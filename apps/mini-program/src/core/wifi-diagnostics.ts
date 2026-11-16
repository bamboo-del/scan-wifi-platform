import type {
  ConnectWifiOptions,
  WechatCallbackResult,
  WechatMiniProgramApi,
  WifiConnectedListener,
  WifiDiagnosticsWxApi,
} from "../platform/wechat-types";

export type WifiDiagnosticStatus =
  "idle" | "running" | "completed" | "failed" | "timeout" | "cancelled";

export interface WifiDiagnosticInput {
  readonly ssid: string;
  readonly password: string;
  readonly bssid?: string;
}

export interface WifiDiagnosticReport {
  readonly status: WifiDiagnosticStatus;
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
  readonly errCode: number | null;
  readonly errMsg: string;
  readonly durationMs: number | null;
  readonly listenerTriggerCount: number;
}

export type WifiDiagnosticUpdate = (report: WifiDiagnosticReport) => void;

type DiagnosticApi = WifiDiagnosticsWxApi &
  Pick<WechatMiniProgramApi, "getSystemInfoSync" | "getAppBaseInfo" | "getDeviceInfo">;

interface ListenerPair {
  readonly onName: "onWifiConnected" | "onWifiConnectedWithPartialInfo";
  readonly offName: "offWifiConnected" | "offWifiConnectedWithPartialInfo";
  readonly partialInfo: boolean;
}

const NOT_EXECUTED = "未执行";
const REDACTED = "[REDACTED]";
const REDACTED_KEY = /(?:password|passwd|passphrase|secret|token|authorization|cookie)/iu;

function sanitizeString(value: string, password: string): string {
  if (password.length === 0) {
    return value;
  }
  return value.split(password).join(REDACTED);
}

function sanitizeValue(
  value: unknown,
  password: string,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (typeof value === "string") {
    return sanitizeString(value, password);
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value ?? null;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "symbol") {
    return value.description ? `[Symbol ${value.description}]` : "[Symbol]";
  }
  if (typeof value === "function") {
    return value.name ? `[Function ${value.name}]` : "[Function]";
  }
  if (depth >= 8) {
    return "[MAX_DEPTH]";
  }
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: sanitizeString(value.name, password),
      message: sanitizeString(value.message, password),
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeValue(item, password, seen, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, 100)) {
    output[key] = REDACTED_KEY.test(key)
      ? REDACTED
      : sanitizeValue(child, password, seen, depth + 1);
  }
  return output;
}

export function formatSanitizedWifiResult(value: unknown, password: string): string {
  const sanitized = sanitizeValue(value, password, new WeakSet<object>(), 0);
  return JSON.stringify(sanitized, null, 2) ?? "null";
}

function readCallbackError(
  value: unknown,
  fallbackMessage: string,
): {
  readonly errCode: number | null;
  readonly errMsg: string;
} {
  if (typeof value !== "object" || value === null) {
    return { errCode: null, errMsg: fallbackMessage };
  }
  const record = value as Readonly<Record<string, unknown>>;
  return {
    errCode: typeof record.errCode === "number" ? record.errCode : null,
    errMsg: typeof record.errMsg === "string" ? record.errMsg : fallbackMessage,
  };
}

function readPlatformInfo(api: DiagnosticApi): {
  readonly sdkVersion: string;
  readonly system: string;
} {
  let sdkVersion = "未知";
  let system = "未知";
  try {
    const app = api.getAppBaseInfo?.();
    if (app?.SDKVersion) {
      sdkVersion = app.SDKVersion;
    }
  } catch {
    // Fall back to the older aggregate system API below.
  }
  try {
    const device = api.getDeviceInfo?.();
    if (device) {
      const deviceSystem = [device.system, device.model].filter(Boolean).join(" · ");
      if (deviceSystem) {
        system = deviceSystem;
      }
    }
  } catch {
    // Fall back to the older aggregate system API below.
  }
  if (sdkVersion === "未知" || system === "未知") {
    try {
      const legacy = api.getSystemInfoSync?.();
      if (legacy) {
        if (sdkVersion === "未知" && legacy.SDKVersion) {
          sdkVersion = legacy.SDKVersion;
        }
        if (system === "未知") {
          const legacySystem = [legacy.system, legacy.model, legacy.platform]
            .filter(Boolean)
            .join(" · ");
          if (legacySystem) {
            system = legacySystem;
          }
        }
      }
    } catch {
      // The diagnostic remains usable even when system introspection fails.
    }
  }
  return { sdkVersion, system };
}

export function createInitialWifiDiagnosticReport(api: DiagnosticApi): WifiDiagnosticReport {
  const platform = readPlatformInfo(api);
  return {
    status: "idle",
    sdkVersion: platform.sdkVersion,
    system: platform.system,
    startWifiAvailable: typeof api.startWifi === "function",
    connectWifiAvailable: typeof api.connectWifi === "function",
    standardListenerAvailable: typeof api.onWifiConnected === "function",
    standardCleanupAvailable: typeof api.offWifiConnected === "function",
    partialListenerAvailable: typeof api.onWifiConnectedWithPartialInfo === "function",
    partialCleanupAvailable: typeof api.offWifiConnectedWithPartialInfo === "function",
    selectedListener: "未选择",
    selectedCleanup: "未选择",
    cleanupStatus: "未注册监听",
    startResult: NOT_EXECUTED,
    connectResult: NOT_EXECUTED,
    lastListenerResult: NOT_EXECUTED,
    errCode: null,
    errMsg: "",
    durationMs: null,
    listenerTriggerCount: 0,
  };
}

