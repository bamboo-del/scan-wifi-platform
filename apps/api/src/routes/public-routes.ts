import { publicEventSchema, sceneTokenSchema } from "@scan-wifi/validation";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PublicConnectService } from "../services/public-connect-service.js";
import { errorResponseSchema } from "./route-utils.js";

const sceneParams = z.object({ sceneToken: sceneTokenSchema }).strict();

export function registerPublicRoutes(
  app: FastifyInstance,
  service: PublicConnectService,
  eventRateLimitMax: number,
): Promise<void> {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store, private, max-age=0");
    reply.header("Pragma", "no-cache");
    reply.header("Expires", "0");
    return payload;
  });
  app.get(
    "/connect/:sceneToken",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        tags: ["顾客端"],
        summary: "解析用户连接配置",
        params: {
          type: "object",
          additionalProperties: false,
          required: ["sceneToken"],
          properties: { sceneToken: { type: "string", pattern: "^[a-f0-9]{32}$" } },
        },
        response: { 400: errorResponseSchema, 404: errorResponseSchema, 429: errorResponseSchema },
      },
    },
    async (request) => {
      const { sceneToken } = sceneParams.parse(request.params);
      return service.resolve(sceneToken);
    },
  );

  app.post(
    "/credential",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["顾客端"],
        summary: "连接前获取 Wi-Fi 凭据",
        response: {
          400: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request) => service.credential(sceneParams.parse(request.body).sceneToken),
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
