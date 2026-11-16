import type {
  AdminSessionResponse,
  DashboardResponse,
  ErrorEnvelope,
  OperationLogItem,
  PaginationResponse,
  QrCodeResponse,
  QrCodeStatus,
  StoreDetail,
  StoreStatisticsResponse,
  StoreStatus,
  StoreSummary,
  SystemSettingsResponse,
  WifiSecurityType,
  WifiStatus,
  WifiStatusResponse,
} from "@scan-wifi/shared-types";

export type {
  DashboardResponse,
  QrCodeResponse,
  QrCodeStatus,
  StoreDetail,
  StoreStatus,
  StoreSummary,
  WifiSecurityType,
  WifiStatus,
  WifiStatusResponse,
};

export type AdminIdentity = AdminSessionResponse["admin"];
export type AdminSession = AdminSessionResponse;
export type DashboardTrendPoint = DashboardResponse["trend"][number];
export type PaginatedResponse<T> = PaginationResponse<T>;
export type OperationLog = OperationLogItem;
export type SystemSettings = SystemSettingsResponse;
export type ApiErrorEnvelope = ErrorEnvelope;
export type ResourceStatus = WifiStatus;

export interface StoreListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: StoreStatus | "all";
}

export interface StorePayload {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  adEnabled: boolean;
  status?: StoreStatus;
}

export interface WifiPayload {
  ssid: string;
  password: string;
  bssid?: string | null;
  securityType?: WifiSecurityType | null;
  status?: WifiStatus;
}

export type StoreStatistics = StoreStatisticsResponse;

export interface OperationLogQuery {
  page: number;
  pageSize: number;
  search?: string;
  action?: string;
  resourceType?: string;
}
