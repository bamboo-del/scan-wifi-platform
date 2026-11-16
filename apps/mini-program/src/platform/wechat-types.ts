export interface WechatCallbackResult {
  readonly errMsg: string;
  readonly errCode?: number;
}

export interface WifiInfo {
  readonly SSID: string;
  readonly BSSID: string;
  readonly secure: boolean;
  readonly signalStrength: number;
  readonly frequency?: number;
}

export interface WifiConnectedResult {
  /** Official notes allow an empty object when Wi-Fi disconnects. */
  readonly wifi?: WifiInfo;
}

export type WifiConnectedListener = (result: WifiConnectedResult) => void;

export interface WifiOperationOptions {
  readonly success?: (result: WechatCallbackResult) => void;
  readonly fail?: (error: WechatCallbackResult) => void;
  readonly complete?: (result: WechatCallbackResult) => void;
}

/** Exact legacy wx.connectWifi option names, including the official typo. */
export interface ConnectWifiOptions extends WifiOperationOptions {
  readonly SSID: string;
  readonly BSSID?: string;
  readonly password: string;
  readonly maunal?: boolean;
  readonly partialInfo?: boolean;
}

export interface LegacyWifiWxApi {
  startWifi(options: WifiOperationOptions): void;
  connectWifi(options: ConnectWifiOptions): void;
  onWifiConnected(listener: WifiConnectedListener): void;
  offWifiConnected(listener?: WifiConnectedListener): void;
  stopWifi(options: WifiOperationOptions): void;
}

/** Runtime-probed Wi-Fi surface used only by the develop/trial diagnostic page. */
export interface WifiDiagnosticsWxApi {
  readonly startWifi?: (options: WifiOperationOptions) => void;
  readonly connectWifi?: (options: ConnectWifiOptions) => void;
  readonly onWifiConnected?: (listener: WifiConnectedListener) => void;
  readonly offWifiConnected?: (listener?: WifiConnectedListener) => void;
  readonly onWifiConnectedWithPartialInfo?: (listener: WifiConnectedListener) => void;
  readonly offWifiConnectedWithPartialInfo?: (listener?: WifiConnectedListener) => void;
  readonly stopWifi?: (options: WifiOperationOptions) => void;
}

export interface WechatRequestTask {
  abort(): void;
}

export interface WechatRequestSuccessResult {
  readonly statusCode: number;
  readonly data: unknown;
  readonly header?: Readonly<Record<string, string>>;
}

export interface WechatRequestOptions {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly data?: unknown;
  readonly header?: Readonly<Record<string, string>>;
  readonly timeout?: number;
  readonly success: (result: WechatRequestSuccessResult) => void;
  readonly fail: (error: WechatCallbackResult) => void;
  readonly complete?: () => void;
}

export interface WechatSystemInfo {
  readonly platform?: string;
  readonly system?: string;
  readonly model?: string;
  readonly SDKVersion?: string;
  readonly version?: string;
}

export interface WechatAppBaseInfo {
  readonly SDKVersion?: string;
  readonly version?: string;
}

export interface WechatDeviceInfo {
  readonly platform?: string;
  readonly system?: string;
  readonly model?: string;
}

export interface WechatAccountInfo {
  readonly miniProgram?: {
    readonly envVersion?: string;
  };
}

export interface WechatNavigationOptions {
  readonly url: string;
  readonly success?: (result: WechatCallbackResult) => void;
  readonly fail?: (error: WechatCallbackResult) => void;
  readonly complete?: (result: WechatCallbackResult) => void;
}

export interface WechatMiniProgramApi extends LegacyWifiWxApi {
  request(options: WechatRequestOptions): WechatRequestTask;
  getSystemInfoSync?: () => WechatSystemInfo;
  getAppBaseInfo?: () => WechatAppBaseInfo;
  getDeviceInfo?: () => WechatDeviceInfo;
  getAccountInfoSync?: () => WechatAccountInfo;
  onWifiConnectedWithPartialInfo?: (listener: WifiConnectedListener) => void;
  offWifiConnectedWithPartialInfo?: (listener?: WifiConnectedListener) => void;
  navigateTo(options: WechatNavigationOptions): void;
  reLaunch(options: WechatNavigationOptions): void;
}
