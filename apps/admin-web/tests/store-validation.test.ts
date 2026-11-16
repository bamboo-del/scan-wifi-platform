import { describe, expect, it } from "vitest";

import { hasValidationErrors, type StoreDraft, validateStoreDraft } from "@/lib/store-validation";

const VALID_DRAFT: StoreDraft = {
  name: "测试咖啡店",
  shortName: "测试店",
  logoUrl: "",
  address: "深圳市南山区测试路 1 号",
  contactName: "张店长",
  contactPhone: "138 0000 0000",
  adEnabled: true,
  status: "active",
  ssid: "Test-Cafe-WiFi",
  bssid: "AA:BB:CC:DD:EE:FF",
  securityType: "WPA2_WPA3",
  wifiStatus: "active",
  newPassword: "SecureWiFi2026!",
  confirmPassword: "SecureWiFi2026!",
};

describe("validateStoreDraft", () => {
  it("accepts a complete store and Wi-Fi draft", () => {
    const errors = validateStoreDraft(VALID_DRAFT, { requireWifiPassword: true });

    expect(errors).toEqual({});
    expect(hasValidationErrors(errors)).toBe(false);
  });

  it("reports required fields, malformed optional contact data, and password mismatch", () => {
    const errors = validateStoreDraft(
      {
        ...VALID_DRAFT,
        name: " ",
        shortName: "",
        address: "",
        contactName: "",
        contactPhone: "not-a-phone",
        ssid: "",
        bssid: "AA:BB:CC",
        newPassword: "short",
        confirmPassword: "different",
      },
      { requireWifiPassword: true },
    );

    expect(errors).toMatchObject({
      name: "请输入用户名称",
      contactPhone: "请输入有效的联系电话",
      ssid: "请输入 Wi-Fi 名称",
      bssid: "请输入有效的 BSSID，例如 AA:BB:CC:DD:EE:FF",
      newPassword: "新密码至少 8 个字符",
      confirmPassword: "两次输入的密码不一致",
    });
    expect(hasValidationErrors(errors)).toBe(true);
  });

  it("accepts blank optional store metadata", () => {
    const errors = validateStoreDraft(
      {
        ...VALID_DRAFT,
        shortName: "",
        address: "",
        contactName: "",
        contactPhone: "",
      },
      { requireWifiPassword: true },
    );

    expect(errors.shortName).toBeUndefined();
    expect(errors.address).toBeUndefined();
    expect(errors.contactName).toBeUndefined();
    expect(errors.contactPhone).toBeUndefined();
  });

  it("does not require the existing password when Wi-Fi settings are unchanged", () => {
    const errors = validateStoreDraft(
      { ...VALID_DRAFT, newPassword: "", confirmPassword: "" },
      { requireWifiPassword: false },
    );

    expect(errors.newPassword).toBeUndefined();
    expect(errors.confirmPassword).toBeUndefined();
  });

  it("enforces the UTF-8 SSID byte limit and password maximum before creating a store", () => {
    const errors = validateStoreDraft(
      { ...VALID_DRAFT, ssid: "中".repeat(11), newPassword: "x".repeat(64) },
      { requireWifiPassword: true },
    );
    expect(errors.ssid).toContain("32 字节");
    expect(errors.newPassword).toContain("63 个字符");
    expect(
      validateStoreDraft({ ...VALID_DRAFT, ssid: " Cafe " }, { requireWifiPassword: true }).ssid,
    ).toBeUndefined();
  });

  it.each([
    "javascript:alert(1)",
    "file:///tmp/logo.png",
    "https://user:secret@example.com/logo.png",
  ])("rejects unsafe logo URL %s", (logoUrl) => {
    expect(
      validateStoreDraft({ ...VALID_DRAFT, logoUrl }, { requireWifiPassword: true }).logoUrl,
    ).toBeDefined();
  });

  it.each([
    ["OPEN", ""],
    ["WEP", "abcde"],
    ["WEP", "a1b2c3d4e5"],
  ] as const)("accepts legacy %s credentials", (securityType, password) => {
    expect(
      validateStoreDraft(
        {
          ...VALID_DRAFT,
          securityType,
          newPassword: password,
          confirmPassword: password,
        },
        { requireWifiPassword: true },
      ),
    ).toEqual({});
  });

  it("rejects a password for OPEN and invalid WEP credentials", () => {
    for (const securityType of ["OPEN", "WEP"] as const) {
      expect(
        validateStoreDraft({ ...VALID_DRAFT, securityType }, { requireWifiPassword: true })
          .newPassword,
      ).toBeDefined();
    }
  });
});
