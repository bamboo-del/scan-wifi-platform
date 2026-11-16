import { PublicApiError } from "../platform/public-api";
import type { ConnectViewState } from "./types";

export function lookupFailure(error: unknown): Partial<ConnectViewState> {
  const code = error instanceof PublicApiError ? error.code : "REQUEST_FAILED";
  const invalid = code === "INVALID_CODE" || code === "VALIDATION_ERROR";
  const disabled = code === "SPOT_DISABLED";
  return {
    phase: invalid ? "invalid" : disabled ? "disabled" : "failed",
    configLoading: false,
    hasConfig: false,
    buttonDisabled: invalid || disabled,
    buttonLabel: invalid ? "二维码无效" : disabled ? "WiFi 已暂停" : "重新加载",
    statusTitle: invalid
      ? "无法识别此二维码"
      : disabled
        ? "该 WiFi 暂时不可用"
        : "暂时无法读取 WiFi",
    statusMessage: invalid
      ? "请扫描门店的小程序码。"
      : disabled
        ? "请联系店员恢复网络。"
        : code === "NETWORK_ERROR"
          ? "网络请求失败，请检查手机网络后重试。"
          : "服务暂不可用，请稍后重试。",
    statusTone: "danger",
  };
}
