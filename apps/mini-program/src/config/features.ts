import { MINI_PROGRAM_RUNTIME_CONFIG } from "./runtime";

/** Public flags only. Release diagnostics also require a trusted runtime environment. */
export const FEATURES = {
  enableAds: MINI_PROGRAM_RUNTIME_CONFIG.enableAds,
  enableAnalytics: MINI_PROGRAM_RUNTIME_CONFIG.enableAnalytics,
  enableWifiDiagnostics: MINI_PROGRAM_RUNTIME_CONFIG.enableWifiDiagnostics,
} as const;
