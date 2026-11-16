import {
  ADMIN_STATUSES,
  CLIENT_PLATFORMS,
  CONNECTION_EVENT_TYPES,
  QR_CODE_STATUSES,
  STORE_STATUSES,
  WIFI_SECURITY_TYPES,
  WIFI_STATUSES,
} from "@scan-wifi/shared-types";
import { z } from "zod";

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value === "" ? null : value));

export const uuidSchema = z.string().uuid();
export const sceneTokenSchema = z.string().regex(/^[a-f0-9]{32}$/u, "sceneToken 格式无效");
export const adminStatusSchema = z.enum(ADMIN_STATUSES);
export const storeStatusSchema = z.enum(STORE_STATUSES);
export const wifiStatusSchema = z.enum(WIFI_STATUSES);
export const qrCodeStatusSchema = z.enum(QR_CODE_STATUSES);
export const connectionEventTypeSchema = z.enum(CONNECTION_EVENT_TYPES);
export const clientPlatformSchema = z.enum(CLIENT_PLATFORMS);

const usernameSchema = z.string().trim().min(3).max(64);

export const loginSchema = z
  .object({
    username: usernameSchema.refine(
      (value) => /^[a-zA-Z0-9._-]+$/u.test(value) || z.string().email().safeParse(value).success,
      "请输入有效的用户名或邮箱",
    ),
    password: z.string().min(10).max(256),
  })
  .strict();

export const paginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(21_474_836).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const createOperatorSchema = loginSchema.extend({
  username: usernameSchema.regex(/^[a-zA-Z0-9._-]+$/u),
});
export const resetPasswordSchema = z.object({ password: loginSchema.shape.password }).strict();
export const changePasswordSchema = z
  .object({
    currentPassword: loginSchema.shape.password,
    newPassword: loginSchema.shape.password,
  })
  .strict();
export const accountStatusSchema = z.object({ status: adminStatusSchema }).strict();
export const transferStoreSchema = z
  .object({
    ownerId: uuidSchema.nullable(),
    reason: z.string().trim().min(1).max(300),
  })
  .strict();

export const storeListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  status: storeStatusSchema.optional(),
});

export const createStoreSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    shortName: optionalTrimmed(60),
    logoUrl: z
      .string()
      .url()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value);
          return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
        } catch {
          return false;
        }
      }, "用户头像必须使用不含账号密码的 HTTP(S) 地址")
      .optional()
      .nullable()
      .or(z.literal("").transform(() => null)),
    address: optionalTrimmed(300),
    contactName: optionalTrimmed(80),
    contactPhone: optionalTrimmed(40),
    status: storeStatusSchema.default("active"),
    adEnabled: z.boolean().default(true),
  })
  .strict();

export const updateStoreSchema = createStoreSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "至少提供一个待更新字段");

export const putWifiSchema = z
  .object({
    ssid: z
      .string()
      .min(1)
      .max(32)
      .refine(
        (value) => new TextEncoder().encode(value).length <= 32,
        "Wi-Fi 名称不能超过 32 字节",
      ),
    password: z.string().max(63),
    bssid: z
      .string()
      .trim()
      .regex(/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/u)
      .optional()
      .nullable(),
    securityType: z.enum(WIFI_SECURITY_TYPES).optional().nullable(),
    status: wifiStatusSchema.default("active"),
  })
  .strict()
  .superRefine((value, context) => {
    const valid =
      value.securityType === "OPEN"
        ? value.password === ""
        : value.securityType === "WEP"
          ? /^(?:[\x20-\x7e]{5}|[\x20-\x7e]{13}|[a-fA-F0-9]{10}|[a-fA-F0-9]{26})$/u.test(
              value.password,
            )
          : value.password.length >= 8;
    if (!valid)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "密码格式与 Wi-Fi 安全类型不匹配",
      });
  });

export const publicEventSchema = z
  .object({
    sceneToken: sceneTokenSchema,
    eventType: connectionEventTypeSchema,
    platform: clientPlatformSchema.default("unknown"),
    errorCode: z.string().trim().max(80).optional().nullable(),
    errorMessage: z.string().trim().max(500).optional().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.eventType !== "connect_failure" && (value.errorCode || value.errorMessage)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "只有连接失败事件可以携带错误信息",
        path: ["errorCode"],
      });
    }
  });

export const statisticsQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from && value.to && Date.parse(value.from) >= Date.parse(value.to)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from 必须早于 to",
        path: ["from"],
      });
    }
  });

export const operationLogQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  action: z.string().trim().max(100).optional(),
  resourceType: z.string().trim().max(80).optional(),
});

export const updateSettingsSchema = z
  .object({
    globalAdEnabled: z.boolean(),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
export type PutWifiInput = z.infer<typeof putWifiSchema>;
export type PublicEventInput = z.infer<typeof publicEventSchema>;
