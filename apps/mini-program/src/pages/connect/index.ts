import { ConnectController } from "../../core/connect-controller";
import type { ConnectViewState, ConnectionPhase } from "../../core/types";
import { LegacyWeChatWifiAdapter } from "../../core/legacy-wechat-wifi-adapter";
import { MINI_PROGRAM_RUNTIME_CONFIG } from "../../config/runtime";
import { isWifiDiagnosticsEnvironment } from "../../core/wifi-diagnostics-environment";
import { getEventPlatform, WechatPublicApiClient } from "../../platform/public-api";

interface ConnectPageData extends ConnectViewState {
  readonly welcomeTitle: string;
  readonly isInitializing: boolean;
  readonly isConnecting: boolean;
  readonly isProgress: boolean;
  readonly isSuccess: boolean;
  readonly showRetryIcon: boolean;
  readonly showAvailability: boolean;
  readonly showManualToggle: boolean;
  readonly adShellClass: string;
  readonly primaryButtonClass: string;
  readonly statusCardClass: string;
  readonly statusDotClass: string;
  readonly showWifiDiagnostics: boolean;
}

interface ConnectPageMembers {
  controller: ConnectController | null;
  onLoad(query: Readonly<Record<string, unknown>>): void;
  onUnload(): void;
  onPrimaryTap(): void;
  onToggleTroubleshooting(): void;
  onAdLoad(): void;
  onAdError(): void;
  onWifiDiagnosticsTap(): void;
}

function isManualPhase(phase: ConnectionPhase): boolean {
  return (
    phase === "failed" ||
    phase === "unsupported" ||
    phase === "permission_denied" ||
    phase === "wifi_disabled"
  );
}

function toPageData(state: ConnectViewState, showWifiDiagnostics = false): ConnectPageData {
  const isInitializing = state.phase === "initializing_wifi";
  const isConnecting = state.phase === "connecting";
  const isProgress = isInitializing || isConnecting;
  const isSuccess = state.phase === "success";
  const showRetryIcon =
    state.phase === "failed" ||
    state.phase === "permission_denied" ||
    state.phase === "wifi_disabled";

  return {
    ...state,
    welcomeTitle: `${state.storeName}欢迎您`,
    isInitializing,
    isConnecting,
    isProgress,
    isSuccess,
    showRetryIcon,
    showAvailability: state.hasConfig,
    showManualToggle: state.hasConfig && isManualPhase(state.phase),
    adShellClass: state.adCollapsed ? "ad-shell ad-shell--collapsed" : "ad-shell",
    primaryButtonClass: state.buttonDisabled
      ? "primary-button primary-button--disabled"
      : "primary-button",
    statusCardClass: `status-card status-card--${state.statusTone}`,
    statusDotClass: `status-dot status-dot--${state.statusTone}`,
    showWifiDiagnostics,
  };
}

const initialData = toPageData({
  phase: "waiting",
  configLoading: true,
  hasConfig: false,
  storeName: "正在读取用户信息",
  brandName: "轻连 WiFi",
  logoUrl: null,
  ssid: "—",
  buttonLabel: "正在读取网络…",
  buttonDisabled: true,
  statusTitle: "正在读取用户信息",
  statusMessage: "请稍候",
  statusTone: "progress",
  initialized: false,
  troubleshootingExpanded: false,
  adEligible: false,
  adCollapsed: true,
  adUnitId: "",
});

Page<ConnectPageData, ConnectPageMembers>({
  data: initialData,
  controller: null,

  onLoad(query) {
    const showWifiDiagnostics = isWifiDiagnosticsEnvironment(wx);
    this.setData({ showWifiDiagnostics });
    const publicApi = new WechatPublicApiClient(
      wx,
      MINI_PROGRAM_RUNTIME_CONFIG.apiBaseUrl,
      MINI_PROGRAM_RUNTIME_CONFIG.requestTimeoutMs,
      MINI_PROGRAM_RUNTIME_CONFIG.allowInsecureLocalhost,
    );
    const wifi = new LegacyWeChatWifiAdapter(wx, {
      enabled: MINI_PROGRAM_RUNTIME_CONFIG.legacyWifiAdapterEnabled,
      timeoutMs: MINI_PROGRAM_RUNTIME_CONFIG.connectTimeoutMs,
      manualSystemConnection: MINI_PROGRAM_RUNTIME_CONFIG.legacyWifiManualSystemConnection,
    });
    const controller = new ConnectController({
      api: publicApi,
      wifi,
      platform: getEventPlatform(wx),
      adUnitId: MINI_PROGRAM_RUNTIME_CONFIG.adUnitId,
      brandName: MINI_PROGRAM_RUNTIME_CONFIG.brandName,
      onChange: (state) => this.setData(toPageData(state, showWifiDiagnostics)),
    });
    this.controller = controller;
    void controller.load(query.scene);
  },

  onUnload() {
    this.controller?.dispose();
    this.controller = null;
  },

  onPrimaryTap() {
    if (this.data.buttonDisabled) {
      return;
    }
    void this.controller?.connect();
  },

  onToggleTroubleshooting() {
    this.controller?.toggleTroubleshooting();
  },

  onAdLoad() {
    this.controller?.handleAdLoad();
  },

  onAdError() {
    this.controller?.handleAdError();
  },

  onWifiDiagnosticsTap() {
    if (!this.data.showWifiDiagnostics || !isWifiDiagnosticsEnvironment(wx)) {
      return;
    }
    wx.navigateTo({ url: "/pages/wifi-diagnostics/index" });
  },
});
