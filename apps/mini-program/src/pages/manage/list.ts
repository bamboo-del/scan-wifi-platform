import {
  ensureMerchantLogin,
  merchantError,
  wifiSpotService,
  type WifiSpot,
} from "../../services/wifi-spot-service";
interface Data {
  items: WifiSpot[];
  search: string;
  busy: boolean;
  error: string;
}
interface Members {
  onShow(): void;
  reload(): Promise<void>;
  onSearch(event: { detail: { value: string } }): void;
  onCreate(): void;
  onDetail(event: { currentTarget: { dataset: { id: string } } }): void;
  onLogout(): Promise<void>;
}
Page<Data, Members>({
  data: { items: [], search: "", busy: false, error: "" },
  onShow() {
    void this.reload();
  },
  async reload() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: "" });
    try {
      await ensureMerchantLogin();
      this.setData({ items: await wifiSpotService.list(this.data.search) });
    } catch (error) {
      this.setData({ error: merchantError(error) });
    } finally {
      this.setData({ busy: false });
    }
  },
  onSearch(event) {
    this.setData({ search: event.detail.value });
  },
  onCreate() {
    wx.navigateTo({ url: "/pages/manage/create" });
  },
  onDetail(event) {
    wx.navigateTo({
      url: `/pages/manage/detail?id=${encodeURIComponent(event.currentTarget.dataset.id)}`,
    });
  },
  async onLogout() {
    try {
      await wifiSpotService.logout();
      wx.reLaunch({ url: "/pages/connect/index?home=1" });
    } catch (error) {
      this.setData({ error: merchantError(error) });
    }
  },
});
