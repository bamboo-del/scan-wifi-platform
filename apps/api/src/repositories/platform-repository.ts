import type {
  AdminStatus,
  AdminRole,
  ClientPlatform,
  ConnectionEventType,
  QrCodeStatus,
  StoreStatus,
  WifiSecurityType,
  WifiStatus,
} from "@scan-wifi/shared-types";
import type { CreateStoreInput, UpdateStoreInput } from "@scan-wifi/validation";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  getTableColumns,
  ilike,
  inArray,
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
  role: AdminRole;
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
  adminRole: AdminRole;
  expiresAt: Date;
}

export interface StoreRecord {
  createdByUsername?: string | null;
  id: string;
  createdById: string | null;
  ownerId: string | null;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  status: StoreStatus;
  adEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WifiRecord {
  id: string;
  storeId: string;
  ssid: string;
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
  createdByUsername?: string | null;
  id: string;
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
  qrCode?: QrCodeRecord | null;
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
  healthCheck(): Promise<void>;
  transaction<T>(callback: (repository: PlatformRepository) => Promise<T>): Promise<T>;
  findAdminByUsername(username: string): Promise<AdminRecord | null>;
  findAdminById(id: string): Promise<AdminRecord | null>;
  createAdminIfAbsent(
    username: string,
    passwordHash: string,
  ): Promise<{ admin: AdminRecord; created: boolean }>;
  lockAccount(id: string): Promise<AdminRecord | null>;
  listAccounts(): Promise<AdminRecord[]>;
  createOperator(username: string, passwordHash: string): Promise<AdminRecord | null>;
  updateAccount(
    id: string,
    input: { status?: AdminStatus; passwordHash?: string },
  ): Promise<AdminRecord | null>;
  deleteAdminSessions(adminId: string): Promise<void>;
  transferStore(id: string, ownerId: string | null): Promise<StoreRecord | null>;
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
    ownerId?: string;
  }): Promise<{ items: StoreListRecord[]; total: number }>;
  createStore(input: CreateStoreInput, actorId?: string): Promise<StoreRecord>;
  getStore(id: string, lock?: boolean): Promise<StoreRecord | null>;
  updateStore(id: string, input: UpdateStoreInput): Promise<StoreRecord | null>;
  getWifi(storeId: string): Promise<WifiRecord | null>;
  upsertWifi(
    input: Omit<WifiRecord, "id" | "version" | "createdAt" | "updatedAt">,
  ): Promise<WifiRecord>;
  getLatestQrForStore(storeId: string): Promise<QrCodeRecord | null>;
  getQrById(id: string): Promise<QrCodeRecord | null>;
  getQrByScene(sceneToken: string): Promise<QrCodeRecord | null>;
  replaceActiveQr(input: {
    storeId: string;
    sceneToken: string;
    imageUrl: string;
    provider: QrCodeRecord["provider"];
  }): Promise<QrCodeRecord>;
  setQrStatus(id: string, status: QrCodeStatus, at: Date): Promise<QrCodeRecord | null>;
  insertEvent(input: {
    storeId: string;
    qrCodeId: string;
    eventType: ConnectionEventType;
    platform: ClientPlatform;
    errorCode: string | null;
    errorMessageSanitized: string | null;
    occurredAt: Date;
  }): Promise<void>;
  getDashboard(now: Date, ownerId?: string): Promise<DashboardAggregate>;
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
    adLoadSuccesses: Number(row?.adLoadSuccesses ?? 0),
    adLoadFailures: Number(row?.adLoadFailures ?? 0),
    connectClicks: Number(row?.connectClicks ?? 0),
    connectSuccesses: Number(row?.connectSuccesses ?? 0),
    connectFailures: Number(row?.connectFailures ?? 0),
  };
}

const storeCreatorUsername = sql<string | null>`(
  select a.username from admins a where a.id = coalesce(stores.created_by_id, (
    select l.admin_id from operation_logs l
    where l.resource_type = 'store' and l.resource_id = stores.id::text
      and l.action = 'store.create'
    order by l.created_at asc, l.id asc limit 1
  ))
)`;
const qrCreatorUsername = sql<string | null>`(
  select a.username from operation_logs l join admins a on a.id = l.admin_id
  where l.resource_type = 'qr_code' and l.resource_id = qr_codes.id::text
    and l.action = 'qrcode.generate'
  order by l.created_at asc, l.id asc limit 1
)`;