function chooseListenerPair(api: DiagnosticApi): ListenerPair | null {
  if (typeof api.onWifiConnected === "function" && typeof api.offWifiConnected === "function") {
    return {
      onName: "onWifiConnected",
      offName: "offWifiConnected",
      partialInfo: false,
    };
  }
  if (
    typeof api.onWifiConnectedWithPartialInfo === "function" &&
    typeof api.offWifiConnectedWithPartialInfo === "function"
  ) {
    return {
      onName: "onWifiConnectedWithPartialInfo",
      offName: "offWifiConnectedWithPartialInfo",
      partialInfo: true,
    };
  }
  return null;
}

export class WifiDiagnosticsSession {
  private report: WifiDiagnosticReport;
  private listener: WifiConnectedListener | null = null;
  private listenerPair: ListenerPair | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private connectStartedAt: number | null = null;
  private connectCallbackSucceeded = false;
  private targetListenerObserved = false;
  private wifiStarted = false;
  private finished = false;
  private disposed = false;
  private password = "";
  private update: WifiDiagnosticUpdate = () => undefined;
  private resolve: ((report: WifiDiagnosticReport) => void) | null = null;

  constructor(
    private readonly api: DiagnosticApi,
    private readonly timeoutMs = 20_000,
  ) {
    this.report = createInitialWifiDiagnosticReport(api);
  }

