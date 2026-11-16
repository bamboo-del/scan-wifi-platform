import type { PasswordHasher } from "../../src/services/password-service.js";
import type { GeneratedQrCode, QrCodeProvider } from "../../src/services/qrcode-provider.js";
import type { QrCodeStorage, StoredQrCode } from "../../src/services/qrcode-storage.js";

export class FastPasswordHasher implements PasswordHasher {
  public async hash(password: string): Promise<string> {
    return `test:${password}`;
  }

  public async verify(hash: string, password: string): Promise<boolean> {
    return hash === "test-hash" && password === "correct horse battery staple";
  }
}

export class FakeQrCodeProvider implements QrCodeProvider {
  public readonly kind = "local-placeholder" as const;

  public async generate(sceneToken: string): Promise<GeneratedQrCode> {
    return {
      content: Buffer.from(`LOCAL TEST ONLY ${sceneToken}`),
      contentType: "image/svg+xml",
      extension: "svg",
    };
  }
}

export class MemoryQrCodeStorage implements QrCodeStorage {
  private readonly values = new Map<string, Buffer>();

  public get size(): number {
    return this.values.size;
  }

  public async save(
    sceneToken: string,
    extension: "png" | "svg",
    content: Buffer,
  ): Promise<StoredQrCode> {
    const location = `local://qrcodes/${sceneToken}.${extension}`;
    this.values.set(location, content);
    return { location };
  }

  public async read(
    location: string,
  ): Promise<{ content: Buffer; contentType: "image/png" | "image/svg+xml" }> {
    const content = this.values.get(location);
    if (!content) throw new Error("missing fake QR image");
    return { content, contentType: location.endsWith(".png") ? "image/png" : "image/svg+xml" };
  }

  public async delete(location: string): Promise<void> {
    this.values.delete(location);
  }
}
