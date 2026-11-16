import type { AppConfig } from "@scan-wifi/config";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { createDatabase } from "./db/client.js";
import { AppError } from "./lib/errors.js";
import {
  PostgresPlatformRepository,
  type PlatformRepository,
} from "./repositories/platform-repository.js";
import { registerAdminRoutes } from "./routes/admin-routes.js";
import { registerPublicRoutes } from "./routes/public-routes.js";
import { AuditService } from "./services/audit-service.js";
import { AuthService } from "./services/auth-service.js";
import { EncryptionService } from "./services/encryption-service.js";
import { LoginThrottle } from "./services/login-throttle.js";
import { PasswordService, type PasswordHasher } from "./services/password-service.js";
import { PublicConnectService } from "./services/public-connect-service.js";
import {
  LocalPlaceholderQRCodeProvider,
  WeChatAccessTokenCache,
  WeChatQRCodeProvider,
  type QrCodeProvider,
} from "./services/qrcode-provider.js";
import { QrCodeService } from "./services/qrcode-service.js";
import { LocalFileQrCodeStorage, type QrCodeStorage } from "./services/qrcode-storage.js";
import { SettingsService } from "./services/settings-service.js";
import { StatisticsService } from "./services/statistics-service.js";
import { MerchantService } from "./services/merchant-service.js";
import { StoreService } from "./services/store-service.js";
import {
  MerchantAuthService,
  WechatCodeLoginProvider,
  type WechatLoginProvider,
} from "./services/merchant-auth-service.js";
import { WifiSpotService } from "./services/wifi-spot-service.js";
import { registerMerchantRoutes } from "./routes/merchant-routes.js";

export interface ApplicationDependencies {
  wechatLoginProvider?: WechatLoginProvider;
  repository?: PlatformRepository;
  qrCodeProvider?: QrCodeProvider;
  qrCodeStorage?: QrCodeStorage;
  passwordService?: PasswordHasher;
  logger?: boolean;
  eventRateLimitMax?: number;
}

function createQrCodeProvider(config: AppConfig): QrCodeProvider {
  if (config.QR_CODE_PROVIDER === "local-placeholder")
    return new LocalPlaceholderQRCodeProvider(config.NODE_ENV);
  const tokens = new WeChatAccessTokenCache(config.WECHAT_APP_ID, config.WECHAT_APP_SECRET);
  return new WeChatQRCodeProvider(tokens, config.WECHAT_QR_PAGE, config.WECHAT_ENV_VERSION);
}

function statusCodeOf(error: unknown): number | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("statusCode" in error) ||
    typeof error.statusCode !== "number"
  )
    return undefined;
  return error.statusCode;
}

