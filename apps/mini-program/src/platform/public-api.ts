import type { WechatMiniProgramApi, WechatRequestTask } from "./wechat-types";
import type {
  EventPlatform,
  PublicApi,
  PublicConnectConfig,
  PublicEventInput,
  WifiConnectionSettings,
} from "../core/types";

export class PublicApiError extends Error {
  constructor(readonly code: string) {
    super("公共连接服务暂时不可用");
    this.name = "PublicApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function decodePublicConnectConfig(value: unknown): PublicConnectConfig {
  if (!isRecord(value)) {
    throw new PublicApiError("INVALID_RESPONSE");
  }

  const { store, wifi, ad, compatibility } = value;
  if (
    !isRecord(store) ||
    !isRecord(wifi) ||
    !isRecord(ad) ||
    !isRecord(compatibility) ||
    !isNonEmptyString(store.name) ||
    !isNullableString(store.shortName) ||
    !isNullableString(store.logoUrl) ||
    !isNonEmptyString(wifi.ssid) ||
    !isNullableString(wifi.bssid) ||
    !isNullableString(wifi.securityType) ||
    typeof ad.enabled !== "boolean" ||
    !isNullableString(ad.unitId) ||
    typeof compatibility.legacyWifiApiEnabled !== "boolean"
  ) {
    throw new PublicApiError("INVALID_RESPONSE");
  }

  return {
    store: {
      name: store.name,
      shortName: store.shortName,
      logoUrl: store.logoUrl,
    },
    wifi: {
      ssid: wifi.ssid,
      bssid: wifi.bssid,
      securityType: wifi.securityType,
    },
    ad: {
      enabled: ad.enabled,
      unitId: ad.unitId,
    },
    compatibility: {
      legacyWifiApiEnabled: compatibility.legacyWifiApiEnabled,
    },
  };
}

export function decodePublicCredential(value: unknown): WifiConnectionSettings {
  if (
    !isRecord(value) ||
    !isRecord(value.wifi) ||
    !isNonEmptyString(value.wifi.ssid) ||
    typeof value.wifi.password !== "string" ||
    !isNullableString(value.wifi.bssid)
  ) {
    throw new PublicApiError("INVALID_RESPONSE");
  }
  return {
    ssid: value.wifi.ssid,
    password: value.wifi.password,
    bssid: value.wifi.bssid,
  };
}

function readApiErrorCode(value: unknown): string {
  if (isRecord(value) && isRecord(value.error) && typeof value.error.code === "string") {
    return value.error.code;
  }
  return "REQUEST_FAILED";
}

function isHttpsApiBaseUrl(value: string): boolean {
  return /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[^\s?#]*)?$/.test(value);
}

function isLoopbackHttpApiBaseUrl(value: string): boolean {
  return /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:\/[^\s?#]*)?$/.test(value);
}

export function isAllowedApiBaseUrl(value: string, allowInsecureLocalhost: boolean): boolean {
  return isHttpsApiBaseUrl(value) || (allowInsecureLocalhost && isLoopbackHttpApiBaseUrl(value));
}

function normalizeApiBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getEventPlatform(api: WechatMiniProgramApi): EventPlatform {
  try {
    const platform = api.getDeviceInfo?.().platform?.toLowerCase();
    if (platform === "ios" || platform === "android" || platform === "devtools") {
      return platform;
    }
  } catch {
    // Older supported base libraries fall back to the aggregate API below.
  }
  try {
    const platform = api.getSystemInfoSync?.().platform?.toLowerCase();
    if (platform === "ios" || platform === "android" || platform === "devtools") {
      return platform;
    }
  } catch {
    // Anonymous reporting safely falls back to an unknown coarse platform.
  }
  return "unknown";
}

export class WechatPublicApiClient implements PublicApi {
  private readonly apiBaseUrl: string;
  private readonly activeTasks = new Map<WechatRequestTask, () => void>();
  private disposed = false;

  constructor(
    private readonly api: WechatMiniProgramApi,
    apiBaseUrl: string,
    private readonly timeoutMs: number,
    private readonly allowInsecureLocalhost = false,
  ) {
    this.apiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
  }

  async getConnectConfig(sceneToken: string): Promise<PublicConnectConfig> {
    const data = await this.request("GET", `/api/public/connect/${encodeURIComponent(sceneToken)}`);
    return decodePublicConnectConfig(data);
  }

  async reportEvent(event: PublicEventInput): Promise<void> {
    await this.request("POST", "/api/public/events", event, 202);
  }

  async getCredential(sceneToken: string): Promise<WifiConnectionSettings> {
    const data = await this.request("POST", "/api/public/credential", { sceneToken });
    return decodePublicCredential(data);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const [task, cancel] of this.activeTasks) {
      cancel();
      try {
        task.abort();
      } catch {
        // Aborting telemetry and config reads on unload is best-effort.
      }
    }
    this.activeTasks.clear();
  }

  private request(
    method: "GET" | "POST",
    path: string,
    data?: unknown,
    expectedStatus = 200,
  ): Promise<unknown> {
    if (this.disposed) {
      return Promise.reject(new PublicApiError("CLIENT_DISPOSED"));
    }
    if (!isAllowedApiBaseUrl(this.apiBaseUrl, this.allowInsecureLocalhost)) {
      return Promise.reject(new PublicApiError("API_BASE_URL_NOT_CONFIGURED"));
    }

    return new Promise<unknown>((resolve, reject) => {
      let task: WechatRequestTask | null = null;
      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (task !== null) {
          this.activeTasks.delete(task);
        }
        callback();
      };

      try {
        task = this.api.request({
          url: `${this.apiBaseUrl}${path}`,
          method,
          ...(data === undefined ? {} : { data }),
          header: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
          timeout: this.timeoutMs,
          success: (result) => {
            finish(() => {
              if (result.statusCode !== expectedStatus) {
                reject(new PublicApiError(readApiErrorCode(result.data)));
                return;
              }
              resolve(result.data);
            });
          },
          fail: () => {
            finish(() => reject(new PublicApiError("NETWORK_ERROR")));
          },
        });
        if (!settled) {
          this.activeTasks.set(task, () => {
            finish(() => reject(new PublicApiError("CLIENT_DISPOSED")));
          });
        }
      } catch {
        finish(() => reject(new PublicApiError("REQUEST_SETUP_FAILED")));
      }
    });
  }
}
