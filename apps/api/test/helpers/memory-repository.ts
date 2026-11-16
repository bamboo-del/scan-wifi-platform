import { randomUUID } from "node:crypto";
import { DEFAULT_MERCHANT_ID } from "../../src/db/schema.js";
import type { AnalyticsRow, ConnectionEventType, StoreStatus } from "@scan-wifi/shared-types";
import type {
  AnalyticsQuery,
  MerchantInput,
  UpdateMerchantInput,
  CreateStoreInput,
  UpdateStoreInput,
} from "@scan-wifi/validation";
import type {
  AdminRecord,
  MerchantRecord,
  DashboardAggregate,
  EventTotals,
  OperationLogRecord,
  PlatformRepository,
  QrCodeRecord,
  SessionRecord,
  StoreListRecord,
  StoreRecord,
  WifiRecord,
} from "../../src/repositories/platform-repository.js";

interface EventRecord {
  storeId: string;
  qrCodeId: string;
  wifiId?: string;
  visitorHash?: string | null;
  eventType: ConnectionEventType;
  platform: "ios" | "android" | "devtools" | "unknown";
  errorCode: string | null;
  errorMessageSanitized: string | null;
  occurredAt: Date;
}

const emptyTotals = (): EventTotals => ({
  pageViews: 0,
  uniqueVisitors: 0,
  scans: 0,
  passwordCopies: 0,
  adLoadSuccesses: 0,
  adLoadFailures: 0,
  connectClicks: 0,
  connectSuccesses: 0,
  connectFailures: 0,
});

function aggregate(events: EventRecord[]): EventTotals {
  const totals = emptyTotals();
  for (const event of events) {
    if (event.eventType === "page_view") totals.pageViews += 1;
    if (event.eventType === "ad_load_success") totals.adLoadSuccesses += 1;
    if (event.eventType === "ad_load_failure") totals.adLoadFailures += 1;
    if (event.eventType === "connect_click") totals.connectClicks += 1;
    if (event.eventType === "connect_success") totals.connectSuccesses += 1;
    if (event.eventType === "connect_failure") totals.connectFailures += 1;
  }
  totals.uniqueVisitors = new Set(
    events
      .filter((event) => event.eventType === "page_view" && event.visitorHash)
      .map((event) => event.visitorHash),
  ).size;
  totals.scans = events.filter((event) => event.eventType === "scan").length;
  totals.passwordCopies = events.filter((event) => event.eventType === "password_copy").length;
  return totals;
}