export async function buildApplication(
  config: AppConfig,
  dependencies: ApplicationDependencies = {},
): Promise<FastifyInstance> {
  const loggerEnabled = dependencies.logger ?? config.NODE_ENV !== "test";
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false } },
    trustProxy: config.TRUST_PROXY_HOPS === 0 ? false : config.TRUST_PROXY_HOPS,
    logger: loggerEnabled
      ? {
          level: config.NODE_ENV === "production" ? "info" : "debug",
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "res.headers.set-cookie",
              "body.password",
              "body.wifi.password",
              "password",
              "*.password",
            ],
            censor: "[REDACTED]",
          },
        }
      : false,
    bodyLimit: 32 * 1024,
    requestTimeout: 15_000,
    keepAliveTimeout: 72_000,
  });
  app.decorateRequest("admin", null);

  let repository = dependencies.repository;
  if (!repository) {
    const connection = createDatabase(config);
    repository = new PostgresPlatformRepository(connection.db);
    app.addHook("onClose", async () => connection.close());
  }

  await app.register(cookie);
  await app.register(cors, {
    origin: config.ADMIN_WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept"],
    maxAge: 600,
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    ban: 3,
    errorResponseBuilder: (_request, context) =>
      new AppError(context.statusCode, "RATE_LIMITED", "请求过于频繁，请稍后再试"),
  });
  if (config.NODE_ENV !== "production") {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "门店免费扫码连接 Wi-Fi API",
          description: "平台管理员与匿名小程序连接 API。管理接口使用 HttpOnly Cookie 会话。",
          version: "0.1.0",
        },
        tags: [
          { name: "管理员认证" },
          { name: "门店" },
          { name: "Wi-Fi" },
          { name: "小程序码" },
          { name: "统计" },
          { name: "审计" },
          { name: "设置" },
          { name: "顾客端" },
        ],
      },
    });
    await app.register(swaggerUi, {
      routePrefix: "/documentation",
      uiConfig: { docExpansion: "list", deepLinking: false },
    });
  }

  const audit = new AuditService(repository);
  const encryption = new EncryptionService(config.WIFI_ENCRYPTION_KEY_BASE64);
  const passwords = dependencies.passwordService ?? new PasswordService();
  const auth = new AuthService(
    repository,
    passwords,
    audit,
    new LoginThrottle(),
    config.SESSION_SECRET,
    config.SESSION_TTL_HOURS,
  );
  const storeService = new StoreService(repository, encryption, audit);
  const qrCodeService = new QrCodeService(
    repository,
    dependencies.qrCodeProvider ?? createQrCodeProvider(config),
    dependencies.qrCodeStorage ?? new LocalFileQrCodeStorage(config.QR_CODE_STORAGE_DIR),
    audit,
  );
  const publicService = new PublicConnectService(repository, encryption, config);
  const statistics = new StatisticsService(repository);
  const settings = new SettingsService(repository, audit, config);

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请求参数无效",
          requestId: request.id,
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }
    if (error instanceof AppError) {
      const envelope = {
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      };
      return reply.code(error.statusCode).send(envelope);
    }
    const statusCode = statusCodeOf(error);
    if (statusCode === 429) {
      return reply.code(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "请求过于频繁，请稍后再试",
          requestId: request.id,
        },
      });
    }
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply
        .code(statusCode)
        .send({ error: { code: "BAD_REQUEST", message: "请求无法处理", requestId: request.id } });
    }
    request.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError", requestId: request.id },
      "Unhandled request failure",
    );
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "服务器暂时无法处理请求", requestId: request.id },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply
      .code(404)
      .send({ error: { code: "ROUTE_NOT_FOUND", message: "接口不存在", requestId: request.id } });
  });

  await app.register(
    async (merchantApp) =>
      registerMerchantRoutes(
        merchantApp,
        new MerchantAuthService(
          repository,
          dependencies.wechatLoginProvider ??
            new WechatCodeLoginProvider(config.WECHAT_APP_ID, config.WECHAT_APP_SECRET),
          config.SESSION_SECRET,
        ),
        new WifiSpotService(repository, encryption, qrCodeService),
      ),
    { prefix: "/api/merchant" },
  );

  app.get("/health", { schema: { hide: true } }, async (_request, reply) => {
    try {
      await repository.healthCheck();
      return {
        status: "ok",
        checks: { database: "ok" },
        time: new Date().toISOString(),
      };
    } catch {
      return reply.code(503).send({
        status: "unavailable",
        checks: { database: "failed" },
        time: new Date().toISOString(),
      });
    }
  });
  await app.register(
    async (adminApp) =>
      registerAdminRoutes(
        adminApp,
        {
          auth,
          stores: storeService,
          qrCodes: qrCodeService,
          statistics,
          settings,
          merchants: new MerchantService(repository, audit),
        },
        config,
      ),
    { prefix: "/api/admin" },
  );
  await app.register(
    async (publicApp) =>
      registerPublicRoutes(publicApp, publicService, dependencies.eventRateLimitMax ?? 30),
    {
      prefix: "/api/public",
    },
  );

  return app;
}
