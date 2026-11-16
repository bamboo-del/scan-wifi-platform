import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const executeFile = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatorPath = path.join(packageRoot, "scripts", "generate-app-manifest.mjs");
const temporaryRoots: string[] = [];

async function generateManifest(production: boolean): Promise<Record<string, unknown>> {
  const root = await mkdtemp(path.join(tmpdir(), "mini-manifest-test-"));
  temporaryRoots.push(root);
  const sourcePath = path.join(root, "app.source.json");
  const outputPath = path.join(root, "app.output.json");
  await writeFile(
    sourcePath,
    JSON.stringify({
      pages: ["pages/connect/index", "pages/manage/list", "pages/success/index"],
      window: { navigationBarTitleText: "Wi-Fi" },
      lazyCodeLoading: "requiredComponents",
    }),
    "utf8",
  );
  await executeFile(process.execPath, [
    generatorPath,
    ...(production ? ["--production"] : []),
    `--source=${sourcePath}`,
    `--output=${outputPath}`,
  ]);
  return JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("mini-program manifest generation", () => {
  it.each([
    ["develop/trial", false, true],
    ["release", true, false],
  ] as const)("preserves lazy loading for %s", async (_label, production, diagnosticsExpected) => {
    const manifest = await generateManifest(production);
    expect(manifest.lazyCodeLoading).toBe("requiredComponents");
    expect((manifest.pages as string[]).includes("pages/wifi-diagnostics/index")).toBe(
      diagnosticsExpected,
    );
    if (production) expect(manifest.pages).toEqual(["pages/connect/index"]);
  });
});
