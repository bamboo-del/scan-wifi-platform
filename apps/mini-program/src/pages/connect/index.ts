import { FEATURES } from "../../config/features";
import { sceneFromEntry } from "../../core/scene";
import { logStep } from "../../utils/logger";
import { dailyVisitorId } from "../../services/analytics";
import { ConnectController } from "../../core/connect-controller";
import type { ConnectViewState } from "../../core/types";
import { LegacyWeChatWifiAdapter } from "../../core/legacy-wechat-wifi-adapter";
import { MINI_PROGRAM_RUNTIME_CONFIG } from "../../config/runtime";
import { getEventPlatform, WechatPublicApiClient } from "../../platform/public-api";

interface ConnectPageData extends ConnectViewState {
  readonly motionActive: boolean;
}

interface ConnectPageMembers {
  entryScene: unknown;
  lastEnterScene: unknown;
  controller: ConnectController | null;
  onLoad(query: Readonly<Record<string, unknown>>): void;
  onShow(): void;
  onHide(): void;
  onUnload(): void;
  onPrimaryTap(): void;
}

const initialData: ConnectPageData = {
  motionActive: true,
  phase: "waiting",
  configLoading: true,
  hasConfig: false,
  storeName: "",
  brandName: "轻连 WiFi",
  logoUrl: null,
  ssid: "—",
  password: "",
  buttonLabel: "正在读取网络…",
  buttonDisabled: true,
  statusTitle: "正在读取网络",
  statusMessage: "请稍候",
  statusTone: "progress",
  initialized: false,
  troubleshootingExpanded: false,
  adEligible: false,
  adCollapsed: true,
  adUnitId: "",
};

Page<ConnectPageData, ConnectPageMembers>({
  data: initialData,
  controller: null,
  entryScene: undefined,
  lastEnterScene: undefined,

  onLoad(query) {
    const api = new WechatPublicApiClient(
      wx,
      MINI_PROGRAM_RUNTIME_CONFIG.apiBaseUrl,
      MINI_PROGRAM_RUNTIME_CONFIG.requestTimeoutMs,
      MINI_PROGRAM_RUNTIME_CONFIG.allowInsecureLocalhost,
    );
    const wifi = new LegacyWeChatWifiAdapter(wx, {
      enabled: MINI_PROGRAM_RUNTIME_CONFIG.legacyWifiAdapterEnabled,
      timeoutMs: MINI_PROGRAM_RUNTIME_CONFIG.connectTimeoutMs,
      manualSystemConnection: MINI_PROGRAM_RUNTIME_CONFIG.legacyWifiManualSystemConnection,
      log: logStep,
    });
    this.controller = new ConnectController({
      api,
      enableAds: false,
      enableAnalytics: FEATURES.enableAnalytics,
      visitorId: () => dailyVisitorId(wx),
      wifi,
      platform: getEventPlatform(wx),
      onChange: (state) => this.setData(state),
    });
    const enter = wx.getEnterOptionsSync?.();
    this.lastEnterScene = sceneFromEntry({}, enter);
    this.entryScene =
      query.home === "1" ? undefined : sceneFromEntry(query, enter, wx.getLaunchOptionsSync?.());
    logStep("SCAN");
    void this.controller.load(this.entryScene);
  },

  onShow() {
    this.setData({ motionActive: true });
    const entered = sceneFromEntry({}, wx.getEnterOptionsSync?.());
    if (entered !== undefined && entered !== this.lastEnterScene) {
      this.lastEnterScene = entered;
      this.entryScene = entered;
      void this.controller?.load(entered);
    }
  },

  onHide() {
    this.setData({ motionActive: false });
  },

  onUnload() {
    this.controller?.dispose();
    this.controller = null;
  },

  onPrimaryTap() {
    if (!this.data.buttonDisabled) void this.controller?.connect();
  },
});
