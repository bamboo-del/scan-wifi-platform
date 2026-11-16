import type { StoreStatus, WifiStatus } from "@/lib/types";
import type { EditableWifiSecurityType } from "@/lib/wifi-security";

export interface StoreDraft {
  name: string;
  shortName: string;
  logoUrl: string;
  address: string;
  contactName: string;
  contactPhone: string;
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

  if (!draft.name.trim()) errors.name = "请输入用户名称";
  if (draft.logoUrl.trim()) {
    try {
      const url = new URL(draft.logoUrl.trim());
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        errors.logoUrl = "请输入不含用户名或密码的 HTTP(S) 图片地址";
      }
    } catch {
      errors.logoUrl = "请输入有效的 HTTP(S) 图片地址";
    }
  }
  if (draft.contactPhone.trim() && !PHONE_PATTERN.test(draft.contactPhone.trim())) {
    errors.contactPhone = "请输入有效的联系电话";
  }
  if (!draft.ssid) errors.ssid = "请输入 Wi-Fi 名称";
  else if (new TextEncoder().encode(draft.ssid).length > 32) {
    errors.ssid = "Wi-Fi 名称不能超过 32 字节（中文通常占 3 字节）";
  }
  if (draft.bssid.trim() && !BSSID_PATTERN.test(draft.bssid.trim())) {
    errors.bssid = "请输入有效的 BSSID，例如 AA:BB:CC:DD:EE:FF";
  }

  if (options.requireWifiPassword || draft.newPassword.length > 0) {
    if (draft.securityType === "OPEN") {
      if (draft.newPassword) errors.newPassword = "开放网络的密码必须留空";
    } else if (draft.securityType === "WEP") {
      if (
        !/^(?:[\x20-\x7E]{5}|[\x20-\x7E]{13}|[\da-fA-F]{10}|[\da-fA-F]{26})$/.test(
          draft.newPassword,
        )
      ) {
        errors.newPassword = "WEP 密码须为 5/13 个 ASCII 字符或 10/26 位十六进制字符";
      }
    } else if (draft.newPassword.length < 8) {
      errors.newPassword = "新密码至少 8 个字符";
    } else if (draft.newPassword.length > 63) {
      errors.newPassword = "新密码不能超过 63 个字符";
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
