import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFileQrCodeStorage } from "../../src/services/qrcode-storage.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("LocalFileQrCodeStorage", () => {
  it("round-trips and removes a validated QR file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "scan-wifi-qr-storage-"));
    temporaryDirectories.push(directory);
    const storage = new LocalFileQrCodeStorage(directory);
    const scene = "a".repeat(32);
    const saved = await storage.save(scene, "png", Buffer.from("png fixture"));

    await expect(storage.read(saved.location)).resolves.toMatchObject({
      contentType: "image/png",
    });
    await storage.delete(saved.location);
    await expect(storage.read(saved.location)).rejects.toMatchObject({
      code: "QR_IMAGE_NOT_FOUND",
    });
  });

  it("rejects traversal-shaped locations without reading or deleting outside storage", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "scan-wifi-qr-storage-"));
    temporaryDirectories.push(directory);
    const storage = new LocalFileQrCodeStorage(directory);
    const traversal = "local://qrcodes/../../outside.png";

    await expect(storage.read(traversal)).rejects.toMatchObject({ code: "QR_IMAGE_NOT_FOUND" });
    await expect(storage.delete(traversal)).resolves.toBeUndefined();
  });
});
