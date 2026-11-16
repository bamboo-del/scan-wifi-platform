import "fastify";
import type { AdminRole } from "@scan-wifi/shared-types";

declare module "fastify" {
  interface FastifyRequest {
    admin: {
      id: string;
      username: string;
      role: AdminRole;
      expiresAt: Date;
    } | null;
  }
}
