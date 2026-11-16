import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createInitialWifiDiagnosticReport,
  formatSanitizedWifiResult,
  WifiDiagnosticsSession,
  type WifiDiagnosticReport,
} from "../src/core/wifi-diagnostics";
import type {
  ConnectWifiOptions,
  WechatAppBaseInfo,
  WechatDeviceInfo,
  WechatSystemInfo,
  WifiConnectedListener,
  WifiOperationOptions,
} from "../src/platform/wechat-types";

interface DiagnosticApiMock {
  getSystemInfoSync: ReturnType<typeof vi.fn<() => WechatSystemInfo>>;
  getAppBaseInfo?: ReturnType<typeof vi.fn<() => WechatAppBaseInfo>>;
  getDeviceInfo?: ReturnType<typeof vi.fn<() => WechatDeviceInfo>>;
  startWifi?: ReturnType<typeof vi.fn<(options: WifiOperationOptions) => void>>;
  connectWifi?: ReturnType<typeof vi.fn<(options: ConnectWifiOptions) => void>>;
  onWifiConnected?: ReturnType<typeof vi.fn<(listener: WifiConnectedListener) => void>>;
  offWifiConnected?: ReturnType<typeof vi.fn<(listener?: WifiConnectedListener) => void>>;
  onWifiConnectedWithPartialInfo?: ReturnType<
    typeof vi.fn<(listener: WifiConnectedListener) => void>
  >;
  offWifiConnectedWithPartialInfo?: ReturnType<
    typeof vi.fn<(listener?: WifiConnectedListener) => void>
  >;
  stopWifi?: ReturnType<typeof vi.fn<(options: WifiOperationOptions) => void>>;
}

function makeApi(): DiagnosticApiMock {
  return {
    getSystemInfoSync: vi.fn(() => ({ SDKVersion: "2.33.0", system: "iOS 18.0" })),
    getAppBaseInfo: vi.fn(() => ({ SDKVersion: "3.7.8" })),
    getDeviceInfo: vi.fn(() => ({ system: "Android 15", model: "Test Phone" })),
    startWifi: vi.fn((options) => options.success?.({ errMsg: "startWifi:ok" })),
    connectWifi: vi.fn(),
    onWifiConnected: vi.fn(),
    offWifiConnected: vi.fn(),
    onWifiConnectedWithPartialInfo: vi.fn(),
    offWifiConnectedWithPartialInfo: vi.fn(),
    stopWifi: vi.fn(),
  };
}

