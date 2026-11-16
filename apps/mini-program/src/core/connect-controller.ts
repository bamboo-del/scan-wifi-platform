import { parseSceneToken } from "./scene";
import { normalizeWifiError } from "./wifi-errors";
import type {
  ConnectViewState,
  EventPlatform,
  NormalizedWifiError,
  PublicApi,
  PublicConnectConfig,
  PublicEventType,
  WifiConnector,
  WifiConnectStage,
  WifiConnectResult,
  WifiConnectionSettings,
} from "./types";

export interface ConnectControllerOptions {
  readonly api: PublicApi;
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
};

function unsupportedState(): Partial<ConnectViewState> {
  return {
    phase: "unsupported",
    buttonLabel: "自动连接暂不可用",
    buttonDisabled: true,
    statusTitle: "自动连接暂未开放",
    statusMessage: "该能力需完成当前小程序真机验证后由平台开启。",
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
  private sceneToken: string | null = null;
  private connectConfig: PublicConnectConfig | null = null;
  private disposed = false;
  private operationId = 0;
  private adLoadReported = false;
  private adFailureReported = false;

  constructor(private readonly options: ConnectControllerOptions) {
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
    if (this.disposed) return;
    const loadId = ++this.operationId;
    this.sceneToken = null;
    this.connectConfig = null;
    this.adLoadReported = false;
    this.adFailureReported = false;
    this.patch({
      ...INITIAL_STATE,
      brandName: this.state.brandName,
    });
    const sceneToken = parseSceneToken(rawScene);
    if (sceneToken === null) {
      this.patch({
        phase: "failed",
        configLoading: false,
        buttonLabel: "二维码无效",
        buttonDisabled: true,
        statusTitle: "无法识别此二维码",
        statusMessage: "请扫描用户最新的小程序码。",
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

      this.connectConfig = config;
      const adUnitId = this.options.adUnitId?.trim() || config.ad.unitId?.trim() || "";
      const adEligible = config.ad.enabled && adUnitId.length > 0;
      const displayName = config.store.shortName?.trim() || config.store.name;
      const common: Partial<ConnectViewState> = {
        phase: "waiting",
        configLoading: false,
        hasConfig: true,
        storeName: displayName,
        logoUrl: config.store.logoUrl,
        ssid: config.wifi.ssid,
        buttonLabel: "一键连接 Wi-Fi",
        buttonDisabled: false,
        statusTitle: "未连接",
        statusMessage: "点击上方按钮连接用户网络",
        statusTone: "neutral",
        adEligible,
        adCollapsed: !adEligible,
        adUnitId,
      };

      this.patch(
        config.compatibility.legacyWifiApiEnabled && this.options.wifi.isAvailable()
          ? common
          : { ...common, ...unsupportedState() },
      );
      this.report("page_view");
    } catch {
      if (!this.isCurrent(loadId)) {
        return;
      }
      this.patch({
        phase: "failed",
        configLoading: false,
        hasConfig: false,
        buttonLabel: "暂时无法连接",
        buttonDisabled: true,
        statusTitle: "用户网络暂不可用",
        statusMessage: "请稍后重新扫码，或联系管理员。",
        statusTone: "danger",
      });
    }
  }

  async connect(): Promise<void> {
    const config = this.connectConfig;
    if (this.disposed || config === null || this.sceneToken === null || this.state.buttonDisabled) {
      return;
    }

    if (!config.compatibility.legacyWifiApiEnabled || !this.options.wifi.isAvailable()) {
      this.patch(unsupportedState());
      return;
    }

    const connectId = ++this.operationId;
    const sceneToken = this.sceneToken;
    this.patch({
      ...stageState("initializing_wifi"),
      statusTitle: "正在获取连接信息",
    });
    this.report("connect_click");
    let credential: WifiConnectionSettings;
    try {
      credential = await this.options.api.getCredential(sceneToken);
    } catch {
      if (!this.isCurrent(connectId)) return;
      const message = "请重新扫码或联系管理员确认用户网络。";
      this.patch({
        phase: "failed",
        buttonDisabled: false,
        buttonLabel: "重新连接",
        statusTitle: "暂时无法获取连接信息",
        statusMessage: message,
        statusTone: "danger",
      });
      this.report("connect_failure", "credential_unavailable", message);
      return;
    }
    if (!this.isCurrent(connectId)) return;
    this.patch({ ssid: credential.ssid });
    let result: WifiConnectResult;
    try {
      result = await this.options.wifi.connect(credential, (stage) => {
        if (this.isCurrent(connectId)) this.patch(stageState(stage));
      });
    } catch (error) {
      result = { ok: false, error: normalizeWifiError(error) };
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
        statusMessage: "您现在可以使用此网络",
        statusTone: "success",
        initialized: true,
        troubleshootingExpanded: false,
      });
      this.report("connect_success");
      return;
    }

    this.patch(failureState(result.error));
    this.report("connect_failure", String(result.error.code), result.error.message);
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
    this.disposed = true;
    this.operationId += 1;
    this.sceneToken = null;
    this.connectConfig = null;
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
    void this.options.api
      .reportEvent({
        sceneToken,
        eventType,
        platform: this.options.platform,
        ...errorFields,
      })
      .catch(() => {
        // Anonymous telemetry is intentionally isolated from the Wi-Fi flow.
      });
  }
}
