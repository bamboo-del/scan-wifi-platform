import { MINI_PROGRAM_RUNTIME_CONFIG as config } from "../config/runtime";
import { isAllowedApiBaseUrl } from "../platform/public-api";

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
export interface SpotInput {
  shopName: string;
  spotName: string;
  ssid: string;
  password: string;
  bssid: string | null;
  status: "active" | "disabled";
}

let token = "";
let expiresAt = 0;
let loginPending: Promise<void> | null = null;
export function merchantError(error: unknown): string {
  return error instanceof Error ? error.message : "操作未完成，请重试";
}

function errorMessage(data: unknown): string {
  const code = (data as { error?: { code?: string } } | null)?.error?.code;
  const messages: Record<string, string> = {
    UNAUTHORIZED: "登录已过期，请返回列表重新登录",
    VALIDATION_ERROR: "请检查店名、SSID、8 至 63 位密码及 BSSID 格式",
    WECHAT_NOT_CONFIGURED: "商家登录尚未配置，请联系服务方",
    WECHAT_LOGIN_FAILED: "微信登录失败，请重试",
    WECHAT_QR_UNAVAILABLE: "小程序码生成失败，WiFi 已保存，可稍后重新生成",
    WECHAT_TOKEN_UNAVAILABLE: "微信制码服务暂不可用，WiFi 已保存",
    SPOT_NOT_FOUND: "WiFi 贴不存在或已删除",
    RATE_LIMITED: "操作太频繁，请稍后重试",
  };
  return messages[code ?? ""] ?? "服务暂不可用，请稍后重试";
}

function request<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  data?: unknown,
): Promise<T> {
  if (!isAllowedApiBaseUrl(config.apiBaseUrl, config.allowInsecureLocalhost))
    return Promise.reject(new Error("服务地址尚未配置"));
  return new Promise((resolve, reject) =>
    wx.request({
      url: `${config.apiBaseUrl}/api/merchant${path}`,
      method,
      ...(data === undefined ? {} : { data }),
      header: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 25000,
      success: (response) => {
        if (response.statusCode === 401) {
          token = "";
          expiresAt = 0;
        }
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data as T);
        else reject(new Error(errorMessage(response.data)));
      },
      fail: () => reject(new Error("网络请求失败，请检查网络后重试")),
    }),
  );
}

export async function ensureMerchantLogin(): Promise<void> {
  if (token && expiresAt > Date.now() + 60000) return;
  if (loginPending) return loginPending;
  loginPending = (async () => {
    const code = await new Promise<string>((resolve, reject) =>
      wx.login({
        success: (result) =>
          result.code ? resolve(result.code) : reject(new Error("微信登录失败")),
        fail: () => reject(new Error("微信登录失败")),
      }),
    );
    const session = await request<{ token: string; expiresAt: string }>("/login", "POST", { code });
    token = session.token;
    expiresAt = Date.parse(session.expiresAt);
  })();
  try {
    await loginPending;
  } finally {
    loginPending = null;
  }
}
export const wifiSpotService = {
  list: (search: string) =>
    request<WifiSpot[]>(`/spots?search=${encodeURIComponent(search)}`, "GET"),
  get: (id: string) => request<WifiSpot>(`/spots/${encodeURIComponent(id)}`, "GET"),
  save: (input: SpotInput, id?: string) =>
    request<WifiSpot>(
      id ? `/spots/${encodeURIComponent(id)}` : "/spots",
      id ? "PUT" : "POST",
      input,
    ),
  generate: (id: string) =>
    request<WifiSpot>(`/spots/${encodeURIComponent(id)}/qrcode`, "POST", {}),
  status: (id: string, status: "active" | "disabled") =>
    request<WifiSpot>(`/spots/${encodeURIComponent(id)}/status`, "PATCH", { status }),
  remove: (id: string) => request<void>(`/spots/${encodeURIComponent(id)}`, "DELETE", {}),
  logout: async () => {
    try {
      await request<void>("/logout", "POST", {});
    } finally {
      token = "";
      expiresAt = 0;
    }
  },
  image: (id: string): Promise<string> =>
    new Promise((resolve, reject) =>
      wx.downloadFile({
        url: `${config.apiBaseUrl}/api/merchant/spots/${encodeURIComponent(id)}/image`,
        header: { Authorization: `Bearer ${token}` },
        success: (result) =>
          result.statusCode === 200
            ? resolve(result.tempFilePath)
            : reject(new Error("图片读取失败，请重试")),
        fail: () => reject(new Error("图片下载失败，请检查 downloadFile 合法域名")),
      }),
    ),
};
