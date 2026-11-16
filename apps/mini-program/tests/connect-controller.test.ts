import { describe, expect, it, vi } from "vitest";
import { ConnectController } from "../src/core/connect-controller";
import { LegacyWeChatWifiAdapter } from "../src/core/legacy-wechat-wifi-adapter";
import type {
  ConnectViewState,
  PublicApi,
  PublicConnectConfig,
  PublicEventInput,
} from "../src/core/types";
import type {
  ConnectWifiOptions,
  LegacyWifiWxApi,
  WifiConnectedListener,
  WifiOperationOptions,
} from "../src/platform/wechat-types";

const SCENE = "0123456789abcdef0123456789abcdef";
const PASSWORD = "never-put-this-in-view-state";
const CONFIG: PublicConnectConfig = {
  store: {
    name: "南山咖啡·科技园店",
    shortName: null,
    logoUrl: null,
  },
  wifi: {
    ssid: "NanshanCoffee-FreeWiFi",
    bssid: null,
    securityType: null,
  },
  ad: {
    enabled: true,
    unitId: "adunit-test",
  },
  compatibility: {
    legacyWifiApiEnabled: true,
  },
};

class MockPublicApi implements PublicApi {
  readonly events: PublicEventInput[] = [];
  readonly getConnectConfig = vi.fn(() => Promise.resolve(CONFIG));
  readonly getCredential = vi.fn(() => Promise.resolve({ ...CONFIG.wifi, password: PASSWORD }));
  readonly reportEvent = vi.fn((event: PublicEventInput) => {
    this.events.push(event);
    return Promise.resolve();
  });
  readonly dispose = vi.fn();
}

function createWifiApi(outcomes: ReadonlyArray<"success" | number>) {
  const queue = [...outcomes];
  let listener: WifiConnectedListener | null = null;
  return {
    startWifi: vi.fn((options: WifiOperationOptions) => {
      options.success?.({ errMsg: "startWifi:ok" });
    }),
    connectWifi: vi.fn((options: ConnectWifiOptions) => {
      const outcome = queue.shift();
      if (outcome === "success") {
        options.success?.({ errMsg: "connectWifi:ok" });
        listener?.({
          wifi: {
            SSID: options.SSID,
            BSSID: options.BSSID ?? "00:11:22:33:44:55",
            secure: true,
            signalStrength: 80,
          },
        });
      } else {
        options.fail?.({
          errMsg: "connectWifi:fail sanitized by adapter",
          ...(typeof outcome === "number" ? { errCode: outcome } : {}),
        });
      }
    }),
    onWifiConnected: vi.fn((value: WifiConnectedListener) => {
      listener = value;
    }),
    offWifiConnected: vi.fn((value?: WifiConnectedListener) => {
      if (value === undefined || value === listener) {
        listener = null;
      }
    }),
    stopWifi: vi.fn(),
  } satisfies LegacyWifiWxApi;
}

function createHarness(outcomes: ReadonlyArray<"success" | number>) {
  const api = new MockPublicApi();
  const wifiApi = createWifiApi(outcomes);
  const wifi = new LegacyWeChatWifiAdapter(wifiApi, {
    enabled: true,
    timeoutMs: 20_000,
    manualSystemConnection: false,
  });
  const states: ConnectViewState[] = [];
  const controller = new ConnectController({
    api,
    wifi,
    platform: "android",
    onChange: (state) => states.push(state),
  });
  return { api, wifiApi, states, controller };
}

