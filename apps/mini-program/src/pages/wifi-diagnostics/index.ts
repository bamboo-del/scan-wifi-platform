import {
  createInitialWifiDiagnosticReport,
  WifiDiagnosticsSession,
  type WifiDiagnosticReport,
} from "../../core/wifi-diagnostics";
import {
  getWifiDiagnosticsEnvironment,
  isWifiDiagnosticsEnvironment,
} from "../../core/wifi-diagnostics-environment";

interface InputEvent {
  readonly detail: {
    readonly value: string;
  };
}

interface WifiDiagnosticsPageData {
  readonly environment: string;
  readonly ssid: string;
  readonly password: string;
  readonly bssid: string;
  readonly running: boolean;
  readonly status: string;
  readonly sdkVersion: string;
  readonly system: string;
  readonly startWifiAvailable: boolean;
  readonly connectWifiAvailable: boolean;
  readonly standardListenerAvailable: boolean;
  readonly standardCleanupAvailable: boolean;
  readonly partialListenerAvailable: boolean;
  readonly partialCleanupAvailable: boolean;
  readonly selectedListener: string;
  readonly selectedCleanup: string;
  readonly cleanupStatus: string;
  readonly startResult: string;
  readonly connectResult: string;
  readonly lastListenerResult: string;
  readonly errCodeText: string;
  readonly errMsg: string;
  readonly durationText: string;
  readonly listenerTriggerCount: number;
}

interface WifiDiagnosticsPageMembers {
  session: WifiDiagnosticsSession | null;
  mounted: boolean;
  onLoad(): void;
  onUnload(): void;
  onSsidInput(event: InputEvent): void;
  onPasswordInput(event: InputEvent): void;
  onBssidInput(event: InputEvent): void;
  onRunTap(): void;
}

function statusLabel(status: WifiDiagnosticReport["status"]): string {
  const labels: Readonly<Record<WifiDiagnosticReport["status"], string>> = {
    idle: "等待开始",
    running: "诊断中",
    completed: "诊断完成",
    failed: "调用失败",
    timeout: "等待监听超时",
    cancelled: "已取消",
  };
  return labels[status];
}

function toPagePatch(report: WifiDiagnosticReport): Partial<WifiDiagnosticsPageData> {
  return {
    running: report.status === "running",
    status: statusLabel(report.status),
    sdkVersion: report.sdkVersion,
    system: report.system,
    startWifiAvailable: report.startWifiAvailable,
    connectWifiAvailable: report.connectWifiAvailable,
    standardListenerAvailable: report.standardListenerAvailable,
    standardCleanupAvailable: report.standardCleanupAvailable,
    partialListenerAvailable: report.partialListenerAvailable,
    partialCleanupAvailable: report.partialCleanupAvailable,
    selectedListener: report.selectedListener,
    selectedCleanup: report.selectedCleanup,
    cleanupStatus: report.cleanupStatus,
    startResult: report.startResult,
    connectResult: report.connectResult,
    lastListenerResult: report.lastListenerResult,
    errCodeText: report.errCode === null ? "—" : String(report.errCode),
    errMsg: report.errMsg || "—",
    durationText: report.durationMs === null ? "—" : `${report.durationMs} ms`,
    listenerTriggerCount: report.listenerTriggerCount,
  };
}

const initialReport = createInitialWifiDiagnosticReport(wx);

Page<WifiDiagnosticsPageData, WifiDiagnosticsPageMembers>({
  data: {
    environment: "unknown",
    ssid: "",
    password: "",
    bssid: "",
    running: false,
    status: "等待环境检查",
    sdkVersion: initialReport.sdkVersion,
    system: initialReport.system,
    startWifiAvailable: initialReport.startWifiAvailable,
    connectWifiAvailable: initialReport.connectWifiAvailable,
    standardListenerAvailable: initialReport.standardListenerAvailable,
    standardCleanupAvailable: initialReport.standardCleanupAvailable,
    partialListenerAvailable: initialReport.partialListenerAvailable,
    partialCleanupAvailable: initialReport.partialCleanupAvailable,
    selectedListener: initialReport.selectedListener,
    selectedCleanup: initialReport.selectedCleanup,
    cleanupStatus: initialReport.cleanupStatus,
    startResult: initialReport.startResult,
    connectResult: initialReport.connectResult,
    lastListenerResult: initialReport.lastListenerResult,
    errCodeText: "—",
    errMsg: "—",
    durationText: "—",
    listenerTriggerCount: 0,
  },
  session: null,
  mounted: false,

  onLoad() {
    this.mounted = true;
    const environment = getWifiDiagnosticsEnvironment(wx);
    if (!isWifiDiagnosticsEnvironment(wx)) {
      this.mounted = false;
      wx.reLaunch({ url: "/pages/connect/index" });
      return;
    }
    this.setData({ environment, ...toPagePatch(createInitialWifiDiagnosticReport(wx)) });
  },

  onUnload() {
    this.mounted = false;
    this.session?.dispose();
    this.session = null;
  },

  onSsidInput(event) {
    this.setData({ ssid: event.detail.value });
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value });
  },

  onBssidInput(event) {
    this.setData({ bssid: event.detail.value });
  },

  onRunTap() {
    if (this.data.running || !isWifiDiagnosticsEnvironment(wx)) {
      return;
    }
    this.session?.dispose();
    const session = new WifiDiagnosticsSession(wx);
    this.session = session;
    const bssid = this.data.bssid.trim();
    void session.run(
      {
        ssid: this.data.ssid,
        password: this.data.password,
        ...(bssid ? { bssid } : {}),
      },
      (report) => {
        if (this.mounted && this.session === session) {
          this.setData(toPagePatch(report));
        }
      },
    );
  },
});
