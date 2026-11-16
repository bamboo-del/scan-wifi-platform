import { takeVerifiedConnection } from "../../services/connection-result";
interface Data {
  ssid: string;
  storeName: string;
  verified: boolean;
}
Page<Data, { onLoad(): void; onHome(): void }>({
  data: { ssid: "", storeName: "", verified: false },
  onLoad() {
    const result = takeVerifiedConnection();
    if (result) this.setData({ ...result, verified: true });
  },
  onHome() {
    wx.reLaunch({ url: "/pages/connect/index?home=1" });
  },
});