const eventTotalsSelection = {
  pageViews: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'page_view')`,
  adLoadSuccesses: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'ad_load_success')`,
  adLoadFailures: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'ad_load_failure')`,
  connectClicks: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'connect_click')`,
  connectSuccesses: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'connect_success')`,
  connectFailures: sql<number>`count(*) filter (where ${connectionEvents.eventType} = 'connect_failure')`,
};

const operationActionNamespaces = new Set(["store", "wifi", "qrcode", "settings", "account"]);

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

  public async healthCheck(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }

  public async transaction<T>(
    callback: (repository: PlatformRepository) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction((transaction) =>
      callback(new PostgresPlatformRepository(transaction as unknown as Database)),
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

  public async lockAccount(id: string): Promise<AdminRecord | null> {
    const [row] = await this.db
      .select()
      .from(admins)
      .where(eq(admins.id, id))
      .for("update")
      .limit(1);
    return row ?? null;
  }

  public async listAccounts(): Promise<AdminRecord[]> {
    return this.db.select().from(admins).orderBy(asc(admins.username));
  }

  public async createOperator(username: string, passwordHash: string): Promise<AdminRecord | null> {
    const [row] = await this.db
      .insert(admins)
      .values({ username, passwordHash, role: "operator" })
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  public async updateAccount(
    id: string,
    input: { status?: AdminStatus; passwordHash?: string },
  ): Promise<AdminRecord | null> {
    const [row] = await this.db
      .update(admins)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(admins.id, id))
      .returning();
    return row ?? null;
  }

  public async deleteAdminSessions(adminId: string): Promise<void> {
    await this.db.delete(adminSessions).where(eq(adminSessions.adminId, adminId));
  }

  public async transferStore(id: string, ownerId: string | null): Promise<StoreRecord | null> {
    const [row] = await this.db
      .update(stores)
      .set({ ownerId, updatedAt: new Date() })
      .where(eq(stores.id, id))
      .returning();
    return row ?? null;
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
        adminRole: admins.role,
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
    ownerId?: string;
  }): Promise<{ items: StoreListRecord[]; total: number }> {
    const conditions = [];
    if (input.ownerId) conditions.push(eq(stores.ownerId, input.ownerId));
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
              and ${wifiConfigs.ssid} ilike ${term}
          )`,
        )!,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, totalRows] = await Promise.all([
      this.db
        .select({ ...getTableColumns(stores), createdByUsername: storeCreatorUsername })
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
        .where(inArray(wifiConfigs.storeId, ids)),
      this.db
        .select({ ...getTableColumns(qrCodes), createdByUsername: qrCreatorUsername })
        .from(qrCodes)
        .where(inArray(qrCodes.storeId, ids))
        .orderBy(asc(qrCodes.status), desc(qrCodes.generatedAt)),
    ]);
    const wifiStoreIds = new Set(wifiRows.map((row) => row.storeId));
    const latestQr = new Map<string, QrCodeRecord>();
    for (const row of qrRows)
      if (!latestQr.has(row.storeId)) latestQr.set(row.storeId, row as QrCodeRecord);
    return {
      items: rows.map((row) => ({
        ...row,
        hasWifi: wifiStoreIds.has(row.id),
        qrCodeStatus: latestQr.get(row.id)?.status ?? null,
        qrCode: latestQr.get(row.id) ?? null,
      })),
      total: Number(totalRows[0]?.value ?? 0),
    };
  }

  public async createStore(input: CreateStoreInput, actorId?: string): Promise<StoreRecord> {
    const [row] = await this.db
      .insert(stores)
      .values({ ...input, createdById: actorId ?? null, ownerId: actorId ?? null })
      .returning();
    if (!row) throw new Error("Store insert returned no row");
    return row;
  }

  public async getStore(id: string, lock?: boolean): Promise<StoreRecord | null> {
    const query = this.db
      .select({ ...getTableColumns(stores), createdByUsername: storeCreatorUsername })
      .from(stores)
      .where(eq(stores.id, id))
      .limit(1);
    const [row] = await (lock ? query.for("update") : query);
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
      .where(eq(wifiConfigs.storeId, storeId))
      .limit(1);
    return row ?? null;
  }

  public async upsertWifi(
    input: Omit<WifiRecord, "id" | "version" | "createdAt" | "updatedAt">,
  ): Promise<WifiRecord> {
    const now = new Date();
    const [row] = await this.db
      .insert(wifiConfigs)
      .values({ ...input, updatedAt: now })
      .onConflictDoUpdate({
        target: wifiConfigs.storeId,
        set: {
          ssid: input.ssid,
          encryptedPassword: input.encryptedPassword,
          passwordIv: input.passwordIv,
          passwordAuthTag: input.passwordAuthTag,
          bssid: input.bssid,
          securityType: input.securityType,
          status: input.status,
          version: sql`${wifiConfigs.version} + 1`,
          updatedAt: now,
        },
      })
      .returning();
    if (!row) throw new Error("Wi-Fi upsert returned no row");
    return row;
  }

  public async getLatestQrForStore(storeId: string): Promise<QrCodeRecord | null> {
    const [row] = await this.db
      .select({ ...getTableColumns(qrCodes), createdByUsername: qrCreatorUsername })
      .from(qrCodes)
      .where(eq(qrCodes.storeId, storeId))
      .orderBy(asc(qrCodes.status), desc(qrCodes.generatedAt))
      .limit(1);
    return (row as QrCodeRecord | undefined) ?? null;
  }

  public async getQrById(id: string): Promise<QrCodeRecord | null> {
    const [row] = await this.db
      .select({ ...getTableColumns(qrCodes), createdByUsername: qrCreatorUsername })
      .from(qrCodes)
      .where(eq(qrCodes.id, id))
      .limit(1);
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
    storeId: string;
    sceneToken: string;
    imageUrl: string;
    provider: QrCodeRecord["provider"];
  }): Promise<QrCodeRecord> {
    return this.db.transaction(async (transaction) => {
      await transaction
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.id, input.storeId))
        .for("update");
      const now = new Date();
      await transaction
        .update(qrCodes)
        .set({ status: "disabled", disabledAt: now })
        .where(and(eq(qrCodes.storeId, input.storeId), eq(qrCodes.status, "active")));
      const [row] = await transaction.insert(qrCodes).values(input).returning();
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
      await transaction
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.id, current.storeId))
        .for("update");
      if (status === "active") {
        await transaction
          .update(qrCodes)
          .set({ status: "disabled", disabledAt: at })
          .where(and(eq(qrCodes.storeId, current.storeId), eq(qrCodes.status, "active")));
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
    eventType: ConnectionEventType;
    platform: ClientPlatform;
    errorCode: string | null;
    errorMessageSanitized: string | null;
    occurredAt: Date;
  }): Promise<void> {
    await this.db.insert(connectionEvents).values(input);
  }

  public async getDashboard(now: Date, ownerId?: string): Promise<DashboardAggregate> {
    const storeScope = ownerId ? eq(stores.ownerId, ownerId) : undefined;
    const qrScope = ownerId
      ? sql`exists (select 1 from ${stores} where ${stores.id} = ${qrCodes.storeId} and ${stores.ownerId} = ${ownerId})`
      : undefined;
    const eventScope = ownerId
      ? sql`exists (select 1 from ${stores} where ${stores.id} = ${connectionEvents.storeId} and ${stores.ownerId} = ${ownerId})`
      : undefined;
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const sevenDayStart = new Date(todayStart);
    sevenDayStart.setUTCDate(sevenDayStart.getUTCDate() - 6);
    const trendDay = sql`date_trunc('day', ${connectionEvents.occurredAt} at time zone 'UTC')`;
    const [storeCount, qrCount, todayRows, funnelRows, trendRows] = await Promise.all([
      this.db.select({ value: count() }).from(stores).where(storeScope),
      this.db
        .select({ value: count() })
        .from(qrCodes)
        .where(and(eq(qrCodes.status, "active"), qrScope)),
      this.db
        .select(eventTotalsSelection)
        .from(connectionEvents)
        .where(and(gte(connectionEvents.occurredAt, todayStart), eventScope)),
      this.db
        .select(eventTotalsSelection)
        .from(connectionEvents)
        .where(and(gte(connectionEvents.occurredAt, sevenDayStart), eventScope)),
      this.db
        .select({
          date: sql<string>`to_char(${trendDay}, 'YYYY-MM-DD')`,
          pageViews: eventTotalsSelection.pageViews,
          connectClicks: eventTotalsSelection.connectClicks,
          connectSuccesses: eventTotalsSelection.connectSuccesses,
        })
        .from(connectionEvents)
        .where(and(gte(connectionEvents.occurredAt, sevenDayStart), eventScope))
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
