import { describe, expect, it, vi } from "vitest";
import {
  decodePublicConnectConfig,
  decodePublicCredential,
  getEventPlatform,
  isAllowedApiBaseUrl,
  PublicApiError,
  WechatPublicApiClient,
} from "../src/platform/public-api";
import type { WechatMiniProgramApi, WechatRequestOptions } from "../src/platform/wechat-types";

const VALID_RESPONSE = {
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

  it("discards accidental credentials in the metadata response", () => {
    const response = decodePublicConnectConfig({
      ...VALID_RESPONSE,
      wifi: { ...VALID_RESPONSE.wifi, password: "unexpected-secret" },
    });
    expect(response.wifi).not.toHaveProperty("password");
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

describe("WechatPublicApiClient", () => {
  it("requests credentials using a POST body and decodes only connection settings", async () => {
    const request = vi.fn((options: WechatRequestOptions) => {
      options.success({
        statusCode: 200,
        data: { wifi: { ...VALID_RESPONSE.wifi, password: "connect-only" } },
      });
      return { abort: vi.fn() };
    });
    const client = new WechatPublicApiClient(
      { request } as unknown as WechatMiniProgramApi,
      "https://wifi.example.com",
      8000,
    );
    await expect(client.getCredential("scene-token")).resolves.toEqual({
      ssid: VALID_RESPONSE.wifi.ssid,
      password: "connect-only",
      bssid: null,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://wifi.example.com/api/public/credential",
        method: "POST",
        data: { sceneToken: "scene-token" },
      }),
    );
    expect(() => decodePublicCredential({ wifi: VALID_RESPONSE.wifi })).toThrow(PublicApiError);
  });

  it("settles pending requests on unload even when abort emits no callback", async () => {
    let requestOptions: WechatRequestOptions | undefined;
    const abort = vi.fn();
    const client = new WechatPublicApiClient(
      {
        request: (options: WechatRequestOptions) => {
          requestOptions = options;
          return { abort };
        },
      } as unknown as WechatMiniProgramApi,
      "https://wifi.example.com",
      8000,
    );
    const pending = client.getConnectConfig("scene-token");
    const assertion = expect(pending).rejects.toMatchObject({ code: "CLIENT_DISPOSED" });
    client.dispose();
    requestOptions?.success({ statusCode: 200, data: VALID_RESPONSE });
    await assertion;
    expect(abort).toHaveBeenCalledTimes(1);
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
