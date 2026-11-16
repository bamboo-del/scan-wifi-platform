import { z } from "zod";
import { isIP } from "node:net";

const booleanFromEnvironment = z.enum(["true", "false"]).transform((value) => value === "true");
const adminUsernameSchema = z
  .string()
  .min(3)
  .max(64)
  .refine(
    (value) => /^[a-zA-Z0-9._-]+$/u.test(value) || z.string().email().safeParse(value).success,
  );
const adminOriginSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, "管理后台来源必须是 HTTP(S) origin，不能包含凭证、路径、查询或片段")
  .transform((value) => new URL(value).origin);

function isPlaceholderHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/\.$/u, "");
  return (
    hostname === "example.cn" ||
    hostname.endsWith(".example.cn") ||
    hostname === "example.com" ||
    hostname.endsWith(".example.com") ||
    hostname === "localhost"
  );
}

const databaseUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "数据库连接必须使用 postgres:// 或 postgresql://",
  );

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
    TRUST_PROXY_ADDRESSES: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((address) => address.trim())
          .filter(Boolean),
      )
      .refine(
        (addresses) =>
          addresses.every((address) => {
            const [ip = "", prefix, extra] = address.split("/");
            const version = isIP(ip);
            return (
              version !== 0 &&
              extra === undefined &&
              (prefix === undefined ||
                (/^\d+$/u.test(prefix) &&
                  Number(prefix) >= 1 &&
                  Number(prefix) <= (version === 4 ? 32 : 128)))
            );
          }),
        "可信代理必须使用明确的 IP 或 CIDR（不能信任全部地址）",
      ),
    ADMIN_WEB_ORIGIN: adminOriginSchema.default("http://localhost:5173"),
    COOKIE_SECURE: booleanFromEnvironment.default("false"),
    DATABASE_URL: databaseUrlSchema,
    MIGRATION_DATABASE_URL: databaseUrlSchema.optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    WIFI_ENCRYPTION_KEY_BASE64: z.string().refine((value) => {
      try {
        return Buffer.from(value, "base64").length === 32;
      } catch {
        return false;
      }
    }, "WIFI_ENCRYPTION_KEY_BASE64 必须是恰好 32 字节的 base64"),
    SESSION_SECRET: z.string().min(32),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    INITIAL_ADMIN_USERNAME: adminUsernameSchema.default("admin"),
    INITIAL_ADMIN_PASSWORD: z.string().min(10).max(256).optional(),
    WECHAT_APP_ID: z.string().optional().default(""),
    WECHAT_APP_SECRET: z.string().optional().default(""),
    WECHAT_QR_PAGE: z.string().min(1).default("pages/connect/index"),
    WECHAT_ENV_VERSION: z.enum(["release", "trial", "develop"]).default("develop"),
    QR_CODE_PROVIDER: z.enum(["wechat", "local-placeholder"]).default("local-placeholder"),
    QR_CODE_STORAGE_DIR: z.string().min(1).default("./storage/qrcodes"),
    MINIPROGRAM_ENABLE_LEGACY_WIFI_API: booleanFromEnvironment.default("false"),
    MINIPROGRAM_AD_UNIT_ID: z.string().optional().default(""),
    MINIPROGRAM_BRAND_NAME: z.string().min(1).default("轻连 WiFi"),
  })
  .superRefine((value, context) => {
    if (value.TRUST_PROXY_HOPS > 0 && value.TRUST_PROXY_ADDRESSES.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TRUST_PROXY_ADDRESSES"],
        message: "启用代理时必须配置明确的可信代理地址",
      });
    }
    if (value.NODE_ENV === "production" && !value.COOKIE_SECURE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "生产环境必须启用 Secure Cookie",
        path: ["COOKIE_SECURE"],
      });
    }
    if (value.NODE_ENV === "production" && !value.ADMIN_WEB_ORIGIN.startsWith("https://")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "生产环境管理后台来源必须使用 HTTPS",
        path: ["ADMIN_WEB_ORIGIN"],
      });
    }
    if (value.NODE_ENV === "production") {
      try {
        if (isPlaceholderHostname(new URL(value.ADMIN_WEB_ORIGIN).hostname)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "生产环境管理后台来源不能使用 example 或 localhost 占位域名",
            path: ["ADMIN_WEB_ORIGIN"],
          });
        }
      } catch {
        // URL syntax is already validated by the field schema.
      }
    }
    if (value.NODE_ENV === "production" && value.WECHAT_ENV_VERSION !== "release") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "生产环境微信小程序码必须使用 release 版本",
        path: ["WECHAT_ENV_VERSION"],
      });
    }
    if (value.NODE_ENV === "production" && value.QR_CODE_PROVIDER === "local-placeholder") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "生产环境禁止使用本地占位二维码提供器",
        path: ["QR_CODE_PROVIDER"],
      });
    }
    if (value.QR_CODE_PROVIDER === "wechat" && (!value.WECHAT_APP_ID || !value.WECHAT_APP_SECRET)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "微信二维码提供器需要 WECHAT_APP_ID 和 WECHAT_APP_SECRET",
        path: ["WECHAT_APP_ID"],
      });
    }
    if (
      value.NODE_ENV === "production" &&
      (value.WECHAT_APP_ID === "touristappid" ||
        value.WECHAT_APP_ID === "testappid" ||
        !/^wx[A-Za-z0-9]{16}$/u.test(value.WECHAT_APP_ID))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "生产环境必须使用正式微信小程序 AppID",
        path: ["WECHAT_APP_ID"],
      });
    }
  });

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(source);
}

const migrationEnvironmentSchema = z
  .object({
    MIGRATION_DATABASE_URL: databaseUrlSchema.optional(),
    DATABASE_URL: databaseUrlSchema.optional(),
  })
  .superRefine((value, context) => {
    if (!value.MIGRATION_DATABASE_URL && !value.DATABASE_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "必须提供 MIGRATION_DATABASE_URL；本地可回退到 DATABASE_URL",
        path: ["MIGRATION_DATABASE_URL"],
      });
    }
  })
  .transform((value) => ({
    databaseUrl: value.MIGRATION_DATABASE_URL ?? value.DATABASE_URL!,
    poolMax: 1,
  }));

const adminInitEnvironmentSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(5).default(2),
  INITIAL_ADMIN_USERNAME: adminUsernameSchema.default("admin"),
  INITIAL_ADMIN_PASSWORD: z.string().min(10).max(256),
});

export type MigrationConfig = z.infer<typeof migrationEnvironmentSchema>;
export type AdminInitConfig = z.infer<typeof adminInitEnvironmentSchema>;

export function loadMigrationConfig(source: NodeJS.ProcessEnv = process.env): MigrationConfig {
  return migrationEnvironmentSchema.parse(source);
}

export function loadAdminInitConfig(source: NodeJS.ProcessEnv = process.env): AdminInitConfig {
  return adminInitEnvironmentSchema.parse(source);
}

export { adminInitEnvironmentSchema, environmentSchema, migrationEnvironmentSchema };
