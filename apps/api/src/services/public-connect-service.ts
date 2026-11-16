import type { AppConfig } from "@scan-wifi/config";
import type { PublicConnectResponse, PublicCredentialResponse } from "@scan-wifi/shared-types";
import type { PublicEventInput } from "@scan-wifi/validation";
import { AppError, notFound, serviceUnavailable } from "../lib/errors.js";
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
      globalEnabled: globalAdEnabled,
      storeEnabled: store.adEnabled,
      adUnitId: this.config.MINIPROGRAM_AD_UNIT_ID,
    });
    return {
      store: { name: store.name, shortName: store.shortName, logoUrl: store.logoUrl },
      wifi: { ssid: wifi.ssid, bssid: wifi.bssid, securityType: wifi.securityType },
      ad: { enabled: adEnabled, unitId: adEnabled ? this.config.MINIPROGRAM_AD_UNIT_ID : null },
      compatibility: { legacyWifiApiEnabled: this.config.MINIPROGRAM_ENABLE_LEGACY_WIFI_API },
    };
  }

  public async credential(sceneToken: string): Promise<PublicCredentialResponse> {
    if (!this.config.MINIPROGRAM_ENABLE_LEGACY_WIFI_API) {
      throw new AppError(403, "LEGACY_WIFI_DISABLED", "当前未启用兼容连接能力");
    }
    const { store, wifi } = await this.requireAvailable(sceneToken);
    let password: string;
    try {
      password = this.encryption.decrypt(
        {
          ciphertext: wifi.encryptedPassword,
          iv: wifi.passwordIv,
          authTag: wifi.passwordAuthTag,
        },
        `wifi-config:v1:${store.id}`,
      );
    } catch {
      throw serviceUnavailable("CONNECT_CONFIG_UNAVAILABLE", "连接配置暂时不可用");
    }
    return {
      wifi: { ssid: wifi.ssid, password, bssid: wifi.bssid, securityType: wifi.securityType },
    };
  }

  public async recordEvent(input: PublicEventInput): Promise<void> {
    const { qrCode, store } = await this.requireAvailable(input.sceneToken);
    const errorCode =
      input.eventType === "connect_failure" ? sanitizeEventErrorCode(input.errorCode) : null;
    await this.repository.insertEvent({
      storeId: store.id,
      qrCodeId: qrCode.id,
      eventType: input.eventType,
      platform: input.platform,
      errorCode,
      errorMessageSanitized:
        input.eventType === "connect_failure"
          ? sanitizeEventErrorMessage(errorCode, input.errorMessage)
          : null,
      occurredAt: new Date(),
    });
  }

  private async requireAvailable(sceneToken: string): Promise<ResolvedConnection> {
    const qrCode = await this.repository.getQrByScene(sceneToken);
    if (!qrCode || qrCode.status !== "active")
      throw notFound("CONNECT_CONFIG_UNAVAILABLE", "该用户网络暂不可用");
    const [store, wifi] = await Promise.all([
      this.repository.getStore(qrCode.storeId),
      this.repository.getWifi(qrCode.storeId),
    ]);
    if (!store || store.status !== "active" || !wifi || wifi.status !== "active") {
      throw notFound("CONNECT_CONFIG_UNAVAILABLE", "该用户网络暂不可用");
    }
    return { qrCode, store, wifi };
  }
}
