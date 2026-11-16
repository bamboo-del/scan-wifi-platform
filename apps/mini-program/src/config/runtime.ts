import { GENERATED_MINI_PROGRAM_RUNTIME_CONFIG } from "./runtime.generated";

export interface MiniProgramRuntimeConfig {
  readonly apiBaseUrl: string;
  readonly requestTimeoutMs: number;
  readonly connectTimeoutMs: number;
  readonly legacyWifiAdapterEnabled: boolean;
  readonly legacyWifiManualSystemConnection: boolean;
  readonly allowInsecureLocalhost: boolean;
  readonly adUnitId: string;
  readonly brandName: string;
}

/**
 * Release-time values for the native mini program.
 *
 * The legacy Wi-Fi API family is officially delisted and cannot be feature-
 * detected with wx.canIUse. Keep the local switch false until the target AppID
 * has passed a physical-device verification matrix. The backend compatibility
 * switch must also be true before the controller enables automatic connection.
 */
export const MINI_PROGRAM_RUNTIME_CONFIG: MiniProgramRuntimeConfig =
  GENERATED_MINI_PROGRAM_RUNTIME_CONFIG;
