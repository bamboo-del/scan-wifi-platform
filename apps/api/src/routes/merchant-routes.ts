import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  uuidSchema,
  wechatLoginSchema,
  wifiSpotSchema,
  wifiStatusUpdateSchema,
} from "@scan-wifi/validation";
import type { MerchantAuthService } from "../services/merchant-auth-service.js";
import type { WifiSpotService } from "../services/wifi-spot-service.js";

export async function registerMerchantRoutes(
  app: FastifyInstance,
  auth: MerchantAuthService,
  spots: WifiSpotService,
): Promise<void> {
  const idParams = z.object({ id: uuidSchema }).strict();
  const empty = z.object({}).strict();
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "private, no-store");
    return payload;
  });
  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, (request) =>
    auth.login(wechatLoginSchema.parse(request.body).code),
  );
  await app.register((secured) => {
    secured.addHook("preHandler", async (request) => {
      await auth.authenticate(request.headers.authorization);
    });
    secured.post("/logout", async (request, reply) => {
      empty.parse(request.body ?? {});
      await auth.logout(request.headers.authorization!);
      return reply.code(204).send();
    });
    secured.get("/spots", async (request) => {
      const query = z
        .object({ search: z.string().max(100).default("") })
        .strict()
        .parse(request.query);
      return spots.list(await auth.authenticate(request.headers.authorization), query.search);
    });
    secured.post("/spots", async (request, reply) =>
      reply
        .code(201)
        .send(
          await spots.save(
            await auth.authenticate(request.headers.authorization),
            wifiSpotSchema.parse(request.body),
          ),
        ),
    );
    secured.get("/spots/:id", async (request) =>
      spots.get(
        await auth.authenticate(request.headers.authorization),
        idParams.parse(request.params).id,
      ),
    );
    secured.put("/spots/:id", async (request) =>
      spots.save(
        await auth.authenticate(request.headers.authorization),
        wifiSpotSchema.parse(request.body),
        idParams.parse(request.params).id,
      ),
    );
    secured.patch("/spots/:id/status", async (request) =>
      spots.status(
        await auth.authenticate(request.headers.authorization),
        idParams.parse(request.params).id,
        wifiStatusUpdateSchema.parse(request.body).status,
      ),
    );
    secured.delete("/spots/:id", async (request, reply) => {
      empty.parse(request.body ?? {});
      await spots.remove(
        await auth.authenticate(request.headers.authorization),
        idParams.parse(request.params).id,
      );
      return reply.code(204).send();
    });
    secured.post("/spots/:id/qrcode", async (request) => {
      empty.parse(request.body ?? {});
      return spots.generate(
        await auth.authenticate(request.headers.authorization),
        idParams.parse(request.params).id,
      );
    });
    secured.get("/spots/:id/image", async (request, reply) => {
      const image = await spots.image(
        await auth.authenticate(request.headers.authorization),
        idParams.parse(request.params).id,
      );
      return reply.type(image.contentType).send(image.content);
    });
    return Promise.resolve();
  });
}
