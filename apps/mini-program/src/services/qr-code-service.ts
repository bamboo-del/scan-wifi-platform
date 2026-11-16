export async function saveImage(filePath: string): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    wx.saveImageToPhotosAlbum({
      filePath,
      success: resolve,
      fail: () => reject(new Error("未能保存图片，请在小程序设置中允许保存相册后重试")),
    }),
  );
}

/** Compose the downloaded WeChat image; never encode a second QR in Canvas. */
export async function createPoster(
  imagePath: string,
  shopName: string,
  page: object,
): Promise<string> {
  const ctx = wx.createCanvasContext("wifi-poster", page);
  ctx.setFillStyle("#ffffff");
  ctx.fillRect(0, 0, 600, 750);
  ctx.setFillStyle("#16211f");
  ctx.setTextAlign("center");
  ctx.setFontSize(40);
  ctx.fillText("免费 WiFi", 300, 95);
  ctx.setFontSize(22);
  ctx.fillText("微信扫码连接 WiFi", 300, 145);
  ctx.drawImage(imagePath, 85, 190, 430, 430);
  ctx.setFontSize(24);
  ctx.fillText(shopName.length > 20 ? `${shopName.slice(0, 20)}…` : shopName, 300, 682);
  await new Promise<void>((resolve) => ctx.draw(false, resolve));
  return new Promise((resolve, reject) =>
    wx.canvasToTempFilePath(
      {
        canvasId: "wifi-poster",
        width: 600,
        height: 750,
        destWidth: 1200,
        destHeight: 1500,
        fileType: "png",
        success: (result) => resolve(result.tempFilePath),
        fail: () => reject(new Error("海报制作失败，请重试")),
      },
      page,
    ),
  );
}
