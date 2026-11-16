import { describe, expect, it } from "vitest";
import {
  createStoreSchema,
  createOperatorSchema,
  loginSchema,
  updateStoreSchema,
  operationLogQuerySchema,
  paginationSchema,
  publicEventSchema,
  putWifiSchema,
  sceneTokenSchema,
} from "./index.js";

describe("request validation", () => {
  it("accepts email logins and existing usernames without changing operator account creation", () => {
    for (const username of ["admin", "team_member-1", " admin@example.com "]) {
      expect(loginSchema.parse({ username, password: "test-password-long" }).username).toBe(
        username.trim(),
      );
    }
    for (const username of ["admin@@example.com", "admin@", "admin name@example.com"]) {
      expect(() => loginSchema.parse({ username, password: "test-password-long" })).toThrow();
    }
    expect(() =>
      createOperatorSchema.parse({ username: "admin@example.com", password: "test-password-long" }),
    ).toThrow();
  });
  it("retains user profile fields and rejects removed notes on create and update", () => {
    const profile = {
      name: "测试用户",
      shortName: "测试",
      logoUrl: "https://cdn.test/logo.png",
      address: "测试地址",
      contactName: "联系人",
      contactPhone: "13800000000",
    };
    expect(createStoreSchema.parse(profile)).toMatchObject(profile);
    expect(updateStoreSchema.parse(profile)).toEqual(profile);
    expect(() => createStoreSchema.parse({ ...profile, notes: "旧备注" })).toThrow();
    expect(() => updateStoreSchema.parse({ notes: "旧备注" })).toThrow();
  });
  it("preserves SSID spaces and bounds UTF-8 byte length", () => {
    expect(putWifiSchema.parse({ ssid: " Guest ", password: "secure-pass" }).ssid).toBe(" Guest ");
    expect(() => putWifiSchema.parse({ ssid: "网".repeat(11), password: "secure-pass" })).toThrow();
    expect(
      putWifiSchema.parse({ ssid: "网".repeat(10) + "ab", password: "secure-pass" }).ssid,
    ).toHaveLength(12);
  });

  it("validates OPEN and WEP passwords according to their security type", () => {
    expect(putWifiSchema.parse({ ssid: "Open", securityType: "OPEN", password: "" }).password).toBe(
      "",
    );
    expect(() =>
      putWifiSchema.parse({ ssid: "Open", securityType: "OPEN", password: "secure-pass" }),
    ).toThrow();
    for (const password of ["abcde", "abcdefghijklm", "0123456789", "0123456789abcdef0123456789"]) {
      expect(putWifiSchema.parse({ ssid: "Legacy", securityType: "WEP", password }).password).toBe(
        password,
      );
    }
    expect(() =>
      putWifiSchema.parse({ ssid: "Legacy", securityType: "WEP", password: "secure-pass" }),
    ).toThrow();
  });

  it("rejects unsafe logo protocols, credentials, and overflowing pagination", () => {
    for (const logoUrl of [
      "javascript:alert(1)",
      "data:image/svg+xml,test",
      "https://user:secret@cdn.test/logo.png",
    ]) {
      expect(() => createStoreSchema.parse({ name: "用户", logoUrl })).toThrow();
    }
    expect(
      createStoreSchema.parse({ name: "用户", logoUrl: "https://cdn.test/logo.png" }).logoUrl,
    ).toBe("https://cdn.test/logo.png");
    expect(() => paginationSchema.parse({ page: "1e100" })).toThrow();
  });

  it("accepts valid store and Wi-Fi writes", () => {
    expect(createStoreSchema.parse({ name: "测试用户" }).name).toBe("测试用户");
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
