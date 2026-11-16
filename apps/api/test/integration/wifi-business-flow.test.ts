import { randomBytes, randomUUID } from "node:crypto";
import { loadConfig } from "@scan-wifi/config";
import type {
  AnalyticsRow,
  MerchantResponse,
  QrCodeResponse,
  StoreDetail,
  WifiNetworkResponse,
  WifiStatusResponse,
} from "@scan-wifi/shared-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApplication } from "../../src/app.js";
import { FastPasswordHasher, FakeQrCodeProvider, MemoryQrCodeStorage } from "../helpers/fakes.js";
import { MemoryPlatformRepository } from "../helpers/memory-repository.js";

describe("merchant / multi-network / credentials / analytics", () => {
  let app: FastifyInstance;
  let repository: MemoryPlatformRepository;
  let cookie: string;
  beforeEach(async () => {
    repository = new MemoryPlatformRepository();
    app = await buildApplication(
      loadConfig({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://test:test@127.0.0.1/test",
        WIFI_ENCRYPTION_KEY_BASE64: randomBytes(32).toString("base64"),
        SESSION_SECRET: randomBytes(32).toString("hex"),
      }),
      {
        repository,
        passwordService: new FastPasswordHasher(),
        qrCodeProvider: new FakeQrCodeProvider(),
        qrCodeStorage: new MemoryQrCodeStorage(),
        logger: false,
        eventRateLimitMax: 100,
      },
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { username: "admin", password: "correct horse battery staple" },
    });
    cookie = String(response.headers["set-cookie"]).split(";")[0]!;
  });
  afterEach(async () => app.close());

  async function fixture() {
    const merchantResponse = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie },
      payload: { name: "商户一", contact: "门店服务台" },
    });
    expect(merchantResponse.statusCode).toBe(201);
    const merchant = merchantResponse.json<MerchantResponse>();
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/stores",
      headers: { cookie },
      payload: { name: "测试咖啡店", merchantId: merchant.id },
    });
    const store = response.json<StoreDetail>();
    const networks: Array<{ wifi: WifiStatusResponse; qr: QrCodeResponse }> = [];
    for (const ssid of ["Guest-1", "Guest-2"]) {
      const wifiResponse = await app.inject({
        method: "POST",
        url: `/api/admin/stores/${store.id}/networks`,
        headers: { cookie },
        payload: { ssid, password: `${ssid}-password` },
      });
      expect(wifiResponse.statusCode).toBe(201);
      const wifi = wifiResponse.json<WifiStatusResponse>();
      const qrResponse = await app.inject({
        method: "POST",
        url: `/api/admin/stores/${store.id}/networks/${wifi.id}/qrcode`,
        headers: { cookie },
      });
      expect(qrResponse.statusCode).toBe(201);
      networks.push({ wifi, qr: qrResponse.json<QrCodeResponse>() });
    }
    return { merchant, store, first: networks[0]!, second: networks[1]! };
  }

  it("keeps two independent printed codes stable when one password changes", async () => {
    const { store, first, second } = await fixture();
    const read = (sceneToken: string, endpoint = "connect") =>
      app.inject({ method: "POST", url: `/api/public/${endpoint}`, payload: { sceneToken } });
    for (const { qr, wifi } of [first, second]) {
      expect(qr.sceneToken).toMatch(/^[a-f0-9]{32}$/);
      expect(qr.wifiId).toBe(wifi.id);
      const info = await read(qr.sceneToken);
      expect(info.statusCode).toBe(200);
      expect(info.json()).toMatchObject({ wifi: { id: wifi.id, ssid: wifi.ssid } });
      expect(info.body).not.toContain("password");
    }
    await app.inject({
      method: "PUT",
      url: `/api/admin/stores/${store.id}/networks/${first.wifi.id}`,
      headers: { cookie },
      payload: { ssid: "Renamed-Guest", password: "updated-password" },
    });
    expect((await read(first.qr.sceneToken, "credential")).json()).toMatchObject({
      ssid: "Renamed-Guest",
      password: "updated-password",
    });
    expect((await read(second.qr.sceneToken, "credential")).json()).toMatchObject({
      ssid: "Guest-2",
      password: "Guest-2-password",
    });
    const list = await app.inject({
      method: "GET",
      url: `/api/admin/stores/${store.id}/networks`,
      headers: { cookie },
    });
    expect(list.json<WifiNetworkResponse[]>()).toHaveLength(2);
    expect(list.body).not.toContain("updated-password");
    expect(list.body).not.toContain("encryptedPassword");
    await app.inject({
      method: "PATCH",
      url: `/api/admin/stores/${store.id}/networks/${first.wifi.id}/status`,
      headers: { cookie },
      payload: { status: "disabled" },
    });
    expect((await read(first.qr.sceneToken, "credential")).statusCode).toBe(404);
    expect((await read(second.qr.sceneToken, "credential")).statusCode).toBe(200);
    expect(JSON.stringify(repository.logs)).not.toContain("updated-password");
    expect(JSON.stringify(repository.logs)).not.toContain(first.qr.sceneToken);
  });

  it("rejects mismatched network/store IDs and disables all merchant credentials", async () => {
    const { merchant, store, first } = await fixture();
    const missing = await app.inject({
      method: "PUT",
      url: `/api/admin/stores/${randomUUID()}/networks/${first.wifi.id}`,
      headers: { cookie },
      payload: { ssid: "Wrong", password: "not-authorized" },
    });
    expect(missing.statusCode).toBe(404);
    const invalid = await app.inject({
      method: "PATCH",
      url: `/api/admin/stores/${store.id}/networks/${first.wifi.id}/status`,
      headers: { cookie },
      payload: { status: "disabled", password: "unexpected" },
    });
    expect(invalid.statusCode).toBe(400);
    await app.inject({
      method: "PATCH",
      url: `/api/admin/merchants/${merchant.id}`,
      headers: { cookie },
      payload: { status: "disabled" },
    });
    const denied = await app.inject({
      method: "POST",
      url: "/api/public/credential",
      payload: { sceneToken: first.qr.sceneToken },
    });
    expect(denied.statusCode).toBe(404);
    expect(denied.headers["cache-control"]).toContain("no-store");
    for (const url of [
      "/api/admin/merchants",
      `/api/admin/stores/${store.id}/networks`,
      "/api/admin/analytics",
    ]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    }
  });

  it("groups by merchant, store, Wi-Fi and UTC date with daily UV and actual attempts", async () => {
    const { merchant, store, first, second } = await fixture();
    const visitorId = randomBytes(16).toString("hex");
    for (const eventType of [
      "page_view",
      "page_view",
      "scan",
      "connect_click",
      "connect_click",
      "connect_click",
      "connect_success",
      "connect_failure",
      "password_copy",
    ]) {
      const result = await app.inject({
        method: "POST",
        url: "/api/public/events",
        payload: {
          sceneToken: first.qr.sceneToken,
          visitorId,
          eventType,
          platform: "android",
          ...(eventType === "connect_failure"
            ? { errorCode: "12002", errorMessage: `password=secret ${visitorId}` }
            : {}),
        },
      });
      expect(result.statusCode).toBe(202);
    }
    await app.inject({
      method: "POST",
      url: "/api/public/events",
      payload: { sceneToken: second.qr.sceneToken, visitorId, eventType: "page_view" },
    });
    const from = new Date(Date.now() - 86400000).toISOString(),
      to = new Date(Date.now() + 86400000).toISOString();
    const query = new URLSearchParams({
      merchantId: merchant.id,
      storeId: store.id,
      wifiId: first.wifi.id!,
      from,
      to,
    });
    const response = await app.inject({
      method: "GET",
      url: `/api/admin/analytics?${query}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const rows = response.json<AnalyticsRow[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      merchantId: merchant.id,
      storeId: store.id,
      wifiId: first.wifi.id,
      totals: {
        pageViews: 2,
        uniqueVisitors: 1,
        scans: 1,
        connectClicks: 3,
        connectSuccesses: 1,
        connectFailures: 1,
        passwordCopies: 1,
        successRate: 1 / 3,
      },
    });
    expect(JSON.stringify(repository.events)).not.toContain(visitorId);
    expect(JSON.stringify(repository.events)).not.toContain("secret");
    expect(repository.events[0]?.visitorHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects unknown scenes, password-bearing payloads and cross-origin admin writes", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/public/credential",
          payload: { sceneToken: randomBytes(16).toString("hex") },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/public/connect",
          payload: { sceneToken: randomBytes(16).toString("hex"), password: "untrusted" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/admin/merchants",
          headers: { cookie, origin: "https://untrusted.invalid" },
          payload: { name: "unauthorized" },
        })
      ).statusCode,
    ).toBe(403);
  });
});
