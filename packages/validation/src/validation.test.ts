import { describe, expect, it } from "vitest";
import {
  createStoreSchema,
  operationLogQuerySchema,
  publicEventSchema,
  putWifiSchema,
  sceneTokenSchema,
} from "./index.js";

describe("request validation", () => {
  it("accepts valid store and Wi-Fi writes", () => {
    expect(createStoreSchema.parse({ name: "测试门店" })).toMatchObject({
      name: "测试门店",
      adEnabled: false,
    });
    expect(putWifiSchema.parse({ ssid: "Guest", password: "secure-pass" }).status).toBe("active");
    expect(
      putWifiSchema.parse({
        ssid: "Guest",
        password: "secure-pass",
        securityType: "WPA2_WPA3",
      }).securityType,
    ).toBe("WPA2_WPA3");
  });

  it("rejects weak passwords and enumerable scene values", () => {
    expect(() => putWifiSchema.parse({ ssid: "Guest", password: "short" })).toThrow();
    expect(() => sceneTokenSchema.parse("42")).toThrow();
    expect(() =>
      putWifiSchema.parse({ ssid: "Guest", password: "secure-pass", securityType: "wpa2" }),
    ).toThrow();
  });

  it("accepts operation-log search and rejects undeclared query fields", () => {
    expect(operationLogQuerySchema.parse({ search: "admin", action: "store" })).toMatchObject({
      page: 1,
      pageSize: 20,
      search: "admin",
      action: "store",
    });
    expect(() => operationLogQuerySchema.parse({ unknown: "value" })).toThrow();
  });

  it("rejects error details on non-failure events", () => {
    expect(() =>
      publicEventSchema.parse({
        sceneToken: "a".repeat(32),
        eventType: "connect_success",
        platform: "ios",
        errorMessage: "must not be present",
      }),
    ).toThrow();
  });
});
