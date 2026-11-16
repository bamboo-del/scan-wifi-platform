import type { QrCodeResponse } from "@scan-wifi/shared-types";
import { notFound } from "../lib/errors.js";
import type { PlatformRepository, QrCodeRecord } from "../repositories/platform-repository.js";
import type { AuditService } from "./audit-service.js";
import { presentQrCode } from "./presenters.js";
import type { QrCodeProvider } from "./qrcode-provider.js";
import type { QrCodeStorage } from "./qrcode-storage.js";
import { createSceneToken } from "./scene-token.js";

export class QrCodeService {
  public constructor(
    private readonly repository: PlatformRepository,
    private readonly provider: QrCodeProvider,
    private readonly storage: QrCodeStorage,
    private readonly audit: AuditService,
  ) {}

  public async generate(
    storeId: string,
    adminId: string | null,
    wifiId?: string,
    ownerId?: string,
  ): Promise<QrCodeResponse> {
    const store = await this.repository.getStore(storeId);
    if (!store) throw notFound("STORE_NOT_FOUND", "门店不存在");
    const wifi = wifiId
      ? await this.repository.getWifiById(wifiId)
      : await this.repository.getWifi(storeId);
    if (!wifi || wifi.deletedAt || wifi.storeId !== storeId)
      throw notFound("WIFI_NOT_FOUND", "请先配置门店 Wi-Fi");
    let storedLocation: string | null = null;
    let previousLocation: string | null = null;
    try {
      const result = await this.repository.transaction(async (repository) => {
        await repository.lockStore(storeId);
        const currentStore = await repository.getStore(storeId);
        if (!currentStore) throw notFound("STORE_NOT_FOUND", "门店不存在");
        if (ownerId && currentStore.merchantId !== ownerId)
          throw notFound("SPOT_NOT_FOUND", "WiFi 贴不存在");
        const existing = await repository.getLatestQrForWifi(wifi.id);
        const currentWifi = await repository.getWifiById(wifi.id);
        if (!currentWifi || currentWifi.deletedAt) throw notFound("WIFI_NOT_FOUND", "Wi-Fi 不存在");
        const sceneToken = existing?.sceneToken ?? currentWifi.shortId;
        const generated = await this.provider.generate(sceneToken);
        // Independent filenames allow atomic DB replacement without overwriting a live image.
        const stored = await this.storage.save(
          createSceneToken(),
          generated.extension,
          generated.content,
        );
        storedLocation = stored.location;
        previousLocation = existing?.imageUrl ?? null;
        const qrCode = existing
          ? await repository.refreshQrImage(existing.id, stored.location, this.provider.kind)
          : await repository.replaceActiveQr({
              storeId,
              wifiId: wifi.id,
              sceneToken,
              imageUrl: stored.location,
              provider: this.provider.kind,
            });
        await this.audit.record(
          {
            adminId,
            action: "qrcode.generate",
            resourceType: "qr_code",
            resourceId: qrCode.id,
            metadata: { storeId, provider: qrCode.provider },
          },
          repository,
        );
        return presentQrCode(qrCode);
      });
      if (previousLocation) await this.storage.delete(previousLocation).catch(() => undefined);
      return result;
    } catch (error) {
      if (storedLocation) await this.storage.delete(storedLocation).catch(() => undefined);
      throw error;
    }
  }

  public async getForStore(storeId: string): Promise<QrCodeResponse> {
    const store = await this.repository.getStore(storeId);
    if (!store) throw notFound("STORE_NOT_FOUND", "门店不存在");
    const qrCode = await this.repository.getLatestQrForStore(storeId);
    if (!qrCode) throw notFound("QR_CODE_NOT_FOUND", "该门店尚未生成小程序码");
    return presentQrCode(qrCode);
  }

  public async setStatus(
    id: string,
    status: "active" | "disabled",
    adminId: string,
  ): Promise<QrCodeResponse> {
    return this.repository.transaction(async (repository) => {
      const current = await this.requireQr(id, repository);
      const updated = await repository.setQrStatus(id, status, new Date());
      if (!updated) throw notFound("QR_CODE_NOT_FOUND", "小程序码不存在");
      await this.audit.record(
        {
          adminId,
          action: status === "active" ? "qrcode.enable" : "qrcode.disable",
          resourceType: "qr_code",
          resourceId: id,
          metadata: { storeId: current.storeId, status },
        },
        repository,
      );
      return presentQrCode(updated);
    });
  }

  public async readImage(id: string): Promise<{
    qrCode: QrCodeRecord;
    content: Buffer;
    contentType: "image/png" | "image/svg+xml";
  }> {
    const qrCode = await this.requireQr(id);
    const image = await this.storage.read(qrCode.imageUrl);
    return { qrCode, ...image };
  }

  private async requireQr(
    id: string,
    repository: PlatformRepository = this.repository,
  ): Promise<QrCodeRecord> {
    const qrCode = await repository.getQrById(id);
    if (!qrCode) throw notFound("QR_CODE_NOT_FOUND", "小程序码不存在");
    return qrCode;
  }
}
