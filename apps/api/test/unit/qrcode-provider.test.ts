import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalFileQrCodeStorage } from "../../src/services/qrcode-storage.js";
import { describe, expect, it, vi } from "vitest";
import {
  WeChatAccessTokenCache,
  WeChatQRCodeProvider,
} from "../../src/services/qrcode-provider.js";

const validOnePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const validOnePixelJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8qqKKKAP/2Q==",
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
  it("accepts a WeChat JPEG and preserves its bytes and type through storage", async () => {
    const fetchQrCode: typeof fetch = async () =>
      new Response(new Uint8Array(validOnePixelJpeg), {
        headers: { "content-type": "image/jpeg" },
      });
    const provider = new WeChatQRCodeProvider(
      createTokenCache().cache,
      "pages/connect/index",
      "release",
      fetchQrCode,
    );
    const generated = await provider.generate("e".repeat(32));
    expect(generated).toEqual({
      content: validOnePixelJpeg,
      contentType: "image/jpeg",
      extension: "jpg",
    });
    const directory = await mkdtemp(path.join(tmpdir(), "wechat-qr-"));
    try {
      const storage = new LocalFileQrCodeStorage(directory);
      const stored = await storage.save("e".repeat(32), generated.extension, generated.content);
      expect(stored.location).toMatch(/\.jpg$/u);
      expect(await storage.read(stored.location)).toEqual({
        content: validOnePixelJpeg,
        contentType: "image/jpeg",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("stops reading an oversized upstream body and cancels its stream", async () => {
    const cancel = vi.fn();
    const oversized = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel,
    });
    const fetchQrCode: typeof fetch = async (_input, init) => {
      expect(init?.redirect).toBe("error");
      return new Response(oversized, { headers: { "content-type": "image/png" } });
    };
    const provider = new WeChatQRCodeProvider(
      createTokenCache().cache,
      "pages/connect/index",
      "release",
      fetchQrCode,
    );
    await expect(provider.generate("a".repeat(32))).rejects.toMatchObject({
      code: "WECHAT_QR_UNAVAILABLE",
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds token responses and disallows redirects containing server credentials", async () => {
    const fetchToken: typeof fetch = async (_input, init) => {
      expect(init?.redirect).toBe("error");
      return new Response("x".repeat(64 * 1024 + 1));
    };
    const cache = new WeChatAccessTokenCache("app-id", "app-secret", fetchToken);
    await expect(cache.get()).rejects.toMatchObject({ code: "WECHAT_TOKEN_UNAVAILABLE" });
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
    ["invalid JPEG bytes", "image/jpeg", Buffer.from("not-a-jpeg")],
    ["truncated JPEG", "image/jpeg", validOnePixelJpeg.subarray(0, -2)],
    ["PNG disguised as JPEG", "image/jpeg", validOnePixelPng],
    ["JPEG disguised as PNG", "image/png", validOnePixelJpeg],
    ["empty JPEG markers", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
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
