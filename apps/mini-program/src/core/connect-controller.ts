import { AdService } from "../services/ad";
import { AnalyticsService } from "../services/analytics";
import { getInternalWifiError } from "./wifi-errors";
import { parseSceneToken } from "./scene";
import { lookupFailure } from "./lookup-errors";
import { PublicApiError } from "../platform/public-api";
import type {
  ConnectViewState,
  EventPlatform,
  NormalizedWifiError,
  PublicApi,
  PublicConnectConfig,
  PublicEventType,
  WifiConnector,
  WifiConnectStage,
} from "./types";

export interface ConnectControllerOptions {
  readonly api: PublicApi;
  readonly enableAds?: boolean;
  readonly enableAnalytics?: boolean;
  readonly visitorId?: () => string | undefined;
  readonly copyToClipboard?: (password: string) => Promise<void>;
  readonly wifi: WifiConnector;
  readonly platform: EventPlatform;
  readonly adUnitId?: string;
  readonly brandName?: string;
  readonly onChange: (state: ConnectViewState) => void;
}

const INITIAL_STATE: ConnectViewState = {
  phase: "waiting",
  configLoading: true,
  hasConfig: false,
  storeName: "正在读取门店信息",
  brandName: "轻连 WiFi",
  logoUrl: null,
  ssid: "—",
  password: "",
  buttonLabel: "正在读取网络…",
  buttonDisabled: true,
  statusTitle: "正在读取门店信息",
  statusMessage: "请稍候",
  statusTone: "progress",
  initialized: false,
  troubleshootingExpanded: false,
  adEligible: false,
  adCollapsed: true,
  adUnitId: "",
};

function unsupportedState(enabled = false): Partial<ConnectViewState> {
  return {
    phase: "unsupported",
    buttonLabel: "自动连接暂不可用",
    buttonDisabled: true,
    statusTitle: enabled ? "当前微信暂不支持自动连接" : "自动连接尚未启用",
    statusMessage: enabled
      ? "微信没有提供所需的 WiFi 接口，请联系管理员。"
      : "请联系管理员启用自动连接。",
    statusTone: "danger",
    initialized: false,
  };
}

function stageState(stage: WifiConnectStage): Partial<ConnectViewState> {
  if (stage === "initializing_wifi") {
    return {
      phase: "initializing_wifi",
      buttonLabel: "正在连接…",
      buttonDisabled: true,
      statusTitle: "正在初始化 Wi-Fi",
      statusMessage: "请保持小程序在前台",
      statusTone: "progress",
      initialized: false,
      troubleshootingExpanded: false,
    };
  }
  return {
    phase: "connecting",
    buttonLabel: "正在连接…",
    buttonDisabled: true,
    statusTitle: "正在连接，请稍候…",
    statusMessage: "请勿离开当前页面",
    statusTone: "progress",
    initialized: true,
    troubleshootingExpanded: false,
  };
}

function failureState(error: NormalizedWifiError): Partial<ConnectViewState> {
  return {
    phase: error.phase,
    buttonLabel: error.phase === "unsupported" ? "自动连接暂不可用" : "重新连接",
    buttonDisabled: error.phase === "unsupported",
    statusTitle: error.title,
    statusMessage: error.message,
    statusTone: "danger",
    initialized: false,
  };
}

export class ConnectController {
  private state: ConnectViewState;
  private readonly analytics: AnalyticsService;
  private copying = false;
  private sceneToken: string | null = null;
  private connectConfig: PublicConnectConfig | null = null;
  private disposed = false;
  private operationId = 0;
  private adLoadReported = false;
  private adFailureReported = false;

  constructor(private readonly options: ConnectControllerOptions) {
    this.analytics = new AnalyticsService(
      options.api,
      options.enableAnalytics ?? true,
      options.visitorId ?? (() => undefined),
    );
    this.state = {
      ...INITIAL_STATE,
      brandName: options.brandName?.trim() || INITIAL_STATE.brandName,
    };
    this.emit();
  }

  get viewState(): ConnectViewState {
    return this.state;
  }

