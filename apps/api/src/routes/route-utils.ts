import type { FastifyRequest } from "fastify";
import { unauthorized } from "../lib/errors.js";

export function requireAdmin(request: FastifyRequest): NonNullable<FastifyRequest["admin"]> {
  if (!request.admin) throw unauthorized();
  return request.admin;
}

export const uuidParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
} as const;

export const errorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message", "requestId"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        requestId: { type: "string" },
        details: {},
      },
    },
  },
} as const;