function reportText(report: WifiDiagnosticReport): string {
  return JSON.stringify(report);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Wi-Fi diagnostics", () => {
  it("reports current platform and method availability", () => {
    const api = makeApi();
    const report = createInitialWifiDiagnosticReport(api);
    expect(report.sdkVersion).toBe("3.7.8");
    expect(report.system).toBe("Android 15 · Test Phone");
    expect(report.startWifiAvailable).toBe(true);
    expect(report.connectWifiAvailable).toBe(true);
    expect(report.standardListenerAvailable).toBe(true);
    expect(report.partialCleanupAvailable).toBe(true);
    expect(api.getSystemInfoSync).not.toHaveBeenCalled();
  });

  it("uses the aggregate system API only as a compatibility fallback", () => {
    const api = makeApi();
    delete api.getAppBaseInfo;
    delete api.getDeviceInfo;

    const report = createInitialWifiDiagnosticReport(api);

    expect(report.sdkVersion).toBe("2.33.0");
    expect(report.system).toBe("iOS 18.0");
    expect(api.getSystemInfoSync).toHaveBeenCalledTimes(1);
  });

  it("recursively removes passwords and secret-shaped fields from rendered results", () => {
    const password = "never-show-this";
    const result: Record<string, unknown> = {
      errMsg: `connectWifi:fail password=${password}`,
      password,
      nested: { authorization: password, message: `bad ${password}` },
    };
    result.self = result;

    const rendered = formatSanitizedWifiResult(result, password);
    expect(rendered).not.toContain(password);
    expect(rendered).toContain("[REDACTED]");
    expect(rendered).toContain("[CIRCULAR]");
  });

  it("runs start, connect and the standard listener in order, then removes the same listener", async () => {
    const api = makeApi();
    let listener: WifiConnectedListener | undefined;
    const order: string[] = [];
    api.startWifi = vi.fn((options) => {
      order.push("startWifi");
      options.success?.({ errMsg: "startWifi:ok", password: "top-secret" } as never);
    });
    api.onWifiConnected = vi.fn((value) => {
      order.push("onWifiConnected");
      listener = value;
    });
    api.connectWifi = vi.fn((options) => {
      order.push("connectWifi");
      options.success?.({
        errMsg: "connectWifi:ok top-secret",
        echoedPassword: "top-secret",
      } as never);
      listener?.({
        wifi: {
          SSID: "Shop Wi-Fi",
          BSSID: "AA:BB:CC:DD:EE:FF",
          secure: true,
          signalStrength: 80,
        },
      });
    });

    const updates: WifiDiagnosticReport[] = [];
    const report = await new WifiDiagnosticsSession(api).run(
      { ssid: "Shop Wi-Fi", password: "top-secret" },
      (value) => updates.push(value),
    );

    expect(order).toEqual(["startWifi", "onWifiConnected", "connectWifi"]);
    expect(report.status).toBe("completed");
    expect(report.listenerTriggerCount).toBe(1);
    expect(report.selectedListener).toBe("onWifiConnected");
    expect(api.offWifiConnected).toHaveBeenCalledWith(listener);
    expect(api.stopWifi).toHaveBeenCalledTimes(1);
    expect(api.connectWifi).toHaveBeenCalledWith(
      expect.objectContaining({ SSID: "Shop Wi-Fi", password: "top-secret", maunal: false }),
    );
    expect(reportText(report)).not.toContain("top-secret");
    expect(JSON.stringify(updates)).not.toContain("top-secret");
  });

  it("falls back to the partial-info listener only when its cleanup method is paired", async () => {
    const api = makeApi();
    delete api.onWifiConnected;
    delete api.offWifiConnected;
    let listener: WifiConnectedListener | undefined;
    api.onWifiConnectedWithPartialInfo = vi.fn((value) => {
      listener = value;
    });
    api.connectWifi = vi.fn((options) => {
      expect(options.partialInfo).toBe(true);
      options.success?.({ errMsg: "connectWifi:ok" });
      listener?.({
        wifi: { SSID: "Cafe", BSSID: "", secure: true, signalStrength: 0 },
      });
    });

    const report = await new WifiDiagnosticsSession(api).run(
      { ssid: "Cafe", password: "password" },
      () => undefined,
    );

    expect(report.selectedListener).toBe("onWifiConnectedWithPartialInfo");
    expect(api.offWifiConnectedWithPartialInfo).toHaveBeenCalledWith(listener);
  });

  it("keeps the complete connect result when the listener fires before the success callback", async () => {
    const api = makeApi();
    let listener: WifiConnectedListener | undefined;
    api.onWifiConnected = vi.fn((value) => {
      listener = value;
    });
    api.connectWifi = vi.fn((options) => {
      listener?.({
        wifi: { SSID: "Cafe", BSSID: "", secure: true, signalStrength: 0 },
      });
      options.success?.({ errCode: 0, errMsg: "connectWifi:ok" });
    });

    const report = await new WifiDiagnosticsSession(api).run(
      { ssid: "Cafe", password: "password" },
      () => undefined,
    );

    expect(report.status).toBe("completed");
    expect(report.errCode).toBe(0);
    expect(report.connectResult).toContain("connectWifi:ok");
    expect(report.listenerTriggerCount).toBe(1);
  });

  it("does not register a listener that cannot be removed", async () => {
    const api = makeApi();
    delete api.offWifiConnected;
    delete api.offWifiConnectedWithPartialInfo;
    api.connectWifi = vi.fn((options) => options.success?.({ errMsg: "connectWifi:ok" }));

    const report = await new WifiDiagnosticsSession(api).run(
      { ssid: "Cafe", password: "password" },
      () => undefined,
    );

    expect(report.status).toBe("completed");
    expect(report.selectedListener).toBe("无");
    expect(report.cleanupStatus).toContain("未注册监听");
    expect(api.onWifiConnected).not.toHaveBeenCalled();
    expect(api.onWifiConnectedWithPartialInfo).not.toHaveBeenCalled();
  });

  it("cleans the listener and resolves cancellation when the page unloads", async () => {
    const api = makeApi();
    api.connectWifi = vi.fn((options) => options.success?.({ errMsg: "connectWifi:ok" }));
    const session = new WifiDiagnosticsSession(api);
    const pending = session.run({ ssid: "Cafe", password: "password" }, () => undefined);
    const listener = api.onWifiConnected?.mock.calls[0]?.[0];

    session.dispose();
    const report = await pending;

    expect(report.status).toBe("cancelled");
    expect(api.offWifiConnected).toHaveBeenCalledWith(listener);
    expect(api.stopWifi).toHaveBeenCalledTimes(1);
  });

  it("stops a delayed startWifi success after unload and never attempts a connection", async () => {
    const api = makeApi();
    let startOptions: WifiOperationOptions | undefined;
    api.startWifi = vi.fn((options) => {
      startOptions = options;
    });
    const session = new WifiDiagnosticsSession(api);
    const pending = session.run({ ssid: "Cafe", password: "password" }, () => undefined);

    session.dispose();
    await pending;
    startOptions?.success?.({ errMsg: "startWifi:ok" });

    expect(api.stopWifi).toHaveBeenCalledTimes(1);
    expect(api.connectWifi).not.toHaveBeenCalled();
  });

  it("times out while waiting for the selected connection listener", async () => {
    vi.useFakeTimers();
    const api = makeApi();
    api.connectWifi = vi.fn((options) => options.success?.({ errMsg: "connectWifi:ok" }));
    const session = new WifiDiagnosticsSession(api, 1000);
    const pending = session.run({ ssid: "Cafe", password: "password" }, () => undefined);

    await vi.advanceTimersByTimeAsync(1000);
    const report = await pending;

    expect(report.status).toBe("timeout");
    expect(report.durationMs).toBe(1000);
    expect(api.offWifiConnected).toHaveBeenCalledTimes(1);
  });

  it("times out a silent startWifi and cleans up a delayed successful start", async () => {
    vi.useFakeTimers();
    const api = makeApi();
    let startOptions: WifiOperationOptions | undefined;
    api.startWifi = vi.fn((options) => {
      startOptions = options;
    });
    const pending = new WifiDiagnosticsSession(api, 1000).run(
      { ssid: "Cafe", password: "password" },
      () => undefined,
    );

    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toMatchObject({ status: "timeout" });
    startOptions?.success?.({ errMsg: "startWifi:ok" });
    expect(api.connectWifi).not.toHaveBeenCalled();
    expect(api.stopWifi).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the full sanitized callback error code and message", async () => {
    const api = makeApi();
    api.connectWifi = vi.fn((options) =>
      options.fail?.({ errCode: 12002, errMsg: "connectWifi:fail password=wrong-pass" }),
    );

    const report = await new WifiDiagnosticsSession(api).run(
      { ssid: "Cafe", password: "wrong-pass" },
      () => undefined,
    );

    expect(report.status).toBe("failed");
    expect(report.errCode).toBe(12002);
    expect(report.errMsg).not.toContain("wrong-pass");
    expect(report.connectResult).not.toContain("wrong-pass");
  });
});
