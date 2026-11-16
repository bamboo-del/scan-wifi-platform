import type {
  PaginationResponse,
  StoreDetail,
  StoreSummary,
  WifiStatusResponse,
  WifiNetworkResponse,
} from "@scan-wifi/shared-types";
import type { CreateStoreInput, PutWifiInput, UpdateStoreInput } from "@scan-wifi/validation";
import { DEFAULT_MERCHANT_ID } from "../db/schema.js";
import { notFound } from "../lib/errors.js";
import { createSceneToken } from "./scene-token.js";
import type { PlatformRepository } from "../repositories/platform-repository.js";
import type { AuditService } from "./audit-service.js";
import type { EncryptionService } from "./encryption-service.js";
import {
  presentQrCode,
  presentStoreDetail,
  presentStoreSummary,
  presentWifi,
} from "./presenters.js";

export class StoreService {
  public constructor(
    private readonly repository: PlatformRepository,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  public async list(input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: "active" | "disabled";
  }): Promise<PaginationResponse<StoreSummary>> {
    const result = await this.repository.listStores(input);
    return {
      items: result.items.map(presentStoreSummary),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize),
    };
  }

  public async create(input: CreateStoreInput, adminId: string): Promise<StoreDetail> {
    return this.repository.transaction(async (repository) => {
      if (!(await repository.getMerchant(input.merchantId ?? DEFAULT_MERCHANT_ID)))
        throw notFound("MERCHANT_NOT_FOUND", "商户不存在");
      const store = await repository.createStore(input);
      await this.audit.record(
        {
          adminId,
          action: "store.create",
          resourceType: "store",
          resourceId: store.id,
          metadata: { name: store.name, status: store.status },
        },
        repository,
      );
      return presentStoreDetail(store, null, null);
    });
  }

  public async get(id: string): Promise<StoreDetail> {
    const store = await this.requireStore(id);
    const [wifi, qrCode] = await Promise.all([
      this.repository.getWifi(id),
      this.repository.getLatestQrForStore(id),
    ]);
    return presentStoreDetail(store, wifi, qrCode);
  }

  public async update(id: string, input: UpdateStoreInput, adminId: string): Promise<StoreDetail> {
    return this.repository.transaction(async (repository) => {
      await this.requireStore(id, repository);
      if (input.merchantId && !(await repository.getMerchant(input.merchantId)))
        throw notFound("MERCHANT_NOT_FOUND", "商户不存在");
      const updated = await repository.updateStore(id, input);
      if (!updated) throw notFound("STORE_NOT_FOUND", "门店不存在");
      await this.audit.record(
        {
          adminId,
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
      return presentStoreDetail(updated, wifi, qrCode);
    });
  }

  public async setStatus(
    id: string,
    status: "active" | "disabled",
    adminId: string,
  ): Promise<StoreDetail> {
    return this.repository.transaction(async (repository) => {
      const updated = await repository.updateStore(id, { status });
      if (!updated) throw notFound("STORE_NOT_FOUND", "门店不存在");
      await this.audit.record(
        {
          adminId,
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
      return presentStoreDetail(updated, wifi, qrCode);
    });
  }

  public async putWifi(
    id: string,
    input: PutWifiInput,
    adminId: string,
    wifiId?: string,
    create = false,
  ): Promise<WifiStatusResponse> {
    const encrypted = this.encryption.encrypt(input.password, `wifi-config:v1:${id}`);
    return this.repository.transaction(async (repository) => {
      await this.requireStore(id, repository);
      if (wifiId) {
        const current = await repository.getWifiById(wifiId);
        if (!current || current.storeId !== id) throw notFound("WIFI_NOT_FOUND", "Wi-Fi 不存在");
      }
      const inputRecord = {
        shortId:
          (wifiId
            ? await repository.getWifiById(wifiId)
            : !create
              ? await repository.getWifi(id)
              : null
          )?.shortId ?? createSceneToken(),
        spotName: input.spotName ?? "",
        deletedAt: null,
        storeId: id,
        ssid: input.ssid,
        encryptedPassword: encrypted.ciphertext,
        passwordIv: encrypted.iv,
        passwordAuthTag: encrypted.authTag,
        bssid: input.bssid ?? null,
        securityType: input.securityType ?? null,
        status: input.status,
      };
      const wifi =
        create || wifiId
          ? await repository.saveWifi(inputRecord, wifiId)
          : await repository.upsertWifi(inputRecord);
      await this.audit.record(
        {
          adminId,
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

  public async getWifiStatus(id: string): Promise<WifiStatusResponse> {
    await this.requireStore(id);
    return presentWifi(await this.repository.getWifi(id));
  }

  public async listWifi(storeId: string): Promise<WifiNetworkResponse[]> {
    await this.requireStore(storeId);
    const networks = await this.repository.listWifi(storeId);
    return Promise.all(
      networks.map(async (wifi) => {
        const qr = await this.repository.getLatestQrForWifi(wifi.id);
        return { ...presentWifi(wifi), qrCode: qr ? presentQrCode(qr) : null };
      }),
    );
  }
  public async setWifiStatus(
    storeId: string,
    wifiId: string,
    status: "active" | "disabled",
    adminId: string,
  ): Promise<WifiStatusResponse> {
    return this.repository.transaction(async (repository) => {
      const wifi = await repository.getWifiById(wifiId);
      if (!wifi || wifi.storeId !== storeId) throw notFound("WIFI_NOT_FOUND", "Wi-Fi 不存在");
      const updated = await repository.setWifiStatus(wifiId, status);
      await this.audit.record(
        {
          adminId,
          action: "wifi.status",
          resourceType: "wifi_config",
          resourceId: wifiId,
          metadata: { storeId, status },
        },
        repository,
      );
      return presentWifi(updated);
    });
  }

  private async requireStore(id: string, repository: PlatformRepository = this.repository) {
    const store = await repository.getStore(id);
    if (!store) throw notFound("STORE_NOT_FOUND", "门店不存在");
    return store;
  }
}
