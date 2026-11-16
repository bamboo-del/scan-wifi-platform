import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    admin: {
      id: string;
      username: string;
      expiresAt: Date;
    } | null;
  }
}
