import { randomBytes, randomUUID } from "node:crypto";
import { createStoreSchema, wifiSpotSchema } from "@scan-wifi/validation";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.js";
import { PostgresPlatformRepository } from "../../src/repositories/platform-repository.js";
import { AuditService } from "../../src/services/audit-service.js";
import { EncryptionService } from "../../src/services/encryption-service.js";
import { MerchantAuthService } from "../../src/services/merchant-auth-service.js";
import { QrCodeService } from "../../src/services/qrcode-service.js";
import { StoreService } from "../../src/services/store-service.js";
import { WifiSpotService } from "../../src/services/wifi-spot-service.js";
import { FakeQrCodeProvider, MemoryQrCodeStorage } from "../helpers/fakes.js";

const DEFAULT_LOCAL_DATABASE_URL = "postgresql://scan_wifi:scan_wifi_dev@127.0.0.1:5432/scan_wifi";

function databaseErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    if (typeof code === "string" && /^[A-Z0-9_]+$/u.test(code)) return code;
  }
  return error instanceof Error ? error.name : "UNKNOWN_ERROR";
}

async function connectToPostgres(): Promise<Pool | null> {
  const pool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL,
    max: 4,
    connectionTimeoutMillis: 750,
    idleTimeoutMillis: 1_000,
    options: "-c statement_timeout=5000",
    application_name: "scan-wifi-api-postgres-tests",
  });

  try {
    const result = await pool.query<{ connectionEvents: string | null }>(
      "select to_regclass('public.connection_events')::text as \"connectionEvents\"",
    );
    if (!result.rows[0]?.connectionEvents) {
      process.stderr.write(
        "[postgres integration] skipped: connection_events is not migrated in the configured database.\n",
      );
      await pool.end();
      return null;
    }
    return pool;
  } catch (error) {
    process.stderr.write(
      `[postgres integration] skipped: database unavailable (${databaseErrorCode(error)}). ` +
        "Set TEST_DATABASE_URL to run these checks.\n",
    );
    await pool.end();
    return null;
  }
}

const pool = await connectToPostgres();
const postgresDescribe = pool ? describe : describe.skip;
const postgresWriteIt = pool && process.env.TEST_DATABASE_URL ? it : it.skip;

async function createSpotFixture(databasePool: Pool) {
  const input = wifiSpotSchema.parse({
    shopName: `spot-store-${randomUUID()}`,
    ssid: `spot-ssid-${randomBytes(8).toString("hex")}`,
    password: "fixture-password",
  });
  const repository = new PostgresPlatformRepository(drizzle(databasePool, { schema }));
  const owner = await repository.createMerchant({
    name: `spot-owner-${randomUUID()}`,
    status: "active",
  });
  const other = await repository.createMerchant({
    name: `spot-other-${randomUUID()}`,
    status: "active",
  });
  const encryption = new EncryptionService(randomBytes(32).toString("base64"));
  const storage = new MemoryQrCodeStorage();
  const provider = new FakeQrCodeProvider();
  const qrCodes = new QrCodeService(repository, provider, storage, new AuditService(repository));
  const service = new WifiSpotService(repository, encryption, qrCodes);
  const spot = await service.save(owner.id, input);
  const wifi = (await repository.getWifiById(spot.id))!;
  const cleanup = async () => {
    await databasePool.query(
      `delete from operation_logs where resource_id in (
      select w.id::text from wifi_configs w join stores s on s.id=w.store_id where s.merchant_id=any($1::uuid[])
      union select q.id::text from qr_codes q join stores s on s.id=q.store_id where s.merchant_id=any($1::uuid[])
    )`,
      [[owner.id, other.id]],
    );
    await databasePool.query("delete from stores where merchant_id=any($1::uuid[])", [
      [owner.id, other.id],
    ]);
    await databasePool.query("delete from merchants where id=any($1::uuid[])", [
      [owner.id, other.id],
    ]);
  };
  return {
    repository,
    owner,
    other,
    encryption,
    storage,
    provider,
    qrCodes,
    service,
    input,
    spot,
    wifi,
    cleanup,
  };
}

