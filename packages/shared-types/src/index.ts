export const ADMIN_STATUSES = ["active", "disabled"] as const;
export const STORE_STATUSES = ["active", "disabled"] as const;
export const WIFI_STATUSES = ["active", "disabled"] as const;
export const WIFI_SECURITY_TYPES = ["WPA", "WPA2", "WPA3", "WPA2_WPA3", "WEP", "OPEN"] as const;
export const QR_CODE_STATUSES = ["active", "disabled"] as const;
export const CONNECTION_EVENT_TYPES = [
  "page_view",
  "ad_load_success",
  "ad_load_failure",
  "connect_click",
  "connect_success",
  "connect_failure",
] as const;
export const CLIENT_PLATFORMS = ["ios", "android", "devtools", "unknown"] as const;

export type AdminStatus = (typeof ADMIN_STATUSES)[number];
export type AdminRole = "admin" | "operator";
export interface AdminActor {
  id: string;
  role: AdminRole;
}
export interface AccountSummary extends AdminActor {
  username: string;
  status: AdminStatus;
  createdAt: string;
  lastLoginAt: string | null;
}
export type StoreStatus = (typeof STORE_STATUSES)[number];
export type WifiStatus = (typeof WIFI_STATUSES)[number];
export type WifiSecurityType = (typeof WIFI_SECURITY_TYPES)[number];
export type QrCodeStatus = (typeof QR_CODE_STATUSES)[number];
export type ConnectionEventType = (typeof CONNECTION_EVENT_TYPES)[number];
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export interface PaginationResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminSessionResponse {
  authenticated: true;
  admin: {
    id: string;
    username: string;
    role: AdminRole;
  };
  expiresAt: string;
}

export interface StoreSummary {
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
  hasWifi: boolean;
  qrCodeStatus: QrCodeStatus | null;
  qrCode?: QrCodeResponse | null;
  createdAt: string;
  updatedAt: string;
}

export interface WifiStatusResponse {
  configured: boolean;
  ssid: string | null;
  passwordMasked: string | null;
  bssid: string | null;
  securityType: WifiSecurityType | null;
  status: WifiStatus | null;
  version: number | null;
  updatedAt: string | null;
}

export interface QrCodeResponse {
  createdByUsername?: string | null;
  id: string;
  storeId: string;
  sceneToken: string;
  status: QrCodeStatus;
  generatedAt: string;
  disabledAt: string | null;
  previewUrl: string;
  downloadUrl: string;
  provider: "wechat" | "local-placeholder";
}

export interface StoreDetail extends StoreSummary {
  wifi: WifiStatusResponse;
  qrCode: QrCodeResponse | null;
}

export interface DashboardResponse {
  storeTotal: number;
  activeQrCodeTotal: number;
  today: {
    pageViews: number;
    connectClicks: number;
    connectSuccesses: number;
    connectFailures: number;
    successRate: number;
  };
  funnel: {
    pageViews: number;
    connectClicks: number;
    connectSuccesses: number;
    connectFailures: number;
  };
  trend: Array<{
    date: string;
    pageViews: number;
    connectClicks: number;
    connectSuccesses: number;
  }>;
}

export interface StatisticsTotals {
  pageViews: number;
  adLoadSuccesses: number;
  adLoadFailures: number;
  connectClicks: number;
  connectSuccesses: number;
  connectFailures: number;
  successRate: number;
}

export interface StoreStatisticsResponse {
  range: { from: string; to: string };
  totals: StatisticsTotals;
  commonErrors: Array<{ errorCode: string; count: number }>;
}

export interface OperationLogItem {
  id: string;
  adminId: string | null;
  adminUsername: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SystemSettingsResponse {
  globalAdEnabled: boolean;
  adUnitConfigured: boolean;
  wechatQrConfigured: boolean;
  qrCodeProvider: "wechat" | "local-placeholder";
  legacyWifiApiEnabled: boolean;
}

export interface PublicConnectResponse {
  store: {
    name: string;
    shortName: string | null;
    logoUrl: string | null;
  };
  wifi: {
    ssid: string;
    bssid: string | null;
    securityType: WifiSecurityType | null;
  };
  ad: {
    enabled: boolean;
    unitId: string | null;
  };
  compatibility: {
    legacyWifiApiEnabled: boolean;
  };
}

export interface PublicCredentialResponse {
  wifi: PublicConnectResponse["wifi"] & { password: string };
}
