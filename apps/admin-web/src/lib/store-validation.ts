import type { StoreStatus, WifiStatus } from "@/lib/types";
import type { EditableWifiSecurityType } from "@/lib/wifi-security";

export interface StoreDraft {
  name: string;
  shortName: string;
  logoUrl: string;
  address: string;
  contactName: string;
  contactPhone: string;
  notes: string;
  adEnabled: boolean;
  status: StoreStatus;
  ssid: string;
  bssid: string;
  securityType: EditableWifiSecurityType;
  wifiStatus: WifiStatus;
  newPassword: string;
  confirmPassword: string;
}

export type StoreDraftErrors = Partial<Record<keyof StoreDraft, string>>;

const PHONE_PATTERN = /^[+\d][\d\s-]{5,19}$/;
const BSSID_PATTERN = /^(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

export function validateStoreDraft(
  draft: StoreDraft,
  options: { requireWifiPassword: boolean },
): StoreDraftErrors {
  const errors: StoreDraftErrors = {};

  if (!draft.name.trim()) errors.name = "请输入门店名称";
  if (draft.contactPhone.trim() && !PHONE_PATTERN.test(draft.contactPhone.trim())) {
    errors.contactPhone = "请输入有效的联系电话";
  }
  if (!draft.ssid.trim()) errors.ssid = "请输入 Wi-Fi 名称";
  if (draft.bssid.trim() && !BSSID_PATTERN.test(draft.bssid.trim())) {
    errors.bssid = "请输入有效的 BSSID，例如 AA:BB:CC:DD:EE:FF";
  }
  if (draft.notes.length > 200) errors.notes = "备注不能超过 200 个字符";

  if (options.requireWifiPassword || draft.newPassword.length > 0) {
    if (draft.newPassword.length < 8) {
      errors.newPassword = "新密码至少 8 个字符";
    }
    if (draft.newPassword !== draft.confirmPassword) {
      errors.confirmPassword = "两次输入的密码不一致";
    }
  }

  return errors;
}

export function hasValidationErrors(errors: StoreDraftErrors): boolean {
  return Object.keys(errors).length > 0;
}
