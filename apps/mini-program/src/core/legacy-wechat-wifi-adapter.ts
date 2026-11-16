import type { LegacyWifiWxApi, WifiConnectedListener } from "../platform/wechat-types";
import type {
  WifiConnectResult,
  WifiConnectionSettings,
  WifiConnector,
  WifiConnectStage,
} from "./types";
import { getInternalWifiError, normalizeWifiError } from "./wifi-errors";

interface ActiveConnection {
  readonly targetSsid: string;
  readonly resolve: (result: WifiConnectResult) => void;
  timer: ReturnType<typeof setTimeout> | null;
  verifyTimer: ReturnType<typeof setTimeout> | null;
  listenerAttached: boolean;
  settled: boolean;
  verifying: boolean;
}

export interface LegacyWeChatWifiAdapterOptions {
  readonly enabled: boolean;
  readonly timeoutMs: number;
  readonly manualSystemConnection: boolean;
  readonly log?: (step: "WIFI_START" | "WIFI_CONNECT" | "WIFI_VERIFY" | "WIFI_FAILED") => void;
}

function hasLegacyWifiContract(api: LegacyWifiWxApi): boolean {
  return (
    typeof api.startWifi === "function" &&
    typeof api.connectWifi === "function" &&
    typeof api.getConnectedWifi === "function" &&
    typeof api.onWifiConnected === "function" &&
    typeof api.offWifiConnected === "function" &&
    typeof api.stopWifi === "function"
  );
}

export class LegacyWeChatWifiAdapter implements WifiConnector {
  private activeConnection: ActiveConnection | null = null;
  private wifiModuleStarted = false;
  private disposed = false;

  private readonly wifiConnectedListener: WifiConnectedListener = (result) => {
    const active = this.activeConnection;
    if (active === null || active.settled || result.wifi?.SSID !== active.targetSsid) {
      return;
    }

    this.verifyConnected(active);
  };

  constructor(
    private readonly api: LegacyWifiWxApi,
    private readonly options: LegacyWeChatWifiAdapterOptions,
  ) {}

  isAvailable(): boolean {
    // The official Wi-Fi overview explicitly says wx.canIUse cannot judge this
    // API family. Availability therefore requires an explicit release switch
    // plus the complete legacy method contract.
    return this.options.enabled && hasLegacyWifiContract(this.api);
  }

