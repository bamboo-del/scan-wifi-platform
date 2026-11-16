import type {
  QrCodeResponse,
  StoreDetail,
  StoreSummary,
  WifiStatusResponse,
} from "@scan-wifi/shared-types";
import type {
  QrCodeRecord,
  StoreListRecord,
  StoreRecord,
  WifiRecord,
} from "../repositories/platform-repository.js";

export function presentWifi(wifi: WifiRecord | null): WifiStatusResponse {
  if (!wifi) {
    return {
      configured: false,
      ssid: null,
      passwordMasked: null,
      bssid: null,
      securityType: null,
      status: null,
      version: null,
      updatedAt: null,
    };
  }
  return {
    configured: true,
    ssid: wifi.ssid,
    passwordMasked: "••••••••",
    bssid: wifi.bssid,
    securityType: wifi.securityType,
    status: wifi.status,
    version: wifi.version,
    updatedAt: wifi.updatedAt.toISOString(),
  };
}

export function presentQrCode(qrCode: QrCodeRecord): QrCodeResponse {
  const endpoint = `/api/admin/qrcodes/${qrCode.id}/download`;
  return {
    id: qrCode.id,
    createdByUsername: qrCode.createdByUsername ?? null,
    storeId: qrCode.storeId,
    sceneToken: qrCode.sceneToken,
    status: qrCode.status,
    generatedAt: qrCode.generatedAt.toISOString(),
    disabledAt: qrCode.disabledAt?.toISOString() ?? null,
    previewUrl: endpoint,
    downloadUrl: endpoint,
    provider: qrCode.provider,
  };
}

export function presentStoreSummary(store: StoreListRecord): StoreSummary {
  return {
    id: store.id,
    createdById: store.createdById,
    createdByUsername: store.createdByUsername ?? null,
    ownerId: store.ownerId,
    name: store.name,
    shortName: store.shortName,
    logoUrl: store.logoUrl,
    address: store.address,
    contactName: store.contactName,
    contactPhone: store.contactPhone,
    status: store.status,
    adEnabled: store.adEnabled,
    hasWifi: store.hasWifi,
    qrCodeStatus: store.qrCodeStatus,
    qrCode: store.qrCode ? presentQrCode(store.qrCode) : null,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
  };
}

export function presentStoreDetail(
  store: StoreRecord,
  wifi: WifiRecord | null,
  qrCode: QrCodeRecord | null,
): StoreDetail {
  return {
    ...presentStoreSummary({
      ...store,
      hasWifi: wifi !== null,
      qrCodeStatus: qrCode?.status ?? null,
    }),
    wifi: presentWifi(wifi),
    qrCode: qrCode ? presentQrCode(qrCode) : null,
  };
}
