import type {
  AdminStatus,
  AnalyticsRow,
  ClientPlatform,
  ConnectionEventType,
  QrCodeStatus,
  StoreStatus,
  WifiSecurityType,
  WifiStatus,
} from "@scan-wifi/shared-types";
import type {
  AnalyticsQuery,
  MerchantInput,
  UpdateMerchantInput,
  CreateStoreInput,
  UpdateStoreInput,
} from "@scan-wifi/validation";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  like,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  admins,
  adminSessions,
  merchants,
  merchantSessions,
  DEFAULT_MERCHANT_ID,
  connectionEvents,
  operationLogs,
  qrCodes,
  stores,
  systemSettings,
  wifiConfigs,
} from "../db/schema.js";

export interface AdminRecord {
  id: string;
  username: string;
  passwordHash: string;
  status: AdminStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface SessionRecord {
  tokenHash: string;
  adminId: string;
  adminUsername: string;
  adminStatus: AdminStatus;
  expiresAt: Date;
}

export interface MerchantRecord {
  id: string;
  name: string;
  contact: string | null;
  status: StoreStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreRecord {
  id: string;
  merchantId: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  status: StoreStatus;
  adEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WifiRecord {
  id: string;
  storeId: string;
  ssid: string;
  shortId: string;
  spotName: string;
  deletedAt: Date | null;
  encryptedPassword: string;
  passwordIv: string;
  passwordAuthTag: string;
  bssid: string | null;
  securityType: WifiSecurityType | null;
  status: WifiStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QrCodeRecord {
  id: string;
  wifiId: string | null;
  storeId: string;
  sceneToken: string;
  imageUrl: string;
  provider: "wechat" | "local-placeholder";
  status: QrCodeStatus;
  generatedAt: Date;
  disabledAt: Date | null;
}

export interface StoreListRecord extends StoreRecord {
  hasWifi: boolean;
  qrCodeStatus: QrCodeStatus | null;
}

export interface DashboardAggregate {
  storeTotal: number;
  activeQrCodeTotal: number;
  today: EventTotals;
  funnel: Pick<EventTotals, "pageViews" | "connectClicks" | "connectSuccesses" | "connectFailures">;
  trend: Array<{
    date: string;
    pageViews: number;
    connectClicks: number;
    connectSuccesses: number;
  }>;
}

export interface EventTotals {
  pageViews: number;
  uniqueVisitors: number;
  scans: number;
  passwordCopies: number;
  adLoadSuccesses: number;
  adLoadFailures: number;
  connectClicks: number;
  connectSuccesses: number;
  connectFailures: number;
}

export interface OperationLogRecord {
  id: string;
  adminId: string | null;
  adminUsername: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface PlatformRepository {
  findOrCreateWechatMerchant(openIdHash: string): Promise<MerchantRecord>;
  createMerchantSession(tokenHash: string, merchantId: string, expiresAt: Date): Promise<void>;
  findMerchantSession(tokenHash: string): Promise<string | null>;
  deleteMerchantSession(tokenHash: string): Promise<void>;
  listOwnedWifi(merchantId: string): Promise<WifiRecord[]>;
  deleteWifi(id: string): Promise<void>;
  lockStore(id: string): Promise<void>;
  refreshQrImage(
    id: string,
    imageUrl: string,
    provider: QrCodeRecord["provider"],
  ): Promise<QrCodeRecord>;
  listMerchants(): Promise<MerchantRecord[]>;
  getMerchant(id: string): Promise<MerchantRecord | null>;
  createMerchant(input: MerchantInput): Promise<MerchantRecord>;
  updateMerchant(id: string, input: UpdateMerchantInput): Promise<MerchantRecord | null>;
  listWifi(storeId: string): Promise<WifiRecord[]>;
  getWifiById(id: string): Promise<WifiRecord | null>;
  saveWifi(
    input: Omit<
      WifiRecord,
      "id" | "version" | "createdAt" | "updatedAt" | "shortId" | "spotName" | "deletedAt"
    > &
      Partial<Pick<WifiRecord, "shortId" | "spotName" | "deletedAt">>,
    id?: string,
  ): Promise<WifiRecord>;
  setWifiStatus(id: string, status: WifiStatus): Promise<WifiRecord | null>;
  getLatestQrForWifi(wifiId: string): Promise<QrCodeRecord | null>;
  getAnalytics(input: AnalyticsQuery): Promise<AnalyticsRow[]>;
  healthCheck(): Promise<void>;
  transaction<T>(callback: (repository: PlatformRepository) => Promise<T>): Promise<T>;
  findAdminByUsername(username: string): Promise<AdminRecord | null>;
  findAdminById(id: string): Promise<AdminRecord | null>;
  createAdminIfAbsent(
    username: string,
    passwordHash: string,
  ): Promise<{ admin: AdminRecord; created: boolean }>;
  updateAdminLastLogin(id: string, at: Date): Promise<void>;
  createSession(tokenHash: string, adminId: string, expiresAt: Date): Promise<void>;
  findSession(tokenHash: string, now: Date): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteExpiredSessions(now: Date): Promise<void>;
  listStores(input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: StoreStatus;
  }): Promise<{ items: StoreListRecord[]; total: number }>;
  createStore(input: CreateStoreInput): Promise<StoreRecord>;
  getStore(id: string): Promise<StoreRecord | null>;
  updateStore(id: string, input: UpdateStoreInput): Promise<StoreRecord | null>;
  getWifi(storeId: string): Promise<WifiRecord | null>;
  upsertWifi(
    input: Omit<
      WifiRecord,
      "id" | "version" | "createdAt" | "updatedAt" | "shortId" | "spotName" | "deletedAt"
    > &
      Partial<Pick<WifiRecord, "shortId" | "spotName" | "deletedAt">>,
  ): Promise<WifiRecord>;
  getLatestQrForStore(storeId: string): Promise<QrCodeRecord | null>;
  getQrById(id: string): Promise<QrCodeRecord | null>;
  getQrByScene(sceneToken: string): Promise<QrCodeRecord | null>;
  replaceActiveQr(input: {
    wifiId?: string;
    storeId: string;
    sceneToken: string;
    imageUrl: string;
    provider: QrCodeRecord["provider"];
  }): Promise<QrCodeRecord>;
  setQrStatus(id: string, status: QrCodeStatus, at: Date): Promise<QrCodeRecord | null>;
  insertEvent(input: {
    storeId: string;
    qrCodeId: string;
    wifiId?: string;
    visitorHash?: string | null;
    eventType: ConnectionEventType;
    platform: ClientPlatform;
    errorCode: string | null;
    errorMessageSanitized: string | null;
    occurredAt: Date;
  }): Promise<void>;
  getDashboard(now: Date): Promise<DashboardAggregate>;
  getStoreStatistics(
    storeId: string,
    from: Date,
    to: Date,
  ): Promise<{ totals: EventTotals; commonErrors: Array<{ errorCode: string; count: number }> }>;
  insertOperationLog(input: {
    adminId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }): Promise<void>;
  listOperationLogs(input: {
    page: number;
    pageSize: number;
    search?: string;
    action?: string;
    resourceType?: string;
  }): Promise<{ items: OperationLogRecord[]; total: number }>;
  getSetting(key: string): Promise<unknown>;
  setSetting(key: string, value: unknown, at: Date): Promise<void>;
}

function eventTotalsFromRow(row: Record<string, unknown> | undefined): EventTotals {
  return {
    pageViews: Number(row?.pageViews ?? 0),
    uniqueVisitors: Number(row?.uniqueVisitors ?? 0),
    scans: Number(row?.scans ?? 0),
    passwordCopies: Number(row?.passwordCopies ?? 0),
    adLoadSuccesses: Number(row?.adLoadSuccesses ?? 0),
    adLoadFailures: Number(row?.adLoadFailures ?? 0),
    connectClicks: Number(row?.connectClicks ?? 0),
    connectSuccesses: Number(row?.connectSuccesses ?? 0),
    connectFailures: Number(row?.connectFailures ?? 0),
  };
}

const eventTotalsSelection = {
  uniqueVisitors: sql<number>`count(distinct ${connectionEvents.visitorHash}) filter (where ${connectionEvents.eventType} = 'page_view')`,
  scans: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'scan')`,
  passwordCopies: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'password_copy')`,
  pageViews: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'page_view')`,
  adLoadSuccesses: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'ad_load_success')`,
  adLoadFailures: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'ad_load_failure')`,
  connectClicks: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'connect_click')`,
  connectSuccesses: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'connect_success')`,
  connectFailures: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'connect_failure')`,
};

