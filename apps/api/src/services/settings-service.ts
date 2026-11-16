import type { AppConfig } from "@scan-wifi/config";
import type { SystemSettingsResponse } from "@scan-wifi/shared-types";
import type { PlatformRepository } from "../repositories/platform-repository.js";
import type { AuditService } from "./audit-service.js";

export class SettingsService {
  public constructor(
    private readonly repository: PlatformRepository,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  public async get(): Promise<SystemSettingsResponse> {
    const configured = await this.repository.getSetting("global_ad_enabled");
    return this.present(typeof configured === "boolean" ? configured : false);
  }

  public async update(globalAdEnabled: boolean, adminId: string): Promise<SystemSettingsResponse> {
    return this.repository.transaction(async (repository) => {
      await repository.setSetting("global_ad_enabled", globalAdEnabled, new Date());
      await this.audit.record(
        {
          adminId,
          action: "settings.global_ad.update",
          resourceType: "system_setting",
          resourceId: "global_ad_enabled",
          metadata: { globalAdEnabled },
        },
        repository,
      );
      return this.present(globalAdEnabled);
    });
  }

  private present(globalAdEnabled: boolean): SystemSettingsResponse {
    return {
      globalAdEnabled,
      adUnitConfigured: this.config.MINIPROGRAM_AD_UNIT_ID.length > 0,
      wechatQrConfigured:
        this.config.WECHAT_APP_ID.length > 0 && this.config.WECHAT_APP_SECRET.length > 0,
      qrCodeProvider: this.config.QR_CODE_PROVIDER,
      legacyWifiApiEnabled: this.config.MINIPROGRAM_ENABLE_LEGACY_WIFI_API,
    };
  }
}
