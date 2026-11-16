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

export const loginSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/u),
    password: z.string().min(10).max(256),
  })
  .strict();

export const paginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const storeListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  status: storeStatusSchema.optional(),
});

export const createStoreSchema = z
  .object({
    merchantId: uuidSchema.optional(),
    name: z.string().trim().min(1).max(120),
    shortName: optionalTrimmed(60),
    logoUrl: z
      .string()
      .url()
      .max(2048)
      .optional()
      .nullable()
      .or(z.literal("").transform(() => null)),
    address: optionalTrimmed(300),
    contactName: optionalTrimmed(80),
    contactPhone: optionalTrimmed(40),
    notes: optionalTrimmed(2000),
    status: storeStatusSchema.default("active"),
    adEnabled: z.boolean().default(false),
  })
  .strict();

export const updateStoreSchema = createStoreSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "至少提供一个待更新字段");

export const putWifiSchema = z
  .object({
    spotName: z.string().trim().max(80).optional(),
    ssid: z.string().trim().min(1).max(32),
    password: z.string().min(8).max(63),
    bssid: z
      .string()
      .trim()
      .regex(/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/u)
      .optional()
      .nullable(),
    securityType: z.enum(WIFI_SECURITY_TYPES).optional().nullable(),
    status: wifiStatusSchema.default("active"),
  })
  .strict();

export const publicEventSchema = z
  .object({
    sceneToken: sceneTokenSchema,
    visitorId: z
      .string()
      .regex(/^[a-f0-9]{32}$/u)
      .optional(),
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

export const merchantSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    contact: optionalTrimmed(120),
    status: storeStatusSchema.default("active"),
  })
  .strict();
export const updateMerchantSchema = merchantSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "至少提供一个待更新字段");
export const wifiStatusUpdateSchema = z.object({ status: wifiStatusSchema }).strict();
export const analyticsQuerySchema = z
  .object({
    merchantId: uuidSchema.optional(),
    storeId: uuidSchema.optional(),
    wifiId: uuidSchema.optional(),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine(
    (value) =>
      Date.parse(value.from) < Date.parse(value.to) &&
      Date.parse(value.to) - Date.parse(value.from) <= 366 * 86400000,
    "请选择不超过一年的有效时间范围",
  );
export type MerchantInput = z.infer<typeof merchantSchema>;
export type UpdateMerchantInput = z.infer<typeof updateMerchantSchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const wifiSpotSchema = putWifiSchema.extend({ shopName: z.string().trim().min(1).max(120) });
export type WifiSpotInput = z.infer<typeof wifiSpotSchema>;
export const wechatLoginSchema = z.object({ code: z.string().min(1).max(256) }).strict();