const operationActionNamespaces = new Set(["store", "wifi", "qrcode", "settings"]);

function escapeLikePattern(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function operationActionCondition(action: string) {
  if (!operationActionNamespaces.has(action)) return eq(operationLogs.action, action);
  return or(
    eq(operationLogs.action, action),
    like(operationLogs.action, `${escapeLikePattern(action)}.%`),
  )!;
}

export class PostgresPlatformRepository implements PlatformRepository {
  public constructor(private readonly db: Database) {}

  public async findOrCreateWechatMerchant(openIdHash: string): Promise<MerchantRecord> {
    const [row] = await this.db
      .insert(merchants)
      .values({ openIdHash, name: "小程序商户" })
      .onConflictDoUpdate({ target: merchants.openIdHash, set: { openIdHash } })
      .returning();
    if (!row) throw new Error("Merchant insert returned no row");
    return row;
  }
  public async createMerchantSession(
    tokenHash: string,
    merchantId: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.delete(merchantSessions).where(lt(merchantSessions.expiresAt, new Date()));
    await this.db.insert(merchantSessions).values({ tokenHash, merchantId, expiresAt });
  }
  public async findMerchantSession(tokenHash: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: merchants.id })
      .from(merchantSessions)
      .innerJoin(merchants, eq(merchants.id, merchantSessions.merchantId))
      .where(
        and(
          eq(merchantSessions.tokenHash, tokenHash),
          gte(merchantSessions.expiresAt, new Date()),
          eq(merchants.status, "active"),
        ),
      );
    return row?.id ?? null;
  }
  public async deleteMerchantSession(tokenHash: string): Promise<void> {
    await this.db.delete(merchantSessions).where(eq(merchantSessions.tokenHash, tokenHash));
  }
  public async listOwnedWifi(merchantId: string): Promise<WifiRecord[]> {
    const rows = await this.db
      .select({ wifi: wifiConfigs })
      .from(wifiConfigs)
      .innerJoin(stores, eq(stores.id, wifiConfigs.storeId))
      .where(and(eq(stores.merchantId, merchantId), isNull(wifiConfigs.deletedAt)))
      .orderBy(desc(wifiConfigs.createdAt));
    return rows.map((row) => row.wifi);
  }
  public async deleteWifi(id: string): Promise<void> {
    await this.db
      .update(wifiConfigs)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        status: "disabled",
        encryptedPassword: "",
        passwordIv: "",
        passwordAuthTag: "",
      })
      .where(eq(wifiConfigs.id, id));
    await this.db
      .update(qrCodes)
      .set({ status: "disabled", disabledAt: new Date() })
      .where(eq(qrCodes.wifiId, id));
  }

  public async lockStore(id: string): Promise<void> {
    await this.db.execute(
      sql`select ${stores.id} from ${stores} where ${stores.id} = ${id} for update`,
    );
  }

  public async refreshQrImage(
    id: string,
    imageUrl: string,
    provider: QrCodeRecord["provider"],
  ): Promise<QrCodeRecord> {
    const [row] = await this.db
      .update(qrCodes)
      .set({ imageUrl, provider, generatedAt: new Date() })
      .where(eq(qrCodes.id, id))
      .returning();
    if (!row) throw new Error("QR image update returned no row");
    return row as QrCodeRecord;
  }

  public async listMerchants(): Promise<MerchantRecord[]> {
    return this.db.select().from(merchants).orderBy(asc(merchants.name));
  }
  public async getMerchant(id: string): Promise<MerchantRecord | null> {
    const [row] = await this.db.select().from(merchants).where(eq(merchants.id, id));
    return row ?? null;
  }
  public async createMerchant(input: MerchantInput): Promise<MerchantRecord> {
    const [row] = await this.db.insert(merchants).values(input).returning();
    if (!row) throw new Error("Merchant insert returned no row");
    return row;
  }
  public async updateMerchant(
    id: string,
    input: UpdateMerchantInput,
  ): Promise<MerchantRecord | null> {
    const [row] = await this.db
      .update(merchants)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(merchants.id, id))
      .returning();
    return row ?? null;
  }
  public async listWifi(storeId: string): Promise<WifiRecord[]> {
    return this.db
      .select()
      .from(wifiConfigs)
      .where(and(eq(wifiConfigs.storeId, storeId), isNull(wifiConfigs.deletedAt)))
      .orderBy(asc(wifiConfigs.createdAt), asc(wifiConfigs.id));
  }
  public async getWifiById(id: string): Promise<WifiRecord | null> {
    const [row] = await this.db
      .select()
      .from(wifiConfigs)
      .where(and(eq(wifiConfigs.id, id), isNull(wifiConfigs.deletedAt)));
    return row ?? null;
  }
  public async saveWifi(
    input: Omit<
      WifiRecord,
      "id" | "version" | "createdAt" | "updatedAt" | "shortId" | "spotName" | "deletedAt"
    > &
      Partial<Pick<WifiRecord, "shortId" | "spotName" | "deletedAt">>,
    id?: string,
  ): Promise<WifiRecord> {
    if (!id) {
      return this.db.transaction(async (transaction) => {
        await transaction.execute(
          sql`select ${stores.id} from ${stores} where ${stores.id} = ${input.storeId} for update`,
        );
        const repository = new PostgresPlatformRepository(transaction);
        const existing = await repository.getWifi(input.storeId);
        const [row] = await transaction.insert(wifiConfigs).values(input).returning();
        if (!row) throw new Error("Wi-Fi insert returned no row");
        // Preserve old printed codes when their store receives its first network.
        if (!existing) {
          await transaction
            .update(qrCodes)
            .set({ wifiId: row.id })
            .where(and(eq(qrCodes.storeId, input.storeId), isNull(qrCodes.wifiId)));
        }
        return row;
      });
    }
    const rows = await this.db
      .update(wifiConfigs)
      .set({ ...input, version: sql`${wifiConfigs.version} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(wifiConfigs.id, id),
          eq(wifiConfigs.storeId, input.storeId),
          isNull(wifiConfigs.deletedAt),
        ),
      )
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Wi-Fi write returned no row");
    return row;
  }
  public async setWifiStatus(id: string, status: WifiStatus): Promise<WifiRecord | null> {
    const [row] = await this.db
      .update(wifiConfigs)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(wifiConfigs.id, id), isNull(wifiConfigs.deletedAt)))
      .returning();
    return row ?? null;
  }
  public async getLatestQrForWifi(wifiId: string): Promise<QrCodeRecord | null> {
    const [row] = await this.db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.wifiId, wifiId))
      .orderBy(desc(sql`${qrCodes.status} = 'active'`), desc(qrCodes.generatedAt), desc(qrCodes.id))
      .limit(1);
    return (row as QrCodeRecord | undefined) ?? null;
  }
  public async getAnalytics(input: AnalyticsQuery): Promise<AnalyticsRow[]> {
    const day = sql`date_trunc('day', ${connectionEvents.occurredAt} at time zone 'UTC')`;
    const conditions = [
      gte(connectionEvents.occurredAt, new Date(input.from)),
      lt(connectionEvents.occurredAt, new Date(input.to)),
    ];
    if (input.merchantId) conditions.push(eq(stores.merchantId, input.merchantId));
    if (input.storeId) conditions.push(eq(stores.id, input.storeId));
    if (input.wifiId) conditions.push(eq(connectionEvents.wifiId, input.wifiId));
    const rows = await this.db
      .select({
        date: sql<string>`to_char(${day}, 'YYYY-MM-DD')`,
        merchantId: stores.merchantId,
        storeId: stores.id,
        wifiId: connectionEvents.wifiId,
        ssid: wifiConfigs.ssid,
        ...eventTotalsSelection,
      })
      .from(connectionEvents)
      .innerJoin(stores, eq(stores.id, connectionEvents.storeId))
      .leftJoin(wifiConfigs, eq(wifiConfigs.id, connectionEvents.wifiId))
      .where(and(...conditions))
      .groupBy(day, stores.merchantId, stores.id, connectionEvents.wifiId, wifiConfigs.ssid)
      .orderBy(desc(day), asc(stores.id), asc(connectionEvents.wifiId));
    return rows.map((row) => {
      const totals = eventTotalsFromRow(row);
      return {
        date: row.date,
        merchantId: row.merchantId,
        storeId: row.storeId,
        wifiId: row.wifiId,
        ssid: row.ssid,
        totals: {
          ...totals,
          successRate: totals.connectClicks ? totals.connectSuccesses / totals.connectClicks : 0,
        },
      };
    });
  }

  public async healthCheck(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }

  public async transaction<T>(
    callback: (repository: PlatformRepository) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction((transaction) =>
      callback(new PostgresPlatformRepository(transaction)),
    );
  }

  public async findAdminByUsername(username: string): Promise<AdminRecord | null> {
    const [row] = await this.db
      .select()
      .from(admins)
      .where(sql`lower(${admins.username}) = lower(${username})`)
      .limit(1);
    return row ?? null;
  }

  public async findAdminById(id: string): Promise<AdminRecord | null> {
    const [row] = await this.db.select().from(admins).where(eq(admins.id, id)).limit(1);
    return row ?? null;
  }

  public async createAdminIfAbsent(
    username: string,
    passwordHash: string,
  ): Promise<{ admin: AdminRecord; created: boolean }> {
    const [created] = await this.db
      .insert(admins)
      .values({ username, passwordHash })
      .onConflictDoNothing()
      .returning();
    if (created) return { admin: created, created: true };
    const existing = await this.findAdminByUsername(username);
    if (!existing) throw new Error("Administrator conflict could not be resolved");
    return { admin: existing, created: false };
  }

  public async updateAdminLastLogin(id: string, at: Date): Promise<void> {
    await this.db.update(admins).set({ lastLoginAt: at, updatedAt: at }).where(eq(admins.id, id));
  }

  public async createSession(tokenHash: string, adminId: string, expiresAt: Date): Promise<void> {
    await this.db.insert(adminSessions).values({ tokenHash, adminId, expiresAt });
  }

  public async findSession(tokenHash: string, now: Date): Promise<SessionRecord | null> {
    const [row] = await this.db
      .select({
        tokenHash: adminSessions.tokenHash,
        adminId: adminSessions.adminId,
        adminUsername: admins.username,
        adminStatus: admins.status,
        expiresAt: adminSessions.expiresAt,
      })
      .from(adminSessions)
      .innerJoin(admins, eq(admins.id, adminSessions.adminId))
      .where(and(eq(adminSessions.tokenHash, tokenHash), gte(adminSessions.expiresAt, now)))
      .limit(1);
    return row ?? null;
  }

  public async deleteSession(tokenHash: string): Promise<void> {
    await this.db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash));
  }

  public async deleteExpiredSessions(now: Date): Promise<void> {
    await this.db.delete(adminSessions).where(lt(adminSessions.expiresAt, now));
  }

  public async listStores(input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: StoreStatus;
  }): Promise<{ items: StoreListRecord[]; total: number }> {
    const conditions = [];
    if (input.status) conditions.push(eq(stores.status, input.status));
    if (input.search) {
      const term = `%${escapeLikePattern(input.search)}%`;
      conditions.push(
        or(
          ilike(stores.name, term),
          ilike(stores.shortName, term),
          ilike(stores.address, term),
          sql`exists (
            select 1 from ${wifiConfigs}
            where ${wifiConfigs.storeId} = ${stores.id}
              and ${wifiConfigs.deletedAt} is null
              and ${wifiConfigs.ssid} ilike ${term}
          )`,
        )!,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(stores)
        .where(where)
        .orderBy(desc(stores.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.db.select({ value: count() }).from(stores).where(where),
    ]);
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return { items: [], total: Number(totalRows[0]?.value ?? 0) };
    const [wifiRows, qrRows] = await Promise.all([
      this.db
        .select({ storeId: wifiConfigs.storeId })
        .from(wifiConfigs)
        .where(and(inArray(wifiConfigs.storeId, ids), isNull(wifiConfigs.deletedAt))),
      this.db
        .select({ storeId: qrCodes.storeId, status: qrCodes.status })
        .from(qrCodes)
        .where(inArray(qrCodes.storeId, ids))
        .orderBy(
          desc(sql`${qrCodes.status} = 'active'`),
          desc(qrCodes.generatedAt),
          desc(qrCodes.id),
        ),
    ]);
    const wifiStoreIds = new Set(wifiRows.map((row) => row.storeId));
    const latestQr = new Map<string, QrCodeStatus>();
    for (const row of qrRows) if (!latestQr.has(row.storeId)) latestQr.set(row.storeId, row.status);
    return {
      items: rows.map((row) => ({
        ...row,
        hasWifi: wifiStoreIds.has(row.id),
        qrCodeStatus: latestQr.get(row.id) ?? null,
      })),
      total: Number(totalRows[0]?.value ?? 0),
    };
  }

  public async createStore(input: CreateStoreInput): Promise<StoreRecord> {
    const [row] = await this.db
      .insert(stores)
      .values({ ...input, merchantId: input.merchantId ?? DEFAULT_MERCHANT_ID })
      .returning();
    if (!row) throw new Error("Store insert returned no row");
    return row;
  }

  public async getStore(id: string): Promise<StoreRecord | null> {
    const [row] = await this.db.select().from(stores).where(eq(stores.id, id)).limit(1);
    return row ?? null;
  }

  public async updateStore(id: string, input: UpdateStoreInput): Promise<StoreRecord | null> {
    const [row] = await this.db
      .update(stores)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(stores.id, id))
      .returning();
    return row ?? null;
  }

  public async getWifi(storeId: string): Promise<WifiRecord | null> {
    const [row] = await this.db
      .select()
      .from(wifiConfigs)
      .where(and(eq(wifiConfigs.storeId, storeId), isNull(wifiConfigs.deletedAt)))
      .orderBy(asc(wifiConfigs.createdAt), asc(wifiConfigs.id))
      .limit(1);
    return row ?? null;
  }

  public async upsertWifi(
    input: Omit<
      WifiRecord,
      "id" | "version" | "createdAt" | "updatedAt" | "shortId" | "spotName" | "deletedAt"
    > &
      Partial<Pick<WifiRecord, "shortId" | "spotName" | "deletedAt">>,
  ): Promise<WifiRecord> {
    return this.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select ${stores.id} from ${stores} where ${stores.id} = ${input.storeId} for update`,
      );
      const repository = new PostgresPlatformRepository(transaction);
      const existing = await repository.getWifi(input.storeId);
      return repository.saveWifi(input, existing?.id);
    });
  }

  public async getLatestQrForStore(storeId: string): Promise<QrCodeRecord | null> {
    const wifi = await this.getWifi(storeId);
    const [row] = await this.db
      .select()
      .from(qrCodes)
      .where(
        and(
          eq(qrCodes.storeId, storeId),
          wifi ? eq(qrCodes.wifiId, wifi.id) : isNull(qrCodes.wifiId),
        ),
      )
      .orderBy(desc(sql`${qrCodes.status} = 'active'`), desc(qrCodes.generatedAt), desc(qrCodes.id))
      .limit(1);
    return (row as QrCodeRecord | undefined) ?? null;
  }

  public async getQrById(id: string): Promise<QrCodeRecord | null> {
    const [row] = await this.db.select().from(qrCodes).where(eq(qrCodes.id, id)).limit(1);
    return (row as QrCodeRecord | undefined) ?? null;
  }

  public async getQrByScene(sceneToken: string): Promise<QrCodeRecord | null> {
    const [row] = await this.db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.sceneToken, sceneToken))
      .limit(1);
    return (row as QrCodeRecord | undefined) ?? null;
  }

  public async replaceActiveQr(input: {
    wifiId?: string;
    storeId: string;
    sceneToken: string;
    imageUrl: string;
    provider: QrCodeRecord["provider"];
  }): Promise<QrCodeRecord> {
    return this.db.transaction(async (transaction) => {
      const now = new Date();
      await transaction.execute(
        sql`select ${stores.id} from ${stores} where ${stores.id} = ${input.storeId} for update`,
      );
      const wifiId =
        input.wifiId ??
        (await new PostgresPlatformRepository(transaction).getWifi(input.storeId))?.id;
      await transaction
        .update(qrCodes)
        .set({ status: "disabled", disabledAt: now })
        .where(
          and(
            eq(qrCodes.storeId, input.storeId),
            wifiId ? eq(qrCodes.wifiId, wifiId) : isNull(qrCodes.wifiId),
            eq(qrCodes.status, "active"),
          ),
        );
      const [row] = await transaction
        .insert(qrCodes)
        .values({ ...input, wifiId: wifiId ?? null })
        .returning();
      if (!row) throw new Error("QR code insert returned no row");
      return row as QrCodeRecord;
    });
  }

  public async setQrStatus(
    id: string,
    status: QrCodeStatus,
    at: Date,
  ): Promise<QrCodeRecord | null> {
    return this.db.transaction(async (transaction) => {
      const [current] = await transaction.select().from(qrCodes).where(eq(qrCodes.id, id)).limit(1);
      if (!current) return null;
      await transaction.execute(
        sql`select ${stores.id} from ${stores} where ${stores.id} = ${current.storeId} for update`,
      );
      if (status === "active") {
        await transaction
          .update(qrCodes)
          .set({ status: "disabled", disabledAt: at })
          .where(
            and(
              eq(qrCodes.storeId, current.storeId),
              current.wifiId ? eq(qrCodes.wifiId, current.wifiId) : isNull(qrCodes.wifiId),
              eq(qrCodes.status, "active"),
            ),
          );
      }
      const [row] = await transaction
        .update(qrCodes)
        .set({ status, disabledAt: status === "disabled" ? at : null })
        .where(eq(qrCodes.id, id))
        .returning();
      return (row as QrCodeRecord | undefined) ?? null;
    });
  }

  public async insertEvent(input: {
    storeId: string;
    qrCodeId: string;
    wifiId?: string;
    visitorHash?: string | null;
    eventType: ConnectionEventType;
    platform: ClientPlatform;
    errorCode: string | null;
    errorMessageSanitized: string | null;
    occurredAt: Date;
  }): Promise<void> {
    await this.db.insert(connectionEvents).values(input);
  }

  public async getDashboard(now: Date): Promise<DashboardAggregate> {
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const sevenDayStart = new Date(todayStart);
    sevenDayStart.setUTCDate(sevenDayStart.getUTCDate() - 6);
    const trendDay = sql`date_trunc('day', ${connectionEvents.occurredAt} at time zone 'UTC')`;
    const [storeCount, qrCount, todayRows, funnelRows, trendRows] = await Promise.all([
      this.db.select({ value: count() }).from(stores),
      this.db.select({ value: count() }).from(qrCodes).where(eq(qrCodes.status, "active")),
      this.db
        .select(eventTotalsSelection)
        .from(connectionEvents)
        .where(gte(connectionEvents.occurredAt, todayStart)),
      this.db
        .select(eventTotalsSelection)
        .from(connectionEvents)
        .where(gte(connectionEvents.occurredAt, sevenDayStart)),
      this.db
        .select({
          date: sql<string>`to_char(${trendDay}, 'YYYY-MM-DD')`,
          pageViews: eventTotalsSelection.pageViews,
          connectClicks: eventTotalsSelection.connectClicks,
          connectSuccesses: eventTotalsSelection.connectSuccesses,
        })
        .from(connectionEvents)
        .where(gte(connectionEvents.occurredAt, sevenDayStart))
        .groupBy(trendDay)
        .orderBy(asc(trendDay)),
    ]);
    const today = eventTotalsFromRow(todayRows[0]);
    const funnel = eventTotalsFromRow(funnelRows[0]);
    const trendMap = new Map(trendRows.map((row) => [row.date, row]));
    const trend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(sevenDayStart);
      date.setUTCDate(date.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      const row = trendMap.get(key);
      return {
        date: key,
        pageViews: Number(row?.pageViews ?? 0),
        connectClicks: Number(row?.connectClicks ?? 0),
        connectSuccesses: Number(row?.connectSuccesses ?? 0),
      };
    });
    return {
      storeTotal: Number(storeCount[0]?.value ?? 0),
      activeQrCodeTotal: Number(qrCount[0]?.value ?? 0),
      today,
      funnel: {
        pageViews: funnel.pageViews,
        connectClicks: funnel.connectClicks,
        connectSuccesses: funnel.connectSuccesses,
        connectFailures: funnel.connectFailures,
      },
      trend,
    };
  }

  public async getStoreStatistics(
    storeId: string,
    from: Date,
    to: Date,
  ): Promise<{
    totals: EventTotals;
    commonErrors: Array<{ errorCode: string; count: number }>;
  }> {
    const range = and(
      eq(connectionEvents.storeId, storeId),
      gte(connectionEvents.occurredAt, from),
      lte(connectionEvents.occurredAt, to),
    );
    const [totalRows, errors] = await Promise.all([
      this.db.select(eventTotalsSelection).from(connectionEvents).where(range),
      this.db
        .select({ errorCode: connectionEvents.errorCode, value: count() })
        .from(connectionEvents)
        .where(
          and(
            range,
            eq(connectionEvents.eventType, "connect_failure"),
            sql`${connectionEvents.errorCode} is not null`,
          ),
        )
        .groupBy(connectionEvents.errorCode)
        .orderBy(desc(count()))
        .limit(10),
    ]);
    return {
      totals: eventTotalsFromRow(totalRows[0]),
      commonErrors: errors.flatMap((row) =>
        row.errorCode ? [{ errorCode: row.errorCode, count: Number(row.value) }] : [],
      ),
    };
  }

  public async insertOperationLog(input: {
    adminId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }): Promise<void> {
    await this.db.insert(operationLogs).values({ ...input, sanitizedMetadata: input.metadata });
  }

  public async listOperationLogs(input: {
    page: number;
    pageSize: number;
    search?: string;
    action?: string;
    resourceType?: string;
  }): Promise<{ items: OperationLogRecord[]; total: number }> {
    const conditions = [];
    if (input.action) conditions.push(operationActionCondition(input.action));
    if (input.resourceType) conditions.push(eq(operationLogs.resourceType, input.resourceType));
    if (input.search) {
      const term = `%${escapeLikePattern(input.search)}%`;
      conditions.push(
        or(
          ilike(admins.username, term),
          ilike(operationLogs.action, term),
          ilike(operationLogs.resourceType, term),
          ilike(operationLogs.resourceId, term),
        )!,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: operationLogs.id,
          adminId: operationLogs.adminId,
          adminUsername: admins.username,
          action: operationLogs.action,
          resourceType: operationLogs.resourceType,
          resourceId: operationLogs.resourceId,
          metadata: operationLogs.sanitizedMetadata,
          createdAt: operationLogs.createdAt,
        })
        .from(operationLogs)
        .leftJoin(admins, eq(admins.id, operationLogs.adminId))
        .where(where)
        .orderBy(desc(operationLogs.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.db
        .select({ value: count() })
        .from(operationLogs)
        .leftJoin(admins, eq(admins.id, operationLogs.adminId))
        .where(where),
    ]);
    return { items: rows, total: Number(totals[0]?.value ?? 0) };
  }

  public async getSetting(key: string): Promise<unknown> {
    const [row] = await this.db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    return row?.value ?? null;
  }

  public async setSetting(key: string, value: unknown, at: Date): Promise<void> {
    await this.db
      .insert(systemSettings)
      .values({ key, value, updatedAt: at })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: at } });
  }
}
