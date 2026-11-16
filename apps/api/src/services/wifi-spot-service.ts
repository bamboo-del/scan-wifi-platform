import type { WifiSpot } from "@scan-wifi/shared-types";
import type { WifiSpotInput } from "@scan-wifi/validation";
import { notFound } from "../lib/errors.js";
import type { PlatformRepository, WifiRecord } from "../repositories/platform-repository.js";
import type { EncryptionService } from "./encryption-service.js";
import type { QrCodeService } from "./qrcode-service.js";
import { createSceneToken } from "./scene-token.js";

export class WifiSpotService {
  constructor(
    private readonly repository: PlatformRepository,
    private readonly encryption: EncryptionService,
    private readonly qrCodes: QrCodeService,
  ) {}

  async list(ownerId: string, search: string): Promise<WifiSpot[]> {
    const rows = await this.repository.listOwnedWifi(ownerId);
    const spots = await Promise.all(rows.map((row) => this.present(row)));
    const term = search.toLocaleLowerCase();
    return spots.filter((spot) =>
      [spot.shopName, spot.spotName, spot.ssid].some((value) =>
        value.toLocaleLowerCase().includes(term),
      ),
    );
  }
  async get(ownerId: string, id: string): Promise<WifiSpot> {
    return this.present(await this.requireOwned(this.repository, ownerId, id));
  }

  async save(ownerId: string, input: WifiSpotInput, id?: string): Promise<WifiSpot> {
    const wifi = await this.repository.transaction(async (repository) => {
      let current = id ? await this.requireOwned(repository, ownerId, id) : null;
      if (current) {
        await repository.lockStore(current.storeId);
        current = await this.requireOwned(repository, ownerId, current.id);
      }
      const store = current
        ? await repository.updateStore(current.storeId, { name: input.shopName })
        : await repository.createStore({
            name: input.shopName,
            merchantId: ownerId,
            status: "active",
            adEnabled: false,
          });
      if (!store) throw notFound("SPOT_NOT_FOUND", "WiFi 贴不存在");
      const encrypted = this.encryption.encrypt(input.password, `wifi-config:v1:${store.id}`);
      const row = await repository.saveWifi(
        {
          storeId: store.id,
          ssid: input.ssid,
          shortId: current?.shortId ?? createSceneToken(),
          spotName: input.spotName ?? "",
          deletedAt: null,
          bssid: input.bssid ?? null,
          securityType: input.securityType ?? "WPA2",
          status: input.status,
          encryptedPassword: encrypted.ciphertext,
          passwordIv: encrypted.iv,
          passwordAuthTag: encrypted.authTag,
        },
        current?.id,
      );
      await repository.insertOperationLog({
        adminId: null,
        action: current ? "wifi.update" : "wifi.create",
        resourceType: "wifi_config",
        resourceId: row.id,
        metadata: { merchantId: ownerId },
        createdAt: new Date(),
      });
      return row;
    });
    return this.present(wifi);
  }
  async status(ownerId: string, id: string, status: "active" | "disabled"): Promise<WifiSpot> {
    await this.repository.transaction(async (repository) => {
      const wifi = await this.requireOwned(repository, ownerId, id);
      await repository.lockStore(wifi.storeId);
      await this.requireOwned(repository, ownerId, id);
      await repository.setWifiStatus(id, status);
    });
    return this.get(ownerId, id);
  }
  async remove(ownerId: string, id: string): Promise<void> {
    await this.repository.transaction(async (repository) => {
      const wifi = await this.requireOwned(repository, ownerId, id);
      await repository.lockStore(wifi.storeId);
      await this.requireOwned(repository, ownerId, id);
      await repository.deleteWifi(id);
      await repository.insertOperationLog({
        adminId: null,
        action: "wifi.delete",
        resourceType: "wifi_config",
        resourceId: id,
        metadata: { merchantId: ownerId },
        createdAt: new Date(),
      });
    });
  }
  async generate(ownerId: string, id: string): Promise<WifiSpot> {
    const wifi = await this.requireOwned(this.repository, ownerId, id);
    await this.qrCodes.generate(wifi.storeId, null, wifi.id, ownerId);
    return this.get(ownerId, id);
  }
  async image(ownerId: string, id: string) {
    const wifi = await this.requireOwned(this.repository, ownerId, id);
    const qr = await this.repository.getLatestQrForWifi(wifi.id);
    if (!qr) throw notFound("QR_CODE_NOT_FOUND", "请先生成小程序码");
    return this.qrCodes.readImage(qr.id);
  }
  private async requireOwned(
    repository: PlatformRepository,
    ownerId: string,
    id: string,
  ): Promise<WifiRecord> {
    const wifi = await repository.getWifiById(id);
    const store = wifi ? await repository.getStore(wifi.storeId) : null;
    if (!wifi || wifi.deletedAt || store?.merchantId !== ownerId)
      throw notFound("SPOT_NOT_FOUND", "WiFi 贴不存在");
    return wifi;
  }
  private async present(wifi: WifiRecord): Promise<WifiSpot> {
    const [store, qr, stats] = await Promise.all([
      this.repository.getStore(wifi.storeId),
      this.repository.getLatestQrForWifi(wifi.id),
      this.repository.getAnalytics({
        wifiId: wifi.id,
        from: new Date(0).toISOString(),
        to: new Date().toISOString(),
      }),
    ]);
    return {
      id: wifi.id,
      shortId: qr?.sceneToken ?? wifi.shortId,
      shopName: store?.name ?? "",
      spotName: wifi.spotName,
      ssid: wifi.ssid,
      bssid: wifi.bssid,
      status: wifi.status,
      qrFileId: qr?.id ?? null,
      qrProvider: qr?.provider ?? null,
      qrUpdatedAt: qr?.generatedAt.toISOString() ?? null,
      connectCount: stats.reduce((sum, row) => sum + row.totals.connectSuccesses, 0),
      createTime: wifi.createdAt.toISOString(),
      updateTime: wifi.updatedAt.toISOString(),
    };
  }
}
