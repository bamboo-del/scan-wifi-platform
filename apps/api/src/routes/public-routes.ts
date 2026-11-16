import { publicEventSchema, sceneTokenSchema } from "@scan-wifi/validation";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PublicConnectService } from "../services/public-connect-service.js";
import { errorResponseSchema } from "./route-utils.js";

const sceneBody = z.object({ sceneToken: sceneTokenSchema }).strict();

export function registerPublicRoutes(
  app: FastifyInstance,
  service: PublicConnectService,
  eventRateLimitMax: number,
): Promise<void> {
  app.post(
    "/credential",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: { tags: ["顾客端"], summary: "用户点击后获取当前网络凭据" },
    },
    async (request, reply) => {
      const { sceneToken } = sceneBody.parse(request.body);
      reply.header("Cache-Control", "no-store, private, max-age=0");
      reply.header("Pragma", "no-cache");
      reply.header("Expires", "0");
      return service.credential(sceneToken);
    },
  );
  app.post(
    "/connect",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        tags: ["顾客端"],
        summary: "解析门店连接配置",
        body: {
          type: "object",
          additionalProperties: false,
          required: ["sceneToken"],
          properties: { sceneToken: { type: "string", pattern: "^[a-f0-9]{32}$" } },
        },
        response: { 400: errorResponseSchema, 404: errorResponseSchema, 429: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { sceneToken } = sceneBody.parse(request.body);
      reply.header("Cache-Control", "no-store, private, max-age=0");
      reply.header("Pragma", "no-cache");
      reply.header("Expires", "0");
      return service.resolve(sceneToken);
    },
  );

  app.post(
    "/events",
    {
      config: { rateLimit: { max: eventRateLimitMax, timeWindow: "1 minute" } },
      schema: {
        tags: ["顾客端"],
        summary: "上报匿名连接事件",
        response: {
          202: { type: "object", properties: { accepted: { type: "boolean" } } },
          400: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await service.recordEvent(publicEventSchema.parse(request.body));
      return reply.code(202).send({ accepted: true });
    },
  );
  return Promise.resolve();
}
