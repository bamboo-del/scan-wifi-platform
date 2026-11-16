import type { AppConfig } from "@scan-wifi/config";
import {
  accountStatusSchema,
  changePasswordSchema,
  createOperatorSchema,
  resetPasswordSchema,
  transferStoreSchema,
  createStoreSchema,
  loginSchema,
  operationLogQuerySchema,
  putWifiSchema,
  statisticsQuerySchema,
  storeListQuerySchema,
  updateSettingsSchema,
  updateStoreSchema,
  uuidSchema,
} from "@scan-wifi/validation";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { forbidden } from "../lib/errors.js";
import { requirePlatformAdmin } from "../services/access-service.js";
import type { AccountService } from "../services/account-service.js";
import type { AuthService } from "../services/auth-service.js";
import type { QrCodeService } from "../services/qrcode-service.js";
import type { SettingsService } from "../services/settings-service.js";
import type { StatisticsService } from "../services/statistics-service.js";
import type { StoreService } from "../services/store-service.js";
import { errorResponseSchema, requireAdmin, uuidParamsSchema } from "./route-utils.js";

const SESSION_COOKIE = "scan_wifi_admin_session";
const idParams = z.object({ id: uuidSchema }).strict();

export interface AdminRouteServices {
  auth: AuthService;
  accounts: AccountService;
  stores: StoreService;
  qrCodes: QrCodeService;
  statistics: StatisticsService;
  settings: SettingsService;
}

function cookieOptions(config: AppConfig) {
  return {
    path: "/api/admin",
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "strict" as const,
    maxAge: config.SESSION_TTL_HOURS * 60 * 60,
  };
}

