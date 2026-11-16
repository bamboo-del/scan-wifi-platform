import type { AnalyticsRow, MerchantResponse, WifiNetworkResponse } from "@scan-wifi/shared-types";
import { demoApi } from "@/lib/demo-api";
import type {
  AdminSession,
  ApiErrorEnvelope,
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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

export class ApiError extends Error {
  readonly code: string;
  readonly requestId: string | null;
  readonly status: number;
  readonly details: unknown;

  constructor(options: {
    message: string;
    code: string;
    status: number;
    requestId?: string;
    details?: unknown;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId ?? null;
    this.details = options.details;
  }
}

function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (!value || typeof value !== "object" || !("error" in value)) return false;
  const error = value.error;
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string" &&
    "requestId" in error &&
    typeof error.requestId === "string"
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    throw new ApiError({
      message: "无法连接服务，请检查网络后重试",
      code: "NETWORK_ERROR",
      status: 0,
      details: error instanceof Error ? error.message : undefined,
    });
  }

  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isApiErrorEnvelope(body)) {
      throw new ApiError({
        message: body.error.message,
        code: body.error.code,
        status: response.status,
        requestId: body.error.requestId,
        details: body.error.details,
      });
    }
    throw new ApiError({
      message: response.status === 401 ? "登录已过期，请重新登录" : "服务暂时不可用，请稍后重试",
      code: response.status === 401 ? "UNAUTHENTICATED" : "HTTP_ERROR",
      status: response.status,
    });
  }

  return body as T;
}

function queryString(values: Record<string, string | number | undefined>): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") parameters.set(key, String(value));
  }
  const serialized = parameters.toString();
  return serialized ? `?${serialized}` : "";
}

function normalizeDemoError(error: unknown): never {
  const message = error instanceof Error ? error.message : "操作失败，请稍后重试";
  throw new ApiError({
    message: message === "UNAUTHENTICATED" ? "登录已过期，请重新登录" : message,
    code: message === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "DEMO_ERROR",
    status: message === "UNAUTHENTICATED" ? 401 : 400,
  });
}

async function demoCall<T>(callback: () => Promise<T>): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    return normalizeDemoError(error);
  }
}