  run(input: WifiDiagnosticInput, update: WifiDiagnosticUpdate): Promise<WifiDiagnosticReport> {
    if (this.finished || this.resolve) {
      throw new Error("A Wi-Fi diagnostic session can only be run once");
    }
    this.password = input.password;
    this.update = update;
    this.report = { ...this.report, status: "running", errMsg: "正在调用 wx.startWifi" };
    this.emit();

    return new Promise<WifiDiagnosticReport>((resolve) => {
      this.resolve = resolve;
      const ssid = input.ssid.trim();
      if (ssid.length === 0) {
        this.finish("failed", null, "SSID 不能为空");
        return;
      }
      if (typeof this.api.startWifi !== "function") {
        this.finish("failed", null, "wx.startWifi 不存在");
        return;
      }
      if (typeof this.api.connectWifi !== "function") {
        this.finish("failed", null, "wx.connectWifi 不存在");
        return;
      }

      this.timeoutId = setTimeout(() => {
        this.finish("timeout", null, `等待 wx.startWifi 回调超时（${this.timeoutMs}ms）`);
      }, this.timeoutMs);
      let startHandled = false;
      try {
        this.api.startWifi({
          success: (result) => {
            if (startHandled) return;
            startHandled = true;
            this.handleStartSuccess(input, result);
          },
          fail: (error) => {
            if (startHandled || this.finished) return;
            startHandled = true;
            const platformError = readCallbackError(error, "wx.startWifi 调用失败");
            this.report = {
              ...this.report,
              startResult: formatSanitizedWifiResult(error, this.password),
              ...platformError,
            };
            this.finish("failed", platformError.errCode, platformError.errMsg);
          },
        });
      } catch (error) {
        if (startHandled || this.finished) return;
        startHandled = true;
        const platformError = readCallbackError(error, "wx.startWifi 同步抛出异常");
        this.report = {
          ...this.report,
          startResult: formatSanitizedWifiResult(error, this.password),
          ...platformError,
        };
        this.finish("failed", platformError.errCode, platformError.errMsg);
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    if (!this.finished && this.resolve) {
      this.finish("cancelled", null, "页面已卸载，诊断已取消");
      return;
    }
    this.cleanupListener();
    this.stopWifi();
  }

  private handleStartSuccess(input: WifiDiagnosticInput, result: WechatCallbackResult): void {
    this.wifiStarted = true;
    if (this.disposed || this.finished) {
      this.stopWifi();
      return;
    }
    const platformResult = readCallbackError(result, "startWifi:ok");
    this.report = {
      ...this.report,
      startResult: formatSanitizedWifiResult(result, this.password),
      ...platformResult,
      errMsg: "wx.startWifi 成功，正在注册连接监听",
    };
    this.attachListener(input.ssid.trim());
    this.callConnectWifi(input);
  }

  private attachListener(ssid: string): void {
    const pair = chooseListenerPair(this.api);
    if (!pair) {
      this.report = {
        ...this.report,
        selectedListener: "无",
        selectedCleanup: "无",
        cleanupStatus: "没有可成对清理的监听 API，未注册监听",
      };
      this.emit();
      return;
    }

    const listener: WifiConnectedListener = (result) => {
      if (this.finished || this.disposed) return;
      const count = this.report.listenerTriggerCount + 1;
      this.report = {
        ...this.report,
        listenerTriggerCount: count,
        lastListenerResult: formatSanitizedWifiResult(result, this.password),
        errCode: null,
        errMsg: `${pair.onName} 已触发 ${count} 次`,
      };
      this.emit();
      if (result.wifi?.SSID === ssid) {
        this.targetListenerObserved = true;
        if (this.connectCallbackSucceeded) {
          this.finish("completed", this.report.errCode, `${pair.onName}:ok`);
        }
      }
    };
    this.listener = listener;
    this.listenerPair = pair;
    this.report = {
      ...this.report,
      selectedListener: pair.onName,
      selectedCleanup: pair.offName,
      cleanupStatus: "监听已注册，结束或离页时清理",
    };

    try {
      this.api[pair.onName]?.(listener);
    } catch (error) {
      this.listener = null;
      this.listenerPair = null;
      this.report = {
        ...this.report,
        selectedListener: pair.onName,
        selectedCleanup: pair.offName,
        cleanupStatus: `监听注册失败：${formatSanitizedWifiResult(error, this.password)}`,
      };
    }
    this.emit();
  }

  private callConnectWifi(input: WifiDiagnosticInput): void {
    if (this.finished || this.disposed || typeof this.api.connectWifi !== "function") return;
    if (this.timeoutId !== null) clearTimeout(this.timeoutId);
    this.connectStartedAt = Date.now();
    this.report = { ...this.report, errCode: null, errMsg: "正在调用 wx.connectWifi" };
    this.emit();

    const options: ConnectWifiOptions = {
      SSID: input.ssid.trim(),
      password: input.password,
      maunal: false,
      success: (result) => {
        if (this.finished || this.disposed) return;
        this.connectCallbackSucceeded = true;
        const platformResult = readCallbackError(result, "connectWifi:ok");
        this.report = {
          ...this.report,
          connectResult: formatSanitizedWifiResult(result, this.password),
          ...platformResult,
          durationMs: this.elapsedMs(),
        };
        this.emit();
        if (!this.listener) {
          this.finish("completed", platformResult.errCode, platformResult.errMsg);
        } else if (this.targetListenerObserved && this.listenerPair) {
          this.finish("completed", platformResult.errCode, `${this.listenerPair.onName}:ok`);
        }
      },
      fail: (error) => {
        if (this.finished || this.disposed) return;
        const platformError = readCallbackError(error, "wx.connectWifi 调用失败");
        this.report = {
          ...this.report,
          connectResult: formatSanitizedWifiResult(error, this.password),
          ...platformError,
          durationMs: this.elapsedMs(),
        };
        this.finish("failed", platformError.errCode, platformError.errMsg);
      },
    };
    const bssid = input.bssid?.trim();
    if (bssid) {
      (options as { BSSID?: string }).BSSID = bssid;
    }
    if (this.listenerPair?.partialInfo) {
      (options as { partialInfo?: boolean }).partialInfo = true;
    }

    this.timeoutId = setTimeout(() => {
      this.finish("timeout", null, `等待目标 SSID 的连接监听超时（${this.timeoutMs}ms）`);
    }, this.timeoutMs);

    try {
      this.api.connectWifi(options);
    } catch (error) {
      if (this.finished || this.disposed) return;
      const platformError = readCallbackError(error, "wx.connectWifi 同步抛出异常");
      this.report = {
        ...this.report,
        connectResult: formatSanitizedWifiResult(error, this.password),
        ...platformError,
        durationMs: this.elapsedMs(),
      };
      this.finish("failed", platformError.errCode, platformError.errMsg);
    }
  }

  private finish(status: WifiDiagnosticStatus, errCode: number | null, errMsg: string): void {
    if (this.finished) return;
    this.finished = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.cleanupListener();
    this.stopWifi();
    this.report = {
      ...this.report,
      status,
      errCode,
      errMsg: sanitizeString(errMsg, this.password),
      durationMs: this.connectStartedAt === null ? this.report.durationMs : this.elapsedMs(),
    };
    this.emit();
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.(this.report);
    this.password = "";
  }

  private cleanupListener(): void {
    if (!this.listener || !this.listenerPair) return;
    const listener = this.listener;
    const pair = this.listenerPair;
    this.listener = null;
    this.listenerPair = null;
    try {
      this.api[pair.offName]?.(listener);
      this.report = {
        ...this.report,
        cleanupStatus: `已通过 ${pair.offName} 清理同一监听函数`,
      };
    } catch (error) {
      this.report = {
        ...this.report,
        cleanupStatus: `监听清理失败：${formatSanitizedWifiResult(error, this.password)}`,
      };
    }
  }

  private stopWifi(): void {
    if (!this.wifiStarted || typeof this.api.stopWifi !== "function") return;
    this.wifiStarted = false;
    try {
      this.api.stopWifi({});
    } catch {
      // stopWifi is best-effort; listener cleanup is tracked separately above.
    }
  }

  private elapsedMs(): number {
    return this.connectStartedAt === null ? 0 : Math.max(0, Date.now() - this.connectStartedAt);
  }

  private emit(): void {
    this.update({ ...this.report, errMsg: sanitizeString(this.report.errMsg, this.password) });
  }
}