export function registerAdminRoutes(
  app: FastifyInstance,
  services: AdminRouteServices,
  config: AppConfig,
): Promise<void> {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store, private, max-age=0");
    return payload;
  });
  const authenticate = async (request: FastifyRequest): Promise<void> => {
    const session = await services.auth.authenticate(request.cookies[SESSION_COOKIE]);
    request.admin = {
      id: session.adminId,
      username: session.adminUsername,
      role: session.adminRole,
      expiresAt: session.expiresAt,
    };
  };
  const verifyOrigin = async (request: FastifyRequest): Promise<void> => {
    await Promise.resolve();
    if (request.method === "GET" || request.method === "HEAD") return;
    const origin = request.headers.origin;
    if (origin && origin !== config.ADMIN_WEB_ORIGIN) {
      throw forbidden("请求来源无效");
    }
  };

  app.post(
    "/auth/login",
    {
      preHandler: verifyOrigin,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["管理员认证"],
        summary: "管理员登录",
        body: {
          type: "object",
          additionalProperties: false,
          required: ["username", "password"],
          properties: { username: { type: "string" }, password: { type: "string", minLength: 10 } },
        },
        response: { 400: errorResponseSchema, 401: errorResponseSchema, 429: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const throttleKey = `${request.ip}:${input.username.toLowerCase()}`;
      const session = await services.auth.login(input, throttleKey);
      reply.header("Cache-Control", "no-store");
      reply.setCookie(SESSION_COOKIE, session.cookieValue, cookieOptions(config));
      return session.response;
    },
  );

  app.get(
    "/auth/session",
    {
      preHandler: authenticate,
      schema: {
        tags: ["管理员认证"],
        summary: "检查管理员登录状态",
        response: { 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const admin = requireAdmin(request);
      reply.header("Cache-Control", "no-store");
      return {
        authenticated: true as const,
        admin: { id: admin.id, username: admin.username, role: admin.role },
        expiresAt: admin.expiresAt.toISOString(),
      };
    },
  );

  app.post(
    "/auth/logout",
    {
      preHandler: [authenticate, verifyOrigin],
      schema: { tags: ["管理员认证"], summary: "管理员退出" },
    },
    async (request, reply) => {
      await services.auth.logout(request.cookies[SESSION_COOKIE], requireAdmin(request).id);
      reply.clearCookie(SESSION_COOKIE, cookieOptions(config));
      return reply.code(204).send();
    },
  );

  app.post(
    "/auth/password",
    { preHandler: [authenticate, verifyOrigin] },
    async (request, reply) => {
      await services.accounts.changePassword(
        changePasswordSchema.parse(request.body),
        requireAdmin(request),
      );
      reply.clearCookie(SESSION_COOKIE, cookieOptions(config));
      return reply.code(204).send();
    },
  );
  app.get("/accounts", { preHandler: authenticate }, async (request) =>
    services.accounts.list(requireAdmin(request)),
  );
  app.post("/accounts", { preHandler: [authenticate, verifyOrigin] }, async (request, reply) =>
    reply
      .code(201)
      .send(
        await services.accounts.create(
          createOperatorSchema.parse(request.body),
          requireAdmin(request),
        ),
      ),
  );
  app.patch(
    "/accounts/:id/status",
    { preHandler: [authenticate, verifyOrigin], schema: { params: uuidParamsSchema } },
    async (request) =>
      services.accounts.update(
        idParams.parse(request.params).id,
        accountStatusSchema.parse(request.body),
        requireAdmin(request),
      ),
  );
  app.post(
    "/accounts/:id/password",
    { preHandler: [authenticate, verifyOrigin], schema: { params: uuidParamsSchema } },
    async (request) =>
      services.accounts.update(
        idParams.parse(request.params).id,
        resetPasswordSchema.parse(request.body),
        requireAdmin(request),
      ),
  );
  app.post(
    "/stores/:id/transfer",
    { preHandler: [authenticate, verifyOrigin], schema: { params: uuidParamsSchema } },
    async (request, reply) => {
      await services.accounts.transfer(
        idParams.parse(request.params).id,
        transferStoreSchema.parse(request.body),
        requireAdmin(request),
      );
      return reply.code(204).send();
    },
  );

  app.get(
    "/stores",
    {
      preHandler: authenticate,
      schema: { tags: ["用户"], summary: "用户列表", response: { 401: errorResponseSchema } },
    },
    async (request) => {
      const query = storeListQuerySchema.parse(request.query);
      return services.stores.list(
        {
          page: query.page,
          pageSize: query.pageSize,
          ...(query.search === undefined ? {} : { search: query.search }),
          ...(query.status === undefined ? {} : { status: query.status }),
        },
        requireAdmin(request),
      );
    },
  );

  app.post(
    "/stores",
    {
      preHandler: [authenticate, verifyOrigin],
      schema: {
        tags: ["用户"],
        summary: "创建用户",
        response: {
          201: { type: "object", additionalProperties: true },
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await services.stores.create(
            createStoreSchema.parse(request.body),
            requireAdmin(request),
          ),
        ),
  );

  app.get(
    "/stores/:id",
    {
      preHandler: authenticate,
      schema: { tags: ["用户"], summary: "用户详情", params: uuidParamsSchema },
    },
    async (request) => {
      const { id } = idParams.parse(request.params);
      return services.stores.get(id, requireAdmin(request));
    },
  );

  app.patch(
    "/stores/:id",
    {
      preHandler: [authenticate, verifyOrigin],
      schema: { tags: ["用户"], summary: "更新用户", params: uuidParamsSchema },
    },
    async (request) => {
      const { id } = idParams.parse(request.params);
      return services.stores.update(
        id,
        updateStoreSchema.parse(request.body),
        requireAdmin(request),
      );
    },
  );

  for (const status of ["active", "disabled"] as const) {
    const action = status === "active" ? "enable" : "disable";
    app.post(
      `/stores/:id/${action}`,
      {
        preHandler: [authenticate, verifyOrigin],
        schema: {
          tags: ["用户"],
          summary: `${status === "active" ? "启用" : "停用"}用户`,
          params: uuidParamsSchema,
        },
      },
      async (request) => {
        const { id } = idParams.parse(request.params);
        return services.stores.setStatus(id, status, requireAdmin(request));
      },
    );
  }

  app.put(
    "/stores/:id/wifi",
    {
      preHandler: [authenticate, verifyOrigin],
      schema: { tags: ["Wi-Fi"], summary: "替换 Wi-Fi 配置", params: uuidParamsSchema },
    },
    async (request) => {
      const { id } = idParams.parse(request.params);
      return services.stores.putWifi(id, putWifiSchema.parse(request.body), requireAdmin(request));
    },
  );

  app.get(
    "/stores/:id/wifi/status",
    {
      preHandler: authenticate,
      schema: { tags: ["Wi-Fi"], summary: "Wi-Fi 配置状态", params: uuidParamsSchema },
    },
    async (request) =>
      services.stores.getWifiStatus(idParams.parse(request.params).id, requireAdmin(request)),
  );

  app.post(
    "/stores/:id/qrcode",
    {
      preHandler: [authenticate, verifyOrigin],
      schema: { tags: ["小程序码"], summary: "生成用户小程序码", params: uuidParamsSchema },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await services.qrCodes.generate(idParams.parse(request.params).id, requireAdmin(request)),
        ),
  );

  app.get(
    "/stores/:id/qrcode",
    {
      preHandler: authenticate,
      schema: { tags: ["小程序码"], summary: "用户小程序码", params: uuidParamsSchema },
    },
    async (request) =>
      services.qrCodes.getForStore(idParams.parse(request.params).id, requireAdmin(request)),
  );

  for (const status of ["active", "disabled"] as const) {
    const action = status === "active" ? "enable" : "disable";
    app.post(
      `/qrcodes/:id/${action}`,
      {
        preHandler: [authenticate, verifyOrigin],
        schema: {
          tags: ["小程序码"],
          summary: `${status === "active" ? "启用" : "停用"}小程序码`,
          params: uuidParamsSchema,
        },
      },
      async (request) =>
        services.qrCodes.setStatus(
          idParams.parse(request.params).id,
          status,
          requireAdmin(request),
        ),
    );
  }

  app.get(
    "/qrcodes/:id/download",
    {
      preHandler: authenticate,
      schema: { tags: ["小程序码"], summary: "预览或下载小程序码", params: uuidParamsSchema },
    },
    async (request, reply) => {
      const image = await services.qrCodes.readImage(
        idParams.parse(request.params).id,
        requireAdmin(request),
      );
      reply.header("Content-Type", image.contentType);
      reply.header(
        "Content-Disposition",
        `inline; filename="store-qrcode-${image.qrCode.id}.${image.contentType === "image/png" ? "png" : image.contentType === "image/jpeg" ? "jpg" : "svg"}"`,
      );
      reply.header("Cache-Control", "private, no-cache");
      return reply.send(image.content);
    },
  );

  app.get(
    "/dashboard",
    { preHandler: authenticate, schema: { tags: ["统计"], summary: "仪表盘统计" } },
    async (request) => services.statistics.dashboard(requireAdmin(request)),
  );

  app.get(
    "/stores/:id/statistics",
    {
      preHandler: authenticate,
      schema: { tags: ["统计"], summary: "用户统计", params: uuidParamsSchema },
    },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const query = statisticsQuerySchema.parse(request.query);
      return services.statistics.storeStatistics(id, requireAdmin(request), query.from, query.to);
    },
  );

  app.get(
    "/operation-logs",
    { preHandler: authenticate, schema: { tags: ["审计"], summary: "管理员操作日志" } },
    async (request) => {
      const query = operationLogQuerySchema.parse(request.query);
      return services.statistics.operationLogs(
        {
          page: query.page,
          pageSize: query.pageSize,
          ...(query.search === undefined ? {} : { search: query.search }),
          ...(query.action === undefined ? {} : { action: query.action }),
          ...(query.resourceType === undefined ? {} : { resourceType: query.resourceType }),
        },
        requireAdmin(request),
      );
    },
  );

  app.get(
    "/settings",
    { preHandler: authenticate, schema: { tags: ["设置"], summary: "系统设置状态" } },
    async (request) => {
      requirePlatformAdmin(requireAdmin(request));
      return services.settings.get();
    },
  );
  app.patch(
    "/settings",
    {
      preHandler: [authenticate, verifyOrigin],
      schema: { tags: ["设置"], summary: "更新系统设置" },
    },
    async (request) => {
      requirePlatformAdmin(requireAdmin(request));
      return services.settings.update(
        updateSettingsSchema.parse(request.body).globalAdEnabled,
        requireAdmin(request).id,
      );
    },
  );
  return Promise.resolve();
}
