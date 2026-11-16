import type { WechatAccountInfo } from "../platform/wechat-types";
import { FEATURES } from "../config/features";

export interface MiniProgramEnvironmentApi {
  readonly getAccountInfoSync?: () => WechatAccountInfo;
}

export type WifiDiagnosticsEnvironment = "develop" | "trial" | "release" | "unknown";

export function getWifiDiagnosticsEnvironment(
  api: MiniProgramEnvironmentApi,
): WifiDiagnosticsEnvironment {
  try {
    const value = api.getAccountInfoSync?.().miniProgram?.envVersion;
    if (value === "develop" || value === "trial" || value === "release") {
      return value;
    }
  } catch {
    // An unavailable account API is treated as an untrusted environment.
  }
  return "unknown";
}

export function isWifiDiagnosticsEnvironment(api: MiniProgramEnvironmentApi): boolean {
  const environment = getWifiDiagnosticsEnvironment(api);
  return FEATURES.enableWifiDiagnostics && (environment === "develop" || environment === "trial");
}
