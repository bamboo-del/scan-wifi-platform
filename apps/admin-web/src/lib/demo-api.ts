import type { AccountSummary } from "@scan-wifi/shared-types";
import type {
  AdminSession,
  DashboardResponse,
  OperationLog,
  OperationLogQuery,
  PaginatedResponse,
  QrCodeResponse,
  QrCodeStatus,
  StoreDetail,
  StoreListQuery,
  StorePayload,
  StoreStatistics,
  StoreStatus,
  StoreSummary,
  SystemSettings,
  WifiPayload,
  WifiStatusResponse,
} from "@/lib/types";

const sleep = async (milliseconds = 120): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const DEMO_NOW = "2026-07-11T14:32:18.000Z";

function placeholderQrDataUrl(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="420" viewBox="0 0 360 420"><rect width="360" height="420" rx="24" fill="#fff"/><rect x="1" y="1" width="358" height="418" rx="23" fill="none" stroke="#d9e1e8"/><g fill="#15242c">${Array.from({ length: 15 }, (_, row) => Array.from({ length: 15 }, (_, col) => ((row * 7 + col * 11 + row * col) % 5 < 2 ? `<rect x="${52 + col * 17}" y="${42 + row * 17}" width="13" height="13" rx="2"/>` : "")).join("")).join("")}<path d="M52 42h72v72H52zM62 52v52h52V52zM76 66h24v24H76zM236 42h72v72h-72zM246 52v52h52V52zM260 66h24v24h-24zM52 226h72v72H52zM62 236v52h52v-52zM76 250h24v24H76z" fill-rule="evenodd"/></g><text x="180" y="335" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="18" font-weight="700" fill="#15242c">${label}</text><text x="180" y="372" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="15" fill="#e04f5f">仅供本地测试</text><text x="180" y="397" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="12" fill="#788892">非微信小程序码</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

let authenticated = false;
const accounts: AccountSummary[] = [
  {
    id: "admin-1",
    username: "admin",
    role: "admin",
    status: "active",
    createdAt: DEMO_NOW,
    lastLoginAt: null,
  },
];
const accountPasswords = new Map([["admin-1", "Admin123!"]]);
let currentAccount = accounts[0]!;
function requireDemoAdmin(): void {
  if (!authenticated) throw new Error("UNAUTHENTICATED");
  if (currentAccount.role !== "admin") throw new Error("无权执行此操作");
}
function visibleStores(): StoreDetail[] {
  return stores.filter(
    (store) => currentAccount.role === "admin" || store.ownerId === currentAccount.id,
  );
}
let settings: SystemSettings = {
  globalAdEnabled: true,
  adUnitConfigured: false,
  wechatQrConfigured: false,
  qrCodeProvider: "local-placeholder",
  legacyWifiApiEnabled: false,
};

let stores: StoreDetail[] = [
  {
    createdById: null,
    ownerId: null,
    id: "store-nanshan",
    name: "示例用户一",
    shortName: "示例一",
    logoUrl: null,
    address: "广东省深圳市南山区科技南十二路 18 号",
    contactName: "张先生",
    contactPhone: "138 0000 0000",
    status: "active",
    adEnabled: true,
    hasWifi: true,
    qrCodeStatus: "active",
    createdAt: "2026-05-15T02:05:33.000Z",
    updatedAt: DEMO_NOW,
    wifi: {
      configured: true,
      ssid: "NanshanCoffee-FreeWiFi",
      passwordMasked: "••••••••",
      bssid: "AA:BB:CC:DD:EE:FF",
      securityType: "WPA2_WPA3",
      status: "active",
      version: 3,
      updatedAt: DEMO_NOW,
    },
    qrCode: {
      id: "qr-nanshan",
      storeId: "store-nanshan",
      sceneToken: "8f42b4d0a7614fefa33ec7c9fe8bd08c",
      status: "active",
      generatedAt: "2026-05-16T02:05:33.000Z",
      disabledAt: null,
      previewUrl: placeholderQrDataUrl("示例用户一"),
      downloadUrl: placeholderQrDataUrl("示例用户一"),
      provider: "local-placeholder",
    },
  },
  {
    createdById: null,
    ownerId: null,
    id: "store-wanxiang",
    name: "示例用户二",
    shortName: "示例二",
    logoUrl: null,
    address: "广东省深圳市罗湖区宝安南路 1881 号",
    contactName: "李经理",
    contactPhone: "0755-8888-1234",
    status: "disabled",
    adEnabled: false,
    hasWifi: true,
    qrCodeStatus: "disabled",
    createdAt: "2026-06-02T03:10:00.000Z",
    updatedAt: "2026-07-11T01:48:00.000Z",
    wifi: {
      configured: true,
      ssid: "TimeBook-FreeWiFi",
      passwordMasked: "••••••••",
      bssid: null,
      securityType: "WPA2",
      status: "active",
      version: 1,
      updatedAt: "2026-06-02T03:10:00.000Z",
    },
    qrCode: {
      id: "qr-wanxiang",
      storeId: "store-wanxiang",
      sceneToken: "2de469d5b7f74ae784eaec82d7d9d780",
      status: "disabled",
      generatedAt: "2026-06-02T03:20:00.000Z",
      disabledAt: "2026-07-11T01:48:00.000Z",
      previewUrl: placeholderQrDataUrl("示例用户二"),
      downloadUrl: placeholderQrDataUrl("示例用户二"),
      provider: "local-placeholder",
    },
  },
  {
    createdById: null,
    ownerId: null,
    id: "store-futian",
    name: "示例用户三",
    shortName: "示例三",
    logoUrl: null,
    address: "广东省深圳市福田区福华一路 88 号",
    contactName: "王师傅",
    contactPhone: "136 0000 1122",
    status: "active",
    adEnabled: true,
    hasWifi: false,
    qrCodeStatus: null,
    createdAt: "2026-07-01T06:30:00.000Z",
    updatedAt: "2026-07-11T00:59:00.000Z",
    wifi: {
      configured: false,
      ssid: null,
      passwordMasked: null,
      bssid: null,
      securityType: null,
      status: null,
      version: null,
      updatedAt: null,
    },
    qrCode: null,
  },
];

let logs: OperationLog[] = [
  {
    id: "log-1",
    adminId: "admin-1",
    adminUsername: "admin",
    action: "store.update",
    resourceType: "store",
    resourceId: "store-nanshan",
    metadata: { changedFields: ["address", "contactPhone"] },
    createdAt: DEMO_NOW,
  },
  {
    id: "log-2",
    adminId: "admin-1",
    adminUsername: "admin",
    action: "qrcode.disable",
    resourceType: "qrcode",
    resourceId: "qr-wanxiang",
    metadata: {},
    createdAt: "2026-07-11T01:48:00.000Z",
  },
  {
    id: "log-3",
    adminId: "admin-1",
    adminUsername: "admin",
    action: "wifi.replace",
    resourceType: "wifi_config",
    resourceId: "store-nanshan",
    metadata: { version: 3 },
    createdAt: "2026-07-10T09:12:00.000Z",
  },
];

function summary(store: StoreDetail): StoreSummary {
  return {
    id: store.id,
    createdById: store.createdById,
    createdByUsername: store.createdByUsername ?? null,
    ownerId: store.ownerId,
    name: store.name,
    shortName: store.shortName,
    logoUrl: store.logoUrl,
    address: store.address,
    contactName: store.contactName,
    contactPhone: store.contactPhone,
    status: store.status,
    adEnabled: store.adEnabled,
    hasWifi: store.hasWifi,
    qrCodeStatus: store.qrCodeStatus,
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
  };
}

function addLog(action: string, resourceType: string, resourceId: string): void {
  logs = [
    {
      id: `log-${crypto.randomUUID()}`,
      adminId: "admin-1",
      adminUsername: "admin",
      action,
      resourceType,
      resourceId,
      metadata: {},
      createdAt: new Date().toISOString(),
    },
    ...logs,
  ];
}

function getRequiredStore(id: string): StoreDetail {
  const store = visibleStores().find((item) => item.id === id);
  if (!store) throw new Error("用户不存在");
  return store;
}

export const demoApi = {
  async listAccounts(): Promise<AccountSummary[]> {
    requireDemoAdmin();
    await sleep();
    return structuredClone(accounts);
  },
  async createOperator(username: string, password: string): Promise<AccountSummary> {
    requireDemoAdmin();
    await sleep();
    if (accounts.some((item) => item.username.toLowerCase() === username.toLowerCase()))
      throw new Error("用户名已存在");
    const account: AccountSummary = {
      id: crypto.randomUUID(),
      username,
      role: "operator",
      status: "active",
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    };
    accounts.push(account);
    accountPasswords.set(account.id, password);
    return structuredClone(account);
  },
  async setAccountStatus(id: string, status: "active" | "disabled"): Promise<AccountSummary> {
    requireDemoAdmin();
    await sleep();
    const account = accounts.find((item) => item.id === id && item.role === "operator");
    if (!account) throw new Error("同仁账号不存在");
    account.status = status;
    return structuredClone(account);
  },
  async resetAccountPassword(id: string, password: string): Promise<AccountSummary> {
    requireDemoAdmin();
    await sleep();
    const account = accounts.find((item) => item.id === id && item.role === "operator");
    if (!account) throw new Error("同仁账号不存在");
    accountPasswords.set(id, password);
    return structuredClone(account);
  },
  async transferStore(id: string, ownerId: string | null, reason: string): Promise<void> {
    requireDemoAdmin();
    await sleep();
    if (!reason.trim()) throw new Error("请填写转移原因");
    getRequiredStore(id).ownerId = ownerId;
    addLog("store.transfer", "store", id);
  },
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await sleep();
    if (accountPasswords.get(currentAccount.id) !== currentPassword)
      throw new Error("当前密码错误");
    accountPasswords.set(currentAccount.id, newPassword);
    authenticated = false;
  },
  async login(username: string, password: string): Promise<AdminSession> {
    await sleep();
    const account = accounts.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!account || account.status !== "active" || accountPasswords.get(account.id) !== password) {
      throw new Error("用户名或密码不正确");
    }
    currentAccount = account;
    authenticated = true;
    return {
      authenticated: true,
      admin: {
        id: currentAccount.id,
        username: currentAccount.username,
        role: currentAccount.role,
      },
      expiresAt: "2026-07-12T14:32:18.000Z",
    };
  },
  async session(): Promise<AdminSession> {
    await sleep(60);
    if (!authenticated) throw new Error("UNAUTHENTICATED");
    return {
      authenticated: true,
      admin: {
        id: currentAccount.id,
        username: currentAccount.username,
        role: currentAccount.role,
      },
      expiresAt: "2026-07-12T14:32:18.000Z",
    };
  },
  async logout(): Promise<void> {
    await sleep(60);
    authenticated = false;
  },
  async dashboard(): Promise<DashboardResponse> {
    requireDemoAdmin();
    await sleep();
    return {
      storeTotal: visibleStores().length,
      activeQrCodeTotal: visibleStores().filter((store) => store.qrCode?.status === "active")
        .length,
      today: {
        pageViews: 6842,
        connectClicks: 5940,
        connectSuccesses: 5231,
        connectFailures: 709,
        successRate: 0.764,
      },
      trend: [
        { date: "2026-07-05", pageViews: 8120, connectClicks: 5230, connectSuccesses: 3340 },
        { date: "2026-07-06", pageViews: 8940, connectClicks: 6120, connectSuccesses: 3960 },
        { date: "2026-07-07", pageViews: 9610, connectClicks: 7080, connectSuccesses: 4510 },
        { date: "2026-07-08", pageViews: 10820, connectClicks: 8120, connectSuccesses: 5480 },
        { date: "2026-07-09", pageViews: 8060, connectClicks: 6130, connectSuccesses: 3910 },
        { date: "2026-07-10", pageViews: 8870, connectClicks: 6620, connectSuccesses: 4520 },
        { date: "2026-07-11", pageViews: 9940, connectClicks: 7040, connectSuccesses: 5231 },
      ],
      funnel: {
        pageViews: 47_892,
        connectClicks: 32_156,
        connectSuccesses: 25_347,
        connectFailures: 6_809,
      },
    };
  },
  async listStores(query: StoreListQuery): Promise<PaginatedResponse<StoreSummary>> {
    await sleep();
    const search = query.search?.trim().toLowerCase() ?? "";
    const filtered = visibleStores().filter((store) => {
      const matchesSearch =
        !search ||
        [store.name, store.shortName, store.address].some((value) =>
          value?.toLowerCase().includes(search),
        );
      const matchesStatus =
        !query.status || query.status === "all" || store.status === query.status;
      return matchesSearch && matchesStatus;
    });
    const start = (query.page - 1) * query.pageSize;
    return {
      items: filtered.slice(start, start + query.pageSize).map(summary),
      page: query.page,
      pageSize: query.pageSize,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / query.pageSize)),
    };
  },
  async getStore(id: string): Promise<StoreDetail> {
    await sleep();
    return structuredClone(getRequiredStore(id));
  },
  async createStore(payload: StorePayload): Promise<StoreDetail> {
    await sleep();
    const id = `store-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const store: StoreDetail = {
      id,
      createdById: currentAccount.id,
      createdByUsername: currentAccount.username,
      ownerId: currentAccount.id,
      name: payload.name,
      shortName: payload.shortName ?? null,
      logoUrl: payload.logoUrl ?? null,
      address: payload.address ?? null,
      contactName: payload.contactName ?? null,
      contactPhone: payload.contactPhone ?? null,
      status: currentAccount.role === "admin" ? (payload.status ?? "active") : "active",
      adEnabled: currentAccount.role === "admin" ? payload.adEnabled : false,
      hasWifi: false,
      qrCodeStatus: null,
      createdAt: now,
      updatedAt: now,
      wifi: {
        configured: false,
        ssid: null,
        passwordMasked: null,
        bssid: null,
        securityType: null,
        status: null,
        version: null,
        updatedAt: null,
      },
      qrCode: null,
    };
    stores = [store, ...stores];
    addLog("store.create", "store", id);
    return structuredClone(store);
  },
  async updateStore(id: string, payload: StorePayload): Promise<StoreDetail> {
    requireDemoAdmin();
    await sleep();
    const store = getRequiredStore(id);
    Object.assign(store, payload, {
      updatedAt: new Date().toISOString(),
    });
    addLog("store.update", "store", id);
    return structuredClone(store);
  },
  async setStoreStatus(id: string, status: StoreStatus): Promise<StoreDetail> {
    requireDemoAdmin();
    await sleep();
    const store = getRequiredStore(id);
    store.status = status;
    store.updatedAt = new Date().toISOString();
    addLog(status === "active" ? "store.enable" : "store.disable", "store", id);
    return structuredClone(store);
  },
  async getWifi(id: string): Promise<WifiStatusResponse> {
    await sleep();
    return structuredClone(getRequiredStore(id).wifi);
  },
  async updateWifi(id: string, payload: WifiPayload): Promise<WifiStatusResponse> {
    await sleep();
    const store = getRequiredStore(id);
    if (
      currentAccount.role !== "admin" &&
      (store.createdById !== currentAccount.id ||
        store.wifi.configured ||
        store.status !== "active" ||
        payload.status === "disabled")
    )
      throw new Error("同仁只能配置初始 Wi-Fi");
    store.wifi = {
      configured: true,
      ssid: payload.ssid,
      passwordMasked: "••••••••",
      bssid: payload.bssid ?? null,
      securityType: payload.securityType ?? null,
      status: payload.status ?? "active",
      version: (store.wifi.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    store.hasWifi = true;
    store.updatedAt = store.wifi.updatedAt ?? store.updatedAt;
    addLog("wifi.replace", "wifi_config", id);
    return structuredClone(store.wifi);
  },
  async getQrCode(storeId: string): Promise<QrCodeResponse | null> {
    await sleep();
    return structuredClone(getRequiredStore(storeId).qrCode);
  },
  async generateQrCode(storeId: string): Promise<QrCodeResponse> {
    await sleep();
    const store = getRequiredStore(storeId);
    if (currentAccount.role !== "admin" && store.qrCode)
      throw new Error("已有二维码，请联系主账号管理");
    const dataUrl = placeholderQrDataUrl(store.name);
    const qr: QrCodeResponse = {
      id: `qr-${crypto.randomUUID()}`,
      storeId,
      createdByUsername: currentAccount.username,
      sceneToken: crypto.randomUUID().replaceAll("-", ""),
      status: "active",
      generatedAt: new Date().toISOString(),
      disabledAt: null,
      previewUrl: dataUrl,
      downloadUrl: dataUrl,
      provider: "local-placeholder",
    };
    store.qrCode = qr;
    store.qrCodeStatus = "active";
    addLog("qrcode.generate", "qrcode", qr.id);
    return structuredClone(qr);
  },
  async setQrCodeStatus(qrId: string, status: QrCodeStatus): Promise<QrCodeResponse> {
    requireDemoAdmin();
    await sleep();
    const store = stores.find((item) => item.qrCode?.id === qrId);
    if (!store?.qrCode) throw new Error("二维码不存在");
    store.qrCode.status = status;
    store.qrCode.disabledAt = status === "active" ? null : new Date().toISOString();
    store.qrCodeStatus = store.qrCode.status;
    addLog(status === "active" ? "qrcode.enable" : "qrcode.disable", "qrcode", qrId);
    return structuredClone(store.qrCode);
  },
  async statistics(storeId: string): Promise<StoreStatistics> {
    requireDemoAdmin();
    await sleep();
    getRequiredStore(storeId);
    return {
      range: { from: "2026-07-05", to: "2026-07-11" },
      totals: {
        pageViews: 12_840,
        adLoadSuccesses: 10_294,
        adLoadFailures: 218,
        connectClicks: 8_410,
        connectSuccesses: 6_795,
        connectFailures: 1_615,
        successRate: 0.808,
      },
      commonErrors: [
        { errorCode: "wifi_disabled", count: 632 },
        { errorCode: "connect_timeout", count: 418 },
        { errorCode: "permission_denied", count: 301 },
      ],
    };
  },
  async operationLogs(query: OperationLogQuery): Promise<PaginatedResponse<OperationLog>> {
    requireDemoAdmin();
    await sleep();
    const search = query.search?.trim().toLowerCase() ?? "";
    const filtered = logs.filter((log) => {
      const matchesSearch =
        !search ||
        log.adminUsername?.toLowerCase().includes(search) ||
        log.action.toLowerCase().includes(search) ||
        log.resourceId?.toLowerCase().includes(search);
      const matchesAction =
        !query.action || query.action === "all" || log.action.startsWith(query.action);
      return matchesSearch && matchesAction;
    });
    const start = (query.page - 1) * query.pageSize;
    return {
      items: filtered.slice(start, start + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / query.pageSize)),
    };
  },
  async settings(): Promise<SystemSettings> {
    requireDemoAdmin();
    await sleep();
    return structuredClone(settings);
  },
  async updateSettings(globalAdEnabled: boolean): Promise<SystemSettings> {
    requireDemoAdmin();
    await sleep();
    settings = { ...settings, globalAdEnabled };
    addLog("settings.update", "system_settings", "global_ad_enabled");
    return structuredClone(settings);
  },
};
