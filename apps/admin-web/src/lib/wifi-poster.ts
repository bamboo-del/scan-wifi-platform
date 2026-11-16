import { api } from "./api";
import type { QrCodeResponse } from "./types";

/** Render the actual server-generated code, preserving its aspect ratio and quiet area. */
export async function createWifiPoster(storeName: string, qr: QrCodeResponse): Promise<Blob> {
  const response = await fetch(api.assetUrl(qr.previewUrl), {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("无法读取小程序码，请重新登录后重试");
  const imageUrl = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1500;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持图片导出");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 1200, 1500);
    context.textAlign = "center";
    context.fillStyle = "#15242c";
    context.font = '500 44px "Microsoft YaHei", sans-serif';
    const lines: string[] = [];
    let line = "";
    for (const char of storeName) {
      if (context.measureText(line + char).width > 1040) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
    if (line) lines.push(line);
    lines
      .slice(0, 2)
      .forEach((text, i) =>
        context.fillText(text + (i === 1 && lines.length > 2 ? "…" : ""), 600, 110 + i * 60),
      );
    context.font = '700 92px "Microsoft YaHei", sans-serif';
    context.fillText("免费 WiFi", 600, 305);
    context.font = '400 42px "Microsoft YaHei", sans-serif';
    context.fillText("微信扫码连接", 600, 390);
    const ratio = Math.min(690 / image.width, 690 / image.height);
    const width = image.width * ratio,
      height = image.height * ratio;
    context.drawImage(image, (1200 - width) / 2, 470 + (690 - height) / 2, width, height);
    context.font = '500 42px "Microsoft YaHei", sans-serif';
    context.fillText("微信扫码 · 一键连接 WiFi", 600, 1260);
    context.font = '400 28px "Microsoft YaHei", sans-serif';
    context.fillStyle = "#52616a";
    context.fillText("连接遇到问题？可复制密码，在系统 Wi-Fi 设置中连接", 600, 1345);
    if (qr.provider === "local-placeholder") {
      context.fillStyle = "#b42318";
      context.fillText("仅供本地测试 · 非微信小程序码", 600, 1430);
    }
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("图片导出失败"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
