import { randomBytes } from "node:crypto";
import { loadConfig, type AppConfig } from "@scan-wifi/config";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApplication } from "../../src/app.js";
import { FakeQrCodeProvider, FastPasswordHasher, MemoryQrCodeStorage } from "../helpers/fakes.js";
import { MemoryPlatformRepository } from "../helpers/memory-repository.js";

class AuditFailingMemoryRepository extends MemoryPlatformRepository {
  public failAuditAction: string | null = null;

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

function testConfig(): AppConfig {
  return loadConfig({
    INITIAL_ADMIN_USERNAME: "admin@example.com",
    NODE_ENV: "test",
    API_HOST: "127.0.0.1",
    API_PORT: "3100",
    ADMIN_WEB_ORIGIN: "http://localhost:5173",
    COOKIE_SECURE: "false",
    DATABASE_URL: "postgresql://unused:unused@127.0.0.1:5432/unused",
    DATABASE_POOL_MAX: "2",
    WIFI_ENCRYPTION_KEY_BASE64: randomBytes(32).toString("base64"),
    SESSION_SECRET: "test-session-secret-that-is-at-least-32-bytes-long",
    SESSION_TTL_HOURS: "12",
    QR_CODE_PROVIDER: "local-placeholder",
    QR_CODE_STORAGE_DIR: "./unused",
    MINIPROGRAM_ENABLE_LEGACY_WIFI_API: "false",
    MINIPROGRAM_AD_UNIT_ID: "adunit-test",
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

it("trusts forwarded client addresses only from an explicitly allowed proxy peer", async () => {
  const proxyApp = await buildApplication(
    { ...testConfig(), TRUST_PROXY_HOPS: 1, TRUST_PROXY_ADDRESSES: ["192.0.2.10"] },
    {
      repository: new MemoryPlatformRepository(),
      qrCodeProvider: new FakeQrCodeProvider(),
      qrCodeStorage: new MemoryQrCodeStorage(),
      passwordService: new FastPasswordHasher(),
      logger: false,
    },
  );
  proxyApp.get("/test/client-ip", async (request) => ({ ip: request.ip }));
  try {
    const untrusted = await proxyApp.inject({
      method: "GET",
      url: "/test/client-ip",
      remoteAddress: "192.0.2.20",
      headers: { "x-forwarded-for": "198.51.100.1" },
    });
    expect(untrusted.json()).toEqual({ ip: "192.0.2.20" });
    const trusted = await proxyApp.inject({
      method: "GET",
      url: "/test/client-ip",
      remoteAddress: "192.0.2.10",
      headers: { "x-forwarded-for": "198.51.100.1" },
    });
    expect(trusted.json()).toEqual({ ip: "198.51.100.1" });
    const injectedChain = await proxyApp.inject({
      method: "GET",
      url: "/test/client-ip",
      remoteAddress: "192.0.2.10",
      headers: { "x-forwarded-for": "203.0.113.9, 198.51.100.1" },
    });
    expect(injectedChain.json()).toEqual({ ip: "198.51.100.1" });
  } finally {
    await proxyApp.close();
  }
}, 15_000);

describe("Fastify API integration", () => {
  let app: FastifyInstance;
  let repository: AuditFailingMemoryRepository;
  let cookie: string;
  let config: AppConfig;

  beforeEach(async () => {
    repository = new AuditFailingMemoryRepository();
    config = testConfig();
    app = await buildApplication(config, {
      repository,
      qrCodeProvider: new FakeQrCodeProvider(),
      qrCodeStorage: new MemoryQrCodeStorage(),
      passwordService: new FastPasswordHasher(),
      logger: false,
      eventRateLimitMax: 2,
    });
    await app.ready();
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { username: "admin@example.com", password: "correct horse battery staple" },
    });
    expect(login.statusCode).toBe(200);
    cookie = cookieFrom(login);
  });

  afterEach(async () => app.close());

  it("logs in an existing administrator by email while preserving their identity and role", async () => {
    const admin = repository.admins[0];
    if (!admin) throw new Error("Missing fixture administrator");
    admin.username = "admin@example.com";
    const login = await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { username: "ADMIN@EXAMPLE.COM", password: "correct horse battery staple" },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({
      admin: { id: admin.id, username: admin.username, role: "admin" },
    });
    const session = await app.inject({
      method: "GET",
      url: "/api/admin/auth/session",
      headers: { cookie: cookieFrom(login) },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({ admin: { id: admin.id, role: "admin" } });
  });

  it("retains user profiles without accepting or returning removed notes", async () => {
    const profile = {
      name: "测试用户",
      shortName: "测试",
      logoUrl: "https://cdn.test/logo.png",
      address: "测试地址",
      contactName: "联系人",
      contactPhone: "13800000000",
    };
    const rejected = await app.inject({
      method: "POST",
      url: "/api/admin/stores",
      headers: { cookie },
      payload: { ...profile, notes: "旧备注" },
    });
    expect(rejected.statusCode).toBe(400);
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/stores",
      headers: { cookie },
      payload: profile,
    });
    expect(created.statusCode).toBe(201);
    const body = created.json<StorePayload>();
    const rejectedUpdate = await app.inject({
      method: "PATCH",
      url: `/api/admin/stores/${body.id}`,
      headers: { cookie },
      payload: { notes: "旧备注" },
    });
    expect(rejectedUpdate.statusCode).toBe(400);
    const detail = await app.inject({
      method: "GET",
      url: `/api/admin/stores/${body.id}`,
      headers: { cookie },
    });
    expect(detail.json()).toMatchObject(profile);
    expect(detail.json()).not.toHaveProperty("notes");
    const list = await app.inject({ method: "GET", url: "/api/admin/stores", headers: { cookie } });
    expect(list.body).not.toContain('"notes"');
  });

  it("reports database readiness without exposing configuration", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", checks: { database: "ok" } });
    expect(response.body).not.toContain("DATABASE_URL");
  });

  async function createReadyStore(): Promise<{ store: StorePayload; qr: QrPayload }> {
    const create = await app.inject({
      method: "POST",
      url: "/api/admin/stores",
      headers: { cookie },
      payload: { name: "测试用户", shortName: "测试", adEnabled: true },
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
    expect(session.json()).toMatchObject({
      authenticated: true,
      admin: { username: "admin@example.com" },
    });

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
        payload: {
          username: "admin@example.com",
          password: "definitely-incorrect-password",
        },
      });
      expect(failed.statusCode).toBe(401);
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { username: "admin@example.com", password: "definitely-incorrect-password" },
    });
    expect(blocked.statusCode).toBe(429);
  });

  it("rejects cross-origin login before creating a session", async () => {
    const sessionsBefore = repository.sessionCount();
    for (const origin of ["https://attacker.example", "null"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/auth/login",
        headers: { origin },
        payload: { username: "admin@example.com", password: "correct horse battery staple" },
      });
      expect(response.statusCode).toBe(403);
      expect(response.headers["set-cookie"]).toBeUndefined();
    }
    expect(repository.sessionCount()).toBe(sessionsBefore);
  });

  it("prevents caching authenticated admin data and authentication errors", async () => {
    for (const headers of [{ cookie }, {}]) {
      const response = await app.inject({ method: "GET", url: "/api/admin/stores", headers });
      expect(response.headers["cache-control"]).toContain("no-store");
    }
  });

  it("uses a historical end date to derive the default statistics start", async () => {
    const { store } = await createReadyStore();
    const response = await app.inject({
      method: "GET",
      url: `/api/admin/stores/${store.id}/statistics?to=2000-02-15T12:00:00.000Z`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      range: { from: "2000-01-17T00:00:00.000Z", to: "2000-02-15T12:00:00.000Z" },
    });
    const future = await app.inject({
      method: "GET",
      url: `/api/admin/stores/${store.id}/statistics?from=2999-01-01T00:00:00.000Z`,
      headers: { cookie },
    });
    expect(future.statusCode).toBe(400);
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
    const { qr } = await createReadyStore();
    expect(qr.sceneToken).toMatch(/^[a-f0-9]{32}$/u);
    const response = await app.inject({
      method: "GET",
      url: `/api/public/connect/${qr.sceneToken}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.json()).toEqual({
      store: { name: "测试用户", shortName: "测试", logoUrl: null },
      wifi: {
        ssid: "Guest-WiFi",
        bssid: null,
        securityType: "WPA2",
      },
      ad: { enabled: true, unitId: "adunit-test" },
      compatibility: { legacyWifiApiEnabled: false },
    });
    expect(response.body).not.toContain("wifi-password-123");
  });

  it("releases credentials only on demand and rechecks every availability switch", async () => {
    const { store, qr } = await createReadyStore();
    const credential = () =>
      app.inject({
        method: "POST",
        url: "/api/public/credential",
        payload: { sceneToken: qr.sceneToken },
      });
    const disabled = await credential();
    expect(disabled.statusCode).toBe(403);
    expect(disabled.headers["cache-control"]).toContain("no-store");
    expect(disabled.body).not.toContain("wifi-password-123");

    config.MINIPROGRAM_ENABLE_LEGACY_WIFI_API = true;
    const metadata = await app.inject({
      method: "GET",
      url: `/api/public/connect/${qr.sceneToken}`,
    });
    expect(metadata.statusCode).toBe(200);
    expect(metadata.body).not.toContain("password");
    const available = await credential();
    expect(available.statusCode).toBe(200);
    expect(available.headers["cache-control"]).toContain("no-store");
    expect(available.json()).toEqual({
      wifi: {
        ssid: "Guest-WiFi",
        password: "wifi-password-123",
        bssid: null,
        securityType: "WPA2",
      },
    });

    const wifi = repository.wifi.get(store.id)!;
    wifi.status = "disabled";
    expect((await credential()).statusCode).toBe(404);
    wifi.status = "active";
    for (const path of [`/qrcodes/${qr.id}`, `/stores/${store.id}`]) {
      const disable = await app.inject({
        method: "POST",
        url: `/api/admin${path}/disable`,
        headers: { cookie },
      });
      expect(disable.statusCode).toBe(200);
      expect((await credential()).statusCode).toBe(404);
      const enable = await app.inject({
        method: "POST",
        url: `/api/admin${path}/enable`,
        headers: { cookie },
      });
      expect(enable.statusCode).toBe(200);
    }
    wifi.encryptedPassword = "invalid-ciphertext";
    const corrupted = await credential();
    expect(corrupted.statusCode).toBe(503);
    expect(corrupted.body).not.toContain("invalid-ciphertext");
  });

  it("validates and independently rate-limits credential retrieval", async () => {
    config.MINIPROGRAM_ENABLE_LEGACY_WIFI_API = true;
    for (const payload of [{ sceneToken: "bad" }, { sceneToken: "a".repeat(32), unknown: true }]) {
      expect(
        (await app.inject({ method: "POST", url: "/api/public/credential", payload })).statusCode,
      ).toBe(400);
    }
    for (let attempt = 0; attempt < 28; attempt += 1) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/public/credential",
            payload: { sceneToken: "a".repeat(32) },
          })
        ).statusCode,
      ).toBe(404);
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/api/public/credential",
      payload: { sceneToken: "a".repeat(32) },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["cache-control"]).toContain("no-store");
    const metadata = await app.inject({
      method: "GET",
      url: `/api/public/connect/${"a".repeat(32)}`,
    });
    expect(metadata.statusCode).toBe(404);
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
      (await app.inject({ method: "GET", url: `/api/public/connect/${first.qr.sceneToken}` }))
        .statusCode,
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
      (await app.inject({ method: "GET", url: `/api/public/connect/${secondQr.sceneToken}` }))
        .statusCode,
    ).toBe(404);
  });

  it("shows a re-enabled older QR consistently in the store list and detail", async () => {
    const { store, qr } = await createReadyStore();
    repository.qrs.get(qr.id)!.generatedAt = new Date("2000-01-01T00:00:00.000Z");
    const replacement = await app.inject({
      method: "POST",
      url: `/api/admin/stores/${store.id}/qrcode`,
      headers: { cookie },
    });
    expect(replacement.statusCode).toBe(201);
    const enabled = await app.inject({
      method: "POST",
      url: `/api/admin/qrcodes/${qr.id}/enable`,
      headers: { cookie },
    });
    expect(enabled.statusCode).toBe(200);
    const detail = await app.inject({
      method: "GET",
      url: `/api/admin/stores/${store.id}`,
      headers: { cookie },
    });
    expect(detail.json()).toMatchObject({ qrCodeStatus: "active", qrCode: { id: qr.id } });
    const current = await app.inject({
      method: "GET",
      url: `/api/admin/stores/${store.id}/qrcode`,
      headers: { cookie },
    });
    expect(current.json()).toMatchObject({ id: qr.id, status: "active" });
    const list = await app.inject({ method: "GET", url: "/api/admin/stores", headers: { cookie } });
    expect(list.json()).toMatchObject({ items: [{ id: store.id, qrCodeStatus: "active" }] });
  });

  it("rejects illegal scene tokens and missing stores", async () => {
    const invalid = await app.inject({ method: "GET", url: "/api/public/connect/1" });
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
      [
        "admin@example.com",
        (item: (typeof exactAction.items)[number]) => item.adminUsername === "admin@example.com",
      ],
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
        payload: { username: "admin@example.com", password: "correct horse battery staple" },
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
