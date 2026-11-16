import { randomBytes, randomUUID } from "node:crypto";
import { createStoreSchema } from "@scan-wifi/validation";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.js";
import { PostgresPlatformRepository } from "../../src/repositories/platform-repository.js";
import { AuditService } from "../../src/services/audit-service.js";
import { EncryptionService } from "../../src/services/encryption-service.js";
import { StoreService } from "../../src/services/store-service.js";

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

postgresDescribe("PostgresPlatformRepository", () => {
  it("migrates away user notes while retaining other profile columns", async () => {
    if (!pool) return;
    const result = await pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'stores'",
    );
    const columns = result.rows.map((row) => row.column_name);
    expect(columns).not.toContain("notes");
    expect(columns).toEqual(
      expect.arrayContaining([
        "name",
        "short_name",
        "logo_url",
        "address",
        "contact_name",
        "contact_phone",
      ]),
    );
  });
  postgresWriteIt(
    "checks ownership after a concurrent transfer releases its store lock",
    async () => {
      if (!pool) return;
      const repository = new PostgresPlatformRepository(drizzle(pool, { schema }));
      const a = await repository.createOperator(`race-a-${randomUUID()}`, "hash");
      const b = await repository.createOperator(`race-b-${randomUUID()}`, "hash");
      if (!a || !b) throw new Error("missing fixture account");
      const store = await repository.createStore(
        createStoreSchema.parse({ name: "before transfer" }),
        a.id,
      );
      const service = new StoreService(
        repository,
        new EncryptionService(randomBytes(32).toString("base64")),
        new AuditService(repository),
      );
      let unlock!: () => void;
      let locked!: () => void;
      const ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const transfer = repository.transaction(async (transaction) => {
        await transaction.getStore(store.id, true);
        await transaction.transferStore(store.id, b.id);
        locked();
        await gate;
      });
      await ready;
      const mutation = service
        .update(store.id, { name: "stale owner write" }, { id: a.id, role: "operator" })
        .catch((error: unknown) => error);
      try {
        let waiting = false;
        for (let attempt = 0; attempt < 40 && !waiting; attempt++) {
          const result = await pool.query<{ waiting: boolean }>(
            "select exists(select 1 from pg_stat_activity where application_name = 'scan-wifi-api-postgres-tests' and wait_event_type = 'Lock') as waiting",
          );
          waiting = result.rows[0]?.waiting ?? false;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(waiting).toBe(true);
      } finally {
        unlock();
        await transfer;
      }
      try {
        expect(await mutation).toMatchObject({ code: "STORE_NOT_FOUND", statusCode: 404 });
        expect(await repository.getStore(store.id)).toMatchObject({
          ownerId: b.id,
          createdById: a.id,
          name: "before transfer",
        });
      } finally {
        await pool.query("delete from stores where id = $1", [store.id]);
        await pool.query("delete from admins where id = any($1::uuid[])", [[a.id, b.id]]);
      }
    },
  );

  postgresWriteIt(
    "scopes real SQL lists, QR counts, trends and event totals by owner",
    async () => {
      if (!pool) return;
      const repository = new PostgresPlatformRepository(drizzle(pool, { schema }));
      const rollback = new Error("rollback ownership fixture");
      await expect(
        repository.transaction(async (transaction) => {
          const a = await transaction.createOperator(`a-${randomUUID()}`, "hash");
          const b = await transaction.createOperator(`b-${randomUUID()}`, "hash");
          if (!a || !b) throw new Error("missing fixture account");
          const storeA = await transaction.createStore(
            createStoreSchema.parse({ name: "owned A" }),
            a.id,
          );
          const storeB = await transaction.createStore(
            createStoreSchema.parse({ name: "owned B" }),
            b.id,
          );
          const qr = await transaction.replaceActiveQr({
            storeId: storeB.id,
            sceneToken: randomBytes(16).toString("hex"),
            imageUrl: "local://fixture.svg",
            provider: "local-placeholder",
          });
          const now = new Date();
          for (const storeId of [storeA.id, storeB.id, storeB.id])
            await transaction.insertEvent({
              storeId,
              qrCodeId: qr.id,
              eventType: "page_view",
              platform: "android",
              errorCode: null,
              errorMessageSanitized: null,
              occurredAt: now,
            });
          const list = await transaction.listStores({ page: 1, pageSize: 20, ownerId: a.id });
          expect(list.total).toBe(1);
          expect(list.items.map((store) => store.id)).toEqual([storeA.id]);
          const aggregate = await transaction.getDashboard(now, a.id);
          expect(aggregate).toMatchObject({
            storeTotal: 1,
            activeQrCodeTotal: 0,
            today: { pageViews: 1 },
            funnel: { pageViews: 1 },
          });
          expect(aggregate.trend.reduce((sum, point) => sum + point.pageViews, 0)).toBe(1);
          await transaction.transferStore(storeA.id, b.id);
          expect(
            (await transaction.listStores({ page: 1, pageSize: 20, ownerId: a.id })).total,
          ).toBe(0);
          expect((await transaction.getStore(storeA.id))?.createdById).toBe(a.id);
          expect((await transaction.getDashboard(now, b.id)).today.pageViews).toBe(3);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    },
  );

  postgresWriteIt(
    "projects immutable creator accounts from real SQL including historical audit records",
    async () => {
      if (!pool) return;
      const repository = new PostgresPlatformRepository(drizzle(pool, { schema }));
      const rollback = new Error("rollback creator fixture");
      await expect(
        repository.transaction(async (transaction) => {
          const a = await transaction.createOperator(`creator-${randomUUID()}`, "hash");
          const b = await transaction.createOperator(`qr-${randomUUID()}`, "hash");
          if (!a || !b) throw new Error("missing fixture accounts");
          const store = await transaction.createStore(
            createStoreSchema.parse({ name: "creator test" }),
            a.id,
          );
          const historical = await transaction.createStore(
            createStoreSchema.parse({ name: "historical test" }),
          );
          const unknown = await transaction.createStore(
            createStoreSchema.parse({ name: "unknown test" }),
          );
          const qr = await transaction.replaceActiveQr({
            storeId: store.id,
            sceneToken: randomBytes(16).toString("hex"),
            imageUrl: "local://fixture.svg",
            provider: "local-placeholder",
          });
          await transaction.insertOperationLog({
            adminId: b.id,
            action: "qrcode.generate",
            resourceType: "qr_code",
            resourceId: qr.id,
            metadata: {},
            createdAt: new Date(),
          });
          await transaction.insertOperationLog({
            adminId: a.id,
            action: "store.create",
            resourceType: "store",
            resourceId: historical.id,
            metadata: {},
            createdAt: new Date(),
          });
          await transaction.transferStore(store.id, b.id);
          expect(await transaction.getStore(store.id, true)).toMatchObject({
            createdByUsername: a.username,
            ownerId: b.id,
          });
          expect(await transaction.getStore(historical.id)).toMatchObject({
            createdByUsername: a.username,
          });
          expect(await transaction.getStore(unknown.id)).toMatchObject({ createdByUsername: null });
          expect(await transaction.getQrById(qr.id)).toMatchObject({
            createdByUsername: b.username,
          });
          expect(await transaction.getLatestQrForStore(store.id)).toMatchObject({
            createdByUsername: b.username,
          });
          const list = await transaction.listStores({ page: 1, pageSize: 20, ownerId: b.id });
          expect(list.items.find((item) => item.id === store.id)).toMatchObject({
            createdByUsername: a.username,
            qrCode: { createdByUsername: b.username },
          });
          throw rollback;
        }),
      ).rejects.toBe(rollback);
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

  postgresWriteIt(
    "serializes concurrent QR replacements and activations for one store",
    async () => {
      if (!pool) return;
      const repository = new PostgresPlatformRepository(drizzle(pool, { schema }));
      const store = await repository.createStore(
        createStoreSchema.parse({ name: `qr-race-${randomUUID()}` }),
      );
      try {
        const generated = await Promise.all(
          Array.from({ length: 4 }, () =>
            repository.replaceActiveQr({
              storeId: store.id,
              sceneToken: randomBytes(16).toString("hex"),
              imageUrl: "local://qrcodes/fixture.svg",
              provider: "local-placeholder",
            }),
          ),
        );
        await Promise.all(
          generated.map((qr) => repository.setQrStatus(qr.id, "active", new Date())),
        );
        const result = await pool.query<{ count: string }>(
          "select count(*) from qr_codes where store_id = $1 and status = 'active'",
          [store.id],
        );
        expect(Number(result.rows[0]?.count)).toBe(1);
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
          service.create(createStoreSchema.parse({ name: marker }), {
            id: randomUUID(),
            role: "admin",
          }),
        ).rejects.toBeDefined();
        const result = await repository.listStores({ page: 1, pageSize: 20, search: marker });
        expect(result.total).toBe(0);
      } finally {
        await pool.query("delete from stores where name = $1", [marker]);
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
