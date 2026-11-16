export type ConnectionPhase =
  | "invalid"
  | "disabled"
  | "idle"
  | "loading"
  | "manual"
  | "waiting"
  | "initializing_wifi"
  | "connecting"
  | "success"
  | "failed"
  | "unsupported"
  | "permission_denied"
  | "wifi_disabled";

export type PublicEventType =
  | "page_view"
  | "scan"
  | "password_copy"
  | "ad_load_success"
  | "ad_load_failure"
  | "connect_click"
  | "connect_success"
  | "connect_failure";

export type EventPlatform = "ios" | "android" | "devtools" | "unknown";

export interface PublicConnectConfig {
  readonly store: {
    readonly id: string;
    readonly name: string;
    readonly shortName: string | null;
    readonly logoUrl: string | null;
  };
  readonly wifi: {
    readonly id: string;
    readonly ssid: string;
    readonly bssid: string | null;
    readonly securityType: string | null;
  };
  readonly ad: {
    /** Effective backend decision: global switch AND store switch. */
    readonly enabled: boolean;
    readonly unitId: string | null;
  };
  readonly compatibility: {
    readonly legacyWifiApiEnabled: boolean;
  };
}

export interface PublicEventInput {
  readonly sceneToken: string;
  readonly eventType: PublicEventType;
  readonly platform: EventPlatform;
  readonly visitorId?: string;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
}

export interface PublicApi {
  getConnectConfig(sceneToken: string): Promise<PublicConnectConfig>;
  getWifiCredential(sceneToken: string): Promise<PublicWifiCredential>;
  reportEvent(event: PublicEventInput): Promise<void>;
  dispose(): void;
}

export interface PublicWifiCredential extends WifiConnectionSettings {
  readonly storeId: string;
  readonly wifiId: string;
}

export interface WifiConnectionSettings {
  readonly ssid: string;
  readonly password: string;
  readonly bssid: string | null;
}

export type WifiInternalErrorCode =
  "adapter_disabled" | "api_unavailable" | "client_timeout" | "cancelled" | "unknown";

export type DocumentedWifiErrorCode =
  | 12000
  | 12001
  | 12002
  | 12003
  | 12004
  | 12005
  | 12006
  | 12007
  | 12008
  | 12009
  | 12010
  | 12011
  | 12013
  | 12014;

export interface NormalizedWifiError {
  readonly code: DocumentedWifiErrorCode | WifiInternalErrorCode;
  readonly phase: Extract<
    ConnectionPhase,
    "failed" | "unsupported" | "permission_denied" | "wifi_disabled"
  >;
  readonly title: string;
  readonly message: string;
}

export type WifiConnectResult =
  { readonly ok: true } | { readonly ok: false; readonly error: NormalizedWifiError };

export type WifiConnectStage = "initializing_wifi" | "connecting";

export interface WifiConnector {
  isAvailable(): boolean;
  connect(
    settings: WifiConnectionSettings,
    onStage: (stage: WifiConnectStage) => void,
  ): Promise<WifiConnectResult>;
  dispose(): void;
}

export interface ConnectViewState {
  readonly phase: ConnectionPhase;
  readonly configLoading: boolean;
  readonly hasConfig: boolean;
  readonly storeName: string;
  readonly brandName: string;
  readonly logoUrl: string | null;
  readonly ssid: string;
  readonly buttonLabel: string;
  readonly password: string;
  readonly buttonDisabled: boolean;
  readonly statusTitle: string;
  readonly statusMessage: string;
  readonly statusTone: "neutral" | "progress" | "success" | "danger";
  readonly initialized: boolean;
  readonly troubleshootingExpanded: boolean;
  readonly adEligible: boolean;
  readonly adCollapsed: boolean;
  readonly adUnitId: string;
}
