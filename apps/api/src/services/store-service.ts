import type {
  AdminActor,
  PaginationResponse,
  StoreDetail,
  StoreSummary,
  WifiStatusResponse,
} from "@scan-wifi/shared-types";
import type { CreateStoreInput, PutWifiInput, UpdateStoreInput } from "@scan-wifi/validation";
import { forbidden, notFound } from "../lib/errors.js";
import type { PlatformRepository } from "../repositories/platform-repository.js";
import { requirePlatformAdmin, requireStoreAccess } from "./access-service.js";
import type { AuditService } from "./audit-service.js";
import type { EncryptionService } from "./encryption-service.js";
import { presentStoreDetail, presentStoreSummary, presentWifi } from "./presenters.js";

export class StoreService {
  public constructor(
    private readonly repository: PlatformRepository,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  public async list(
    input: {
      page: number;
      pageSize: number;
      search?: string;
      status?: "active" | "disabled";
    },
    actor: AdminActor,
  ): Promise<PaginationResponse<StoreSummary>> {
    const result = await this.repository.listStores({
      ...input,
      ...(actor.role === "operator" ? { ownerId: actor.id } : {}),
    });
    return {
      items: result.items.map(presentStoreSummary),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize),
    };
  }

  public async create(input: CreateStoreInput, actor: AdminActor): Promise<StoreDetail> {
    return this.repository.transaction(async (repository) => {
      const store = await repository.createStore(
        actor.role === "operator" ? { ...input, status: "active", adEnabled: false } : input,
        actor.id,
      );
      await this.audit.record(
        {
          adminId: actor.id,
          action: "store.create",
          resourceType: "store",
          resourceId: store.id,
          metadata: { name: store.name, status: store.status },
        },
        repository,
      );
      return presentStoreDetail((await repository.getStore(store.id)) ?? store, null, null);
    });
  }

  public async get(id: string, actor: AdminActor): Promise<StoreDetail> {
    const store = await requireStoreAccess(this.repository, id, actor);
    const [wifi, qrCode] = await Promise.all([
      this.repository.getWifi(id),
      this.repository.getLatestQrForStore(id),
    ]);
    return presentStoreDetail(store, wifi, qrCode);
  }

  public async update(
    id: string,
    input: UpdateStoreInput,
    actor: AdminActor,
  ): Promise<StoreDetail> {
    return this.repository.transaction(async (repository) => {
      await requireStoreAccess(repository, id, actor, true);
      requirePlatformAdmin(actor);
      const updated = await repository.updateStore(id, input);
      if (!updated) throw notFound("STORE_NOT_FOUND", "用户不存在");
      await this.audit.record(
        {
          adminId: actor.id,
          action: "store.update",
          resourceType: "store",
          resourceId: id,
          metadata: { changedFields: Object.keys(input) },
        },
        repository,
      );
      const [wifi, qrCode] = await Promise.all([
        repository.getWifi(id),
        repository.getLatestQrForStore(id),
      ]);
      return presentStoreDetail((await repository.getStore(id)) ?? updated, wifi, qrCode);
    });
  }

  public async setStatus(
    id: string,
    status: "active" | "disabled",
    actor: AdminActor,
  ): Promise<StoreDetail> {
    return this.repository.transaction(async (repository) => {
      await requireStoreAccess(repository, id, actor, true);
      requirePlatformAdmin(actor);
      const updated = await repository.updateStore(id, { status });
      if (!updated) throw notFound("STORE_NOT_FOUND", "用户不存在");
      await this.audit.record(
        {
          adminId: actor.id,
          action: status === "active" ? "store.enable" : "store.disable",
          resourceType: "store",
          resourceId: id,
          metadata: { status },
        },
        repository,
      );
      const [wifi, qrCode] = await Promise.all([
        repository.getWifi(id),
        repository.getLatestQrForStore(id),
      ]);
      return presentStoreDetail((await repository.getStore(id)) ?? updated, wifi, qrCode);
    });
  }

  public async putWifi(
    id: string,
    input: PutWifiInput,
    actor: AdminActor,
  ): Promise<WifiStatusResponse> {
    const encrypted = this.encryption.encrypt(input.password, `wifi-config:v1:${id}`);
    return this.repository.transaction(async (repository) => {
      const store = await requireStoreAccess(repository, id, actor, true);
      if (
        actor.role === "operator" &&
        (store.createdById !== actor.id ||
          store.status !== "active" ||
          input.status !== "active" ||
          (await repository.getWifi(id)))
      ) {
        throw forbidden("同仁只能为自己新建的用户配置初始 Wi-Fi");
      }
      const wifi = await repository.upsertWifi({
        storeId: id,
        ssid: input.ssid,
        encryptedPassword: encrypted.ciphertext,
        passwordIv: encrypted.iv,
        passwordAuthTag: encrypted.authTag,
        bssid: input.bssid ?? null,
        securityType: input.securityType ?? null,
        status: input.status,
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: "wifi.replace",
          resourceType: "wifi_config",
          resourceId: wifi.id,
          metadata: { storeId: id, ssid: wifi.ssid, status: wifi.status, version: wifi.version },
        },
        repository,
      );
      return presentWifi(wifi);
    });
  }

  public async getWifiStatus(id: string, actor: AdminActor): Promise<WifiStatusResponse> {
    await requireStoreAccess(this.repository, id, actor);
    return presentWifi(await this.repository.getWifi(id));
  }
}
