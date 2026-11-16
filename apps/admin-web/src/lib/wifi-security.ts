import { WIFI_SECURITY_TYPES, type WifiSecurityType } from "@scan-wifi/shared-types";

export type EditableWifiSecurityType = WifiSecurityType;

export const WIFI_SECURITY_TYPE_OPTIONS: ReadonlyArray<{
  value: EditableWifiSecurityType;
  label: string;
}> = [
  { value: "WPA2_WPA3", label: "WPA2/WPA3 Personal" },
  { value: "WPA2", label: "WPA2 Personal" },
  { value: "WPA3", label: "WPA3 Personal" },
];

export function isEditableWifiSecurityType(value: string): value is EditableWifiSecurityType {
  return (WIFI_SECURITY_TYPES as readonly string[]).includes(value);
}

export function toEditableWifiSecurityType(
  value: WifiSecurityType | null,
): EditableWifiSecurityType {
  return value ?? "WPA2_WPA3";
}

export function formatWifiSecurityType(value: WifiSecurityType | null): string {
  return WIFI_SECURITY_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value ?? "—";
}
