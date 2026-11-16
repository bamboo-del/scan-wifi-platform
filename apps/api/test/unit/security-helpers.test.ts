import { describe, expect, it } from "vitest";
import {
  redactSensitive,
  sanitizeEventErrorCode,
  sanitizeEventErrorMessage,
  sanitizeExternalError,
} from "../../src/lib/redaction.js";
import { shouldDisplayAd } from "../../src/services/ad-policy.js";
import { LocalPlaceholderQRCodeProvider } from "../../src/services/qrcode-provider.js";
import { createSceneToken } from "../../src/services/scene-token.js";

describe("security helpers", () => {
  it("creates unique 32-character lowercase hexadecimal scene tokens", () => {
    const values = Array.from({ length: 256 }, createSceneToken);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) expect(value).toMatch(/^[a-f0-9]{32}$/u);
  });

  it("redacts secrets recursively and does not echo upstream errors", () => {
    const redacted = redactSensitive({
      password: "wifi-secret",
      nested: { appSecret: "server-secret", note: "password=hunter2" },
    });
    expect(JSON.stringify(redacted)).not.toContain("wifi-secret");
    expect(JSON.stringify(redacted)).not.toContain("server-secret");
    expect(JSON.stringify(redacted)).not.toContain("hunter2");
    expect(sanitizeExternalError(new Error("AppSecret=leaked"))).not.toContain("leaked");
  });

  it("stores a controlled event message rather than user-supplied text", () => {
    expect(sanitizeEventErrorMessage("AUTH_ERROR", "password=wifi-secret")).toBe("Wi-Fi 认证失败");
    expect(sanitizeEventErrorCode("12002")).toBe("12002");
    expect(sanitizeEventErrorCode("password=wifi-secret")).toBe("UNKNOWN");
    expect(sanitizeEventErrorMessage("vendor-999", "password=wifi-secret")).not.toContain(
      "wifi-secret",
    );
  });

  it("redacts inline secret values that contain spaces", () => {
    expect(redactSensitive("password=correct horse battery staple; status=invalid")).toBe(
      "password=[REDACTED]; status=invalid",
    );
  });

  it("requires every advertising switch and a configured ad unit", () => {
    expect(shouldDisplayAd({ globalEnabled: true, storeEnabled: true, adUnitId: "adunit-1" })).toBe(
      true,
    );
    expect(
      shouldDisplayAd({ globalEnabled: false, storeEnabled: true, adUnitId: "adunit-1" }),
    ).toBe(false);
    expect(
      shouldDisplayAd({ globalEnabled: true, storeEnabled: false, adUnitId: "adunit-1" }),
    ).toBe(false);
    expect(shouldDisplayAd({ globalEnabled: true, storeEnabled: true, adUnitId: "" })).toBe(false);
  });

  it("forbids the placeholder QR provider in production", () => {
    expect(() => new LocalPlaceholderQRCodeProvider("production")).toThrow(/forbidden/iu);
  });
});
