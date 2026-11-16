import type { AppConfig } from "@scan-wifi/config";
import { createHmac } from "node:crypto";
import type { PublicConnectResponse, PublicWifiCredential } from "@scan-wifi/shared-types";
import type { PublicEventInput } from "@scan-wifi/validation";
import { notFound, serviceUnavailable } from "../lib/errors.js";
import { sanitizeEventErrorCode, sanitizeEventErrorMessage } from "../lib/redaction.js";
import type {
  PlatformRepository,
  QrCodeRecord,
  StoreRecord,
  WifiRecord,
} from "../repositories/platform-repository.js";
import { shouldDisplayAd } from "./ad-policy.js";
import type { EncryptionService } from "./encryption-service.js";

interface ResolvedConnection {
  qrCode: QrCodeRecord;
  store: StoreRecord;
  wifi: WifiRecord;
}

export class PublicConnectService {
  public constructor(
    private readonly repository: PlatformRepository,
    private readonly encryption: EncryptionService,
    private readonly config: AppConfig,
  ) {}

  public async resolve(sceneToken: string): Promise<PublicConnectResponse> {
    const { store, wifi } = await this.requireAvailable(sceneToken);
    const setting = await this.repository.getSetting("global_ad_enabled");
    const globalAdEnabled = typeof setting === "boolean" ? setting : false;
    const adEnabled = shouldDisplayAd({
      globalEnabled: this.config.ENABLE_ADS && globalAdEnabled,
      storeEnabled: store.adEnabled,
      adUnitId: this.config.MINIPROGRAM_AD_UNIT_ID,
    });
    return {
      store: { id: store.id, name: store.name, shortName: store.shortName, logoUrl: store.logoUrl },
      wifi: { id: wifi.id, ssid: wifi.ssid, bssid: wifi.bssid, securityType: wifi.securityType },
      ad: { enabled: adEnabled, unitId: adEnabled ? this.config.MINIPROGRAM_AD_UNIT_ID : null },
      compatibility: { legacyWifiApiEnabled: this.config.MINIPROGRAM_ENABLE_LEGACY_WIFI_API },
    };
  }

  public async credential(sceneToken: string): Promise<PublicWifiCredential> {
    const { store, wifi } = await this.requireAvailable(sceneToken);
    try {
      const password = this.encryption.decrypt(
        { ciphertext: wifi.encryptedPassword, iv: wifi.passwordIv, authTag: wifi.passwordAuthTag },
        `wifi-config:v1:${store.id}`,
      );
      return { storeId: store.id, wifiId: wifi.id, ssid: wifi.ssid, password, bssid: wifi.bssid };
    } catch {
      throw serviceUnavailable("CONNECT_CONFIG_UNAVAILABLE", "连接配置暂时不可用");
    }
  }

  public async recordEvent(input: PublicEventInput): Promise<void> {
    if (!this.config.ENABLE_ANALYTICS) return;
    const { qrCode, store, wifi } = await this.requireAvailable(input.sceneToken);
    const occurredAt = new Date();
    const visitorHash = input.visitorId
      ? createHmac("sha256", this.config.SESSION_SECRET)
          .update(`wifi-uv:${occurredAt.toISOString().slice(0, 10)}:${input.visitorId}`)
          .digest("hex")
      : null;
    const errorCode =
      input.eventType === "connect_failure" ? sanitizeEventErrorCode(input.errorCode) : null;
    await this.repository.insertEvent({
      storeId: store.id,
      wifiId: wifi.id,
      visitorHash,
      qrCodeId: qrCode.id,
      eventType: input.eventType,
      platform: input.platform,
      errorCode,
      errorMessageSanitized:
        input.eventType === "connect_failure"
          ? sanitizeEventErrorMessage(errorCode, input.errorMessage)
          : null,
      occurredAt,
    });
  }

  private async requireAvailable(sceneToken: string): Promise<ResolvedConnection> {
    const qrCode = await this.repository.getQrByScene(sceneToken);
    if (!qrCode) throw notFound("INVALID_CODE", "二维码不存在或已失效");
    const [store, wifi] = await Promise.all([
      this.repository.getStore(qrCode.storeId),
      qrCode.wifiId ? this.repository.getWifiById(qrCode.wifiId) : Promise.resolve(null),
    ]);
    if (!store || !wifi || wifi.deletedAt || wifi.storeId !== store.id)
      throw notFound("INVALID_CODE", "二维码不存在或已失效");
    if (qrCode.status !== "active" || store.status !== "active" || wifi.status !== "active") {
      throw notFound("SPOT_DISABLED", "该 WiFi 暂时不可用");
    }
    const merchant = await this.repository.getMerchant(store.merchantId);
    if (!merchant || merchant.status !== "active")
      throw notFound("SPOT_DISABLED", "该 WiFi 暂时不可用");
    return { qrCode, store, wifi };
  }
}