  async load(rawScene: unknown): Promise<void> {
    const loadId = ++this.operationId;
    this.sceneToken = null;
    this.connectConfig = null;
    this.adLoadReported = false;
    this.adFailureReported = false;
    this.patch({
      ...INITIAL_STATE,
      brandName: this.state.brandName,
    });
    if (rawScene === undefined || rawScene === null || rawScene === "") {
      this.patch({
        phase: "idle",
        configLoading: false,
        storeName: this.state.brandName,
        buttonLabel: "请扫描门店 WiFi 贴",
        statusTitle: "欢迎使用免费 WiFi",
        statusMessage: "使用微信扫一扫，扫描门店张贴的小程序码。",
        statusTone: "neutral",
      });
      return;
    }
    const sceneToken = parseSceneToken(rawScene);
    if (sceneToken === null) {
      this.patch({
        phase: "invalid",
        configLoading: false,
        storeName: this.state.brandName,
        buttonLabel: "二维码无效",
        buttonDisabled: true,
        statusTitle: "无法识别此二维码",
        statusMessage: "请扫描门店最新的小程序码。",
        statusTone: "danger",
      });
      return;
    }

    this.sceneToken = sceneToken;
    try {
      const config = await this.options.api.getConnectConfig(sceneToken);
      if (!this.isCurrent(loadId)) {
        return;
      }

      const credential = await this.options.api.getWifiCredential(sceneToken);
      if (!this.isCurrent(loadId)) return;
      if (credential.wifiId !== config.wifi.id || credential.storeId !== config.store.id)
        throw new PublicApiError("INVALID_CODE");
      this.connectConfig = config;
      const adUnitId = this.options.adUnitId?.trim() || config.ad.unitId?.trim() || "";
      const adEligible = new AdService(this.options.enableAds ?? false).canDisplay(
        "banner",
        config.ad.enabled,
        adUnitId,
      );
      const displayName = config.store.shortName?.trim() || config.store.name;
      const common: Partial<ConnectViewState> = {
        phase: "waiting",
        configLoading: false,
        hasConfig: true,
        storeName: displayName,
        logoUrl: config.store.logoUrl,
        ssid: credential.ssid,
        password: credential.password,
        buttonLabel: "一键连接 Wi-Fi",
        buttonDisabled: false,
        statusTitle: "未连接",
        statusMessage: "点击上方按钮连接门店网络",
        statusTone: "neutral",
        adEligible,
        adCollapsed: !adEligible,
        adUnitId,
      };

      this.patch(
        config.compatibility.legacyWifiApiEnabled && this.options.wifi.isAvailable()
          ? common
          : { ...common, ...unsupportedState(config.compatibility.legacyWifiApiEnabled) },
      );
      this.report("page_view");
      this.report("scan");
    } catch (error) {
      if (!this.isCurrent(loadId)) {
        return;
      }
      this.connectConfig = null;
      this.patch({
        ...lookupFailure(error),
        storeName: this.state.brandName,
        password: "",
        ssid: "—",
      });
    }
  }

  async connect(): Promise<void> {
    if (!this.connectConfig && this.sceneToken && !this.state.buttonDisabled)
      return this.load(this.sceneToken);
    const config = this.connectConfig;
    if (
      this.disposed ||
      config === null ||
      this.sceneToken === null ||
      this.state.phase === "loading" ||
      this.copying ||
      this.state.phase === "success" ||
      this.state.phase === "initializing_wifi" ||
      this.state.phase === "connecting"
    ) {
      return;
    }

    if (!config.compatibility.legacyWifiApiEnabled || !this.options.wifi.isAvailable()) {
      this.patch(unsupportedState(config.compatibility.legacyWifiApiEnabled));
      return;
    }

    const connectId = ++this.operationId;
    this.report("connect_click");
    this.patch({
      phase: "loading",
      buttonDisabled: true,
      buttonLabel: "准备连接…",
      statusTitle: "准备连接",
      statusMessage: "正在获取当前网络",
      statusTone: "progress",
    });
    let result;
    try {
      const credential = await this.options.api.getWifiCredential(this.sceneToken);
      if (!this.isCurrent(connectId)) return;
      if (credential.wifiId !== config.wifi.id || credential.storeId !== config.store.id)
        throw new PublicApiError("INVALID_CODE");
      this.patch({ ssid: credential.ssid, password: credential.password });
      result = await this.options.wifi.connect(credential, (stage) => {
        if (this.isCurrent(connectId)) this.patch(stageState(stage));
      });
    } catch (error) {
      if (error instanceof PublicApiError && this.isCurrent(connectId)) {
        this.connectConfig = null;
        this.patch({ ...lookupFailure(error), password: "", ssid: "—" });
        return;
      }
      result = { ok: false as const, error: getInternalWifiError("unknown") };
    }

    if (!this.isCurrent(connectId)) {
      return;
    }

    if (result.ok) {
      this.patch({
        phase: "success",
        buttonLabel: "已连接 Wi-Fi",
        buttonDisabled: true,
        statusTitle: "连接成功",
        statusMessage: "您现在可以使用门店网络",
        statusTone: "success",
        initialized: true,
        troubleshootingExpanded: false,
      });
      this.report("connect_success");
      return;
    }

    this.patch({ ...failureState(result.error), troubleshootingExpanded: true });
    this.report("connect_failure", String(result.error.code), result.error.message);
  }

