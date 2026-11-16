import { describe, expect, it } from "vitest";

import { hasValidationErrors, type StoreDraft, validateStoreDraft } from "@/lib/store-validation";

const VALID_DRAFT: StoreDraft = {
  name: "测试咖啡店",
  shortName: "测试店",
  logoUrl: "",
  address: "深圳市南山区测试路 1 号",
  contactName: "张店长",
  contactPhone: "138 0000 0000",
  notes: "",
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
      name: "请输入门店名称",
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
});
