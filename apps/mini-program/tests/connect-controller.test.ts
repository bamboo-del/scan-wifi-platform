import { describe, expect, it, vi } from "vitest";
import { ConnectController } from "../src/core/connect-controller";
import { PublicApiError } from "../src/platform/public-api";
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
const PASSWORD = "customer-visible-password";
const CONFIG: PublicConnectConfig = {
  store: {
    id: "store-test",
    name: "南山咖啡·科技园店",
    shortName: null,
    logoUrl: null,
  },
  wifi: {
    id: "wifi-test",
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
  readonly getWifiCredential = vi.fn(() =>
    Promise.resolve({
      wifiId: CONFIG.wifi.id,
      storeId: CONFIG.store.id,
      ssid: CONFIG.wifi.ssid,
      password: PASSWORD,
      bssid: null,
    }),
  );
  readonly events: PublicEventInput[] = [];
  readonly getConnectConfig = vi.fn(() => Promise.resolve(CONFIG));
  readonly reportEvent = vi.fn((event: PublicEventInput) => {
    this.events.push(event);
    return Promise.resolve();
  });
  readonly dispose = vi.fn();
}

function createWifiApi(outcomes: ReadonlyArray<"success" | number>) {
  const queue = [...outcomes];
  let connected = false;
  let listener: WifiConnectedListener | null = null;
  return {
    getConnectedWifi: vi.fn<NonNullable<LegacyWifiWxApi["getConnectedWifi"]>>((options) =>
      connected
        ? options.success({
            wifi: { SSID: CONFIG.wifi.ssid, BSSID: "", secure: true, signalStrength: 80 },
          })
        : options.fail({ errMsg: "not connected" }),
    ),
    startWifi: vi.fn((options: WifiOperationOptions) => {
      options.success?.({ errMsg: "startWifi:ok" });
    }),
    connectWifi: vi.fn((options: ConnectWifiOptions) => {
      const outcome = queue.shift();
      if (outcome === "success") {
        connected = true;
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
    enableAds: true,
    wifi,
    platform: "android",
    onChange: (state) => states.push(state),
  });
  return { api, wifiApi, states, controller };
}

describe("ConnectController", () => {
  it("clears the previous network password on a new or invalid scan", async () => {
    const { controller, api } = createHarness([]);
    await controller.load(SCENE);
    expect(controller.viewState.password).toBe(PASSWORD);
    let finish!: (value: PublicConnectConfig) => void;
    api.getConnectConfig.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = controller.load("a".repeat(32));
    expect(controller.viewState.password).toBe("");
    await controller.load("invalid");
    finish(CONFIG);
    await pending;
    expect(controller.viewState.password).toBe("");
    expect(controller.viewState.hasConfig).toBe(false);
    controller.dispose();
  });

  it("rejects credentials for a different network and never renders their password", async () => {
    const { controller, api, states } = createHarness([]);
    api.getWifiCredential.mockResolvedValueOnce({
      storeId: CONFIG.store.id,
      wifiId: "other-network",
      ssid: "Other",
      password: "other-password",
      bssid: null,
    });
    await controller.load(SCENE);
    expect(controller.viewState.hasConfig).toBe(false);
    expect(JSON.stringify(states)).not.toContain("other-password");
    controller.dispose();
  });

  it("uses the updated password at button click without changing the printed scene", async () => {
    const { controller, api, wifiApi } = createHarness(["success"]);
    await controller.load(SCENE);
    api.getWifiCredential.mockResolvedValueOnce({
      storeId: CONFIG.store.id,
      wifiId: CONFIG.wifi.id,
      ssid: CONFIG.wifi.ssid,
      password: "replacement-password",
      bssid: null,
    });
    await controller.connect();
    expect(wifiApi.connectWifi).toHaveBeenCalledWith(
      expect.objectContaining({ password: "replacement-password" }),
    );
    expect(controller.viewState.password).toBe("replacement-password");
    expect(JSON.stringify(api.events)).not.toContain("replacement-password");
    controller.dispose();
    expect(controller.viewState.password).toBe("");
  });

  it.each(["connect", "copyPassword"] as const)(
    "blocks %s when the merchant pauses after page lookup",
    async (action) => {
      const { controller, api, wifiApi } = createHarness(["success"]);
      await controller.load(SCENE);
      api.getWifiCredential.mockRejectedValue(new PublicApiError("SPOT_DISABLED"));
      await controller[action]();
      expect(controller.viewState).toMatchObject({
        phase: "disabled",
        buttonDisabled: true,
        hasConfig: false,
        password: "",
      });
      expect(wifiApi.connectWifi).not.toHaveBeenCalled();
      controller.dispose();
    },
  );
  it("reloads after a transient credential request failure", async () => {
    const { controller, api } = createHarness(["success"]);
    await controller.load(SCENE);
    api.getWifiCredential.mockRejectedValueOnce(new PublicApiError("NETWORK_ERROR"));
    await controller.connect();
    expect(controller.viewState).toMatchObject({
      phase: "failed",
      buttonDisabled: false,
      hasConfig: false,
    });
    await controller.retry();
    expect(controller.viewState.phase).toBe("waiting");
    expect(api.getConnectConfig).toHaveBeenCalledTimes(2);
    controller.dispose();
  });
  it("fetches only the scanned network password and refreshes it before connecting", async () => {
    const { controller, api } = createHarness(["success"]);
    await controller.load(undefined);
    expect(controller.viewState.phase).toBe("idle");
    expect(api.getConnectConfig).not.toHaveBeenCalled();
    expect(api.getWifiCredential).not.toHaveBeenCalled();
    await controller.load(SCENE);
    expect(api.getWifiCredential).toHaveBeenCalledWith(SCENE);
    expect(controller.viewState.password).toBe(PASSWORD);
    await controller.connect();
    expect(api.getWifiCredential).toHaveBeenCalledTimes(2);
  });

  it.each([12002, 12005, 12007, 12008, 12003, 12010])(
    "offers a human-readable fallback for %s",
    async (code) => {
      const { controller, api } = createHarness([code]);
      await controller.load(SCENE);
      await controller.connect();
      expect(controller.viewState.statusTitle).not.toContain(String(code));
      expect(controller.viewState.troubleshootingExpanded).toBe(true);
      expect(api.events.at(-1)).toMatchObject({
        eventType: "connect_failure",
        errorCode: String(code),
        platform: "android",
      });
    },
  );

  it("copies a freshly fetched password while automatic connection and ads are disabled", async () => {
    const api = new MockPublicApi();
    api.getConnectConfig.mockResolvedValue({
      ...CONFIG,
      compatibility: { legacyWifiApiEnabled: false },
    });
    const copyToClipboard = vi.fn(() => Promise.resolve());
    const wifiApi = createWifiApi([]);
    const controller = new ConnectController({
      api,
      wifi: new LegacyWeChatWifiAdapter(wifiApi, {
        enabled: false,
        timeoutMs: 100,
        manualSystemConnection: false,
      }),
      platform: "ios",
      copyToClipboard,
      onChange: vi.fn(),
    });
    await controller.load(SCENE);
    await controller.copyPassword();
    expect(copyToClipboard).toHaveBeenCalledWith(PASSWORD);
    expect(controller.viewState.phase).toBe("manual");
    expect(controller.viewState.statusMessage).toContain(CONFIG.wifi.ssid);
    expect(controller.viewState.adEligible).toBe(false);
    expect(api.events.at(-1)?.eventType).toBe("password_copy");
    expect(wifiApi.startWifi).not.toHaveBeenCalled();
    expect(controller.viewState.password).toBe(PASSWORD);
  });

  it("deduplicates clicks while credentials load and ignores completion after unload", async () => {
    const { controller, api, wifiApi } = createHarness(["success"]);
    await controller.load(SCENE);
    let finish!: (value: Awaited<ReturnType<typeof api.getWifiCredential>>) => void;
    api.getWifiCredential.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = controller.connect();
    await controller.connect();
    expect(api.getWifiCredential).toHaveBeenCalledTimes(2);
    controller.dispose();
    finish({
      storeId: CONFIG.store.id,
      wifiId: CONFIG.wifi.id,
      ssid: CONFIG.wifi.ssid,
      password: PASSWORD,
      bssid: null,
    });
    await pending;
    expect(wifiApi.startWifi).not.toHaveBeenCalled();
    expect(controller.viewState.password).toBe("");
    expect(api.events.filter((event) => event.eventType === "connect_click")).toHaveLength(1);
  });

  it("handles nonexistent scenes and credential request failure without leaking external errors", async () => {
    const { controller, api } = createHarness(["success"]);
    api.getConnectConfig.mockRejectedValueOnce(new Error("external sensitive message"));
    await controller.load(SCENE);
    expect(controller.viewState.hasConfig).toBe(false);
    await controller.load(SCENE);
    api.getWifiCredential.mockRejectedValueOnce(new Error(PASSWORD));
    await controller.connect();
    expect(controller.viewState.phase).toBe("failed");
    expect(JSON.stringify(api.events)).not.toContain(PASSWORD);
  });

  it("connects successfully when telemetry rejects and both advertising and analytics are off", async () => {
    const api = new MockPublicApi();
    api.reportEvent.mockRejectedValue(new Error("offline"));
    const controller = new ConnectController({
      api,
      wifi: new LegacyWeChatWifiAdapter(createWifiApi(["success"]), {
        enabled: true,
        timeoutMs: 100,
        manualSystemConnection: false,
      }),
      platform: "ios",
      enableAds: false,
      enableAnalytics: false,
      onChange: vi.fn(),
    });
    await controller.load(SCENE);
    await controller.connect();
    expect(controller.viewState.phase).toBe("success");
    expect(api.reportEvent).not.toHaveBeenCalled();
    expect(controller.viewState.adEligible).toBe(false);
  });
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
      "scan",
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
  });

  it("reports only normalized failure details and never the password", async () => {
    const { api, controller } = createHarness([12002]);
    await controller.load(SCENE);
    await controller.connect();

    const failure = api.events.find((event) => event.eventType === "connect_failure");
    expect(failure).toMatchObject({ errorCode: "12002" });
    expect(JSON.stringify(failure)).not.toContain(PASSWORD);
    expect(controller.viewState.password).toBe(PASSWORD);
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
      enableAds: true,
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
      enableAds: true,
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
      enableAds: true,
      wifi: new LegacyWeChatWifiAdapter(wifiApi, {
        enabled: true,
        timeoutMs: 20_000,
        manualSystemConnection: false,
      }),
      platform: "ios",
      adUnitId: " adunit-build-time ",
      brandName: " 门店网络 ",
      onChange: vi.fn(),
    });

    await controller.load(SCENE);
    expect(controller.viewState.adEligible).toBe(true);
    expect(controller.viewState.adUnitId).toBe("adunit-build-time");
    expect(controller.viewState.brandName).toBe("门店网络");

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
      "scan",
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
});
