import type { DocumentedWifiErrorCode, NormalizedWifiError, WifiInternalErrorCode } from "./types";

const DOCUMENTED_ERROR_CODES = new Set<number>([
  12000, 12001, 12002, 12003, 12004, 12005, 12006, 12007, 12008, 12009, 12010, 12011, 12013, 12014,
]);

const DOCUMENTED_ERRORS: Readonly<Record<DocumentedWifiErrorCode, NormalizedWifiError>> = {
  12000: {
    code: 12000,
    phase: "failed",
    title: "Wi-Fi 初始化未完成",
    message: "请稍后重新连接。",
  },
  12001: {
    code: 12001,
    phase: "unsupported",
    title: "当前设备暂不支持",
    message: "请使用系统 Wi-Fi 设置手动连接用户网络。",
  },
  12002: {
    code: 12002,
    phase: "failed",
    title: "Wi-Fi 密码可能不正确",
    message: "用户 Wi-Fi 密码可能已更新，请联系管理员确认后重新连接。",
  },
  12003: {
    code: 12003,
    phase: "failed",
    title: "连接超时",
    message: "请靠近用户路由器后重新连接。",
  },
  12004: {
    code: 12004,
    phase: "failed",
    title: "正在处理其他连接",
    message: "请稍等片刻后重新连接。",
  },
  12005: {
    code: 12005,
    phase: "wifi_disabled",
    title: "手机 Wi-Fi 未开启",
    message: "请先打开手机 Wi-Fi 开关，再重新连接。",
  },
  12006: {
    code: 12006,
    phase: "failed",
    title: "定位服务未开启",
    message: "Android 设备请先打开系统定位服务，再重新连接。",
  },
  12007: {
    code: 12007,
    phase: "permission_denied",
    title: "未获得连接权限",
    message: "请在系统设置中允许微信使用无线局域网相关权限。",
  },
  12008: {
    code: 12008,
    phase: "failed",
    title: "未找到用户网络",
    message: "请确认您在无线网络覆盖范围内，并靠近无线网络设备。",
  },
  12009: {
    code: 12009,
    phase: "failed",
    title: "系统拒绝了网络配置",
    message: "请在系统 Wi-Fi 设置中手动选择用户网络。",
  },
  12010: {
    code: 12010,
    phase: "failed",
    title: "系统暂时无法连接",
    message: "请稍后重试，或使用系统 Wi-Fi 设置手动连接。",
  },
  12011: {
    code: 12011,
    phase: "failed",
    title: "请返回小程序后重试",
    message: "小程序处于后台时无法配置 Wi-Fi。",
  },
  12013: {
    code: 12013,
    phase: "failed",
    title: "旧网络配置已过期",
    message: "请在系统设置中忽略该网络，再返回重新连接。",
  },
  12014: {
    code: 12014,
    phase: "failed",
    title: "Wi-Fi 密码无效",
    message: "iOS 无法使用当前 Wi-Fi 密码，请联系管理员确认网络配置。",
  },
};

const INTERNAL_ERRORS: Readonly<Record<WifiInternalErrorCode, NormalizedWifiError>> = {
  adapter_disabled: {
    code: "adapter_disabled",
    phase: "unsupported",
    title: "自动连接暂未开放",
    message: "该能力需完成当前小程序真机验证后由平台开启。",
  },
  api_unavailable: {
    code: "api_unavailable",
    phase: "unsupported",
    title: "当前版本暂不支持",
    message: "请使用系统 Wi-Fi 设置手动连接用户网络。",
  },
  client_timeout: {
    code: "client_timeout",
    phase: "failed",
    title: "连接等待时间过长",
    message: "请确认 Wi-Fi 已开启并靠近用户路由器，然后重新连接。",
  },
  cancelled: {
    code: "cancelled",
    phase: "failed",
    title: "连接已取消",
    message: "请重新发起连接。",
  },
  unknown: {
    code: "unknown",
    phase: "failed",
    title: "连接未完成",
    message: "请确认手机 Wi-Fi 已开启，然后重新连接。",
  },
};

function readDocumentedCode(error: unknown): DocumentedWifiErrorCode | null {
  if (typeof error !== "object" || error === null || !("errCode" in error)) {
    return null;
  }

  const errCode = error.errCode;
  if (typeof errCode !== "number" || !DOCUMENTED_ERROR_CODES.has(errCode)) {
    return null;
  }

  return errCode as DocumentedWifiErrorCode;
}

export function normalizeWifiError(error: unknown): NormalizedWifiError {
  const code = readDocumentedCode(error);
  return code === null ? INTERNAL_ERRORS.unknown : DOCUMENTED_ERRORS[code];
}

export function getInternalWifiError(code: WifiInternalErrorCode): NormalizedWifiError {
  return INTERNAL_ERRORS[code];
}
