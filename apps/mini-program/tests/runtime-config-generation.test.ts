import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const executeFile = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatorPath = path.join(packageRoot, "scripts", "generate-runtime-config.mjs");
const temporaryRoots: string[] = [];

async function generate(
  mode: "trial" | "production",
  apiBaseUrl: string,
  allowPlaceholder = false,
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "mini-runtime-config-test-"));
  temporaryRoots.push(root);
  const outputPath = path.join(root, "runtime.generated.ts");
  await executeFile(
    process.execPath,
    [generatorPath, mode === "trial" ? "--trial" : "--production", `--output=${outputPath}`],
    {
      env: {
        ...process.env,
        MINIPROGRAM_API_BASE_URL: apiBaseUrl,
        MINIPROGRAM_ALLOW_PLACEHOLDER_API: String(allowPlaceholder),
        MINIPROGRAM_ENABLE_LEGACY_WIFI_API: "false",
        MINIPROGRAM_AD_UNIT_ID: "",
      },
    },
  );
  return readFile(outputPath, "utf8");
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("mini-program runtime release gates", () => {
  it("rejects an example API in production even when the trial override is set", async () => {
    await expect(generate("production", "https://api.example.cn", true)).rejects.toThrow(
      /placeholder/u,
    );
  });

  it("requires trial placeholder use to be explicitly marked internal-only", async () => {
    await expect(generate("trial", "https://api.example.cn")).rejects.toThrow(
      /MINIPROGRAM_ALLOW_PLACEHOLDER_API=true/u,
    );
    await expect(generate("trial", "https://api.example.cn", true)).resolves.toContain(
      'apiBaseUrl: "https://api.example.cn"',
    );
  });

  it("accepts a non-example HTTPS API for production with safe defaults", async () => {
    const source = await generate("production", "https://api.scan-wifi-production.cn");
    expect(source).toContain('apiBaseUrl: "https://api.scan-wifi-production.cn"');
    expect(source).toContain("legacyWifiAdapterEnabled: false");
    expect(source).toContain('adUnitId: ""');
  });
});