export const api = {
  isDemoMode: IS_DEMO_MODE,
  listMerchants(): Promise<MerchantResponse[]> {
    return IS_DEMO_MODE ? demoCall(() => demoApi.listMerchants()) : request("/api/admin/merchants");
  },
  saveMerchant(
    payload: { name: string; contact: string | null; status: StoreStatus },
    id?: string,
  ): Promise<MerchantResponse> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.saveMerchant(payload, id))
      : request(`/api/admin/merchants${id ? `/${id}` : ""}`, {
          method: id ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        });
  },
  listNetworks(storeId: string): Promise<WifiNetworkResponse[]> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.listNetworks(storeId))
      : request(`/api/admin/stores/${storeId}/networks`);
  },
  saveNetwork(storeId: string, payload: WifiPayload, wifiId?: string): Promise<WifiStatusResponse> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.saveNetwork(storeId, payload, wifiId))
      : request(`/api/admin/stores/${storeId}/networks${wifiId ? `/${wifiId}` : ""}`, {
          method: wifiId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        });
  },
  setNetworkStatus(
    storeId: string,
    wifiId: string,
    status: StoreStatus,
  ): Promise<WifiStatusResponse> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.setNetworkStatus(storeId, wifiId, status))
      : request(`/api/admin/stores/${storeId}/networks/${wifiId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
  },
  analytics(query: {
    merchantId?: string;
    storeId?: string;
    wifiId?: string;
    from: string;
    to: string;
  }): Promise<AnalyticsRow[]> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.analytics(query))
      : request(`/api/admin/analytics${queryString(query)}`);
  },
  login(username: string, password: string): Promise<AdminSession> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.login(username, password))
      : request("/api/admin/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
  },
  session(): Promise<AdminSession> {
    return IS_DEMO_MODE ? demoCall(() => demoApi.session()) : request("/api/admin/auth/session");
  },
  logout(): Promise<void> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.logout())
      : request("/api/admin/auth/logout", { method: "POST" });
  },
  dashboard(): Promise<DashboardResponse> {
    return IS_DEMO_MODE ? demoCall(() => demoApi.dashboard()) : request("/api/admin/dashboard");
  },
  listStores(query: StoreListQuery): Promise<PaginatedResponse<StoreSummary>> {
    if (IS_DEMO_MODE) return demoCall(() => demoApi.listStores(query));
    const queryStatus = query.status === "all" ? undefined : query.status;
    return request(
      `/api/admin/stores${queryString({
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        status: queryStatus,
      })}`,
    );
  },
  getStore(id: string): Promise<StoreDetail> {
    return IS_DEMO_MODE ? demoCall(() => demoApi.getStore(id)) : request(`/api/admin/stores/${id}`);
  },
  createStore(payload: StorePayload): Promise<StoreDetail> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.createStore(payload))
      : request("/api/admin/stores", { method: "POST", body: JSON.stringify(payload) });
  },
  updateStore(id: string, payload: StorePayload): Promise<StoreDetail> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.updateStore(id, payload))
      : request(`/api/admin/stores/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  setStoreStatus(id: string, status: StoreStatus): Promise<StoreDetail> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.setStoreStatus(id, status))
      : request(`/api/admin/stores/${id}/${status === "active" ? "enable" : "disable"}`, {
          method: "POST",
        });
  },
  getWifiStatus(id: string): Promise<WifiStatusResponse> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.getWifi(id))
      : request(`/api/admin/stores/${id}/wifi/status`);
  },
  updateWifi(id: string, payload: WifiPayload): Promise<WifiStatusResponse> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.updateWifi(id, payload))
      : request(`/api/admin/stores/${id}/wifi`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
  },
  async getQrCode(storeId: string): Promise<QrCodeResponse | null> {
    if (IS_DEMO_MODE) return demoCall(() => demoApi.getQrCode(storeId));
    try {
      return await request(`/api/admin/stores/${storeId}/qrcode`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.code === "QR_CODE_NOT_FOUND") {
        return null;
      }
      throw error;
    }
  },
  generateQrCode(storeId: string, wifiId?: string): Promise<QrCodeResponse> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.generateQrCode(storeId, wifiId))
      : request(
          wifiId
            ? `/api/admin/stores/${storeId}/networks/${wifiId}/qrcode`
            : `/api/admin/stores/${storeId}/qrcode`,
          { method: "POST" },
        );
  },
  setQrCodeStatus(qrId: string, status: QrCodeStatus): Promise<QrCodeResponse> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.setQrCodeStatus(qrId, status))
      : request(`/api/admin/qrcodes/${qrId}/${status === "active" ? "enable" : "disable"}`, {
          method: "POST",
        });
  },
  statistics(storeId: string, from?: string, to?: string): Promise<StoreStatistics> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.statistics(storeId))
      : request(`/api/admin/stores/${storeId}/statistics${queryString({ from, to })}`);
  },
  operationLogs(query: OperationLogQuery): Promise<PaginatedResponse<OperationLog>> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.operationLogs(query))
      : request(
          `/api/admin/operation-logs${queryString({
            page: query.page,
            pageSize: query.pageSize,
            search: query.search,
            action: query.action === "all" ? undefined : query.action,
          })}`,
        );
  },
  settings(): Promise<SystemSettings> {
    return IS_DEMO_MODE ? demoCall(() => demoApi.settings()) : request("/api/admin/settings");
  },
  updateSettings(globalAdEnabled: boolean): Promise<SystemSettings> {
    return IS_DEMO_MODE
      ? demoCall(() => demoApi.updateSettings(globalAdEnabled))
      : request("/api/admin/settings", {
          method: "PATCH",
          body: JSON.stringify({ globalAdEnabled }),
        });
  },
  assetUrl(path: string): string {
    if (/^(?:data:|https?:)/.test(path)) return path;
    return `${API_BASE_URL}${path}`;
  },
};
