import { randomBytes } from "node:crypto";
import { loadConfig, type AppConfig } from "@scan-wifi/config";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApplication } from "../../src/app.js";
import { FakeQrCodeProvider, FastPasswordHasher, MemoryQrCodeStorage } from "../helpers/fakes.js";
import { MemoryPlatformRepository } from "../helpers/memory-repository.js";

class AuditFailingMemoryRepository extends MemoryPlatformRepository {
  public failAuditAction: string | null = null;
  public failHealthCheck = false;

  public override async healthCheck(): Promise<void> {
    if (this.failHealthCheck) throw new Error("Injected database health failure");
  }

  public override async insertOperationLog(
    input: Parameters<MemoryPlatformRepository["insertOperationLog"]>[0],
  ): Promise<void> {
    if (input.action === this.failAuditAction) throw new Error("Injected audit insert failure");
    await super.insertOperationLog(input);
  }
}

interface StorePayload {
  id: string;
  status: "active" | "disabled";
}

interface QrPayload {
  id: string;
  sceneToken: string;
  status: "active" | "disabled";
}

const TEST_WIFI_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");

function testConfig(overrides: NodeJS.ProcessEnv = {}): AppConfig {
  return loadConfig({
    NODE_ENV: "test",
    API_HOST: "127.0.0.1",
    API_PORT: "3100",
    ADMIN_WEB_ORIGIN: "http://localhost:5173",
    COOKIE_SECURE: "false",
    DATABASE_URL: "postgresql://unused:unused@127.0.0.1:5432/unused",
    DATABASE_POOL_MAX: "2",
    WIFI_ENCRYPTION_KEY_BASE64: TEST_WIFI_ENCRYPTION_KEY,
    SESSION_SECRET: "test-session-secret-that-is-at-least-32-bytes-long",
    SESSION_TTL_HOURS: "12",
    QR_CODE_PROVIDER: "local-placeholder",
    QR_CODE_STORAGE_DIR: "./unused",
    MINIPROGRAM_ENABLE_LEGACY_WIFI_API: "false",
    MINIPROGRAM_AD_UNIT_ID: "adunit-test",
    ...overrides,
  });
}

function cookieFrom(response: {
  headers: Record<string, string | string[] | number | undefined>;
}): string {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : typeof raw === "string" ? raw : undefined;
  if (!value) throw new Error("Login did not set a session cookie");
  return value.split(";", 1)[0] ?? "";
}