async function waitForStoreLock(databasePool: Pool): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const result = await databasePool.query<{ waiting: boolean }>(`select exists (
      select 1 from pg_stat_activity where application_name='scan-wifi-api-postgres-tests'
      and pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%for update%'
    ) as waiting`);
    if (result.rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected merchant operation to wait for the store row lock");
}

postgresDescribe("PostgresPlatformRepository", () => {
  postgresWriteIt(
    "keeps one merchant identity across concurrent logins and session-key rotation",
    async () => {
      if (!pool) return;
      const repository = new PostgresPlatformRepository(drizzle(pool, { schema }));
      const openid = `openid-fixture-${randomUUID()}`;
      const provider = { exchange: async () => openid };
      const auth = new MerchantAuthService(repository, provider, randomBytes(32).toString("hex"));
      const sessions = await Promise.all(
        Array.from({ length: 3 }, () => auth.login("fixture-code")),
      );
      const owners = await Promise.all(
        sessions.map((session) => auth.authenticate(`Bearer ${session.token}`)),
      );
      const ownerId = owners[0]!;
      try {
        expect(new Set(owners).size).toBe(1);
        const persisted = await pool.query(
          "select token_hash from merchant_sessions where merchant_id=$1",
          [ownerId],
        );
        expect(persisted.rows).toHaveLength(3);
        expect(JSON.stringify(persisted.rows)).not.toContain(sessions[0]!.token);
        const merchant = await pool.query<{ openid_hash: string }>(
          "select openid_hash from merchants where id=$1",
          [ownerId],
        );
        expect(merchant.rows[0]?.openid_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(merchant.rows)).not.toContain(openid);
        const rotated = new MerchantAuthService(
          repository,
          provider,
          randomBytes(32).toString("hex"),
        );
        await expect(rotated.authenticate(`Bearer ${sessions[0]!.token}`)).rejects.toMatchObject({
          code: "UNAUTHORIZED",
        });
        const newSession = await rotated.login("next-code");
        expect(await rotated.authenticate(`Bearer ${newSession.token}`)).toBe(ownerId);
        await auth.logout(`Bearer ${sessions[0]!.token}`);
        await expect(auth.authenticate(`Bearer ${sessions[0]!.token}`)).rejects.toMatchObject({
          code: "UNAUTHORIZED",
        });
        await repository.updateMerchant(ownerId, { status: "disabled" });
        await expect(rotated.authenticate(`Bearer ${newSession.token}`)).rejects.toMatchObject({
          code: "UNAUTHORIZED",
        });
        await expect(auth.login("disabled-code")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await repository.updateMerchant(ownerId, { status: "active" });
        await pool.query(
          "update merchant_sessions set expires_at=now()-interval '1 minute' where merchant_id=$1",
          [ownerId],
        );
        await expect(auth.authenticate(`Bearer ${sessions[1]!.token}`)).rejects.toMatchObject({
          code: "UNAUTHORIZED",
        });
      } finally {
        await pool.query("delete from merchants where id=$1", [ownerId]);
      }
    },
  );

  postgresWriteIt(
    "isolates owned spots, serializes permanent-code regeneration, and erases deleted credentials",
    async () => {
      if (!pool) return;
      const fixture = await createSpotFixture(pool);
      const { service, owner, other, repository, input, spot, wifi, storage, encryption } = fixture;
      try {
        expect(JSON.stringify(wifi)).not.toContain(input.password);
        expect(await service.list(other.id, "")).toEqual([]);
        for (const operation of [
          () => service.get(other.id, spot.id),
          () => service.save(other.id, input, spot.id),
          () => service.status(other.id, spot.id, "disabled"),
          () => service.remove(other.id, spot.id),
          () => service.generate(other.id, spot.id),
          () => service.image(other.id, spot.id),
        ])
          await expect(operation()).rejects.toMatchObject({ code: "SPOT_NOT_FOUND" });
        const generations = await Promise.all([
          service.generate(owner.id, spot.id),
          service.generate(owner.id, spot.id),
        ]);
        expect(generations.every((generated) => generated.shortId === spot.shortId)).toBe(true);
        expect(new Set(generations.map((generated) => generated.qrFileId)).size).toBe(1);
        expect(storage.size).toBe(1);
        const codes = await pool.query("select id from qr_codes where wifi_id=$1", [spot.id]);
        expect(codes.rowCount).toBe(1);
        await service.save(owner.id, { ...input, password: "edited-password" }, spot.id);
        const updated = (await repository.getWifiById(spot.id))!;
        expect(updated.shortId).toBe(spot.shortId);
        expect(
          encryption.decrypt(
            {
              ciphertext: updated.encryptedPassword,
              iv: updated.passwordIv,
              authTag: updated.passwordAuthTag,
            },
            `wifi-config:v1:${wifi.storeId}`,
          ),
        ).toBe("edited-password");
        await service.status(owner.id, spot.id, "disabled");
        expect((await repository.getWifiById(spot.id))?.status).toBe("disabled");
        await service.status(owner.id, spot.id, "active");
        await service.remove(owner.id, spot.id);
        expect(await service.list(owner.id, "")).toEqual([]);
        expect(await repository.listWifi(wifi.storeId)).toEqual([]);
        const deleted = await pool.query<{
          encrypted_password: string;
          password_iv: string;
          password_auth_tag: string;
          deleted_at: Date | null;
        }>(
          "select encrypted_password, password_iv, password_auth_tag, deleted_at from wifi_configs where id=$1",
          [spot.id],
        );
        expect(deleted.rows[0]).toMatchObject({
          encrypted_password: "",
          password_iv: "",
          password_auth_tag: "",
        });
        expect(deleted.rows[0]?.deleted_at).toBeInstanceOf(Date);
        expect((await repository.getQrByScene(spot.shortId))?.status).toBe("disabled");
        expect(
          (await repository.listStores({ page: 1, pageSize: 20, search: input.shopName })).items[0]
            ?.hasWifi,
        ).toBe(false);
        expect(
          (await repository.listStores({ page: 1, pageSize: 20, search: input.ssid })).total,
        ).toBe(0);
        await expect(service.save(owner.id, input, spot.id)).rejects.toMatchObject({
          code: "SPOT_NOT_FOUND",
        });
        await expect(service.generate(owner.id, spot.id)).rejects.toMatchObject({
          code: "SPOT_NOT_FOUND",
        });
      } finally {
        await fixture.cleanup();
      }
    },
  );

  postgresWriteIt("counts successful connections for the selected Wi-Fi only", async () => {
    if (!pool) return;
    const fixture = await createSpotFixture(pool);
    const { repository, service, owner, spot, wifi } = fixture;
    try {
      const second = await repository.saveWifi({
        storeId: wifi.storeId,
        shortId: randomBytes(16).toString("hex"),
        ssid: "Second network",
        encryptedPassword: wifi.encryptedPassword,
        passwordIv: wifi.passwordIv,
        passwordAuthTag: wifi.passwordAuthTag,
        bssid: null,
        securityType: "WPA2",
        status: "active",
      });
      for (const network of [wifi, second]) {
        const qr = await fixture.qrCodes.generate(wifi.storeId, null, network.id);
        for (let index = 0; index < (network.id === wifi.id ? 1 : 2); index++)
          await repository.insertEvent({
            storeId: wifi.storeId,
            wifiId: network.id,
            qrCodeId: qr.id,
            eventType: "connect_success",
            platform: "android",
            errorCode: null,
            errorMessageSanitized: null,
            occurredAt: new Date(Date.now() - 1000),
          });
      }
      expect((await service.get(owner.id, spot.id)).connectCount).toBe(1);
      expect((await service.get(owner.id, second.id)).connectCount).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });

  postgresWriteIt(
    "rechecks ownership and deletion after waiting for a concurrent store write",
    async () => {
      if (!pool) return;
      const fixture = await createSpotFixture(pool);
      const holder = await pool.connect();
      const { owner, other, wifi, spot, service, input } = fixture;
      try {
        await holder.query("begin");
        await holder.query("select id from stores where id=$1 for update", [wifi.storeId]);
        const generate = service.generate(owner.id, spot.id);
        const denied = expect(generate).rejects.toMatchObject({ code: "SPOT_NOT_FOUND" });
        await waitForStoreLock(pool);
        await holder.query("update stores set merchant_id=$1 where id=$2", [
          other.id,
          wifi.storeId,
        ]);
        await holder.query("commit");
        await denied;
        expect(fixture.storage.size).toBe(0);
        await holder.query("begin");
        await holder.query("select id from stores where id=$1 for update", [wifi.storeId]);
        const save = service.save(other.id, { ...input, shopName: "Must not apply" }, spot.id);
        const removed = expect(save).rejects.toMatchObject({ code: "SPOT_NOT_FOUND" });
        await waitForStoreLock(pool);
        await holder.query(
          "update wifi_configs set deleted_at=now(),status='disabled',encrypted_password='',password_iv='',password_auth_tag='' where id=$1",
          [spot.id],
        );
        await holder.query("commit");
        await removed;
        expect((await fixture.repository.getStore(wifi.storeId))?.name).toBe(input.shopName);
      } finally {
        await holder.query("rollback");
        holder.release();
        await fixture.cleanup();
      }
    },
  );

  it("loads dashboard aggregates with a valid grouped trend query", async () => {
    if (!pool) return;
    const database = drizzle(pool, { schema });
    const repository = new PostgresPlatformRepository(database);

    const dashboard = await repository.getDashboard(new Date("2026-07-12T12:00:00.000Z"));

    expect(dashboard.storeTotal).toBeGreaterThanOrEqual(0);
    expect(dashboard.activeQrCodeTotal).toBeGreaterThanOrEqual(0);
    expect(dashboard.trend).toHaveLength(7);
    expect(dashboard.trend.map((point) => point.date)).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
    ]);
  });

  it("executes joined operation-log search with an action namespace filter", async () => {
    if (!pool) return;
    const database = drizzle(pool, { schema });
    const repository = new PostgresPlatformRepository(database);

    const result = await repository.listOperationLogs({
      page: 1,
      pageSize: 20,
      search: "admin",
      action: "store",
    });

    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(
      result.items.every((item) => item.action === "store" || item.action.startsWith("store.")),
    ).toBe(true);
  });

  it("runs with an application role that cannot create databases, roles, or schema objects", async () => {
    if (!pool) return;
    const result = await pool.query<{
      superuser: boolean;
      createDatabase: boolean;
      createRole: boolean;
      createInPublic: boolean;
    }>(`
      select
        rolsuper as "superuser",
        rolcreatedb as "createDatabase",
        rolcreaterole as "createRole",
        has_schema_privilege(current_user, 'public', 'CREATE') as "createInPublic"
      from pg_roles
      where rolname = current_user
    `);
    expect(result.rows[0]).toEqual({
      superuser: false,
      createDatabase: false,
      createRole: false,
      createInPublic: false,
    });
  });

  postgresWriteIt(
    "keeps global and newly created store advertising disabled after migrations",
    async () => {
      if (!pool) return;
      const marker = `ad-default-${randomUUID()}`;
      try {
        const inserted = await pool.query<{ adEnabled: boolean }>(
          'insert into stores (name) values ($1) returning ad_enabled as "adEnabled"',
          [marker],
        );
        const setting = await pool.query<{ value: boolean }>(
          "select value #>> '{}' = 'true' as value from system_settings where key = 'global_ad_enabled'",
        );
        expect(inserted.rows[0]?.adEnabled).toBe(false);
        expect(setting.rows[0]?.value).toBe(false);
      } finally {
        await pool.query("delete from stores where name = $1", [marker]);
      }
    },
  );

  postgresWriteIt(
    "serializes concurrent QR replacement and leaves exactly one active code",
    async () => {
      if (!pool) return;
      const database = drizzle(pool, { schema });
      const repository = new PostgresPlatformRepository(database);
      const marker = `qr-concurrency-${randomUUID()}`;
      const store = await repository.createStore(createStoreSchema.parse({ name: marker }));
      try {
        const scenes = [randomBytes(16).toString("hex"), randomBytes(16).toString("hex")];
        await Promise.all(
          scenes.map((sceneToken) =>
            repository.replaceActiveQr({
              storeId: store.id,
              sceneToken,
              imageUrl: `local://qrcodes/${sceneToken}.svg`,
              provider: "local-placeholder",
            }),
          ),
        );
        const rows = await pool.query<{ status: "active" | "disabled" }>(
          "select status from qr_codes where store_id = $1",
          [store.id],
        );
        expect(rows.rowCount).toBe(2);
        expect(rows.rows.filter((row) => row.status === "active")).toHaveLength(1);
      } finally {
        await pool.query("delete from stores where id = $1", [store.id]);
      }
    },
  );

  postgresWriteIt(
    "rolls back a store when its real audit insert violates a foreign key",
    async () => {
      if (!pool) return;
      const database = drizzle(pool, { schema });
      const repository = new PostgresPlatformRepository(database);
      const service = new StoreService(
        repository,
        new EncryptionService(randomBytes(32).toString("base64")),
        new AuditService(repository),
      );
      const marker = `audit-rollback-${randomUUID()}`;

      try {
        await expect(
          service.create(createStoreSchema.parse({ name: marker }), randomUUID()),
        ).rejects.toBeDefined();
        const result = await repository.listStores({ page: 1, pageSize: 20, search: marker });
        expect(result.total).toBe(0);
      } finally {
        await pool.query("delete from stores where name = $1", [marker]);
      }
    },
  );

  postgresWriteIt(
    "binds an old printed code once and isolates concurrent QR rotations by network",
    async () => {
      if (!pool) return;
      const repository = new PostgresPlatformRepository(drizzle(pool, { schema }));
      const store = await repository.createStore(
        createStoreSchema.parse({ name: `multi-${randomUUID()}` }),
      );
      const input = {
        storeId: store.id,
        ssid: "Guest-1",
        encryptedPassword: "ciphertext",
        passwordIv: "iv",
        passwordAuthTag: "tag",
        bssid: null,
        securityType: null,
        status: "active" as const,
      };
      const createQr = (wifiId?: string) =>
        repository.replaceActiveQr({
          storeId: store.id,
          ...(wifiId ? { wifiId } : {}),
          sceneToken: randomBytes(16).toString("hex"),
          imageUrl: "local://fixture.svg",
          provider: "local-placeholder",
        });
      try {
        const legacy = await createQr();
        const first = await repository.saveWifi(input);
        const second = await repository.saveWifi({ ...input, ssid: "Guest-2" });
        expect((await repository.getQrByScene(legacy.sceneToken))?.wifiId).toBe(first.id);
        await repository.saveWifi({ ...input, encryptedPassword: "updated-ciphertext" }, first.id);
        expect((await repository.getQrByScene(legacy.sceneToken))?.status).toBe("active");
        await Promise.all([
          createQr(first.id),
          createQr(first.id),
          createQr(second.id),
          createQr(second.id),
        ]);
        const active = await pool.query<{ wifi_id: string; count: string }>(
          "select wifi_id, count(*) from qr_codes where store_id=$1 and status='active' group by wifi_id",
          [store.id],
        );
        expect(active.rows).toHaveLength(2);
        expect(active.rows.every((row) => Number(row.count) === 1)).toBe(true);
        await repository.setQrStatus(legacy.id, "active", new Date());
        expect((await repository.getQrByScene(legacy.sceneToken))?.status).toBe("active");
        expect((await repository.getLatestQrForWifi(second.id))?.status).toBe("active");
        expect(await repository.listWifi(store.id)).toHaveLength(2);
        await expect(
          repository.replaceActiveQr({
            storeId: store.id,
            wifiId: randomUUID(),
            sceneToken: randomBytes(16).toString("hex"),
            imageUrl: "local://fixture.svg",
            provider: "local-placeholder",
          }),
        ).rejects.toBeDefined();
      } finally {
        await pool.query("delete from stores where id=$1", [store.id]);
      }
    },
  );

  postgresWriteIt(
    "aggregates daily UV and success per attempt with merchant/network filters in PostgreSQL",
    async () => {
      if (!pool) return;
      const repository = new PostgresPlatformRepository(drizzle(pool, { schema }));
      const merchant = await repository.createMerchant({
        name: `analytics-${randomUUID()}`,
        status: "active",
      });
      const store = await repository.createStore(
        createStoreSchema.parse({ name: "Analytics fixture", merchantId: merchant.id }),
      );
      try {
        const wifi = await repository.saveWifi({
          storeId: store.id,
          ssid: "Guest",
          encryptedPassword: "ciphertext",
          passwordIv: "iv",
          passwordAuthTag: "tag",
          bssid: null,
          securityType: null,
          status: "active",
        });
        const qr = await repository.replaceActiveQr({
          storeId: store.id,
          wifiId: wifi.id,
          sceneToken: randomBytes(16).toString("hex"),
          imageUrl: "local://fixture.svg",
          provider: "local-placeholder",
        });
        const eventTypes = [
          "page_view",
          "page_view",
          "scan",
          "connect_click",
          "connect_click",
          "connect_click",
          "connect_success",
          "connect_failure",
          "password_copy",
        ] as const;
        for (const eventType of eventTypes)
          await repository.insertEvent({
            storeId: store.id,
            wifiId: wifi.id,
            qrCodeId: qr.id,
            visitorHash: "a".repeat(64),
            eventType,
            platform: "android",
            errorCode: null,
            errorMessageSanitized: null,
            occurredAt: new Date("2026-09-13T23:59:59Z"),
          });
        await repository.insertEvent({
          storeId: store.id,
          wifiId: wifi.id,
          qrCodeId: qr.id,
          visitorHash: "b".repeat(64),
          eventType: "page_view",
          platform: "ios",
          errorCode: null,
          errorMessageSanitized: null,
          occurredAt: new Date("2026-09-14T00:00:00Z"),
        });
        const query = {
          from: "2026-09-13T00:00:00Z",
          to: "2026-09-14T00:00:00Z",
          merchantId: merchant.id,
          storeId: store.id,
          wifiId: wifi.id,
        };
        const rows = await repository.getAnalytics(query);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          date: "2026-09-13",
          merchantId: merchant.id,
          wifiId: wifi.id,
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
        expect(await repository.getAnalytics({ ...query, merchantId: randomUUID() })).toEqual([]);
      } finally {
        await pool.query("delete from stores where id=$1", [store.id]);
        await pool.query("delete from merchants where id=$1", [merchant.id]);
      }
    },
  );

  postgresWriteIt(
    "finds a store by Wi-Fi SSID and rolls the fixture transaction back",
    async () => {
      if (!pool) return;
      const database = drizzle(pool, { schema });
      const repository = new PostgresPlatformRepository(database);
      const marker = `ssid-search-${randomUUID()}`;
      const rollback = new Error("rollback fixture");

      await expect(
        repository.transaction(async (transaction) => {
          const store = await transaction.createStore(createStoreSchema.parse({ name: marker }));
          await transaction.upsertWifi({
            storeId: store.id,
            ssid: marker,
            encryptedPassword: "encrypted",
            passwordIv: "iv",
            passwordAuthTag: "tag",
            bssid: null,
            securityType: "WPA2_WPA3",
            status: "active",
          });
          const result = await transaction.listStores({ page: 1, pageSize: 20, search: marker });
          expect(result.items.map((item) => item.id)).toContain(store.id);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      const afterRollback = await repository.listStores({ page: 1, pageSize: 20, search: marker });
      expect(afterRollback.total).toBe(0);
    },
  );
});

afterAll(async () => {
  if (pool) await pool.end();
});
