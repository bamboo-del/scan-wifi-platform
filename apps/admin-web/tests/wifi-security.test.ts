import { describe, expect, it } from "vitest";

import {
  formatWifiSecurityType,
  isEditableWifiSecurityType,
  toEditableWifiSecurityType,
} from "@/lib/wifi-security";

describe("Wi-Fi security type helpers", () => {
  it("keeps canonical values separate from their display labels", () => {
    expect(isEditableWifiSecurityType("WPA2_WPA3")).toBe(true);
    expect(isEditableWifiSecurityType("WPA2/WPA3 Personal")).toBe(false);
    expect(formatWifiSecurityType("WPA2_WPA3")).toBe("WPA2/WPA3 Personal");
  });

  it("preserves less common canonical values returned by the API", () => {
    expect(toEditableWifiSecurityType("WPA")).toBe("WPA");
    expect(toEditableWifiSecurityType("WEP")).toBe("WEP");
    expect(toEditableWifiSecurityType("OPEN")).toBe("OPEN");
  });
});
