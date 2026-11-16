import type { MerchantResponse } from "@scan-wifi/shared-types";
import type { MerchantInput, UpdateMerchantInput } from "@scan-wifi/validation";
import { notFound } from "../lib/errors.js";
import type { MerchantRecord, PlatformRepository } from "../repositories/platform-repository.js";
import type { AuditService } from "./audit-service.js";

const present = (row: MerchantRecord): MerchantResponse => ({
  id: row.id,
  name: row.name,
  contact: row.contact,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export class MerchantService {
  constructor(
    private readonly repository: PlatformRepository,
    private readonly audit: AuditService,
  ) {}
  async list(): Promise<MerchantResponse[]> {
    return (await this.repository.listMerchants()).map(present);
  }
  async save(
    input: MerchantInput | UpdateMerchantInput,
    adminId: string,
    id?: string,
  ): Promise<MerchantResponse> {
    return this.repository.transaction(async (repository) => {
      const row = id
        ? await repository.updateMerchant(id, input)
        : await repository.createMerchant(input as MerchantInput);
      if (!row) throw notFound("MERCHANT_NOT_FOUND", "商户不存在");
      await this.audit.record(
        {
          adminId,
          action: id ? "merchant.update" : "merchant.create",
          resourceType: "merchant",
          resourceId: row.id,
          metadata: { changedFields: Object.keys(input) },
        },
        repository,
      );
      return present(row);
    });
  }
}