  connect(
    settings: WifiConnectionSettings,
    onStage: (stage: WifiConnectStage) => void,
  ): Promise<WifiConnectResult> {
    if (this.disposed) {
      return Promise.resolve({ ok: false, error: getInternalWifiError("cancelled") });
    }

    if (!this.options.enabled) {
      return Promise.resolve({
        ok: false,
        error: getInternalWifiError("adapter_disabled"),
      });
    }

    if (!hasLegacyWifiContract(this.api)) {
      return Promise.resolve({
        ok: false,
        error: getInternalWifiError("api_unavailable"),
      });
    }

    this.cancelActiveConnection();
    onStage("initializing_wifi");

    return new Promise<WifiConnectResult>((resolve) => {
      const active: ActiveConnection = {
        targetSsid: settings.ssid,
        resolve,
        timer: null,
        verifyTimer: null,
        listenerAttached: false,
        settled: false,
        verifying: false,
      };
      this.activeConnection = active;
      active.timer = setTimeout(
        () => this.settle(active, { ok: false, error: getInternalWifiError("client_timeout") }),
        this.options.timeoutMs,
      );

      try {
        this.api.startWifi({
          success: () => {
            this.wifiModuleStarted = true;
            this.options.log?.("WIFI_START");
            if (this.disposed) {
              // startWifi cannot be cancelled. If its success arrives after the
              // page was disposed, stop the module here instead of leaking it.
              this.stopWifiModule();
              return;
            }
            if (!this.isCurrent(active)) {
              if (this.activeConnection === null) this.stopWifiModule();
              return;
            }

            try {
              this.api.onWifiConnected(this.wifiConnectedListener);
              active.listenerAttached = true;
              onStage("connecting");
              this.options.log?.("WIFI_CONNECT");
              if (active.timer !== null) clearTimeout(active.timer);
              active.timer = setTimeout(() => {
                this.settle(active, {
                  ok: false,
                  error: getInternalWifiError("client_timeout"),
                });
              }, this.options.timeoutMs);

              const optionalBssid = settings.bssid === null ? {} : { BSSID: settings.bssid };
              const connect = () => {
                if (!this.isCurrent(active)) return;
                try {
                  this.api.connectWifi({
                    SSID: settings.ssid,
                    password: settings.password,
                    maunal: this.options.manualSystemConnection,
                    ...optionalBssid,
                    success: () => {
                      this.verifyConnected(active);
                    },
                    fail: (error) => {
                      if (this.isCurrent(active)) {
                        this.settle(active, {
                          ok: false,
                          error: normalizeWifiError(error),
                        });
                      }
                    },
                  });
                } catch (error) {
                  this.settle(active, { ok: false, error: normalizeWifiError(error) });
                }
              };
              if (this.api.getConnectedWifi) {
                this.api.getConnectedWifi({
                  success: (result) => {
                    if (!this.isCurrent(active)) return;
                    if (result.wifi?.SSID === active.targetSsid) this.settle(active, { ok: true });
                    else connect();
                  },
                  fail: () => {
                    if (this.isCurrent(active)) connect();
                  },
                });
              } else connect();
            } catch (error) {
              this.settle(active, {
                ok: false,
                error: normalizeWifiError(error),
              });
            }
          },
          fail: (error) => {
            if (this.isCurrent(active)) {
              this.settle(active, {
                ok: false,
                error: normalizeWifiError(error),
              });
            }
          },
        });
      } catch (error) {
        this.settle(active, {
          ok: false,
          error: normalizeWifiError(error),
        });
      }
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.cancelActiveConnection();

    this.stopWifiModule();
  }

  private verifyConnected(active: ActiveConnection): void {
    if (!this.isCurrent(active) || active.verifying) return;
    // Without a readable SSID we cannot claim verified success.
    if (!this.api.getConnectedWifi) return;
    active.verifying = true;
    try {
      this.api.getConnectedWifi({
        success: (result) => {
          active.verifying = false;
          if (!this.isCurrent(active)) return;
          if (result.wifi?.SSID === active.targetSsid) this.settle(active, { ok: true });
          else this.scheduleVerification(active);
        },
        fail: (error) => {
          active.verifying = false;
          if (!this.isCurrent(active)) return;
          const normalized = normalizeWifiError(error);
          if ([12001, 12005, 12006, 12007].includes(Number(normalized.code))) {
            this.settle(active, { ok: false, error: normalized });
          } else this.scheduleVerification(active);
        },
      });
    } catch {
      active.verifying = false;
      this.scheduleVerification(active);
    }
  }

  private scheduleVerification(active: ActiveConnection): void {
    if (!this.isCurrent(active) || active.verifyTimer !== null) return;
    active.verifyTimer = setTimeout(() => {
      active.verifyTimer = null;
      this.verifyConnected(active);
    }, 500);
  }

  private isCurrent(active: ActiveConnection): boolean {
    return !this.disposed && this.activeConnection === active && !active.settled;
  }

  private stopWifiModule(): void {
    if (!this.wifiModuleStarted || typeof this.api.stopWifi !== "function") {
      return;
    }
    this.wifiModuleStarted = false;
    try {
      this.api.stopWifi({});
    } catch {
      // Cleanup must stay best-effort and never surface raw platform errors.
    }
  }

  private cancelActiveConnection(): void {
    const active = this.activeConnection;
    if (active !== null && !active.settled) {
      this.settle(active, {
        ok: false,
        error: getInternalWifiError("cancelled"),
      });
    }
  }

  private settle(active: ActiveConnection, result: WifiConnectResult): void {
    if (active.settled) {
      return;
    }

    active.settled = true;
    if (active.verifyTimer !== null) {
      clearTimeout(active.verifyTimer);
      active.verifyTimer = null;
    }
    this.options.log?.(result.ok ? "WIFI_VERIFY" : "WIFI_FAILED");
    if (active.timer !== null) {
      clearTimeout(active.timer);
      active.timer = null;
    }

    if (active.listenerAttached) {
      try {
        this.api.offWifiConnected(this.wifiConnectedListener);
      } catch {
        // The listener reference remains stable; cleanup is best-effort.
      }
      active.listenerAttached = false;
    }

    if (this.activeConnection === active) {
      this.activeConnection = null;
    }
    active.resolve(result);
  }
}