export class MemoryPlatformRepository implements PlatformRepository {
  private readonly openIds = new Map<string, string>();
  private readonly merchantSessions = new Map<string, { merchantId: string; expiresAt: Date }>();
  public async findOrCreateWechatMerchant(openIdHash: string): Promise<MerchantRecord> {
    const id = this.openIds.get(openIdHash);
    if (id) return this.merchants.get(id)!;
    const merchant = await this.createMerchant({ name: "小程序商户", status: "active" });
    this.openIds.set(openIdHash, merchant.id);
    return merchant;
  }
  public async createMerchantSession(
    tokenHash: string,
    merchantId: string,
    expiresAt: Date,
  ): Promise<void> {
    this.merchantSessions.set(tokenHash, { merchantId, expiresAt });
  }
  public async findMerchantSession(tokenHash: string): Promise<string | null> {
    const session = this.merchantSessions.get(tokenHash);
    return session &&
      session.expiresAt > new Date() &&
      this.merchants.get(session.merchantId)?.status === "active"
      ? session.merchantId
      : null;
  }
  public async deleteMerchantSession(tokenHash: string): Promise<void> {
    this.merchantSessions.delete(tokenHash);
  }
  public async listOwnedWifi(merchantId: string): Promise<WifiRecord[]> {
    return [...this.wifi.values()].filter(
      (row) => !row.deletedAt && this.stores.get(row.storeId)?.merchantId === merchantId,
    );
  }
  public async deleteWifi(id: string): Promise<void> {
    const row = await this.getWifiById(id);
    if (row)
      Object.assign(row, {
        deletedAt: new Date(),
        status: "disabled",
        encryptedPassword: "",
        passwordIv: "",
        passwordAuthTag: "",
      });
    for (const qr of this.qrs.values()) if (qr.wifiId === id) qr.status = "disabled";
  }
  public async lockStore(): Promise<void> {}
  public async refreshQrImage(
    id: string,
    imageUrl: string,
    provider: QrCodeRecord["provider"],
  ): Promise<QrCodeRecord> {
    const row = this.qrs.get(id);
    if (!row) throw new Error("QR image missing");
    Object.assign(row, { imageUrl, provider, generatedAt: new Date() });
    return row;
  }
  public readonly admins: AdminRecord[] = [
    {
      id: "8f1119c9-5dd9-4c6b-8c60-20c5c708eb6d",
      username: "admin",
      passwordHash: "test-hash",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      lastLoginAt: null,
    },
  ];
  public readonly merchants = new Map<string, MerchantRecord>([
    [
      DEFAULT_MERCHANT_ID,
      {
        id: DEFAULT_MERCHANT_ID,
        name: "默认商户",
        contact: null,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  ]);
  public readonly stores = new Map<string, StoreRecord>();
  public readonly wifi = new Map<string, WifiRecord>();
  public readonly qrs = new Map<string, QrCodeRecord>();
  public readonly events: EventRecord[] = [];
  public readonly logs: OperationLogRecord[] = [];
  public readonly settings = new Map<string, unknown>([["global_ad_enabled", true]]);
  private readonly sessions = new Map<string, { adminId: string; expiresAt: Date }>();

  public async listMerchants(): Promise<MerchantRecord[]> {
    return [...this.merchants.values()];
  }
  public async getMerchant(id: string): Promise<MerchantRecord | null> {
    return this.merchants.get(id) ?? null;
  }
  public async createMerchant(input: MerchantInput): Promise<MerchantRecord> {
    const row = {
      id: randomUUID(),
      ...input,
      contact: input.contact ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.merchants.set(row.id, row);
    return row;
  }
  public async updateMerchant(
    id: string,
    input: UpdateMerchantInput,
  ): Promise<MerchantRecord | null> {
    const row = this.merchants.get(id);
    if (!row) return null;
    Object.assign(row, input, { updatedAt: new Date() });
    return row;
  }
  public async listWifi(storeId: string): Promise<WifiRecord[]> {
    return [...this.wifi.values()].filter((row) => row.storeId === storeId && !row.deletedAt);
  }
  public async getWifiById(id: string): Promise<WifiRecord | null> {
    return [...this.wifi.values()].find((row) => row.id === id && !row.deletedAt) ?? null;
  }
  public async saveWifi(
    input: Omit<
      WifiRecord,
      "id" | "version" | "createdAt" | "updatedAt" | "shortId" | "spotName" | "deletedAt"
    > &
      Partial<Pick<WifiRecord, "shortId" | "spotName" | "deletedAt">>,
    id?: string,
  ): Promise<WifiRecord> {
    const existing = id ? await this.getWifiById(id) : null;
    const row = {
      shortId: existing?.shortId ?? randomUUID().replaceAll("-", ""),
      spotName: existing?.spotName ?? "",
      deletedAt: existing?.deletedAt ?? null,
      ...input,
      id: existing?.id ?? randomUUID(),
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    const key = existing
      ? [...this.wifi.entries()].find(([, value]) => value.id === existing.id)![0]
      : this.wifi.has(input.storeId)
        ? row.id
        : input.storeId;
    this.wifi.set(key, row);
    if (key === input.storeId && !existing) {
      for (const qr of this.qrs.values())
        if (qr.storeId === input.storeId && !qr.wifiId) qr.wifiId = row.id;
    }
    return row;
  }
  public async setWifiStatus(
    id: string,
    status: "active" | "disabled",
  ): Promise<WifiRecord | null> {
    const row = await this.getWifiById(id);
    if (!row) return null;
    row.status = status;
    row.updatedAt = new Date();
    return row;
  }
  public async getLatestQrForWifi(wifiId: string): Promise<QrCodeRecord | null> {
    return (
      [...this.qrs.values()]
        .filter((row) => row.wifiId === wifiId)
        .sort(
          (a, b) =>
            Number(b.status === "active") - Number(a.status === "active") ||
            b.generatedAt.getTime() - a.generatedAt.getTime(),
        )[0] ?? null
    );
  }
  public async getAnalytics(input: AnalyticsQuery): Promise<AnalyticsRow[]> {
    const groups = new Map<string, EventRecord[]>();
    for (const event of this.events) {
      const store = this.stores.get(event.storeId)!;
      if (
        event.occurredAt < new Date(input.from) ||
        event.occurredAt >= new Date(input.to) ||
        (input.merchantId && store.merchantId !== input.merchantId) ||
        (input.storeId && store.id !== input.storeId) ||
        (input.wifiId && event.wifiId !== input.wifiId)
      )
        continue;
      const key = `${event.occurredAt.toISOString().slice(0, 10)}:${event.storeId}:${event.wifiId}`;
      const events = groups.get(key) ?? [];
      events.push(event);
      groups.set(key, events);
    }
    return [...groups.values()].map((events) => {
      const event = events[0]!;
      const totals = aggregate(events);
      return {
        date: event.occurredAt.toISOString().slice(0, 10),
        merchantId: this.stores.get(event.storeId)!.merchantId,
        storeId: event.storeId,
        wifiId: event.wifiId ?? null,
        ssid: [...this.wifi.values()].find((wifi) => wifi.id === event.wifiId)?.ssid ?? null,
        totals: {
          ...totals,
          successRate: totals.connectClicks ? totals.connectSuccesses / totals.connectClicks : 0,
        },
      };
    });
  }

  public async healthCheck(): Promise<void> {}

  public async transaction<T>(
    callback: (repository: PlatformRepository) => Promise<T>,
  ): Promise<T> {
    const snapshot = {
      admins: structuredClone(this.admins),
      stores: structuredClone(this.stores),
      merchants: structuredClone(this.merchants),
      wifi: structuredClone(this.wifi),
      qrs: structuredClone(this.qrs),
      events: structuredClone(this.events),
      logs: structuredClone(this.logs),
      settings: structuredClone(this.settings),
      sessions: structuredClone(this.sessions),
    };
    try {
      return await callback(this);
    } catch (error) {
      this.admins.splice(0, this.admins.length, ...snapshot.admins);
      this.replaceMap(this.stores, snapshot.stores);
      this.replaceMap(this.merchants, snapshot.merchants);
      this.replaceMap(this.wifi, snapshot.wifi);
      this.replaceMap(this.qrs, snapshot.qrs);
      this.events.splice(0, this.events.length, ...snapshot.events);
      this.logs.splice(0, this.logs.length, ...snapshot.logs);
      this.replaceMap(this.settings, snapshot.settings);
      this.replaceMap(this.sessions, snapshot.sessions);
      throw error;
    }
  }

  public sessionCount(): number {
    return this.sessions.size;
  }

  public async findAdminByUsername(username: string): Promise<AdminRecord | null> {
    return (
      this.admins.find((admin) => admin.username.toLowerCase() === username.toLowerCase()) ?? null
    );
  }

  public async findAdminById(id: string): Promise<AdminRecord | null> {
    return this.admins.find((admin) => admin.id === id) ?? null;
  }

  public async createAdminIfAbsent(
    username: string,
    passwordHash: string,
  ): Promise<{ admin: AdminRecord; created: boolean }> {
    const existing = await this.findAdminByUsername(username);
    if (existing) return { admin: existing, created: false };
    const now = new Date();
    const admin: AdminRecord = {
      id: randomUUID(),
      username,
      passwordHash,
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };
    this.admins.push(admin);
    return { admin, created: true };
  }

  public async updateAdminLastLogin(id: string, at: Date): Promise<void> {
    const admin = await this.findAdminById(id);
    if (admin) admin.lastLoginAt = at;
  }

  public async createSession(tokenHash: string, adminId: string, expiresAt: Date): Promise<void> {
    this.sessions.set(tokenHash, { adminId, expiresAt });
  }

  public async findSession(tokenHash: string, now: Date): Promise<SessionRecord | null> {
    const value = this.sessions.get(tokenHash);
    if (!value || value.expiresAt < now) return null;
    const admin = await this.findAdminById(value.adminId);
    if (!admin) return null;
    return {
      tokenHash,
      adminId: admin.id,
      adminUsername: admin.username,
      adminStatus: admin.status,
      expiresAt: value.expiresAt,
    };
  }

  public async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  public async deleteExpiredSessions(now: Date): Promise<void> {
    for (const [key, value] of this.sessions) if (value.expiresAt < now) this.sessions.delete(key);
  }

  public async listStores(input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: StoreStatus;
  }): Promise<{ items: StoreListRecord[]; total: number }> {
    let rows = [...this.stores.values()];
    if (input.status) rows = rows.filter((store) => store.status === input.status);
    if (input.search) {
      const search = input.search.toLowerCase();
      rows = rows.filter((store) =>
        [store.name, store.shortName, store.address, this.wifi.get(store.id)?.ssid].some((value) =>
          value?.toLowerCase().includes(search),
        ),
      );
    }
    rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    const total = rows.length;
    const page = rows.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);
    return {
      items: page.map((store) => ({
        ...store,
        hasWifi: this.wifi.has(store.id),
        qrCodeStatus: this.latestQr(store.id)?.status ?? null,
      })),
      total,
    };
  }

  public async createStore(input: CreateStoreInput): Promise<StoreRecord> {
    const now = new Date();
    const store: StoreRecord = {
      id: randomUUID(),
      name: input.name,
      merchantId: input.merchantId ?? DEFAULT_MERCHANT_ID,
      shortName: input.shortName ?? null,
      logoUrl: input.logoUrl ?? null,
      address: input.address ?? null,
      contactName: input.contactName ?? null,
      contactPhone: input.contactPhone ?? null,
      notes: input.notes ?? null,
      status: input.status,
      adEnabled: input.adEnabled,
      createdAt: now,
      updatedAt: now,
    };
    this.stores.set(store.id, store);
    return store;
  }

  public async getStore(id: string): Promise<StoreRecord | null> {
    return this.stores.get(id) ?? null;
  }

  public async updateStore(id: string, input: UpdateStoreInput): Promise<StoreRecord | null> {
    const store = this.stores.get(id);
    if (!store) return null;
    if (input.merchantId !== undefined) store.merchantId = input.merchantId;
    if (input.name !== undefined) store.name = input.name;
    if (input.shortName !== undefined) store.shortName = input.shortName;
    if (input.logoUrl !== undefined) store.logoUrl = input.logoUrl;
    if (input.address !== undefined) store.address = input.address;
    if (input.contactName !== undefined) store.contactName = input.contactName;
    if (input.contactPhone !== undefined) store.contactPhone = input.contactPhone;
    if (input.notes !== undefined) store.notes = input.notes;
    if (input.status !== undefined) store.status = input.status;
    if (input.adEnabled !== undefined) store.adEnabled = input.adEnabled;
    store.updatedAt = new Date();
    return store;
  }

  public async getWifi(storeId: string): Promise<WifiRecord | null> {
    return (await this.listWifi(storeId))[0] ?? null;
  }

  public async upsertWifi(
    input: Omit<
      WifiRecord,
      "id" | "version" | "createdAt" | "updatedAt" | "shortId" | "spotName" | "deletedAt"
    > &
      Partial<Pick<WifiRecord, "shortId" | "spotName" | "deletedAt">>,
  ): Promise<WifiRecord> {
    const existing = this.wifi.get(input.storeId);
    const now = new Date();
    const row: WifiRecord = {
      shortId: existing?.shortId ?? randomUUID().replaceAll("-", ""),
      spotName: existing?.spotName ?? "",
      deletedAt: existing?.deletedAt ?? null,
      ...input,
      id: existing?.id ?? randomUUID(),
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.wifi.set(input.storeId, row);
    for (const qr of this.qrs.values())
      if (qr.storeId === input.storeId && !qr.wifiId) qr.wifiId = row.id;
    return row;
  }

  public async getLatestQrForStore(storeId: string): Promise<QrCodeRecord | null> {
    const wifi = await this.getWifi(storeId);
    return wifi ? this.getLatestQrForWifi(wifi.id) : this.latestQr(storeId);
  }

  public async getQrById(id: string): Promise<QrCodeRecord | null> {
    return this.qrs.get(id) ?? null;
  }

  public async getQrByScene(sceneToken: string): Promise<QrCodeRecord | null> {
    return [...this.qrs.values()].find((qr) => qr.sceneToken === sceneToken) ?? null;
  }

  public async replaceActiveQr(input: {
    wifiId?: string;
    storeId: string;
    sceneToken: string;
    imageUrl: string;
    provider: QrCodeRecord["provider"];
  }): Promise<QrCodeRecord> {
    const now = new Date();
    const wifiId = input.wifiId ?? this.wifi.get(input.storeId)?.id ?? null;
    for (const qr of this.qrs.values()) {
      if (qr.wifiId === wifiId && qr.storeId === input.storeId && qr.status === "active") {
        qr.status = "disabled";
        qr.disabledAt = now;
      }
    }
    const qr: QrCodeRecord = {
      id: randomUUID(),
      ...input,
      wifiId,
      status: "active",
      generatedAt: now,
      disabledAt: null,
    };
    this.qrs.set(qr.id, qr);
    return qr;
  }

  public async setQrStatus(
    id: string,
    status: "active" | "disabled",
    at: Date,
  ): Promise<QrCodeRecord | null> {
    const qr = this.qrs.get(id);
    if (!qr) return null;
    if (status === "active") {
      for (const candidate of this.qrs.values()) {
        if (
          candidate.wifiId === qr.wifiId &&
          candidate.storeId === qr.storeId &&
          candidate.status === "active"
        ) {
          candidate.status = "disabled";
          candidate.disabledAt = at;
        }
      }
    }
    qr.status = status;
    qr.disabledAt = status === "disabled" ? at : null;
    return qr;
  }

  public async insertEvent(input: EventRecord): Promise<void> {
    this.events.push(input);
  }

  public async getDashboard(now: Date): Promise<DashboardAggregate> {
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const today = aggregate(this.events.filter((event) => event.occurredAt >= todayStart));
    const week = aggregate(this.events.filter((event) => event.occurredAt >= weekStart));
    const trend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setUTCDate(date.getUTCDate() + index);
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + 1);
      const totals = aggregate(
        this.events.filter((event) => event.occurredAt >= date && event.occurredAt < next),
      );
      return {
        date: date.toISOString().slice(0, 10),
        pageViews: totals.pageViews,
        connectClicks: totals.connectClicks,
        connectSuccesses: totals.connectSuccesses,
      };
    });
    return {
      storeTotal: this.stores.size,
      activeQrCodeTotal: [...this.qrs.values()].filter((qr) => qr.status === "active").length,
      today,
      funnel: {
        pageViews: week.pageViews,
        connectClicks: week.connectClicks,
        connectSuccesses: week.connectSuccesses,
        connectFailures: week.connectFailures,
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
    const selected = this.events.filter(
      (event) => event.storeId === storeId && event.occurredAt >= from && event.occurredAt <= to,
    );
    const errors = new Map<string, number>();
    for (const event of selected)
      if (event.errorCode) errors.set(event.errorCode, (errors.get(event.errorCode) ?? 0) + 1);
    return {
      totals: aggregate(selected),
      commonErrors: [...errors.entries()]
        .map(([errorCode, count]) => ({ errorCode, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 10),
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
    this.logs.push({
      id: randomUUID(),
      adminUsername: this.admins.find((admin) => admin.id === input.adminId)?.username ?? null,
      ...input,
    });
  }

  public async listOperationLogs(input: {
    page: number;
    pageSize: number;
    search?: string;
    action?: string;
    resourceType?: string;
  }): Promise<{ items: OperationLogRecord[]; total: number }> {
    let selected = [...this.logs];
    if (input.action) {
      const action = input.action;
      const namespace = ["store", "wifi", "qrcode", "settings"].includes(action);
      selected = selected.filter(
        (log) => log.action === action || (namespace && log.action.startsWith(`${action}.`)),
      );
    }
    if (input.resourceType)
      selected = selected.filter((log) => log.resourceType === input.resourceType);
    if (input.search) {
      const search = input.search.toLocaleLowerCase();
      selected = selected.filter((log) =>
        [log.adminUsername, log.action, log.resourceType, log.resourceId].some((value) =>
          value?.toLocaleLowerCase().includes(search),
        ),
      );
    }
    selected.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return {
      items: selected.slice((input.page - 1) * input.pageSize, input.page * input.pageSize),
      total: selected.length,
    };
  }

  public async getSetting(key: string): Promise<unknown> {
    return this.settings.get(key) ?? null;
  }

  public async setSetting(key: string, value: unknown): Promise<void> {
    this.settings.set(key, value);
  }

  private latestQr(storeId: string): QrCodeRecord | null {
    return (
      [...this.qrs.values()]
        .filter((qr) => qr.storeId === storeId)
        .sort(
          (left, right) =>
            Number(right.status === "active") - Number(left.status === "active") ||
            right.generatedAt.getTime() - left.generatedAt.getTime(),
        )[0] ?? null
    );
  }

  private replaceMap<Key, Value>(target: Map<Key, Value>, source: Map<Key, Value>): void {
    target.clear();
    for (const [key, value] of source) target.set(key, value);
  }
}
