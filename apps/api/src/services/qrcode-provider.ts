import { z } from "zod";
import { AppError, serviceUnavailable } from "../lib/errors.js";
import { sanitizeExternalError } from "../lib/redaction.js";

export interface GeneratedQrCode {
  content: Buffer;
  contentType: "image/png" | "image/svg+xml";
  extension: "png" | "svg";
}

export interface QrCodeProvider {
  readonly kind: "wechat" | "local-placeholder";
  generate(sceneToken: string): Promise<GeneratedQrCode>;
}

interface AccessTokenValue {
  token: string;
  expiresAt: number;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});
const wechatErrorSchema = z.object({ errcode: z.number(), errmsg: z.string().optional() });
const invalidAccessTokenCodes = new Set([40014, 42001]);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const maxQrCodeBytes = 10 * 1024 * 1024;

type WeChatQrAttempt =
  | { ok: true; generated: GeneratedQrCode }
  | { ok: false; errorCode: number | null; status: number };

function crc32(content: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isValidPng(content: Buffer): boolean {
  if (
    content.length > maxQrCodeBytes ||
    !content.subarray(0, pngSignature.length).equals(pngSignature)
  )
    return false;

  let offset = pngSignature.length;
  let chunkIndex = 0;
  let sawIdat = false;
  while (offset < content.length) {
    if (offset + 12 > content.length) return false;
    const dataLength = content.readUInt32BE(offset);
    const dataStart = offset + 8;
    const chunkEnd = dataStart + dataLength + 4;
    if (chunkEnd > content.length) return false;

    const type = content.toString("ascii", offset + 4, dataStart);
    if (!/^[A-Za-z]{4}$/u.test(type)) return false;
    const expectedCrc = content.readUInt32BE(dataStart + dataLength);
    if (crc32(content.subarray(offset + 4, dataStart + dataLength)) !== expectedCrc) return false;

    if (chunkIndex === 0) {
      if (type !== "IHDR" || dataLength !== 13) return false;
      const width = content.readUInt32BE(dataStart);
      const height = content.readUInt32BE(dataStart + 4);
      const bitDepth = content[dataStart + 8];
      const colorType = content[dataStart + 9];
      const allowedBitDepths: Record<number, readonly number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        width === 0 ||
        height === 0 ||
        bitDepth === undefined ||
        colorType === undefined ||
        !allowedBitDepths[colorType]?.includes(bitDepth) ||
        content[dataStart + 10] !== 0 ||
        content[dataStart + 11] !== 0 ||
        (content[dataStart + 12] !== 0 && content[dataStart + 12] !== 1)
      )
        return false;
    } else if (type === "IHDR") {
      return false;
    }

    if (type === "IDAT") sawIdat = true;
    if (type === "IEND") return dataLength === 0 && sawIdat && chunkEnd === content.length;

    offset = chunkEnd;
    chunkIndex += 1;
  }
  return false;
}

function parseWechatErrorCode(content: Buffer): number | null {
  try {
    const parsed = wechatErrorSchema.safeParse(JSON.parse(content.toString("utf8")));
    return parsed.success ? parsed.data.errcode : null;
  } catch {
    return null;
  }
}

export class WeChatAccessTokenCache {
  private cached: AccessTokenValue | null = null;
  private pending: Promise<string> | null = null;

  public constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  public async get(): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now + 60_000) return this.cached.token;
    if (this.pending) return this.pending;
    this.pending = this.refresh();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }

  public invalidate(): void {
    this.cached = null;
  }

  private async refresh(): Promise<string> {
    try {
      const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
      url.searchParams.set("grant_type", "client_credential");
      url.searchParams.set("appid", this.appId);
      url.searchParams.set("secret", this.appSecret);
      const response = await this.fetchImplementation(url, { signal: AbortSignal.timeout(8_000) });
      const parsed = tokenResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success)
        throw new Error("WeChat access token response was rejected");
      this.cached = {
        token: parsed.data.access_token,
        expiresAt: Date.now() + Math.max(60, parsed.data.expires_in - 120) * 1_000,
      };
      return this.cached.token;
    } catch (error) {
      throw serviceUnavailable("WECHAT_TOKEN_UNAVAILABLE", sanitizeExternalError(error));
    }
  }
}

export class WeChatQRCodeProvider implements QrCodeProvider {
  public readonly kind = "wechat" as const;

  public constructor(
    private readonly tokenCache: WeChatAccessTokenCache,
    private readonly page: string,
    private readonly envVersion: "release" | "trial" | "develop",
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  public async generate(sceneToken: string): Promise<GeneratedQrCode> {
    let token = await this.tokenCache.get();
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await this.requestQrCode(sceneToken, token);
        if (result.ok) return result.generated;
        if (
          attempt === 0 &&
          result.errorCode !== null &&
          invalidAccessTokenCodes.has(result.errorCode)
        ) {
          this.tokenCache.invalidate();
          token = await this.tokenCache.get();
          continue;
        }
        if (result.errorCode === 41030) {
          throw serviceUnavailable(
            "WECHAT_QR_PAGE_UNAVAILABLE",
            "小程序连接页尚未发布，请在微信后台发布包含 pages/connect/index 的版本后重新生成二维码。",
          );
        }
        throw new Error(`WeChat QR response rejected (${result.errorCode ?? result.status})`);
      }
      throw new Error("WeChat QR response retry limit exceeded");
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw serviceUnavailable("WECHAT_QR_UNAVAILABLE", sanitizeExternalError(error));
    }
  }

  private async requestQrCode(sceneToken: string, token: string): Promise<WeChatQrAttempt> {
    const response = await this.fetchImplementation(
      `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scene: sceneToken,
          page: this.page,
          check_path: this.envVersion === "release",
          env_version: this.envVersion,
          width: 430,
        }),
        signal: AbortSignal.timeout(12_000),
      },
    );
    const content = Buffer.from(await response.arrayBuffer());
    const contentType = (response.headers.get("content-type") ?? "")
      .split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (!response.ok || contentType !== "image/png") {
      return { ok: false, errorCode: parseWechatErrorCode(content), status: response.status };
    }
    if (!isValidPng(content)) throw new Error("WeChat QR response is not a valid PNG image");
    return { ok: true, generated: { content, contentType: "image/png", extension: "png" } };
  }
}

export class LocalPlaceholderQRCodeProvider implements QrCodeProvider {
  public readonly kind = "local-placeholder" as const;

  public constructor(nodeEnvironment: "development" | "test" | "production") {
    if (nodeEnvironment === "production")
      throw new Error("Local QR placeholder provider is forbidden in production");
  }

  public generate(sceneToken: string): Promise<GeneratedQrCode> {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="860" viewBox="0 0 860 860">
<rect width="860" height="860" fill="#fff8e8"/><rect x="24" y="24" width="812" height="812" rx="38" fill="none" stroke="#b45309" stroke-width="16"/>
<path d="M110 210h640M110 650h640" stroke="#b45309" stroke-width="12" stroke-dasharray="18 18"/>
<text x="430" y="350" text-anchor="middle" font-family="sans-serif" font-size="58" font-weight="700" fill="#7c2d12">仅供本地测试</text>
<text x="430" y="435" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#7c2d12">这不是微信小程序码</text>
<text x="430" y="520" text-anchor="middle" font-family="monospace" font-size="22" fill="#78350f">scene: ${sceneToken}</text>
</svg>`;
    return Promise.resolve({
      content: Buffer.from(svg, "utf8"),
      contentType: "image/svg+xml",
      extension: "svg",
    });
  }
}