  async copyPassword(): Promise<void> {
    if (
      this.disposed ||
      this.copying ||
      !this.sceneToken ||
      !this.connectConfig ||
      ["loading", "initializing_wifi", "connecting"].includes(this.state.phase)
    )
      return;
    const copyId = this.operationId;
    const config = this.connectConfig;
    this.copying = true;
    try {
      const credential = await this.options.api.getWifiCredential(this.sceneToken);
      if (!this.isCurrent(copyId)) return;
      if (credential.wifiId !== config.wifi.id || credential.storeId !== config.store.id)
        throw new PublicApiError("INVALID_CODE");
      if (!this.options.copyToClipboard) throw new Error("Clipboard unavailable");
      await this.options.copyToClipboard(credential.password);
      if (!this.isCurrent(copyId)) return;
      this.patch({
        phase: "manual",
        ssid: credential.ssid,
        statusTitle: "密码已复制",
        statusMessage: `请打开手机系统 Wi-Fi 设置，选择 ${credential.ssid} 并粘贴密码。`,
        statusTone: "neutral",
        troubleshootingExpanded: true,
      });
      this.report("password_copy");
    } catch (error) {
      if (error instanceof PublicApiError && this.isCurrent(copyId)) {
        this.connectConfig = null;
        this.patch({ ...lookupFailure(error), password: "", ssid: "—" });
      } else if (this.isCurrent(copyId))
        this.patch({
          statusTitle: "暂时无法复制密码",
          statusMessage: "请重试，或联系店员获取当前密码。",
          statusTone: "danger",
        });
    } finally {
      this.copying = false;
    }
  }

  retry(): Promise<void> {
    return this.connect();
  }

  toggleTroubleshooting(): void {
    if (this.disposed || !this.state.hasConfig) {
      return;
    }
    this.patch({
      troubleshootingExpanded: !this.state.troubleshootingExpanded,
    });
  }

  handleAdLoad(): void {
    if (this.disposed || !this.state.adEligible) {
      return;
    }
    if (this.state.adCollapsed) {
      this.patch({ adCollapsed: false });
    }
    if (!this.adLoadReported) {
      this.adLoadReported = true;
      this.report("ad_load_success");
    }
  }

  handleAdError(): void {
    if (this.disposed || !this.state.adEligible) {
      return;
    }
    // Keep the native <ad> mounted under a collapsed parent. This follows the
    // official component guidance and allows a later bindload notification.
    if (!this.state.adCollapsed) {
      this.patch({ adCollapsed: true });
    }
    if (!this.adFailureReported) {
      this.adFailureReported = true;
      this.report("ad_load_failure");
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.patch({ password: "", ssid: "—", hasConfig: false });
    this.connectConfig = null;
    this.sceneToken = null;
    this.disposed = true;
    this.operationId += 1;
    this.options.wifi.dispose();
    this.options.api.dispose();
  }

  private isCurrent(operationId: number): boolean {
    return !this.disposed && this.operationId === operationId;
  }

  private patch(update: Partial<ConnectViewState>): void {
    if (this.disposed) {
      return;
    }
    this.state = { ...this.state, ...update };
    this.emit();
  }

  private emit(): void {
    this.options.onChange(this.state);
  }

  private report(eventType: PublicEventType, errorCode?: string, errorMessage?: string): void {
    const sceneToken = this.sceneToken;
    if (sceneToken === null || this.disposed) {
      return;
    }

    const errorFields =
      eventType === "connect_failure"
        ? { errorCode: errorCode ?? null, errorMessage: errorMessage ?? null }
        : {};
    this.analytics.report({
      sceneToken,
      eventType,
      platform: this.options.platform,
      ...errorFields,
    });
  }
}
