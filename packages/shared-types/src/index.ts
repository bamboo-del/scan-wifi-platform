export const ADMIN_STATUSES = ["active", "disabled"] as const;
export const STORE_STATUSES = ["active", "disabled"] as const;
export const WIFI_STATUSES = ["active", "disabled"] as const;
export const WIFI_SECURITY_TYPES = ["WPA", "WPA2", "WPA3", "WPA2_WPA3", "WEP", "OPEN"] as const;
export const QR_CODE_STATUSES = ["active", "disabled"] as const;
export const CONNECTION_EVENT_TYPES = [
  "page_view",
  "scan",
  "password_copy",
  "ad_load_success",
  "ad_load_failure",
  "connect_click",
  "connect_success",
  "connect_failure",
] as const;
export const CLIENT_PLATFORMS = ["ios", "android", "devtools", "unknown"] as const;

export type AdminStatus = (typeof ADMIN_STATUSES)[number];
export type StoreStatus = (typeof STORE_STATUSES)[number];
export type WifiStatus = (typeof WIFI_STATUSES)[number];
export type WifiSecurityType = (typeof WIFI_SECURITY_TYPES)[number];
export type QrCodeStatus = (typeof QR_CODE_STATUSES)[number];
export type ConnectionEventType = (typeof CONNECTION_EVENT_TYPES)[number];
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

/** Merchant view. Credentials and owner identity are never included. */
export interface WifiSpot {
  id: string;
  shortId: string;
  shopName: string;
  spotName: string;
  ssid: string;
  bssid: string | null;
  status: "active" | "disabled";
  qrFileId: string | null;
  qrProvider: "wechat" | "local-placeholder" | null;
  qrUpdatedAt: string | null;
  connectCount: number;
  createTime: string;
  updateTime: string;
}

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
  };
  expiresAt: string;
}

export interface StoreSummary {
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
  hasWifi: boolean;
  qrCodeStatus: QrCodeStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface WifiStatusResponse {
  id: string | null;
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
  id: string;
  storeId: string;
  wifiId: string | null;
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
  uniqueVisitors: number;
  scans: number;
  passwordCopies: number;
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
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
  };
  wifi: {
    id: string;
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

export interface PublicWifiCredential {
  wifiId: string;
  storeId: string;
  ssid: string;
  password: string;
  bssid: string | null;
}

export interface MerchantResponse {
  id: string;
  name: string;
  contact: string | null;
  status: StoreStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WifiNetworkResponse extends WifiStatusResponse {
  qrCode: QrCodeResponse | null;
}

export interface AnalyticsRow {
  date: string;
  merchantId: string;
  storeId: string;
  wifiId: string | null;
  ssid: string | null;
  totals: StatisticsTotals;
}
