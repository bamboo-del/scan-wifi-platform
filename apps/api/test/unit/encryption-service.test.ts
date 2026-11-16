import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EncryptionService } from "../../src/services/encryption-service.js";

describe("EncryptionService", () => {
  it("round-trips Wi-Fi passwords with AES-256-GCM", () => {
    const service = new EncryptionService(randomBytes(32).toString("base64"));
    const encrypted = service.encrypt("correct horse battery staple", "wifi-config:v1:store-a");
    expect(encrypted.ciphertext).not.toContain("correct horse");
    expect(service.decrypt(encrypted, "wifi-config:v1:store-a")).toBe(
      "correct horse battery staple",
    );
  });

  it("fails closed when ciphertext is tampered with", () => {
    const service = new EncryptionService(randomBytes(32).toString("base64"));
    const encrypted = service.encrypt("secure-password", "wifi-config:v1:store-a");
    const bytes = Buffer.from(encrypted.ciphertext, "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    expect(() =>
      service.decrypt(
        { ...encrypted, ciphertext: bytes.toString("base64") },
        "wifi-config:v1:store-a",
      ),
    ).toThrow();
  });

  it("binds ciphertext to its store context", () => {
    const service = new EncryptionService(randomBytes(32).toString("base64"));
    const encrypted = service.encrypt("secure-password", "wifi-config:v1:store-a");
    expect(() => service.decrypt(encrypted, "wifi-config:v1:store-b")).toThrow();
  });
});
