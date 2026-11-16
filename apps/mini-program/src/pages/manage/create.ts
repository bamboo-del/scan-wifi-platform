import {
  ensureMerchantLogin,
  merchantError,
  wifiSpotService,
  type SpotInput,
} from "../../services/wifi-spot-service";
interface Data {
  id: string;
  shopName: string;
  spotName: string;
  ssid: string;
  bssid: string;
  status: "active" | "disabled";
  busy: boolean;
  error: string;
  passwordInput: string;
}
interface Members {
  password: string;
  onLoad(query: Record<string, string>): void;
  loadSpot(): Promise<void>;
  onField(event: {
    currentTarget: { dataset: { field: string } };
    detail: { value: string };
  }): void;
  onPassword(event: { detail: { value: string } }): void;
  onSave(): Promise<void>;
  onUnload(): void;
}
Page<Data, Members>({
  data: {
    id: "",
    shopName: "",
    spotName: "",
    ssid: "",
    bssid: "",
    status: "active",
    busy: false,
    error: "",
    passwordInput: "",
  },
  password: "",
  onLoad(query) {
    if (query.id) {
      this.setData({ id: query.id });
      void this.loadSpot();
    }
  },
  async loadSpot() {
    this.setData({ busy: true });
    try {
      await ensureMerchantLogin();
      const spot = await wifiSpotService.get(this.data.id);
      this.setData({
        shopName: spot.shopName,
        spotName: spot.spotName,
        ssid: spot.ssid,
        bssid: spot.bssid ?? "",
        status: spot.status,
      });
    } catch (error) {
      this.setData({ error: merchantError(error) });
    } finally {
      this.setData({ busy: false });
    }
  },
  onField(event) {
    const field = event.currentTarget.dataset.field;
    if (field === "shopName" || field === "spotName" || field === "ssid" || field === "bssid")
      this.setData({ [field]: event.detail.value });
  },
  onPassword(event) {
    this.password = event.detail.value;
  },
  async onSave() {
    if (this.data.busy) return;
    const input: SpotInput = {
      shopName: this.data.shopName.trim(),
      spotName: this.data.spotName.trim(),
      ssid: this.data.ssid,
      password: this.password,
      bssid: this.data.bssid.trim() || null,
      status: this.data.status,
    };
    if (!input.shopName || !input.ssid || input.password.length < 8 || input.password.length > 63) {
      this.setData({ error: "请填写店名、SSID 和 8 至 63 位 WiFi 密码" });
      return;
    }
    this.setData({ busy: true, error: "" });
    try {
      await ensureMerchantLogin();
      const spot = await wifiSpotService.save(input, this.data.id || undefined);
      this.password = "";
      this.setData({ id: spot.id, passwordInput: "" });
      wx.redirectTo({
        url: `/pages/manage/detail?id=${encodeURIComponent(spot.id)}&generate=${spot.qrFileId ? "0" : "1"}`,
      });
    } catch (error) {
      this.setData({ error: merchantError(error) });
    } finally {
      this.setData({ busy: false });
    }
  },
  onUnload() {
    this.password = "";
  },
});
