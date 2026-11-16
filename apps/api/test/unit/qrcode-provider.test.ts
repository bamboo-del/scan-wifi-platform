import { describe, expect, it } from "vitest";
import {
  WeChatAccessTokenCache,
  WeChatQRCodeProvider,
} from "../../src/services/qrcode-provider.js";

const validOnePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function createTokenCache() {
  let requests = 0;
  const fetchToken: typeof fetch = async () => {
    requests += 1;
    return Response.json({ access_token: `token-${requests}`, expires_in: 7200 });
  };
  return {
    cache: new WeChatAccessTokenCache("app-id", "app-secret", fetchToken),
    requestCount: () => requests,
  };
}

describe("WeChatQRCodeProvider", () => {
  it("explains an unpublished connection page without exposing the external response", async () => {
    const tokens = createTokenCache();
    const provider = new WeChatQRCodeProvider(
      tokens.cache,
      "pages/connect/index",
      "release",
      async () => Response.json({ errcode: 41030, errmsg: "external-sensitive-response" }),
    );
    const result = provider.generate("a".repeat(32));
    await expect(result).rejects.toMatchObject({
      code: "WECHAT_QR_PAGE_UNAVAILABLE",
    });
    await expect(result).rejects.toThrow("小程序连接页尚未发布");
  });
  it("deduplicates concurrent access-token refreshes", async () => {
    let release: ((response: Response) => void) | undefined;
    let requests = 0;
    const fetchToken: typeof fetch = async () => {
      requests += 1;
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    };
    const cache = new WeChatAccessTokenCache("app-id", "server-credential", fetchToken);
    const first = cache.get();
    const second = cache.get();
    release?.(Response.json({ access_token: "shared-token", expires_in: 7200 }));

    await expect(Promise.all([first, second])).resolves.toEqual(["shared-token", "shared-token"]);
    expect(requests).toBe(1);
  });

  it("sends only the opaque scene and fixed rendering options in the QR request body", async () => {
    const tokens = createTokenCache();
    let requestBody: unknown;
    const fetchQrCode: typeof fetch = async (_input, init) => {
      if (typeof init?.body !== "string") throw new Error("expected JSON request body");
      requestBody = JSON.parse(init.body);
      return new Response(new Uint8Array(validOnePixelPng), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    };
    const provider = new WeChatQRCodeProvider(
      tokens.cache,
      "pages/connect/index",
      "release",
      fetchQrCode,
    );
    const scene = "d".repeat(32);

    await provider.generate(scene);

    expect(requestBody).toEqual({
      scene,
      page: "pages/connect/index",
      check_path: true,
      env_version: "release",
      width: 430,
    });
    expect(JSON.stringify(requestBody)).not.toContain("password");
    expect(JSON.stringify(requestBody)).not.toContain("ssid");
  });

  it.each([40014, 42001])(
    "refreshes an invalid or expired access token once for error %s",
    async (errcode) => {
      const tokens = createTokenCache();
      const requestedUrls: string[] = [];
      const fetchQrCode: typeof fetch = async (input) => {
        requestedUrls.push(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );
        if (requestedUrls.length === 1) return Response.json({ errcode, errmsg: "token rejected" });
        return new Response(new Uint8Array(validOnePixelPng), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      };
      const provider = new WeChatQRCodeProvider(
        tokens.cache,
        "pages/connect/index",
        "develop",
        fetchQrCode,
      );

      const generated = await provider.generate("a".repeat(32));

      expect(generated.content).toEqual(validOnePixelPng);
      expect(tokens.requestCount()).toBe(2);
      expect(requestedUrls).toHaveLength(2);
      expect(requestedUrls[0]).toContain("access_token=token-1");
      expect(requestedUrls[1]).toContain("access_token=token-2");
    },
  );

  it("never retries an invalid access token more than once", async () => {
    const tokens = createTokenCache();
    let qrRequests = 0;
    const fetchQrCode: typeof fetch = async () => {
      qrRequests += 1;
      return Response.json({ errcode: 40014, errmsg: "token rejected" });
    };
    const provider = new WeChatQRCodeProvider(
      tokens.cache,
      "pages/connect/index",
      "develop",
      fetchQrCode,
    );

    await expect(provider.generate("b".repeat(32))).rejects.toMatchObject({
      code: "WECHAT_QR_UNAVAILABLE",
    });
    expect(tokens.requestCount()).toBe(2);
    expect(qrRequests).toBe(2);
  });

  it.each([
    ["wrong content type", "application/octet-stream", validOnePixelPng],
    ["invalid PNG bytes", "image/png", Buffer.from("not-a-png")],
  ])("rejects a successful response with %s", async (_case, contentType, content) => {
    const tokens = createTokenCache();
    const fetchQrCode: typeof fetch = async () =>
      new Response(new Uint8Array(content), {
        status: 200,
        headers: { "content-type": contentType },
      });
    const provider = new WeChatQRCodeProvider(
      tokens.cache,
      "pages/connect/index",
      "develop",
      fetchQrCode,
    );

    await expect(provider.generate("c".repeat(32))).rejects.toMatchObject({
      code: "WECHAT_QR_UNAVAILABLE",
    });
  });
});
