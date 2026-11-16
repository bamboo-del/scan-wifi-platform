import { describe, expect, it, vi } from "vitest";

import {
  getWifiDiagnosticsEnvironment,
  isWifiDiagnosticsEnvironment,
} from "../src/core/wifi-diagnostics-environment";

describe("Wi-Fi diagnostics environment guard", () => {
  it.each(["develop", "trial"])("allows the %s environment", (envVersion) => {
    const api = { getAccountInfoSync: () => ({ miniProgram: { envVersion } }) };
    expect(getWifiDiagnosticsEnvironment(api)).toBe(envVersion);
    expect(isWifiDiagnosticsEnvironment(api)).toBe(true);
  });

  it.each(["release", "unknown-channel"])("denies the %s environment", (envVersion) => {
    const api = { getAccountInfoSync: () => ({ miniProgram: { envVersion } }) };
    expect(isWifiDiagnosticsEnvironment(api)).toBe(false);
  });

  it("fails closed when account information is unavailable", () => {
    const api = {
      getAccountInfoSync: vi.fn((): never => {
        throw new Error("unavailable");
      }),
    };
    expect(getWifiDiagnosticsEnvironment({})).toBe("unknown");
    expect(getWifiDiagnosticsEnvironment(api)).toBe("unknown");
    expect(isWifiDiagnosticsEnvironment({})).toBe(false);
  });
});
