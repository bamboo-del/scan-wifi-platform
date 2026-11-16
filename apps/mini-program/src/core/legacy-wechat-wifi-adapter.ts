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
  readonly targetBssid: string | null;
  readonly resolve: (result: WifiConnectResult) => void;
  timer: ReturnType<typeof setTimeout> | null;
  listenerAttached: boolean;
  settled: boolean;
}

export interface LegacyWeChatWifiAdapterOptions {
  readonly enabled: boolean;
  readonly timeoutMs: number;
  readonly manualSystemConnection: boolean;
}

function hasLegacyWifiContract(api: LegacyWifiWxApi): boolean {
  return (
    typeof api.startWifi === "function" &&
    typeof api.connectWifi === "function" &&
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
    if (
      active === null ||
      active.settled ||
      result.wifi?.SSID !== active.targetSsid ||
      (active.targetBssid !== null && result.wifi.BSSID.toLowerCase() !== active.targetBssid)
    ) {
      return;
    }

    this.settle(active, { ok: true });
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
        targetBssid: settings.bssid?.toLowerCase() ?? null,
        resolve,
        timer: null,
        listenerAttached: false,
        settled: false,
      };
      this.activeConnection = active;
      active.timer = setTimeout(() => {
        this.settle(active, {
          ok: false,
          error: getInternalWifiError("client_timeout"),
        });
      }, this.options.timeoutMs);

      let startHandled = false;
      try {
        this.api.startWifi({
          success: () => {
            if (startHandled) return;
            startHandled = true;
            this.wifiModuleStarted = true;
            if (this.disposed || (active.settled && this.activeConnection === null)) {
              // startWifi cannot be cancelled. If its success arrives after the
              // page was disposed, stop the module here instead of leaking it.
              this.stopWifiModule();
              return;
            }
            if (!this.isCurrent(active)) {
              return;
            }

            try {
              this.api.onWifiConnected(this.wifiConnectedListener);
              active.listenerAttached = true;
              onStage("connecting");

              const optionalBssid = settings.bssid === null ? {} : { BSSID: settings.bssid };
              this.api.connectWifi({
                SSID: settings.ssid,
                password: settings.password,
                maunal: this.options.manualSystemConnection,
                ...optionalBssid,
                success: () => {
                  // This callback only confirms that the connect request was
                  // accepted. Actual success is the matching
                  // onWifiConnected event; manual mode merely opens settings.
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
          },
          fail: (error) => {
            if (startHandled) return;
            startHandled = true;
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
