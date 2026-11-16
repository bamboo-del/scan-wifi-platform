import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  verifyMiniProgramArtifact,
  type MiniProgramArtifactMode,
} from "../scripts/artifact-integrity.mjs";

const temporaryRoots: string[] = [];
const connectPage = "pages/connect/index";
const diagnosticsPage = "pages/wifi-diagnostics/index";

async function write(root: string, relativePath: string, content = "fixture"): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function createFixture(mode: MiniProgramArtifactMode): Promise<string> {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "mini-artifact-test-"));
  temporaryRoots.push(repositoryRoot);
  const packageRoot = path.join(repositoryRoot, "apps", "mini-program");
  const sourceRoot = path.join(packageRoot, "src");
  const artifactRoot = path.join(packageRoot, "dist");
  const pages = mode === "production" ? [connectPage] : [connectPage, diagnosticsPage];

  await write(sourceRoot, "app.ts", 'import "./core/mini-program-environment"; App({});');
  await write(
    sourceRoot,
    "app.json",
    JSON.stringify({
      pages: [connectPage],
      window: { navigationBarTitleText: "轻连 WiFi" },
      lazyCodeLoading: "requiredComponents",
    }),
  );
  await write(sourceRoot, "app.wxss");
  await write(sourceRoot, "sitemap.json", JSON.stringify({ rules: [] }));
  await write(
    sourceRoot,
    "core/wifi-diagnostics-environment.ts",
    "export const isWifiDiagnosticsEnvironment = () => true;",
  );
  await write(
    sourceRoot,
    "core/mini-program-environment.ts",
    'export { isWifiDiagnosticsEnvironment } from "./wifi-diagnostics-environment";',
  );
  await write(sourceRoot, "core/wifi-diagnostics.ts", "export const diagnostic = true;");
  await write(
    sourceRoot,
    `${connectPage}.ts`,
    'import "../../core/wifi-diagnostics-environment"; Page({ data: {} });',
  );
  await write(sourceRoot, `${connectPage}.json`, "{}");
  await write(sourceRoot, `${connectPage}.wxml`, "<view />");
  await write(sourceRoot, `${connectPage}.wxss`, "page {}");
  await write(
    sourceRoot,
    `${diagnosticsPage}.ts`,
    'import "../../core/wifi-diagnostics"; Page({ data: {} });',
  );
  await write(sourceRoot, `${diagnosticsPage}.json`, "{}");
  await write(sourceRoot, `${diagnosticsPage}.wxml`, "<view />");
  await write(sourceRoot, `${diagnosticsPage}.wxss`, "page {}");

  await write(
    artifactRoot,
    "app.js",
    '"use strict"; require("./core/mini-program-environment"); App({});',
  );
  await write(
    artifactRoot,
    "app.json",
    JSON.stringify({
      pages,
      window: { navigationBarTitleText: "轻连 WiFi" },
      lazyCodeLoading: "requiredComponents",
    }),
  );
  await write(artifactRoot, "app.wxss");
  await write(artifactRoot, "sitemap.json", JSON.stringify({ rules: [] }));
  await write(
    artifactRoot,
    `${connectPage}.js`,
    '"use strict"; require("../../core/wifi-diagnostics-environment"); Page({ data: {} });',
  );
  await write(artifactRoot, `${connectPage}.json`, "{}");
  await write(artifactRoot, `${connectPage}.wxml`, "<view />");
  await write(artifactRoot, `${connectPage}.wxss`, "page {}");
  await write(
    artifactRoot,
    "core/wifi-diagnostics-environment.js",
    '"use strict"; exports.isWifiDiagnosticsEnvironment = () => true;',
  );
  await write(
    artifactRoot,
    "core/mini-program-environment.js",
    '"use strict"; require("./wifi-diagnostics-environment");',
  );
  if (mode !== "production") {
    await write(
      artifactRoot,
      `${diagnosticsPage}.js`,
      '"use strict"; require("../../core/wifi-diagnostics"); Page({ data: {} });',
    );
    await write(artifactRoot, `${diagnosticsPage}.json`, "{}");
    await write(artifactRoot, `${diagnosticsPage}.wxml`, "<view />");
    await write(artifactRoot, `${diagnosticsPage}.wxss`, "page {}");
    await write(artifactRoot, "core/wifi-diagnostics.js", '"use strict"; exports.value = true;');
  }
  await write(
    artifactRoot,
    "config/runtime.generated.js",
    'export const config = { apiBaseUrl: "https://api.scan-wifi-production.cn", legacyWifiAdapterEnabled: false, adUnitId: "" };',
  );
  return packageRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("mini-program artifact integrity", () => {
  it.each<MiniProgramArtifactMode>(["development", "trial", "production"])(
    "accepts a complete %s artifact",
    async (mode) => {
      const packageRoot = await createFixture(mode);
      const summary = await verifyMiniProgramArtifact({ packageRoot, mode });
      expect(summary.pages[0]).toBe(connectPage);
      expect(summary.diagnosticsIncluded).toBe(mode !== "production");
      expect(summary.relativeDependenciesChecked).toBeGreaterThanOrEqual(
        mode === "production" ? 3 : 4,
      );
    },
  );

  it("rejects a page listed in app.json without JavaScript", async () => {
    const packageRoot = await createFixture("development");
    await rm(path.join(packageRoot, "dist", `${connectPage}.js`));
    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "development" })).rejects.toThrow(
      "pages/connect/index.js: page artifact is missing",
    );
  });

  it("rejects incomplete page WXML, WXSS or JSON", async () => {
    const packageRoot = await createFixture("development");
    await rm(path.join(packageRoot, "dist", `${diagnosticsPage}.wxml`));
    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "development" })).rejects.toThrow(
      "pages/wifi-diagnostics/index.wxml: page artifact is missing",
    );
  });

  it.each([
    "<text selectable>result</text>",
    '<text selectable="true">result</text>',
    '<text selectable="{{canSelect}}">result</text>',
  ])("rejects a deprecated text selectable attribute: %s", async (wxml) => {
    const packageRoot = await createFixture("trial");
    await write(packageRoot, `dist/${diagnosticsPage}.wxml`, wxml);

    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "trial" })).rejects.toThrow(
      "text selectable attribute is deprecated; use user-select instead",
    );
  });

  it("accepts the text user-select replacement", async () => {
    const packageRoot = await createFixture("trial");
    await write(
      packageRoot,
      `dist/${diagnosticsPage}.wxml`,
      '<text user-select="true">result</text>',
    );

    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "trial" })).resolves.toBeDefined();
  });

  it("rejects known mojibake markers in runtime text files", async () => {
    const packageRoot = await createFixture("trial");
    const corruptedBrand = String.fromCodePoint(0x675e, 0x660f, 0x7e5b);
    await write(packageRoot, `dist/${connectPage}.wxml`, `<view>${corruptedBrand} WiFi</view>`);
    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "trial" })).rejects.toThrow(
      "contains a known mojibake marker",
    );
  });

  it("rejects server secret markers in the runtime artifact", async () => {
    const packageRoot = await createFixture("development");
    const marker = ["WECHAT", "APP", "SECRET"].join("_");
    await write(packageRoot, "dist/config/leak.js", `const leaked = "${marker}";`);
    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "development" })).rejects.toThrow(
      "contains forbidden server marker",
    );
  });

  it("rejects a manifest without required-components lazy loading", async () => {
    const packageRoot = await createFixture("development");
    await write(
      packageRoot,
      "dist/app.json",
      JSON.stringify({
        pages: [connectPage, diagnosticsPage],
        window: { navigationBarTitleText: "轻连 WiFi" },
      }),
    );
    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "development" })).rejects.toThrow(
      'lazyCodeLoading must be "requiredComponents"',
    );
  });

  it("rejects test data in a production artifact", async () => {
    const packageRoot = await createFixture("production");
    await write(packageRoot, "dist/tests/device-result.test.js", "export {};");
    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "production" })).rejects.toThrow(
      "test source or test data leaked",
    );
  });

  it("rejects diagnostics source in a production artifact", async () => {
    const packageRoot = await createFixture("production");
    await write(packageRoot, "dist/core/wifi-diagnostics.js", "export {};");
    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "production" })).rejects.toThrow(
      "diagnostics source leaked into the production artifact",
    );
  });

  it("rejects management pages in a production customer artifact", async () => {
    const packageRoot = await createFixture("production");
    await write(packageRoot, "dist/pages/manage/list.js", "Page({});");
    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "production" })).rejects.toThrow(
      "non-customer page leaked",
    );
  });

  it("allows an explicitly enabled adapter while keeping production page and secret gates", async () => {
    const packageRoot = await createFixture("production");
    await write(
      packageRoot,
      "dist/config/runtime.generated.js",
      'export const config = { apiBaseUrl: "https://api.scan-wifi-production.cn", legacyWifiAdapterEnabled: true, adUnitId: "" };',
    );
    await expect(
      verifyMiniProgramArtifact({ packageRoot, mode: "production" }),
    ).resolves.toMatchObject({ pages: [connectPage] });
  });

  it("rejects an example API in a production artifact", async () => {
    const packageRoot = await createFixture("production");
    await write(
      packageRoot,
      "dist/config/runtime.generated.js",
      'export const config = { apiBaseUrl: "https://api.example.cn", legacyWifiAdapterEnabled: false, adUnitId: "" };',
    );
    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "production" })).rejects.toThrow(
      "production API URL must be real HTTPS",
    );
  });

  it("rejects customer input fields in a production connection page", async () => {
    const packageRoot = await createFixture("production");
    await write(packageRoot, `dist/${connectPage}.wxml`, '<input name="password" />');
    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "production" })).rejects.toThrow(
      "release customer page must not contain input fields",
    );
  });

  it("allows only the fixed daily analytics ID storage contract", async () => {
    const packageRoot = await createFixture("production");
    await write(
      packageRoot,
      "dist/services/analytics.js",
      'storage.getStorageSync("wifi-visit-day"); storage.setStorageSync("wifi-visit-day", { day, id });',
    );
    await expect(
      verifyMiniProgramArtifact({ packageRoot, mode: "production" }),
    ).resolves.toBeDefined();
    await write(
      packageRoot,
      "dist/services/analytics.js",
      'storage.setStorageSync("wifi-visit-day", { day, id, password });',
    );
    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "production" })).rejects.toThrow(
      "must not persist customer connection data locally",
    );
    await write(
      packageRoot,
      "dist/services/analytics.js",
      'storage.setStorageSync("wifi-credentials", { day, id });',
    );
    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "production" })).rejects.toThrow(
      "must not persist customer connection data locally",
    );
  });

  it("rejects customer local storage calls in a production artifact", async () => {
    const packageRoot = await createFixture("production");
    await write(
      packageRoot,
      `dist/${connectPage}.js`,
      'require("../../core/wifi-diagnostics-environment"); wx.setStorage({ key: "wifi" });',
    );
    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "production" })).rejects.toThrow(
      "must not persist customer connection data locally",
    );
  });

  it.each<MiniProgramArtifactMode>(["development", "trial", "production"])(
    "rejects the missing diagnostics environment dependency in %s",
    async (mode) => {
      const packageRoot = await createFixture(mode);
      await rm(path.join(packageRoot, "dist/core/wifi-diagnostics-environment.js"));

      await expect(verifyMiniProgramArtifact({ packageRoot, mode })).rejects.toThrow(
        "relative require ../../core/wifi-diagnostics-environment cannot resolve",
      );
    },
  );

  it.each<MiniProgramArtifactMode>(["development", "trial", "production"])(
    "rejects the missing mini-program environment dependency in %s",
    async (mode) => {
      const packageRoot = await createFixture(mode);
      await rm(path.join(packageRoot, "dist/core/mini-program-environment.js"));

      await expect(verifyMiniProgramArtifact({ packageRoot, mode })).rejects.toThrow(
        "app.js: relative require ./core/mini-program-environment cannot resolve",
      );
    },
  );

  it.each<MiniProgramArtifactMode>(["development", "trial"])(
    "rejects the missing diagnostics page runtime dependency in %s",
    async (mode) => {
      const packageRoot = await createFixture(mode);
      await rm(path.join(packageRoot, "dist/core/wifi-diagnostics.js"));

      await expect(verifyMiniProgramArtifact({ packageRoot, mode })).rejects.toThrow(
        "pages/wifi-diagnostics/index.js: relative require ../../core/wifi-diagnostics cannot resolve",
      );
    },
  );

  it("rejects a relative dependency with mismatched casing", async () => {
    const packageRoot = await createFixture("development");
    await rm(path.join(packageRoot, "dist/core/wifi-diagnostics-environment.js"));
    await write(
      packageRoot,
      "dist/core/Wifi-Diagnostics-Environment.js",
      '"use strict"; export {};',
    );

    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "development" })).rejects.toThrow(
      "has a casing mismatch",
    );
  });

  it("resolves a relative dependency through an index.js", async () => {
    const packageRoot = await createFixture("development");
    await write(
      packageRoot,
      `dist/${connectPage}.js`,
      'require("../../core/wifi-diagnostics-environment"); require("../../core/feature"); Page({});',
    );
    await write(packageRoot, "dist/core/feature/index.js", '"use strict"; export {};');

    const summary = await verifyMiniProgramArtifact({ packageRoot, mode: "development" });
    expect(summary.relativeDependenciesChecked).toBe(5);
  });

  it("resolves an extensionless module name that contains a dot", async () => {
    const packageRoot = await createFixture("development");
    await write(
      packageRoot,
      `dist/${connectPage}.js`,
      'require("../../core/wifi-diagnostics-environment"); require("../../config/runtime.generated"); Page({});',
    );

    const summary = await verifyMiniProgramArtifact({ packageRoot, mode: "development" });
    expect(summary.relativeDependenciesChecked).toBe(5);
  });

  it("resolves static imports, re-exports and dynamic imports", async () => {
    const packageRoot = await createFixture("development");
    await write(
      packageRoot,
      "dist/core/import-owner.js",
      'import "./static-target"; export { value } from "./export-target.js"; import("./dynamic-target");',
    );
    await write(packageRoot, "dist/core/static-target.js", "export {};");
    await write(packageRoot, "dist/core/export-target.js", "export const value = true;");
    await write(packageRoot, "dist/core/dynamic-target.js", "export {};");

    const summary = await verifyMiniProgramArtifact({ packageRoot, mode: "development" });
    expect(summary.relativeDependenciesChecked).toBe(7);
  });

  it("rejects a missing dynamic import", async () => {
    const packageRoot = await createFixture("development");
    await write(packageRoot, "dist/core/import-owner.js", 'import("./missing-target");');

    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "development" })).rejects.toThrow(
      "core/import-owner.js: relative dynamic import ./missing-target cannot resolve",
    );
  });

  it("normalizes Windows separators in relative dependencies", async () => {
    const packageRoot = await createFixture("development");
    await write(packageRoot, "dist/core/windows-owner.js", 'require(".\\\\windows-target");');
    await write(packageRoot, "dist/core/windows-target.js", "export {};");

    const summary = await verifyMiniProgramArtifact({ packageRoot, mode: "development" });
    expect(summary.relativeDependenciesChecked).toBe(5);
  });

  it("accepts a complete local component and ignores WeChat or plugin components", async () => {
    const packageRoot = await createFixture("development");
    await write(
      packageRoot,
      `dist/${connectPage}.json`,
      JSON.stringify({
        usingComponents: {
          statusCard: "../../components/status/index",
          builtIn: "wx://not-found",
          pluginCard: "plugin://example/card",
        },
      }),
    );
    for (const extension of [".js", ".json", ".wxml", ".wxss"]) {
      await write(
        packageRoot,
        `dist/components/status/index${extension}`,
        extension === ".json" ? "{}" : "fixture",
      );
    }

    const summary = await verifyMiniProgramArtifact({ packageRoot, mode: "development" });
    expect(summary.localComponentsChecked).toBe(1);
  });

  it("rejects an incomplete local component", async () => {
    const packageRoot = await createFixture("development");
    await write(
      packageRoot,
      `dist/${connectPage}.json`,
      JSON.stringify({ usingComponents: { statusCard: "../../components/status/index" } }),
    );
    for (const extension of [".js", ".json", ".wxss"]) {
      await write(packageRoot, `dist/components/status/index${extension}`);
    }

    await expect(verifyMiniProgramArtifact({ packageRoot, mode: "development" })).rejects.toThrow(
      "local component statusCard at ../../components/status/index is incomplete or missing",
    );
  });
});
