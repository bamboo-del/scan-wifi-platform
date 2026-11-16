import {
  ensureMerchantLogin,
  merchantError,
  wifiSpotService,
  type WifiSpot,
} from "../../services/wifi-spot-service";
import { createPoster, saveImage } from "../../services/qr-code-service";
interface Data {
  id: string;
  spot: WifiSpot | null;
  createdTime: string;
  imagePath: string;
  posterPath: string;
  busy: boolean;
  error: string;
}
interface Members {
  generateOnLoad: boolean;
  onLoad(query: Record<string, string>): void;
  onShow(): void;
  reload(): Promise<void>;
  onGenerate(): Promise<void>;
  onEdit(): void;
  onToggle(): Promise<void>;
  onDelete(): void;
  onSaveImage(): Promise<void>;
  onPoster(): Promise<void>;
  onSavePoster(): Promise<void>;
  onPreview(): void;
}
Page<Data, Members>({
  data: {
    id: "",
    spot: null,
    createdTime: "",
    imagePath: "",
    posterPath: "",
    busy: false,
    error: "",
  },
  generateOnLoad: false,
  onLoad(query) {
    this.setData({ id: query.id ?? "" });
    this.generateOnLoad = query.generate === "1";
  },
  onShow() {
    void this.reload();
  },
  async reload() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: "" });
    try {
      await ensureMerchantLogin();
      const spot = await wifiSpotService.get(this.data.id);
      this.setData({
        spot,
        createdTime: new Date(spot.createTime).toLocaleString("zh-CN", { hour12: false }),
      });
      if (spot.qrProvider === "wechat")
        this.setData({ imagePath: await wifiSpotService.image(spot.id) });
    } catch (error) {
      this.setData({ error: merchantError(error) });
    } finally {
      this.setData({ busy: false });
    }
    if (this.generateOnLoad) {
      this.generateOnLoad = false;
      await this.onGenerate();
    }
  },
  async onGenerate() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: "" });
    try {
      const spot = await wifiSpotService.generate(this.data.id);
      this.setData({
        spot,
        posterPath: "",
        imagePath: spot.qrProvider === "wechat" ? await wifiSpotService.image(spot.id) : "",
        error: "",
      });
    } catch (error) {
      this.setData({ error: merchantError(error) });
    } finally {
      this.setData({ busy: false });
    }
  },
  onEdit() {
    wx.navigateTo({ url: `/pages/manage/create?id=${encodeURIComponent(this.data.id)}` });
  },
  async onToggle() {
    if (!this.data.spot || this.data.busy) return;
    this.setData({ busy: true, error: "" });
    try {
      this.setData({
        spot: await wifiSpotService.status(
          this.data.id,
          this.data.spot.status === "active" ? "disabled" : "active",
        ),
      });
    } catch (error) {
      this.setData({ error: merchantError(error) });
    } finally {
      this.setData({ busy: false });
    }
  },
  onDelete() {
    if (this.data.busy) return;
    wx.showModal({
      title: "删除 WiFi 贴",
      content: "删除后已打印的码将不可用，无法恢复。",
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ busy: true });
        void wifiSpotService
          .remove(this.data.id)
          .then(() => wx.redirectTo({ url: "/pages/manage/list" }))
          .catch((error: unknown) => this.setData({ busy: false, error: merchantError(error) }));
      },
    });
  },
  async onSaveImage() {
    try {
      if (this.data.imagePath) {
        await saveImage(this.data.imagePath);
        wx.showToast({ title: "已保存到相册", icon: "success" });
      }
    } catch (error) {
      this.setData({ error: merchantError(error) });
    }
  },
  async onPoster() {
    if (!this.data.imagePath || !this.data.spot) return;
    try {
      this.setData({
        posterPath: await createPoster(this.data.imagePath, this.data.spot.shopName, this),
      });
    } catch (error) {
      this.setData({ error: merchantError(error) });
    }
  },
  async onSavePoster() {
    try {
      if (this.data.posterPath) {
        await saveImage(this.data.posterPath);
        wx.showToast({ title: "已保存到相册", icon: "success" });
      }
    } catch (error) {
      this.setData({ error: merchantError(error) });
    }
  },
  onPreview() {
    if (this.data.imagePath) wx.previewImage({ urls: [this.data.imagePath] });
  },
});
