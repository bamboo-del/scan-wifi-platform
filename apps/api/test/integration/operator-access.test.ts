import { randomBytes } from "node:crypto";
import { loadConfig } from "@scan-wifi/config";
import type {
  AccountSummary,
  StoreDetail,
  QrCodeResponse,
  DashboardResponse,
} from "@scan-wifi/shared-types";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApplication } from "../../src/app.js";
import { FakeQrCodeProvider, FastPasswordHasher, MemoryQrCodeStorage } from "../helpers/fakes.js";
import { MemoryPlatformRepository } from "../helpers/memory-repository.js";

const password = "operator test password";
function sessionCookie(headers: Record<string, unknown>): string {
  return String(headers["set-cookie"]).split(";", 1)[0]!;
}

describe("operator resource isolation", () => {
  let app: FastifyInstance;
  let repository: MemoryPlatformRepository;
  let adminCookie: string;
  let a: AccountSummary;
  let b: AccountSummary;
  let aCookie: string;
  let bCookie: string;
  let aStore: StoreDetail;
  let bStore: StoreDetail;
  let provider: FakeQrCodeProvider;
  const login = async (username: string, value = password) =>
    app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: { username, password: value },
    });
  const call = (cookie: string, options: InjectOptions) =>
    app.inject({ ...options, headers: { cookie } });

  beforeEach(async () => {
    repository = new MemoryPlatformRepository();
    provider = new FakeQrCodeProvider();
    app = await buildApplication(
      loadConfig({
        INITIAL_ADMIN_USERNAME: "admin@example.com",
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://unused:unused@127.0.0.1:5432/unused",
        ADMIN_WEB_ORIGIN: "http://localhost:5173",
        WIFI_ENCRYPTION_KEY_BASE64: randomBytes(32).toString("base64"),
        SESSION_SECRET: "test-session-secret-that-is-at-least-32-bytes-long",
        QR_CODE_PROVIDER: "local-placeholder",
        COOKIE_SECURE: "false",
      }),
      {
        repository,
        passwordService: new FastPasswordHasher(),
        qrCodeProvider: provider,
        qrCodeStorage: new MemoryQrCodeStorage(),
        logger: false,
      },
    );
    adminCookie = sessionCookie(
      (await login("admin@example.com", "correct horse battery staple")).headers,
    );
    a = (
      await call(adminCookie, {
        method: "POST",
        url: "/api/admin/accounts",
        payload: { username: "operator_a", password },
      })
    ).json<AccountSummary>();
    b = (
      await call(adminCookie, {
        method: "POST",
        url: "/api/admin/accounts",
        payload: { username: "operator_b", password },
      })
    ).json<AccountSummary>();
    aCookie = sessionCookie((await login(a.username)).headers);
    bCookie = sessionCookie((await login(b.username)).headers);
    aStore = (
      await call(aCookie, {
        method: "POST",
        url: "/api/admin/stores",
        payload: { name: "A 私有店" },
      })
    ).json<StoreDetail>();
    bStore = (
      await call(bCookie, {
        method: "POST",
        url: "/api/admin/stores",
        payload: { name: "B 私有店", contactPhone: "private-phone" },
      })
    ).json<StoreDetail>();
  });
  afterEach(async () => app.close());

  it("creates only operators, rejects role/ownership injection and duplicate usernames", async () => {
    expect(a.role).toBe("operator");
    expect(aStore).toMatchObject({ ownerId: a.id, createdById: a.id });
    expect(
      (
        await call(adminCookie, {
          method: "POST",
          url: "/api/admin/accounts",
          payload: { username: "new_user", password, role: "admin" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call(adminCookie, {
          method: "POST",
          url: "/api/admin/accounts",
          payload: { username: "OPERATOR_A", password },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call(aCookie, {
          method: "POST",
          url: "/api/admin/stores",
          payload: { name: "伪造归属", ownerId: b.id },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call(aCookie, {
          method: "PATCH",
          url: `/api/admin/stores/${aStore.id}`,
          payload: { createdById: b.id },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      JSON.stringify(
        (await call(adminCookie, { method: "GET", url: "/api/admin/accounts" })).json(),
      ),
    ).not.toContain("passwordHash");
  });

  it("filters pagination, QR metadata, all dashboard aggregates and guessed store/QR URLs", async () => {
    const qr = (
      await call(bCookie, { method: "POST", url: `/api/admin/stores/${bStore.id}/qrcode` })
    ).json<QrCodeResponse>();
    for (const options of [
      { method: "GET", url: `/api/admin/stores/${bStore.id}` },
      { method: "PATCH", url: `/api/admin/stores/${bStore.id}`, payload: { name: "越权" } },
      { method: "POST", url: `/api/admin/stores/${bStore.id}/enable` },
      { method: "POST", url: `/api/admin/stores/${bStore.id}/disable` },
      {
        method: "PUT",
        url: `/api/admin/stores/${bStore.id}/wifi`,
        payload: { ssid: "other", password: "other-wifi-password" },
      },
      { method: "GET", url: `/api/admin/stores/${bStore.id}/wifi/status` },
      { method: "GET", url: `/api/admin/stores/${bStore.id}/statistics` },
      { method: "GET", url: `/api/admin/stores/${bStore.id}/qrcode` },
      { method: "POST", url: `/api/admin/stores/${bStore.id}/qrcode` },
      { method: "GET", url: `/api/admin/qrcodes/${qr.id}/download` },
      { method: "POST", url: `/api/admin/qrcodes/${qr.id}/disable` },
      { method: "POST", url: `/api/admin/qrcodes/${qr.id}/enable` },
    ] satisfies InjectOptions[]) {
      const response = await call(aCookie, options);
      expect(response.statusCode, options.url).toBe(404);
      expect(response.body).not.toContain("private-phone");
      expect(response.body).not.toContain(qr.sceneToken);
    }
    const list = (
      await call(aCookie, { method: "GET", url: "/api/admin/stores?page=1&pageSize=1" })
    ).json<{ total: number; items: StoreDetail[] }>();
    expect(list.total).toBe(1);
    expect(list.items.map((store) => store.id)).toEqual([aStore.id]);
    expect(
      (await call(aCookie, { method: "GET", url: "/api/admin/stores?search=B" })).json<{
        total: number;
      }>().total,
    ).toBe(0);
    for (const store of [aStore, bStore, bStore])
      await repository.insertEvent({
        storeId: store.id,
        qrCodeId: qr.id,
        eventType: "page_view",
        platform: "android",
        errorCode: null,
        errorMessageSanitized: null,
        occurredAt: new Date(),
      });
    expect((await call(aCookie, { method: "GET", url: "/api/admin/dashboard" })).statusCode).toBe(
      403,
    );
    expect(
      (
        await call(adminCookie, { method: "GET", url: "/api/admin/dashboard" })
      ).json<DashboardResponse>().storeTotal,
    ).toBe(2);
  });

  it("blocks platform settings, logs, account administration and transfers for operators", async () => {
    for (const options of [
      { method: "GET", url: "/api/admin/accounts" },
      { method: "POST", url: "/api/admin/accounts", payload: { username: "new_user", password } },
      {
        method: "PATCH",
        url: `/api/admin/accounts/${b.id}/status`,
        payload: { status: "disabled" },
      },
      { method: "POST", url: `/api/admin/accounts/${b.id}/password`, payload: { password } },
      { method: "GET", url: "/api/admin/settings" },
      { method: "PATCH", url: "/api/admin/settings", payload: { globalAdEnabled: false } },
      { method: "GET", url: "/api/admin/operation-logs" },
      {
        method: "POST",
        url: `/api/admin/stores/${aStore.id}/transfer`,
        payload: { ownerId: b.id, reason: "越权转移" },
      },
    ] satisfies InjectOptions[])
      expect((await call(aCookie, options)).statusCode, options.url).toBe(403);
  });

  it("limits operators to creation, initial Wi-Fi and a first QR while keeping main-account controls", async () => {
    const wifiUrl = `/api/admin/stores/${aStore.id}/wifi`;
    const payload = { ssid: "initial-network", password: "initial-password", status: "active" };
    expect((await call(aCookie, { method: "PUT", url: wifiUrl, payload })).statusCode).toBe(200);
    const qr = (
      await call(aCookie, { method: "POST", url: `/api/admin/stores/${aStore.id}/qrcode` })
    ).json<QrCodeResponse>();
    expect(qr.createdByUsername).toBe(a.username);
    const attempts = [
      {
        method: "PATCH",
        url: `/api/admin/stores/${aStore.id}`,
        payload: { name: "forbidden change" },
      },
      { method: "POST", url: `/api/admin/stores/${aStore.id}/disable` },
      { method: "POST", url: `/api/admin/stores/${aStore.id}/enable` },
      { method: "PUT", url: wifiUrl, payload: { ...payload, password: "replacement-password" } },
      { method: "POST", url: `/api/admin/qrcodes/${qr.id}/disable` },
      { method: "POST", url: `/api/admin/qrcodes/${qr.id}/enable` },
      { method: "POST", url: `/api/admin/stores/${aStore.id}/qrcode` },
      { method: "GET", url: `/api/admin/stores/${aStore.id}/statistics` },
    ] satisfies InjectOptions[];
    for (const options of attempts)
      expect((await call(aCookie, options)).statusCode, options.url).toBe(403);
    expect(repository.wifi.get(aStore.id)?.version).toBe(1);
    expect(repository.qrs.get(qr.id)?.status).toBe("active");
    expect(repository.stores.get(aStore.id)?.name).toBe(aStore.name);
    expect(
      (await call(aCookie, { method: "GET", url: `/api/admin/qrcodes/${qr.id}/download` }))
        .statusCode,
    ).toBe(200);
    expect((await call(adminCookie, { method: "PUT", url: wifiUrl, payload })).statusCode).toBe(
      200,
    );
    expect(
      (await call(adminCookie, { method: "POST", url: `/api/admin/qrcodes/${qr.id}/disable` }))
        .statusCode,
    ).toBe(200);
    expect(
      (await call(aCookie, { method: "POST", url: `/api/admin/stores/${aStore.id}/qrcode` }))
        .statusCode,
    ).toBe(403);
    expect(repository.qrs.get(qr.id)?.status).toBe("disabled");
    const created = (
      await call(aCookie, {
        method: "POST",
        url: "/api/admin/stores",
        payload: { name: "injected switches", status: "disabled", adEnabled: true },
      })
    ).json<StoreDetail>();
    expect(created).toMatchObject({ status: "active", adEnabled: false });
    expect(
      (
        await call(aCookie, {
          method: "PUT",
          url: `/api/admin/stores/${created.id}/wifi`,
          payload: { ...payload, status: "disabled" },
        })
      ).statusCode,
    ).toBe(403);
  });

  it("treats every other login as an operator even when its stored role is admin", async () => {
    const account = repository.admins.find((item) => item.id === a.id)!;
    account.role = "admin";
    const signedIn = await login(a.username);
    expect(signedIn.json()).toMatchObject({ admin: { role: "operator" } });
    for (const cookie of [aCookie, sessionCookie(signedIn.headers)]) {
      expect(
        (await call(cookie, { method: "GET", url: "/api/admin/auth/session" })).json(),
      ).toMatchObject({ admin: { role: "operator" } });
      for (const url of [
        "/api/admin/accounts",
        "/api/admin/operation-logs",
        "/api/admin/settings",
        "/api/admin/dashboard",
      ])
        expect((await call(cookie, { method: "GET", url })).statusCode).toBe(403);
    }
    expect(
      (await call(adminCookie, { method: "GET", url: "/api/admin/accounts" }))
        .json<AccountSummary[]>()
        .find((item) => item.id === a.id)?.role,
    ).toBe("operator");
    expect(
      (
        await call(adminCookie, {
          method: "PATCH",
          url: `/api/admin/accounts/${a.id}/status`,
          payload: { status: "disabled" },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("shows independent user and QR creators after transfer and keeps unknown history explicit", async () => {
    await call(adminCookie, {
      method: "POST",
      url: `/api/admin/stores/${aStore.id}/transfer`,
      payload: { ownerId: b.id, reason: "handover" },
    });
    const qr = (
      await call(bCookie, { method: "POST", url: `/api/admin/stores/${aStore.id}/qrcode` })
    ).json<QrCodeResponse>();
    expect(qr.createdByUsername).toBe(b.username);
    for (const url of [`/api/admin/stores/${aStore.id}`, `/api/admin/stores/${aStore.id}/qrcode`]) {
      const data = (await call(adminCookie, { method: "GET", url })).json<
        StoreDetail | QrCodeResponse
      >();
      expect(data.createdByUsername).toBe(url.endsWith("qrcode") ? b.username : a.username);
    }
    const list = (await call(adminCookie, { method: "GET", url: "/api/admin/stores" })).json<{
      items: StoreDetail[];
    }>();
    expect(list.items.find((item) => item.id === aStore.id)).toMatchObject({
      createdByUsername: a.username,
      ownerId: b.id,
      qrCode: { createdByUsername: b.username },
    });
    repository.stores.get(aStore.id)!.createdById = null;
    expect(
      (
        await call(adminCookie, { method: "GET", url: `/api/admin/stores/${aStore.id}` })
      ).json<StoreDetail>().createdByUsername,
    ).toBe(a.username);
    repository.logs.length = 0;
    expect(
      (
        await call(adminCookie, { method: "GET", url: `/api/admin/stores/${aStore.id}` })
      ).json<StoreDetail>(),
    ).toMatchObject({ createdByUsername: null, qrCode: { createdByUsername: null } });
  });

  it("transfers access immediately while keeping creator, Wi-Fi, QR scene and transfer history", async () => {
    await call(aCookie, {
      method: "PUT",
      url: `/api/admin/stores/${aStore.id}/wifi`,
      payload: { ssid: "unchanged", password: "wifi-password" },
    });
    const qr = (
      await call(aCookie, { method: "POST", url: `/api/admin/stores/${aStore.id}/qrcode` })
    ).json<QrCodeResponse>();
    const result = await call(adminCookie, {
      method: "POST",
      url: `/api/admin/stores/${aStore.id}/transfer`,
      payload: { ownerId: b.id, reason: "用户交接" },
    });
    expect(result.statusCode).toBe(204);
    expect(
      (await call(aCookie, { method: "GET", url: `/api/admin/stores/${aStore.id}` })).statusCode,
    ).toBe(404);
    const store = (
      await call(bCookie, { method: "GET", url: `/api/admin/stores/${aStore.id}` })
    ).json<StoreDetail>();
    expect(store).toMatchObject({
      ownerId: b.id,
      createdById: a.id,
      wifi: { ssid: "unchanged", version: 1 },
      qrCode: { sceneToken: qr.sceneToken },
    });
    expect(repository.logs.find((log) => log.action === "store.transfer")?.metadata).toMatchObject({
      previousOwnerId: a.id,
      ownerId: b.id,
      reason: "用户交接",
    });
    await call(adminCookie, {
      method: "POST",
      url: `/api/admin/stores/${aStore.id}/transfer`,
      payload: { ownerId: null, reason: "收回平台" },
    });
    expect(
      (await call(bCookie, { method: "GET", url: `/api/admin/qrcodes/${qr.id}/download` }))
        .statusCode,
    ).toBe(404);
    expect(repository.logs.filter((log) => log.action === "store.transfer")).toHaveLength(2);
  });

  it("rejects a QR generation that loses ownership while waiting for the provider", async () => {
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const generate = provider.generate.bind(provider);
    vi.spyOn(provider, "generate").mockImplementation(async (scene) => {
      entered();
      await gate;
      return generate(scene);
    });
    const generating = call(aCookie, {
      method: "POST",
      url: `/api/admin/stores/${aStore.id}/qrcode`,
    }).then((response) => response);
    await ready;
    try {
      expect(
        (
          await call(adminCookie, {
            method: "POST",
            url: `/api/admin/stores/${aStore.id}/transfer`,
            payload: { ownerId: b.id, reason: "生成期间交接" },
          })
        ).statusCode,
      ).toBe(204);
    } finally {
      release();
    }
    expect((await generating).statusCode).toBe(404);
    expect(repository.qrs.size).toBe(0);
    expect(repository.stores.get(aStore.id)?.ownerId).toBe(b.id);
  });

  it("revokes sessions on disable/reset/change and preserves active customer store data", async () => {
    expect(
      (
        await call(adminCookie, {
          method: "PATCH",
          url: `/api/admin/accounts/${a.id}/status`,
          payload: { status: "disabled" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await call(aCookie, { method: "GET", url: "/api/admin/auth/session" })).statusCode,
    ).toBe(401);
    expect((await login(a.username)).statusCode).toBe(401);
    expect(repository.stores.get(aStore.id)?.status).toBe("active");
    expect(
      (
        await call(adminCookie, {
          method: "POST",
          url: `/api/admin/stores/${bStore.id}/transfer`,
          payload: { ownerId: a.id, reason: "无效负责人" },
        })
      ).statusCode,
    ).toBe(409);
    await call(adminCookie, {
      method: "PATCH",
      url: `/api/admin/accounts/${a.id}/status`,
      payload: { status: "active" },
    });
    expect(
      (await call(aCookie, { method: "GET", url: "/api/admin/auth/session" })).statusCode,
    ).toBe(401);
    aCookie = sessionCookie((await login(a.username)).headers);
    await call(adminCookie, {
      method: "POST",
      url: `/api/admin/accounts/${a.id}/password`,
      payload: { password: "new operator password" },
    });
    expect((await call(aCookie, { method: "GET", url: "/api/admin/stores" })).statusCode).toBe(401);
    expect((await login(a.username)).statusCode).toBe(401);
    aCookie = sessionCookie((await login(a.username, "new operator password")).headers);
    expect(
      (
        await call(aCookie, {
          method: "POST",
          url: "/api/admin/auth/password",
          payload: { currentPassword: "wrong password", newPassword: "self changed password" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await call(aCookie, {
          method: "POST",
          url: "/api/admin/auth/password",
          payload: {
            currentPassword: "new operator password",
            newPassword: "self changed password",
          },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await call(aCookie, { method: "GET", url: "/api/admin/auth/session" })).statusCode,
    ).toBe(401);
    expect((await login(a.username, "self changed password")).statusCode).toBe(200);
    expect(
      (
        await call(adminCookie, {
          method: "PATCH",
          url: `/api/admin/accounts/${repository.admins[0]!.id}/status`,
          payload: { status: "disabled" },
        })
      ).statusCode,
    ).toBe(404);
    expect(JSON.stringify(repository.logs)).not.toContain("self changed password");
  });
});
