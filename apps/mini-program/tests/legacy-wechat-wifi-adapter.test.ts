import { afterEach, describe, expect, it, vi } from "vitest";
import { LegacyWeChatWifiAdapter } from "../src/core/legacy-wechat-wifi-adapter";
import type {
  ConnectWifiOptions,
  LegacyWifiWxApi,
  WifiConnectedListener,
  WifiOperationOptions,
} from "../src/platform/wechat-types";

const SETTINGS = {
  ssid: "NanshanCoffee-FreeWiFi",
  password: "not-rendered",
  bssid: null,
} as const;

const CONNECTED_WIFI = {
  wifi: {
    SSID: SETTINGS.ssid,
    BSSID: "00:11:22:33:44:55",
    secure: true,
    signalStrength: 80,
  },
} as const;

function createMockApi(
  start: (options: WifiOperationOptions) => void,
  connect: (options: ConnectWifiOptions) => void,
) {
  return {
    getConnectedWifi: vi.fn<NonNullable<LegacyWifiWxApi["getConnectedWifi"]>>((options) =>
      options.fail({ errMsg: "not connected" }),
    ),
    startWifi: vi.fn(start),
    connectWifi: vi.fn(connect),
    onWifiConnected: vi.fn<(listener: WifiConnectedListener) => void>(),
    offWifiConnected: vi.fn<(listener?: WifiConnectedListener) => void>(),
    stopWifi: vi.fn<(options: WifiOperationOptions) => void>(),
  } satisfies LegacyWifiWxApi;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("LegacyWeChatWifiAdapter", () => {
  it("verifies a delayed connection even when no connected event arrives", async () => {
    vi.useFakeTimers();
    const api = createMockApi(
      (options) => options.success?.({ errMsg: "ok" }),
      (options) => options.success?.({ errMsg: "ok" }),
    );
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 2000,
      manualSystemConnection: false,
    });
    const result = adapter.connect(SETTINGS, vi.fn());
    api.getConnectedWifi.mockImplementation((options) => options.success(CONNECTED_WIFI));
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
    adapter.dispose();
  });
  it("requires a readable current SSID before offering automatic connection", () => {
    const api = createMockApi(
      () => undefined,
      () => undefined,
    );
    const unverifiable: LegacyWifiWxApi = { ...api };
    delete unverifiable.getConnectedWifi;
    const adapter = new LegacyWeChatWifiAdapter(unverifiable, {
      enabled: true,
      timeoutMs: 100,
      manualSystemConnection: false,
    });
    expect(adapter.isAvailable()).toBe(false);
  });
  it("sanitizes connectWifi exceptions delivered from an asynchronous precheck", async () => {
    const api = createMockApi(
      (options) => options.success?.({ errMsg: "ok" }),
      () => {
        throw new Error("platform raw error");
      },
    );
    api.getConnectedWifi.mockImplementation((options) => {
      queueMicrotask(() => options.fail({ errMsg: "not connected" }));
    });
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 100,
      manualSystemConnection: false,
    });
    await expect(adapter.connect(SETTINGS, vi.fn())).resolves.toMatchObject({
      ok: false,
      error: { code: "unknown" },
    });
    adapter.dispose();
  });
  it("confirms an already connected target without calling connectWifi", async () => {
    const api = createMockApi(
      (options) => options.success?.({ errMsg: "ok" }),
      () => undefined,
    );
    api.getConnectedWifi.mockImplementation((options) => options.success(CONNECTED_WIFI));
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 100,
      manualSystemConnection: false,
    });
    await expect(adapter.connect(SETTINGS, vi.fn())).resolves.toEqual({ ok: true });
    expect(api.connectWifi).not.toHaveBeenCalled();
    adapter.dispose();
  });
  it("rejects both accepted callback and matching event when the verified SSID differs", async () => {
    vi.useFakeTimers();
    const api = createMockApi(
      (options) => options.success?.({ errMsg: "ok" }),
      (options) => options.success?.({ errMsg: "ok" }),
    );
    api.getConnectedWifi.mockImplementation((options) =>
      options.success({ wifi: { ...CONNECTED_WIFI.wifi, SSID: "Other" } }),
    );
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 100,
      manualSystemConnection: false,
    });
    const result = adapter.connect(SETTINGS, vi.fn());
    api.onWifiConnected.mock.calls[0]?.[0](CONNECTED_WIFI);
    await vi.advanceTimersByTimeAsync(101);
    await expect(result).resolves.toMatchObject({ ok: false });
    adapter.dispose();
  });
  it("times out a silent startWifi call and cleans up a late start success", async () => {
    vi.useFakeTimers();
    const api = createMockApi(
      () => undefined,
      () => undefined,
    );
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 100,
      manualSystemConnection: false,
    });
    const result = adapter.connect(SETTINGS, vi.fn());
    await vi.advanceTimersByTimeAsync(101);
    await expect(result).resolves.toMatchObject({ ok: false, error: { code: "client_timeout" } });
    api.startWifi.mock.calls[0]?.[0].success?.({ errMsg: "startWifi:ok" });
    expect(api.connectWifi).not.toHaveBeenCalled();
    expect(api.stopWifi).toHaveBeenCalledOnce();
  });
  it("keeps the delisted family disabled unless explicitly enabled", async () => {
    const api = createMockApi(
      () => undefined,
      () => undefined,
    );
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: false,
      timeoutMs: 20_000,
      manualSystemConnection: false,
    });

    expect(adapter.isAvailable()).toBe(false);
    await expect(adapter.connect(SETTINGS, vi.fn())).resolves.toMatchObject({
      ok: false,
      error: { code: "adapter_disabled", phase: "unsupported" },
    });
    expect(api.startWifi).not.toHaveBeenCalled();
  });

  it("normalizes startWifi failure", async () => {
    const api = createMockApi(
      (options) => options.fail?.({ errMsg: "startWifi:fail", errCode: 12005 }),
      () => undefined,
    );
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 20_000,
      manualSystemConnection: false,
    });
    const stages: string[] = [];

    const result = await adapter.connect(SETTINGS, (stage) => stages.push(stage));

    expect(result).toMatchObject({
      ok: false,
      error: { code: 12005, phase: "wifi_disabled" },
    });
    expect(stages).toEqual(["initializing_wifi"]);
    expect(api.connectWifi).not.toHaveBeenCalled();
  });

  it("waits for a matching Wi-Fi event after connectWifi accepts the request", async () => {
    let listener: WifiConnectedListener | null = null;
    const api = createMockApi(
      (options) => options.success?.({ errMsg: "startWifi:ok" }),
      (options) => options.success?.({ errMsg: "connectWifi:ok" }),
    );
    api.onWifiConnected.mockImplementation((value) => {
      listener = value;
    });
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 20_000,
      manualSystemConnection: false,
    });
    const stages: string[] = [];

    const pending = adapter.connect(SETTINGS, (stage) => stages.push(stage));
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(stages).toEqual(["initializing_wifi", "connecting"]);
    expect(api.connectWifi).toHaveBeenCalledWith(
      expect.objectContaining({
        SSID: SETTINGS.ssid,
        password: SETTINGS.password,
        maunal: false,
      }),
    );
    expect(api.connectWifi.mock.calls[0]?.[0]).not.toHaveProperty("BSSID");

    const connectedListener = listener as unknown as WifiConnectedListener;
    api.getConnectedWifi.mockImplementation((options) => options.success(CONNECTED_WIFI));
    connectedListener(CONNECTED_WIFI);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(api.offWifiConnected).toHaveBeenCalledWith(connectedListener);
  });

  it("does not treat opening the manual system path as a successful connection", async () => {
    let listener: WifiConnectedListener | null = null;
    const api = createMockApi(
      (options) => options.success?.({ errMsg: "startWifi:ok" }),
      (options) => options.success?.({ errMsg: "connectWifi:ok" }),
    );
    api.onWifiConnected.mockImplementation((value) => {
      listener = value;
    });
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 20_000,
      manualSystemConnection: true,
    });

    const pending = adapter.connect(SETTINGS, vi.fn());
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(api.connectWifi).toHaveBeenCalledWith(expect.objectContaining({ maunal: true }));
    const connectedListener = listener as unknown as WifiConnectedListener;
    api.getConnectedWifi.mockImplementation((options) => options.success(CONNECTED_WIFI));
    connectedListener(CONNECTED_WIFI);
    await expect(pending).resolves.toEqual({ ok: true });
  });

  it("normalizes connectWifi failure", async () => {
    const api = createMockApi(
      (options) => options.success?.({ errMsg: "startWifi:ok" }),
      (options) => options.fail?.({ errMsg: "connectWifi:fail", errCode: 12007 }),
    );
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 20_000,
      manualSystemConnection: false,
    });

    await expect(adapter.connect(SETTINGS, vi.fn())).resolves.toMatchObject({
      ok: false,
      error: { code: 12007, phase: "permission_denied" },
    });
  });

  it("accepts the onWifiConnected event for the requested SSID", async () => {
    let listener: WifiConnectedListener | null = null;
    const api = createMockApi(
      (options) => options.success?.({ errMsg: "startWifi:ok" }),
      () => undefined,
    );
    api.onWifiConnected.mockImplementation((value) => {
      listener = value;
    });
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 20_000,
      manualSystemConnection: false,
    });

    const result = adapter.connect(SETTINGS, vi.fn());
    expect(listener).not.toBeNull();
    const connectedListener = listener as unknown as WifiConnectedListener;
    api.getConnectedWifi.mockImplementation((options) => options.success(CONNECTED_WIFI));
    connectedListener(CONNECTED_WIFI);

    await expect(result).resolves.toEqual({ ok: true });
  });

  it("settles only once when the platform repeats the matching event", async () => {
    let listener: WifiConnectedListener | null = null;
    const api = createMockApi(
      (options) => options.success?.({ errMsg: "startWifi:ok" }),
      (options) => options.success?.({ errMsg: "connectWifi:ok" }),
    );
    api.onWifiConnected.mockImplementation((value) => {
      listener = value;
    });
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 20_000,
      manualSystemConnection: false,
    });

    const pending = adapter.connect(SETTINGS, vi.fn());
    const connectedListener = listener as unknown as WifiConnectedListener;
    api.getConnectedWifi.mockImplementation((options) => options.success(CONNECTED_WIFI));
    connectedListener(CONNECTED_WIFI);
    api.getConnectedWifi.mockImplementation((options) => options.success(CONNECTED_WIFI));
    connectedListener(CONNECTED_WIFI);

    await expect(pending).resolves.toEqual({ ok: true });
    expect(api.offWifiConnected).toHaveBeenCalledTimes(1);
  });

  it("ignores empty and non-target events, then times out and removes the listener", async () => {
    vi.useFakeTimers();
    let listener: WifiConnectedListener | null = null;
    const api = createMockApi(
      (options) => options.success?.({ errMsg: "startWifi:ok" }),
      (options) => options.success?.({ errMsg: "connectWifi:ok" }),
    );
    api.onWifiConnected.mockImplementation((value) => {
      listener = value;
    });
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 20_000,
      manualSystemConnection: false,
    });

    const pending = adapter.connect(SETTINGS, vi.fn());
    const connectedListener = listener as unknown as WifiConnectedListener;
    connectedListener({});
    connectedListener({
      wifi: { ...CONNECTED_WIFI.wifi, SSID: "Other-Network" },
    });
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: "client_timeout", phase: "failed" },
    });
    expect(api.offWifiConnected).toHaveBeenCalledTimes(1);
    expect(api.offWifiConnected).toHaveBeenCalledWith(connectedListener);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops Wi-Fi when startWifi succeeds after the page was already disposed", async () => {
    let startOptions: WifiOperationOptions | null = null;
    const api = createMockApi(
      (options) => {
        startOptions = options;
      },
      () => undefined,
    );
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 20_000,
      manualSystemConnection: false,
    });

    const pending = adapter.connect(SETTINGS, vi.fn());
    adapter.dispose();
    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: "cancelled" },
    });
    expect(api.stopWifi).not.toHaveBeenCalled();

    const delayedStartOptions = startOptions as unknown as WifiOperationOptions;
    delayedStartOptions.success?.({ errMsg: "startWifi:ok" });
    expect(api.stopWifi).toHaveBeenCalledTimes(1);
    expect(api.connectWifi).not.toHaveBeenCalled();
  });

  it("uses the same listener reference and clears timers on unload", async () => {
    vi.useFakeTimers();
    const api = createMockApi(
      (options) => options.success?.({ errMsg: "startWifi:ok" }),
      () => undefined,
    );
    const adapter = new LegacyWeChatWifiAdapter(api, {
      enabled: true,
      timeoutMs: 20_000,
      manualSystemConnection: false,
    });

    const pending = adapter.connect(SETTINGS, vi.fn());
    const registeredListener = api.onWifiConnected.mock.calls[0]?.[0];
    expect(() => registeredListener?.({})).not.toThrow();
    adapter.dispose();

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: "cancelled" },
    });
    expect(registeredListener).toBeDefined();
    expect(api.offWifiConnected).toHaveBeenCalledWith(registeredListener);
    expect(api.stopWifi).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
