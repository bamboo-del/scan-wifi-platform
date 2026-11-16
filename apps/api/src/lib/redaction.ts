const SENSITIVE_KEY =
  /(pass(word)?|secret|token|authorization|cookie|encrypted|auth.?tag|session|credential|app.?secret)/iu;
const INLINE_SECRET =
  /(password|passwd|pwd|secret|token|authorization|cookie)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^,;&\r\n]*)/giu;

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[DEPTH_LIMIT]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string")
    return value.replace(INLINE_SECRET, "$1=[REDACTED]").slice(0, 2_000);
  if (Array.isArray(value))
    return value.slice(0, 100).map((entry) => redactSensitive(entry, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value).slice(0, 100)) {
      output[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitive(entry, depth + 1);
    }
    return output;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.description ?? "[SYMBOL]";
  if (typeof value === "function") return "[FUNCTION]";
  return "[UNSUPPORTED]";
}

export function sanitizeExternalError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "AbortError" ? "上游服务请求超时" : "上游服务暂时不可用";
  }
  return "上游服务暂时不可用";
}

const SAFE_EVENT_ERRORS: Record<string, string> = {
  WIFI_DISABLED: "设备 Wi-Fi 未开启",
  PERMISSION_DENIED: "用户未授予 Wi-Fi 权限",
  UNSUPPORTED: "当前设备或系统不支持该能力",
  AUTH_ERROR: "Wi-Fi 认证失败",
  TIMEOUT: "连接 Wi-Fi 超时",
  NETWORK_NOT_FOUND: "未找到目标 Wi-Fi",
};

const SAFE_EVENT_ERROR_CODES = new Set([
  ...Object.keys(SAFE_EVENT_ERRORS),
  "12000",
  "12001",
  "12002",
  "12003",
  "12004",
  "12005",
  "12006",
  "12007",
  "12008",
  "12009",
  "12010",
  "12011",
  "12013",
  "12014",
  "ADAPTER_DISABLED",
  "API_UNAVAILABLE",
  "CLIENT_TIMEOUT",
  "CANCELLED",
  "UNKNOWN",
]);

export function sanitizeEventErrorCode(errorCode: string | null | undefined): string | null {
  if (!errorCode) return null;
  const normalized = errorCode.trim().toUpperCase().slice(0, 80);
  return SAFE_EVENT_ERROR_CODES.has(normalized) ? normalized : "UNKNOWN";
}

export function sanitizeEventErrorMessage(
  errorCode: string | null | undefined,
  suppliedMessage: string | null | undefined,
): string | null {
  const normalized = sanitizeEventErrorCode(errorCode);
  if (normalized) {
    return SAFE_EVENT_ERRORS[normalized] ?? "客户端连接失败（详情已省略）";
  }
  return suppliedMessage ? "客户端连接失败（详情已省略）" : null;
}
