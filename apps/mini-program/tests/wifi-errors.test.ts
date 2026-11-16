import { describe, expect, it } from "vitest";
import { normalizeWifiError } from "../src/core/wifi-errors";

describe("normalizeWifiError", () => {
  it("maps official capability, permission, and switch errors to UI states", () => {
    expect(normalizeWifiError({ errCode: 12001 }).phase).toBe("unsupported");
    expect(normalizeWifiError({ errCode: 12005 }).phase).toBe("wifi_disabled");
    expect(normalizeWifiError({ errCode: 12007 }).phase).toBe("permission_denied");
  });

  it("does not invent or recognize the undocumented 12012 code", () => {
    expect(normalizeWifiError({ errCode: 12012 }).code).toBe("unknown");
  });

  it("clearly identifies the documented password errors", () => {
    expect(normalizeWifiError({ errCode: 12002 })).toMatchObject({
      code: 12002,
      title: "Wi-Fi 密码可能不正确",
    });
    expect(normalizeWifiError({ errCode: 12014 })).toMatchObject({
      code: 12014,
      title: "Wi-Fi 密码无效",
    });
  });

  it("never exposes a raw platform error message", () => {
    const normalized = normalizeWifiError({
      errCode: 99999,
      errMsg: "connectWifi:fail password=plaintext",
    });
    expect(normalized.message).not.toContain("plaintext");
  });
});
