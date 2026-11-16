import { randomBytes, randomUUID } from "node:crypto";
import { loadConfig } from "@scan-wifi/config";
import type { WifiSpot } from "@scan-wifi/shared-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApplication } from "../../src/app.js";
import { FakeQrCodeProvider, MemoryQrCodeStorage } from "../helpers/fakes.js";
import { MemoryPlatformRepository } from "../helpers/memory-repository.js";

describe("native merchant lifecycle", () => {
  let app: FastifyInstance;
  let repository: MemoryPlatformRepository;
  let provider: FakeQrCodeProvider;
  let storage: MemoryQrCodeStorage;
  let owner: string;
  const input = { shopName: "店铺 A", spotName: "大厅", ssid: "WiFi A", password: "password-A" };
  const login = async (code: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/merchant/login",
      payload: { code },
    });
    expect(response.statusCode).toBe(200);
    return `Bearer ${response.json<{ token: string }>().token}`;
  };
  const call = (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    payload?: object,
    authorization = owner,
  ) =>
    app.inject({
      method,
      url: `/api/merchant${path}`,
      headers: { authorization },
      ...(payload ? { payload } : {}),
    });
  beforeEach(async () => {
    repository = new MemoryPlatformRepository();
    provider = new FakeQrCodeProvider();
    storage = new MemoryQrCodeStorage();
    app = await buildApplication(
      loadConfig({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://unused/unused",
        WIFI_ENCRYPTION_KEY_BASE64: randomBytes(32).toString("base64"),
        SESSION_SECRET: randomBytes(32).toString("hex"),
      }),
      {
        repository,
        qrCodeProvider: provider,
        qrCodeStorage: storage,
        logger: false,
        wechatLoginProvider: { exchange: async (code) => `openid-${code}` },
      },
    );
    owner = await login("owner-a");
  });
  afterEach(async () => app.close());
  it("creates encrypted data, preserves permanent ID through regeneration/password edit, disables and deletes", async () => {
    const created = await call("POST", "/spots", input);
    expect(created.statusCode).toBe(201);
    const spot = created.json<WifiSpot>();
    expect(spot.shortId).toMatch(/^[a-f0-9]{32}$/);
    expect(created.body).not.toContain(input.password);
    expect(JSON.stringify([...repository.wifi.values()])).not.toContain(input.password);
    expect(spot.qrFileId).toBeNull();
    const first = (await call("POST", `/spots/${spot.id}/qrcode`, {})).json<WifiSpot>();
    expect(first.shortId).toBe(spot.shortId);
    expect(first.qrFileId).toBeTruthy();
    expect((await call("GET", `/spots/${spot.id}/image`)).statusCode).toBe(200);
    const next = (await call("POST", `/spots/${spot.id}/qrcode`, {})).json<WifiSpot>();
    expect(next.shortId).toBe(first.shortId);
    expect(next.qrFileId).toBe(first.qrFileId);
    expect(storage.size).toBe(1);
    const update = await call("PUT", `/spots/${spot.id}`, {
      ...input,
      password: "password-B",
      ssid: "WiFi B",
    });
    expect(update.statusCode).toBe(200);
    const read = () =>
      app.inject({
        method: "POST",
        url: "/api/public/credential",
        payload: { sceneToken: spot.shortId },
      });
    expect((await read()).json()).toMatchObject({ ssid: "WiFi B", password: "password-B" });
    expect((await call("GET", "/spots?search=大厅")).json<WifiSpot[]>()).toHaveLength(1);
    await call("PATCH", `/spots/${spot.id}/status`, { status: "disabled" });
    expect((await read()).json()).toMatchObject({ error: { code: "SPOT_DISABLED" } });
    await call("PATCH", `/spots/${spot.id}/status`, { status: "active" });
    expect((await read()).statusCode).toBe(200);
    expect((await call("DELETE", `/spots/${spot.id}`, {})).statusCode).toBe(204);
    expect((await read()).json()).toMatchObject({ error: { code: "INVALID_CODE" } });
    expect((await call("GET", "/spots")).json()).toEqual([]);
    expect((await call("PATCH", `/spots/${spot.id}/status`, { status: "active" })).statusCode).toBe(
      404,
    );
    expect(JSON.stringify(repository.logs)).not.toContain(input.password);
    expect(JSON.stringify(repository.logs)).not.toContain(spot.shortId);
  });
  it("enforces ownership for every read/write/image route and revokes sessions", async () => {
    const spot = (await call("POST", "/spots", input)).json<WifiSpot>();
    const other = await login("owner-b");
    for (const [method, suffix, body] of [
      ["GET", "", undefined],
      ["PUT", "", input],
      ["DELETE", "", {}],
      ["PATCH", "/status", { status: "disabled" }],
      ["POST", "/qrcode", {}],
      ["GET", "/image", undefined],
    ] as const) {
      expect((await call(method, `/spots/${spot.id}${suffix}`, body, other)).statusCode).toBe(404);
    }
    expect((await call("GET", "/spots", undefined, other)).json()).toEqual([]);
    expect((await call("POST", "/spots", { ...input, ownerId: randomUUID() })).statusCode).toBe(
      400,
    );
    expect((await call("GET", "/spots", undefined, "")).statusCode).toBe(401);
    await call("POST", "/logout", {});
    expect((await call("GET", "/spots")).statusCode).toBe(401);
    const again = await login("owner-a");
    expect((await call("GET", "/spots", undefined, again)).json<WifiSpot[]>()).toHaveLength(1);
  });
  it("keeps the saved record and old image usable when WeChat generation fails", async () => {
    const spot = (await call("POST", "/spots", input)).json<WifiSpot>();
    await call("POST", `/spots/${spot.id}/qrcode`, {});
    provider.generate = async () => {
      throw new Error("external secret failure");
    };
    const failure = await call("POST", `/spots/${spot.id}/qrcode`, {});
    expect(failure.statusCode).toBe(500);
    expect(failure.body).not.toContain("secret");
    expect((await call("GET", `/spots/${spot.id}`)).json<WifiSpot>().shortId).toBe(spot.shortId);
    expect((await call("GET", `/spots/${spot.id}/image`)).statusCode).toBe(200);
    expect(storage.size).toBe(1);
  });
});