describe("ConnectController", () => {
  it("keeps ad failure independent from a successful connection", async () => {
    const { api, controller } = createHarness(["success"]);
    await controller.load(SCENE);

    expect(controller.viewState.adEligible).toBe(true);
    controller.handleAdError();
    expect(controller.viewState.adCollapsed).toBe(true);

    await controller.connect();
    expect(controller.viewState.phase).toBe("success");
    expect(api.events.map((event) => event.eventType)).toEqual([
      "page_view",
      "ad_load_failure",
      "connect_click",
      "connect_success",
    ]);
  });

  it("moves through failure and retry without reloading config", async () => {
    const { api, wifiApi, controller } = createHarness([12003, "success"]);
    await controller.load(SCENE);

    await controller.connect();
    expect(controller.viewState.phase).toBe("failed");
    expect(controller.viewState.buttonLabel).toBe("重新连接");

    await controller.retry();
    expect(controller.viewState.phase).toBe("success");
    expect(wifiApi.connectWifi).toHaveBeenCalledTimes(2);
    expect(api.getConnectConfig).toHaveBeenCalledTimes(1);
    expect(api.getCredential).toHaveBeenCalledTimes(2);
  });

  it("reports only normalized failure details and never the password", async () => {
    const { api, controller } = createHarness([12002]);
    await controller.load(SCENE);
    await controller.connect();

    const failure = api.events.find((event) => event.eventType === "connect_failure");
    expect(failure).toMatchObject({ errorCode: "12002" });
    expect(JSON.stringify(failure)).not.toContain(PASSWORD);
    expect(JSON.stringify(controller.viewState)).not.toContain(PASSWORD);
  });

  it("shows unsupported when backend verification is disabled", async () => {
    const api = new MockPublicApi();
    api.getConnectConfig.mockResolvedValue({
      ...CONFIG,
      compatibility: { legacyWifiApiEnabled: false },
    });
    const wifiApi = createWifiApi(["success"]);
    const controller = new ConnectController({
      api,
      wifi: new LegacyWeChatWifiAdapter(wifiApi, {
        enabled: true,
        timeoutMs: 20_000,
        manualSystemConnection: false,
      }),
      platform: "ios",
      onChange: vi.fn(),
    });

    await controller.load(SCENE);
    expect(controller.viewState.phase).toBe("unsupported");
    expect(controller.viewState.buttonDisabled).toBe(true);
    expect(wifiApi.startWifi).not.toHaveBeenCalled();
    expect(api.getCredential).not.toHaveBeenCalled();
  });

  it("does not mount an ad without both the effective switch and a unit ID", async () => {
    const api = new MockPublicApi();
    api.getConnectConfig.mockResolvedValue({
      ...CONFIG,
      ad: { enabled: true, unitId: null },
    });
    const wifiApi = createWifiApi(["success"]);
    const controller = new ConnectController({
      api,
      wifi: new LegacyWeChatWifiAdapter(wifiApi, {
        enabled: true,
        timeoutMs: 20_000,
        manualSystemConnection: false,
      }),
      platform: "ios",
      onChange: vi.fn(),
    });

    await controller.load(SCENE);
    expect(controller.viewState.adEligible).toBe(false);
    expect(controller.viewState.adCollapsed).toBe(true);
  });

  it("uses injected public branding and ad configuration without bypassing the backend switch", async () => {
    const api = new MockPublicApi();
    api.getConnectConfig.mockResolvedValue({
      ...CONFIG,
      ad: { enabled: true, unitId: null },
    });
    const wifiApi = createWifiApi(["success"]);
    const controller = new ConnectController({
      api,
      wifi: new LegacyWeChatWifiAdapter(wifiApi, {
        enabled: true,
        timeoutMs: 20_000,
        manualSystemConnection: false,
      }),
      platform: "ios",
      adUnitId: " adunit-build-time ",
      brandName: " 用户网络 ",
      onChange: vi.fn(),
    });

    await controller.load(SCENE);
    expect(controller.viewState.adEligible).toBe(true);
    expect(controller.viewState.adUnitId).toBe("adunit-build-time");
    expect(controller.viewState.brandName).toBe("用户网络");

    api.getConnectConfig.mockResolvedValue({
      ...CONFIG,
      ad: { enabled: false, unitId: null },
    });
    await controller.load(SCENE);
    expect(controller.viewState.adEligible).toBe(false);
  });

  it("deduplicates repeated ad callbacks while preserving the latest layout state", async () => {
    const { api, controller } = createHarness(["success"]);
    await controller.load(SCENE);

    controller.handleAdError();
    controller.handleAdError();
    controller.handleAdLoad();
    controller.handleAdLoad();
    controller.handleAdError();

    expect(controller.viewState.adCollapsed).toBe(true);
    expect(api.events.map((event) => event.eventType)).toEqual([
      "page_view",
      "ad_load_failure",
      "ad_load_success",
    ]);
  });

  it("rejects an invalid scene before any request", async () => {
    const { api, controller } = createHarness(["success"]);
    await controller.load("store-1");

    expect(controller.viewState.statusTitle).toBe("无法识别此二维码");
    expect(controller.viewState.hasConfig).toBe(false);
    controller.toggleTroubleshooting();
    expect(controller.viewState.troubleshootingExpanded).toBe(false);
    expect(api.getConnectConfig).not.toHaveBeenCalled();
  });

  it("fetches fresh credentials only on click and uses the current network", async () => {
    const { api, wifiApi, controller } = createHarness(["success"]);
    await controller.load(SCENE);
    expect(api.getCredential).not.toHaveBeenCalled();
    api.getCredential.mockResolvedValue({
      ...CONFIG.wifi,
      ssid: "Updated-Network",
      password: "updated-password",
    });

    await controller.connect();
    expect(wifiApi.connectWifi).toHaveBeenCalledWith(
      expect.objectContaining({ SSID: "Updated-Network", password: "updated-password" }),
    );
    expect(controller.viewState.ssid).toBe("Updated-Network");
    expect(JSON.stringify(controller.viewState)).not.toContain("updated-password");
  });

  it("blocks duplicate clicks and discards credentials received after unload", async () => {
    const { api, wifiApi, controller } = createHarness(["success"]);
    await controller.load(SCENE);
    let resolveCredential: ((value: typeof CONFIG.wifi & { password: string }) => void) | undefined;
    api.getCredential.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCredential = resolve;
        }),
    );
    const pending = controller.connect();
    await controller.connect();
    expect(api.getCredential).toHaveBeenCalledTimes(1);
    controller.dispose();
    resolveCredential?.({ ...CONFIG.wifi, password: PASSWORD });
    await pending;
    expect(wifiApi.connectWifi).not.toHaveBeenCalled();
  });

  it("does not connect with a stale password when credentials are rejected", async () => {
    const { api, wifiApi, controller } = createHarness(["success"]);
    await controller.load(SCENE);
    api.getCredential.mockRejectedValue(new Error("disabled store or rotated scene"));
    await expect(controller.connect()).resolves.toBeUndefined();
    expect(controller.viewState.phase).toBe("failed");
    expect(controller.viewState.buttonDisabled).toBe(false);
    expect(wifiApi.startWifi).not.toHaveBeenCalled();
    expect(JSON.stringify(api.events)).not.toContain("disabled store");
  });

  it("normalizes unexpected adapter exceptions and permits retry", async () => {
    const api = new MockPublicApi();
    const controller = new ConnectController({
      api,
      wifi: {
        isAvailable: () => true,
        connect: () => Promise.reject(new Error(PASSWORD)),
        dispose: vi.fn(),
      },
      platform: "android",
      onChange: vi.fn(),
    });
    await controller.load(SCENE);
    await expect(controller.connect()).resolves.toBeUndefined();
    expect(controller.viewState.phase).toBe("failed");
    expect(controller.viewState.buttonDisabled).toBe(false);
    expect(JSON.stringify(api.events)).not.toContain(PASSWORD);
  });
});
