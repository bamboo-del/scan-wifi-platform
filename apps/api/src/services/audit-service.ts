import type { PlatformRepository } from "../repositories/platform-repository.js";
import { redactSensitive } from "../lib/redaction.js";

export class AuditService {
  public constructor(private readonly repository: PlatformRepository) {}

  public async record(
    input: {
      adminId: string | null;
      action: string;
      resourceType: string;
      resourceId: string | null;
      metadata?: Record<string, unknown>;
    },
    repository: PlatformRepository = this.repository,
  ): Promise<void> {
    const sanitized = redactSensitive(input.metadata ?? {});
    await repository.insertOperationLog({
      adminId: input.adminId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata:
        typeof sanitized === "object" && sanitized !== null && !Array.isArray(sanitized)
          ? (sanitized as Record<string, unknown>)
          : {},
      createdAt: new Date(),
    });
  }
}
