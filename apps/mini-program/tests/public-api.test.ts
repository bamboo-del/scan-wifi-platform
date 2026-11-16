import { describe, expect, it, vi } from "vitest";
import {
  decodePublicConnectConfig,
  getEventPlatform,
  isAllowedApiBaseUrl,
  PublicApiError,
  WechatPublicApiClient,
} from "../src/platform/public-api";
import type { WechatMiniProgramApi } from "../src/platform/wechat-types";

const VALID_RESPONSE = {
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
    unitId: "adunit-example",
  },
  compatibility: {
    legacyWifiApiEnabled: false,
  },
};

describe("decodePublicConnectConfig", () => {
  it("accepts only the minimal public contract", () => {
    expect(decodePublicConnectConfig(VALID_RESPONSE)).toEqual(VALID_RESPONSE);
  });

  it("rejects a response missing compatibility verification", () => {
    const invalid = { ...VALID_RESPONSE, compatibility: {} };
    expect(() => decodePublicConnectConfig(invalid)).toThrow(PublicApiError);
  });

  it("rejects a response with an incomplete Wi-Fi contract", () => {
    const invalid = {
      ...VALID_RESPONSE,
      wifi: { ssid: VALID_RESPONSE.wifi.ssid, password: "secret" },
    };
    expect(() => decodePublicConnectConfig(invalid)).toThrow(PublicApiError);
  });
});

describe("isAllowedApiBaseUrl", () => {
  it("always accepts HTTPS and keeps loopback HTTP behind an explicit switch", () => {
    expect(isAllowedApiBaseUrl("https://wifi.example.com", false)).toBe(true);
    expect(isAllowedApiBaseUrl("http://127.0.0.1:3100", false)).toBe(false);
    expect(isAllowedApiBaseUrl("http://127.0.0.1:3100", true)).toBe(true);
    expect(isAllowedApiBaseUrl("http://localhost:3100/api", true)).toBe(true);
    expect(isAllowedApiBaseUrl("http://192.168.1.10:3100", true)).toBe(false);
  });

  it("rejects empty, credential-bearing, and malformed base URLs", () => {
    expect(isAllowedApiBaseUrl("", true)).toBe(false);
    expect(isAllowedApiBaseUrl("https://user:password@example.com", false)).toBe(false);
    expect(isAllowedApiBaseUrl("https://wifi.example.com?secret=value", false)).toBe(false);
    expect(isAllowedApiBaseUrl("javascript:alert(1)", true)).toBe(false);
  });
});

describe("WechatPublicApiClient", () => {
  it("keeps the opaque scene out of the request URL and sends it only in the validated body", async () => {
    const sceneToken = "0123456789abcdef0123456789abcdef";
    const request = vi.fn((options: Record<string, unknown>) => {
      const success = options.success as (result: { statusCode: number; data: unknown }) => void;
      success({ statusCode: 200, data: VALID_RESPONSE });
      return { abort: vi.fn() };
    });
    const client = new WechatPublicApiClient(
      { request } as unknown as WechatMiniProgramApi,
      "https://wifi.example.com",
      8_000,
    );

    await expect(client.getConnectConfig(sceneToken)).resolves.toEqual(VALID_RESPONSE);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://wifi.example.com/api/public/connect",
        method: "POST",
        data: { sceneToken },
      }),
    );
    expect(JSON.stringify(request.mock.calls[0]?.[0].url)).not.toContain(sceneToken);
  });
});

describe("getEventPlatform", () => {
  it("uses getDeviceInfo without calling the deprecated aggregate API", () => {
    const getSystemInfoSync = vi.fn(() => ({ platform: "android" }));
    const api = {
      getDeviceInfo: () => ({ platform: "iOS" }),
      getSystemInfoSync,
    } as unknown as WechatMiniProgramApi;

    expect(getEventPlatform(api)).toBe("ios");
    expect(getSystemInfoSync).not.toHaveBeenCalled();
  });

  it("uses a controlled legacy fallback when getDeviceInfo is unavailable", () => {
    const api = {
      getSystemInfoSync: () => ({ platform: "Android" }),
    } as unknown as WechatMiniProgramApi;

    expect(getEventPlatform(api)).toBe("android");
  });
});
