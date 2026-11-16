import { randomUUID } from "node:crypto";
import type { AdminStatus, StoreStatus } from "@scan-wifi/shared-types";
import type { CreateStoreInput, UpdateStoreInput } from "@scan-wifi/validation";
import type {
  AdminRecord,
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
  eventType:
    | "page_view"
    | "ad_load_success"
    | "ad_load_failure"
    | "connect_click"
    | "connect_success"
    | "connect_failure";
  platform: "ios" | "android" | "devtools" | "unknown";
  errorCode: string | null;
  errorMessageSanitized: string | null;
  occurredAt: Date;
}

const emptyTotals = (): EventTotals => ({
  pageViews: 0,
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
  return totals;
}

export class MemoryPlatformRepository implements PlatformRepository {
  public readonly admins: AdminRecord[] = [
    {
      id: "8f1119c9-5dd9-4c6b-8c60-20c5c708eb6d",
      username: "admin@example.com",
      passwordHash: "test-hash",
      role: "admin",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      lastLoginAt: null,
    },
  ];
  public readonly stores = new Map<string, StoreRecord>();
  public readonly wifi = new Map<string, WifiRecord>();
  public readonly qrs = new Map<string, QrCodeRecord>();
  public readonly events: EventRecord[] = [];
  public readonly logs: OperationLogRecord[] = [];
  public readonly settings = new Map<string, unknown>([["global_ad_enabled", true]]);
  private readonly sessions = new Map<string, { adminId: string; expiresAt: Date }>();

  public async healthCheck(): Promise<void> {}

  public async transaction<T>(
    callback: (repository: PlatformRepository) => Promise<T>,
  ): Promise<T> {
    const snapshot = {
      admins: structuredClone(this.admins),
      stores: structuredClone(this.stores),
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
      role: "admin",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };
    this.admins.push(admin);
    return { admin, created: true };
  }

  public async lockAccount(id: string): Promise<AdminRecord | null> {
    return this.findAdminById(id);
  }

  public async listAccounts(): Promise<AdminRecord[]> {
    return [...this.admins];
  }

  public async createOperator(username: string, passwordHash: string): Promise<AdminRecord | null> {
    const result = await this.createAdminIfAbsent(username, passwordHash);
    if (!result.created) return null;
    result.admin.role = "operator";
    return result.admin;
  }

  public async updateAccount(
    id: string,
    input: { status?: AdminStatus; passwordHash?: string },
  ): Promise<AdminRecord | null> {
    const admin = await this.findAdminById(id);
    if (!admin) return null;
    Object.assign(admin, input, { updatedAt: new Date() });
    return admin;
  }

  public async deleteAdminSessions(adminId: string): Promise<void> {
    for (const [key, value] of this.sessions)
      if (value.adminId === adminId) this.sessions.delete(key);
  }

  public async transferStore(id: string, ownerId: string | null): Promise<StoreRecord | null> {
    const store = this.stores.get(id);
    if (!store) return null;
    store.ownerId = ownerId;
    store.updatedAt = new Date();
    return store;
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
      adminRole: admin.role,
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
    ownerId?: string;
  }): Promise<{ items: StoreListRecord[]; total: number }> {
    let rows = [...this.stores.values()];
    if (input.ownerId) rows = rows.filter((store) => store.ownerId === input.ownerId);
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
        createdByUsername: this.creatorName("store", store.id, store.createdById),
        hasWifi: this.wifi.has(store.id),
        qrCodeStatus: this.latestQr(store.id)?.status ?? null,
        qrCode: this.latestQr(store.id),
      })),
      total,
    };
  }

  public async createStore(input: CreateStoreInput, actorId?: string): Promise<StoreRecord> {
    const now = new Date();
    const store: StoreRecord = {
      id: randomUUID(),
      createdById: actorId ?? null,
      ownerId: actorId ?? null,
      name: input.name,
      shortName: input.shortName ?? null,
      logoUrl: input.logoUrl ?? null,
      address: input.address ?? null,
      contactName: input.contactName ?? null,
      contactPhone: input.contactPhone ?? null,
      status: input.status,
      adEnabled: input.adEnabled,
      createdAt: now,
      updatedAt: now,
    };
    this.stores.set(store.id, store);
    return store;
  }

  public async getStore(id: string): Promise<StoreRecord | null> {
    const store = this.stores.get(id);
    return store
      ? { ...store, createdByUsername: this.creatorName("store", id, store.createdById) }
      : null;
  }

  public async updateStore(id: string, input: UpdateStoreInput): Promise<StoreRecord | null> {
    const store = this.stores.get(id);
    if (!store) return null;
    if (input.name !== undefined) store.name = input.name;
    if (input.shortName !== undefined) store.shortName = input.shortName;
    if (input.logoUrl !== undefined) store.logoUrl = input.logoUrl;
    if (input.address !== undefined) store.address = input.address;
    if (input.contactName !== undefined) store.contactName = input.contactName;
    if (input.contactPhone !== undefined) store.contactPhone = input.contactPhone;
    if (input.status !== undefined) store.status = input.status;
    if (input.adEnabled !== undefined) store.adEnabled = input.adEnabled;
    store.updatedAt = new Date();
    return store;
  }

  public async getWifi(storeId: string): Promise<WifiRecord | null> {
    return this.wifi.get(storeId) ?? null;
  }

  public async upsertWifi(
    input: Omit<WifiRecord, "id" | "version" | "createdAt" | "updatedAt">,
  ): Promise<WifiRecord> {
    const existing = this.wifi.get(input.storeId);
    const now = new Date();
    const row: WifiRecord = {
      ...input,
      id: existing?.id ?? randomUUID(),
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.wifi.set(input.storeId, row);
    return row;
  }

  public async getLatestQrForStore(storeId: string): Promise<QrCodeRecord | null> {
    return this.latestQr(storeId);
  }

  public async getQrById(id: string): Promise<QrCodeRecord | null> {
    const qr = this.qrs.get(id);
    return qr ? { ...qr, createdByUsername: this.creatorName("qr_code", id) } : null;
  }

  public async getQrByScene(sceneToken: string): Promise<QrCodeRecord | null> {
    return [...this.qrs.values()].find((qr) => qr.sceneToken === sceneToken) ?? null;
  }

  public async replaceActiveQr(input: {
    storeId: string;
    sceneToken: string;
    imageUrl: string;
    provider: QrCodeRecord["provider"];
  }): Promise<QrCodeRecord> {
    const now = new Date();
    for (const qr of this.qrs.values()) {
      if (qr.storeId === input.storeId && qr.status === "active") {
        qr.status = "disabled";
        qr.disabledAt = now;
      }
    }
    const qr: QrCodeRecord = {
      id: randomUUID(),
      ...input,
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
        if (candidate.storeId === qr.storeId && candidate.status === "active") {
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

  public async getDashboard(now: Date, ownerId?: string): Promise<DashboardAggregate> {
    const selectedStores = [...this.stores.values()].filter(
      (store) => !ownerId || store.ownerId === ownerId,
    );
    const storeIds = new Set(selectedStores.map((store) => store.id));
    const selectedEvents = this.events.filter((event) => storeIds.has(event.storeId));
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const today = aggregate(selectedEvents.filter((event) => event.occurredAt >= todayStart));
    const week = aggregate(selectedEvents.filter((event) => event.occurredAt >= weekStart));
    const trend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setUTCDate(date.getUTCDate() + index);
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + 1);
      const totals = aggregate(
        selectedEvents.filter((event) => event.occurredAt >= date && event.occurredAt < next),
      );
      return {
        date: date.toISOString().slice(0, 10),
        pageViews: totals.pageViews,
        connectClicks: totals.connectClicks,
        connectSuccesses: totals.connectSuccesses,
      };
    });
    return {
      storeTotal: selectedStores.length,
      activeQrCodeTotal: [...this.qrs.values()].filter(
        (qr) => qr.status === "active" && storeIds.has(qr.storeId),
      ).length,
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
      const namespace = ["store", "wifi", "qrcode", "settings", "account"].includes(action);
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

  private creatorName(type: string, id: string, creatorId?: string | null): string | null {
    const log = this.logs.find(
      (item) =>
        item.resourceType === type &&
        item.resourceId === id &&
        item.action === (type === "store" ? "store.create" : "qrcode.generate"),
    );
    return this.admins.find((item) => item.id === (creatorId ?? log?.adminId))?.username ?? null;
  }

  private latestQr(storeId: string): QrCodeRecord | null {
    const qr =
      [...this.qrs.values()]
        .filter((qr) => qr.storeId === storeId)
        .sort(
          (left, right) =>
            left.status.localeCompare(right.status) ||
            right.generatedAt.getTime() - left.generatedAt.getTime(),
        )[0] ?? null;
    return qr ? { ...qr, createdByUsername: this.creatorName("qr_code", qr.id) } : null;
  }

  private replaceMap<Key, Value>(target: Map<Key, Value>, source: Map<Key, Value>): void {
    target.clear();
    for (const [key, value] of source) target.set(key, value);
  }
}
