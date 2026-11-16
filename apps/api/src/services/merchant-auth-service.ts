import { createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { serviceUnavailable, unauthorized } from "../lib/errors.js";
import type { PlatformRepository } from "../repositories/platform-repository.js";

export interface WechatLoginProvider {
  exchange(code: string): Promise<string>;
}

export class WechatCodeLoginProvider implements WechatLoginProvider {
  constructor(
    private readonly appId: string,
    private readonly secret: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async exchange(code: string): Promise<string> {
    if (!this.appId || !this.secret)
      throw serviceUnavailable("WECHAT_NOT_CONFIGURED", "商家登录尚未配置，请联系服务方");
    try {
      const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
      url.search = new URLSearchParams({
        appid: this.appId,
        secret: this.secret,
        js_code: code,
        grant_type: "authorization_code",
      }).toString();
      const response = await this.fetcher(url, { signal: AbortSignal.timeout(8000) });
      const parsed = z
        .object({ openid: z.string().min(1), errcode: z.literal(0).optional() })
        .safeParse(await response.json());
      if (!response.ok || !parsed.success) throw new Error("Rejected login");
      return parsed.data.openid;
    } catch {
      throw serviceUnavailable("WECHAT_LOGIN_FAILED", "微信登录暂不可用，请重试");
    }
  }
}

export class MerchantAuthService {
  constructor(
    private readonly repository: PlatformRepository,
    private readonly provider: WechatLoginProvider,
    private readonly secret: string,
  ) {}
  private hash(value: string): string {
    return createHmac("sha256", this.secret).update(value).digest("hex");
  }
  async login(code: string): Promise<{ token: string; expiresAt: string }> {
    const openid = await this.provider.exchange(code);
    // Merchant identity must survive rotation of the session signing secret.
    const identityHash = createHash("sha256").update(`wechat-merchant:v1:${openid}`).digest("hex");
    const merchant = await this.repository.findOrCreateWechatMerchant(identityHash);
    if (merchant.status !== "active") throw unauthorized("商家账号已停用");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 12 * 3600000);
    await this.repository.createMerchantSession(
      this.hash(`session:${token}`),
      merchant.id,
      expiresAt,
    );
    return { token, expiresAt: expiresAt.toISOString() };
  }
  async authenticate(authorization: string | undefined): Promise<string> {
    if (!authorization || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) throw unauthorized();
    const ownerId = await this.repository.findMerchantSession(
      this.hash(`session:${authorization.slice(7)}`),
    );
    if (!ownerId) throw unauthorized();
    return ownerId;
  }
  async logout(authorization: string): Promise<void> {
    await this.repository.deleteMerchantSession(this.hash(`session:${authorization.slice(7)}`));
  }
}
