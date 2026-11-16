import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "../lib/errors.js";

export interface StoredQrCode {
  location: string;
}

export interface QrCodeStorage {
  save(sceneToken: string, extension: "png" | "svg", content: Buffer): Promise<StoredQrCode>;
  read(location: string): Promise<{ content: Buffer; contentType: "image/png" | "image/svg+xml" }>;
  delete(location: string): Promise<void>;
}

export class LocalFileQrCodeStorage implements QrCodeStorage {
  private readonly directory: string;

  public constructor(directory: string) {
    this.directory = path.resolve(directory);
  }

  public async save(
    sceneToken: string,
    extension: "png" | "svg",
    content: Buffer,
  ): Promise<StoredQrCode> {
    await mkdir(this.directory, { recursive: true });
    const filename = `${sceneToken}.${extension}`;
    await writeFile(path.join(this.directory, filename), content, { flag: "wx" });
    return { location: `local://qrcodes/${filename}` };
  }

  public async read(
    location: string,
  ): Promise<{ content: Buffer; contentType: "image/png" | "image/svg+xml" }> {
    const match = /^local:\/\/qrcodes\/([a-f0-9]{32}\.(png|svg))$/u.exec(location);
    if (!match?.[1] || !match[2]) throw notFound("QR_IMAGE_NOT_FOUND", "二维码图片不存在");
    try {
      return {
        content: await readFile(path.join(this.directory, match[1])),
        contentType: match[2] === "png" ? "image/png" : "image/svg+xml",
      };
    } catch {
      throw notFound("QR_IMAGE_NOT_FOUND", "二维码图片不存在");
    }
  }

  public async delete(location: string): Promise<void> {
    const match = /^local:\/\/qrcodes\/([a-f0-9]{32}\.(?:png|svg))$/u.exec(location);
    if (!match?.[1]) return;
    await rm(path.join(this.directory, match[1]), { force: true });
  }
}