describe("Fastify API integration", () => {
  let app: FastifyInstance;
  let repository: AuditFailingMemoryRepository;
  let qrCodeStorage: MemoryQrCodeStorage;
  let cookie: string;

  beforeEach(async () => {
    repository = new AuditFailingMemoryRepository();
    qrCodeStorage = new MemoryQrCodeStorage();
    app = await buildApplication(testConfig(), {
      repository,
      qrCodeProvider: new FakeQrCodeProvider(),
      qrCodeStorage,
      passwordService: new FastPasswordHasher(),
      logger: false,
      eventRateLimitMax: 2,
    });
    await app.ready();
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { username: "admin", password: "correct horse battery staple" },
    });
    expect(login.statusCode).toBe(200);
    cookie = cookieFrom(login);
  });

  afterEach(async () => app.close());

  it("reports database readiness without exposing configuration", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", checks: { database: "ok" } });
    expect(response.body).not.toContain("DATABASE_URL");
  });

  it("reports database failure as a sanitized non-ready health response", async () => {
    repository.failHealthCheck = true;
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "unavailable",
      checks: { database: "failed" },
    });
    expect(response.body).not.toContain("Injected database health failure");
    expect(response.body).not.toContain("DATABASE_URL");
  });

  it("does not register API documentation in production", async () => {
    const productionApp = await buildApplication(
      testConfig({
        NODE_ENV: "production",
        ADMIN_WEB_ORIGIN: "https://admin.scan-wifi-production.cn",
        COOKIE_SECURE: "true",
        QR_CODE_PROVIDER: "wechat",
        WECHAT_APP_ID: "wx0123456789abcdef",
        WECHAT_APP_SECRET: "production-test-value-not-a-real-credential",
        WECHAT_ENV_VERSION: "release",
      }),
      {
        repository,
        qrCodeProvider: new FakeQrCodeProvider(),
        qrCodeStorage: new MemoryQrCodeStorage(),
        passwordService: new FastPasswordHasher(),
        logger: false,
      },
    );
    try {
      await productionApp.ready();
      const response = await productionApp.inject({
        method: "GET",
        url: "/documentation",
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        error: { code: "ROUTE_NOT_FOUND", message: "接口不存在" },
      });
    } finally {
      await productionApp.close();
    }
  });

  async function createReadyStore(): Promise<{ store: StorePayload; qr: QrPayload }> {
    const create = await app.inject({
      method: "POST",
      url: "/api/admin/stores",
      headers: { cookie },
      payload: { name: "测试门店", shortName: "测试", adEnabled: true },
    });
    expect(create.statusCode).toBe(201);
    const store = JSON.parse(create.body) as StorePayload;
    const wifi = await app.inject({
      method: "PUT",
      url: `/api/admin/stores/${store.id}/wifi`,
      headers: { cookie },
      payload: { ssid: "Guest-WiFi", password: "wifi-password-123", securityType: "WPA2" },
    });
    expect(wifi.statusCode).toBe(200);
    const qrResponse = await app.inject({
      method: "POST",
      url: `/api/admin/stores/${store.id}/qrcode`,
      headers: { cookie },
    });
    expect(qrResponse.statusCode).toBe(201);
    return { store, qr: JSON.parse(qrResponse.body) as QrPayload };
  }

  it("rejects unauthenticated administrator access with the shared envelope", async () => {
    const response = await app.inject({ method: "GET", url: "/api/admin/stores" });
    expect(response.statusCode).toBe(401);
    const body = response.json<{ error: { code: string; requestId: unknown } }>();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(typeof body.error.requestId).toBe("string");
  });

  it("checks and revokes the opaque administrator session", async () => {
    const session = await app.inject({
      method: "GET",
      url: "/api/admin/auth/session",
      headers: { cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({ authenticated: true, admin: { username: "admin" } });

    const logout = await app.inject({
      method: "POST",
      url: "/api/admin/auth/logout",
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);
    const revoked = await app.inject({
      method: "GET",
      url: "/api/admin/auth/session",
      headers: { cookie },
    });
    expect(revoked.statusCode).toBe(401);
  });

  it("throttles repeated failed administrator logins", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await app.inject({
        method: "POST",
        url: "/api/admin/auth/login",
        payload: { username: "admin", password: "definitely-incorrect-password" },
      });
      expect(failed.statusCode).toBe(401);
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { username: "admin", password: "definitely-incorrect-password" },
    });
    expect(blocked.statusCode).toBe(429);
  });

  it("creates a store, replaces Wi-Fi, and never returns the plaintext password from admin endpoints", async () => {
    const { store } = await createReadyStore();
    const list = await app.inject({ method: "GET", url: "/api/admin/stores", headers: { cookie } });
    const detail = await app.inject({
      method: "GET",
      url: `/api/admin/stores/${store.id}`,
      headers: { cookie },
    });
    const status = await app.inject({
      method: "GET",
      url: `/api/admin/stores/${store.id}/wifi/status`,
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(detail.statusCode).toBe(200);
    expect(status.statusCode).toBe(200);
    for (const response of [list, detail, status])
      expect(response.body).not.toContain("wifi-password-123");
    expect(status.json()).toMatchObject({
      configured: true,
      ssid: "Guest-WiFi",
      passwordMasked: "••••••••",
      version: 1,
    });
    expect(repository.wifi.get(store.id)?.encryptedPassword).not.toContain("wifi-password-123");

    const bySsid = await app.inject({
      method: "GET",
      url: "/api/admin/stores?search=Guest-WiFi",
      headers: { cookie },
    });
    expect(bySsid.statusCode).toBe(200);
    expect(bySsid.json<{ items: StorePayload[]; total: number }>()).toMatchObject({
      total: 1,
      items: [{ id: store.id }],
    });
  });

  it("generates a random placeholder QR and resolves the minimal no-store public configuration", async () => {
    const { store, qr } = await createReadyStore();
    const wifi = await repository.getWifi(store.id);
    expect(qr.sceneToken).toMatch(/^[a-f0-9]{32}$/u);
    const response = await app.inject({
      method: "POST",
      url: "/api/public/connect",
      payload: { sceneToken: qr.sceneToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.json()).toEqual({
      store: { id: store.id, name: "测试门店", shortName: "测试", logoUrl: null },
      wifi: {
        ssid: "Guest-WiFi",
        id: wifi?.id,
        bssid: null,
        securityType: "WPA2",
      },
      ad: { enabled: false, unitId: null },
      compatibility: { legacyWifiApiEnabled: false },
    });
    expect(response.body).not.toContain("wifi-password-123");
  });

  it("keeps credentials out of page metadata even when the Wi-Fi API gate is enabled", async () => {
    const { qr } = await createReadyStore();
    const enabledApp = await buildApplication(
      testConfig({ MINIPROGRAM_ENABLE_LEGACY_WIFI_API: "true" }),
      {
        repository,
        qrCodeProvider: new FakeQrCodeProvider(),
        qrCodeStorage,
        passwordService: new FastPasswordHasher(),
        logger: false,
      },
    );
    await enabledApp.ready();
    try {
      const response = await enabledApp.inject({
        method: "POST",
        url: "/api/public/connect",
        payload: { sceneToken: qr.sceneToken },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        wifi: { ssid: "Guest-WiFi" },
        compatibility: { legacyWifiApiEnabled: true },
      });
      expect(response.body).not.toContain("password");
      const credential = await enabledApp.inject({
        method: "POST",
        url: "/api/public/credential",
        payload: { sceneToken: qr.sceneToken },
      });
      expect(credential.json()).toMatchObject({ password: "wifi-password-123" });
      expect(credential.headers["cache-control"]).toContain("no-store");
    } finally {
      await enabledApp.close();
    }
  });

  it("invalidates public configuration immediately after QR or store disable", async () => {
    const first = await createReadyStore();
    const disableQr = await app.inject({
      method: "POST",
      url: `/api/admin/qrcodes/${first.qr.id}/disable`,
      headers: { cookie },
    });
    expect(disableQr.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/public/connect",
          payload: { sceneToken: first.qr.sceneToken },
        })
      ).statusCode,
    ).toBe(404);

    const secondQrResponse = await app.inject({
      method: "POST",
      url: `/api/admin/stores/${first.store.id}/qrcode`,
      headers: { cookie },
    });
    const secondQr = JSON.parse(secondQrResponse.body) as QrPayload;
    const disableStore = await app.inject({
      method: "POST",
      url: `/api/admin/stores/${first.store.id}/disable`,
      headers: { cookie },
    });
    expect(disableStore.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/public/connect",
          payload: { sceneToken: secondQr.sceneToken },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("rejects illegal scene tokens and missing stores", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/api/public/connect",
      payload: { sceneToken: "1" },
    });
    expect(invalid.statusCode).toBe(400);
    const missing = await app.inject({
      method: "PUT",
      url: `/api/admin/stores/${randomBytes(16).toString("hex")}/wifi`,
      headers: { cookie },
      payload: { ssid: "Guest", password: "password-123" },
    });
    expect(missing.statusCode).toBe(400);
    const validMissingId = "57c54d7c-ea6d-4ed8-8b2a-81f6899bbf47";
    const missingStore = await app.inject({
      method: "PUT",
      url: `/api/admin/stores/${validMissingId}/wifi`,
      headers: { cookie },
      payload: { ssid: "Guest", password: "password-123" },
    });
    expect(missingStore.statusCode).toBe(404);
  });

  it("rate limits anonymous events and never persists supplied error text", async () => {
    const { qr } = await createReadyStore();
    const payload = {
      sceneToken: qr.sceneToken,
      eventType: "connect_failure",
      platform: "ios",
      errorCode: "AUTH_ERROR",
      errorMessage: "password=wifi-password-123",
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/public/events",
          payload: {
            ...payload,
            errorCode: "password=wifi-password-123",
            errorMessage: "password=wifi-password-123 with spaces",
          },
        })
      ).statusCode,
    ).toBe(202);
    expect(
      (await app.inject({ method: "POST", url: "/api/public/events", payload })).statusCode,
    ).toBe(202);
    const limited = await app.inject({ method: "POST", url: "/api/public/events", payload });
    expect(limited.statusCode).toBe(429);
    expect(JSON.stringify(repository.events)).not.toContain("wifi-password-123");
    expect(repository.events.map((event) => event.errorCode)).toEqual(["UNKNOWN", "AUTH_ERROR"]);
    expect(limited.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("searches operation logs across displayed fields and supports action namespaces", async () => {
    const { store, qr } = await createReadyStore();
    const disabled = await app.inject({
      method: "POST",
      url: `/api/admin/qrcodes/${qr.id}/disable`,
      headers: { cookie },
    });
    expect(disabled.statusCode).toBe(200);

    const getLogs = async (query: string) => {
      const response = await app.inject({
        method: "GET",
        url: `/api/admin/operation-logs?${query}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      return response.json<{
        items: Array<{
          adminUsername: string | null;
          action: string;
          resourceType: string;
          resourceId: string | null;
        }>;
        total: number;
      }>();
    };

    const qrcodeNamespace = await getLogs("action=qrcode");
    expect(qrcodeNamespace.total).toBe(2);
    expect(qrcodeNamespace.items.every((item) => item.action.startsWith("qrcode."))).toBe(true);

    const exactAction = await getLogs("action=qrcode.generate");
    expect(exactAction.total).toBe(1);
    expect(exactAction.items[0]?.action).toBe("qrcode.generate");

    const wifiId = repository.wifi.get(store.id)?.id;
    expect(wifiId).toBeDefined();
    const searches = [
      ["admin", (item: (typeof exactAction.items)[number]) => item.adminUsername === "admin"],
      [
        "wifi.replace",
        (item: (typeof exactAction.items)[number]) => item.action === "wifi.replace",
      ],
      [
        "wifi_config",
        (item: (typeof exactAction.items)[number]) => item.resourceType === "wifi_config",
      ],
      [
        wifiId?.slice(0, 8) ?? "",
        (item: (typeof exactAction.items)[number]) => item.resourceId === wifiId,
      ],
    ] as const;
    for (const [search, matches] of searches) {
      const result = await getLogs(`search=${encodeURIComponent(search)}`);
      expect(result.total).toBeGreaterThan(0);
      expect(result.items.every(matches)).toBe(true);
    }
  });

  it("validates all write inputs and logs sensitive operations without passwords", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/api/admin/stores",
      headers: { cookie },
      payload: { name: "", unknown: true },
    });
    expect(invalid.statusCode).toBe(400);
    await createReadyStore();
    expect(repository.logs.some((log) => log.action === "wifi.replace")).toBe(true);
    expect(JSON.stringify(repository.logs)).not.toContain("wifi-password-123");
  });

  it("rolls back memory business writes whenever their audit insert fails", async () => {
    repository.failAuditAction = "store.create";
    const failedCreate = await app.inject({
      method: "POST",
      url: "/api/admin/stores",
      headers: { cookie },
      payload: { name: "rollback-create" },
    });
    expect(failedCreate.statusCode).toBe(500);
    expect(repository.stores.size).toBe(0);

    repository.failAuditAction = null;
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/stores",
      headers: { cookie },
      payload: { name: "original-name" },
    });
    expect(created.statusCode).toBe(201);
    const store = created.json<StorePayload>();

    repository.failAuditAction = "store.update";
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/admin/stores/${store.id}`,
          headers: { cookie },
          payload: { name: "must-roll-back" },
        })
      ).statusCode,
    ).toBe(500);
    expect(repository.stores.get(store.id)?.name).toBe("original-name");

    repository.failAuditAction = "store.disable";
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/admin/stores/${store.id}/disable`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(500);
    expect(repository.stores.get(store.id)?.status).toBe("active");

    repository.failAuditAction = "wifi.replace";
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/api/admin/stores/${store.id}/wifi`,
          headers: { cookie },
          payload: { ssid: "Rollback-WiFi", password: "wifi-password-rollback" },
        })
      ).statusCode,
    ).toBe(500);
    expect(repository.wifi.has(store.id)).toBe(false);

    repository.failAuditAction = null;
    await app.inject({
      method: "PUT",
      url: `/api/admin/stores/${store.id}/wifi`,
      headers: { cookie },
      payload: { ssid: "Rollback-WiFi", password: "wifi-password-rollback" },
    });
    repository.failAuditAction = "qrcode.generate";
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/admin/stores/${store.id}/qrcode`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(500);
    expect(repository.qrs.size).toBe(0);
    expect(qrCodeStorage.size).toBe(0);

    repository.failAuditAction = null;
    const generated = await app.inject({
      method: "POST",
      url: `/api/admin/stores/${store.id}/qrcode`,
      headers: { cookie },
    });
    expect(generated.statusCode).toBe(201);
    const qrCode = generated.json<QrPayload>();

    repository.failAuditAction = "qrcode.disable";
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/admin/qrcodes/${qrCode.id}/disable`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(500);
    expect(repository.qrs.get(qrCode.id)?.status).toBe("active");

    repository.failAuditAction = "settings.global_ad.update";
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/admin/settings",
          headers: { cookie },
          payload: { globalAdEnabled: false },
        })
      ).statusCode,
    ).toBe(500);
    expect(repository.settings.get("global_ad_enabled")).toBe(true);

    repository.failAuditAction = "admin.logout";
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/admin/auth/logout",
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(500);
    expect(repository.sessionCount()).toBe(1);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/admin/auth/session",
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(200);
    expect(JSON.stringify(repository.logs)).not.toContain("wifi-password-rollback");
  });

  it("rolls back a memory session and last-login update when login audit insertion fails", async () => {
    const failingRepository = new AuditFailingMemoryRepository();
    failingRepository.failAuditAction = "admin.login";
    const failingApp = await buildApplication(testConfig(), {
      repository: failingRepository,
      qrCodeProvider: new FakeQrCodeProvider(),
      qrCodeStorage: new MemoryQrCodeStorage(),
      passwordService: new FastPasswordHasher(),
      logger: false,
    });
    await failingApp.ready();
    try {
      const response = await failingApp.inject({
        method: "POST",
        url: "/api/admin/auth/login",
        payload: { username: "admin", password: "correct horse battery staple" },
      });
      expect(response.statusCode).toBe(500);
      expect(failingRepository.admins[0]?.lastLoginAt).toBeNull();
      expect(failingRepository.sessionCount()).toBe(0);
      expect(JSON.stringify(failingRepository.logs)).not.toContain("correct horse battery staple");
    } finally {
      await failingApp.close();
    }
  });
});
