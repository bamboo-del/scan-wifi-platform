import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { assertReleaseApiBaseUrl } from "./production-gates.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const productionMode = process.argv.includes("--production");
const clientRoots = ["apps/admin-web", "apps/mini-program"];
const textExtensions = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".wxml",
  ".html",
  ".css",
  ".map",
]);
const ignoredDirectories = new Set([
  "node_modules",
  "coverage",
  "test-results",
  "playwright-report",
]);
const forbiddenServerMarkers = [
  "WECHAT_APP_SECRET",
  "WIFI_ENCRYPTION_KEY_BASE64",
  "SESSION_SECRET",
  "DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "POSTGRES_OWNER_PASSWORD",
  "POSTGRES_APP_PASSWORD",
  "INITIAL_ADMIN_PASSWORD",
];
const secretEnvironmentNames = [
  "WECHAT_APP_SECRET",
  "WIFI_ENCRYPTION_KEY_BASE64",
  "SESSION_SECRET",
  "DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "POSTGRES_OWNER_PASSWORD",
  "POSTGRES_APP_PASSWORD",
  "INITIAL_ADMIN_PASSWORD",
];
const viteSecretNamePattern =
  /\bVITE_[A-Z0-9_]*(?:SECRET|PASSWORD|DATABASE|ENCRYPTION|SESSION|PRIVATE_KEY|TOKEN)[A-Z0-9_]*\b/g;

async function loadSecretValues() {
  const values = new Map();
  for (const environmentFile of [".env", ".env.production"]) {
    const content = await readFile(join(rootPath, environmentFile), "utf8").catch(() => "");
    for (const line of content.split(/\r?\n/u)) {
      const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/u.exec(line);
      if (!match || !secretEnvironmentNames.includes(match[1])) continue;
      const value = match[2].replace(/^(["'])(.*)\1$/u, "$2");
      if (value.length >= 8) values.set(match[1], value);
    }
  }

  for (const name of secretEnvironmentNames) {
    const value = process.env[name];
    if (value && value.length >= 8) values.set(name, value);
  }

  return values;
}

async function collectFiles(path) {
  const pathStat = await stat(path).catch(() => undefined);
  if (!pathStat) return [];
  if (pathStat.isFile()) return [path];

  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !ignoredDirectories.has(entry.name))
      .map((entry) => collectFiles(join(path, entry.name))),
  );
  return nested.flat();
}

const findings = [];
const secretValues = await loadSecretValues();

if (productionMode) {
  const adminIndex = join(rootPath, "apps/admin-web/dist/index.html");
  const runtimeConfig = join(rootPath, "apps/mini-program/dist/config/runtime.generated.js");
  const miniProgramManifest = join(rootPath, "apps/mini-program/dist/app.json");
  const diagnosticsPageDirectory = join(rootPath, "apps/mini-program/dist/pages/wifi-diagnostics");
  const adminIndexStat = await stat(adminIndex).catch(() => undefined);
  const generatedRuntime = await readFile(runtimeConfig, "utf8").catch(() => "");
  const generatedManifest = await readFile(miniProgramManifest, "utf8").catch(() => "");
  const diagnosticsPageStat = await stat(diagnosticsPageDirectory).catch(() => undefined);

  if (!adminIndexStat?.isFile()) {
    findings.push("apps/admin-web/dist/index.html: production build output is missing");
  }
  if (!/apiBaseUrl:\s*"https:\/\//u.test(generatedRuntime)) {
    findings.push(
      "apps/mini-program/dist/config/runtime.generated.js: production HTTPS API URL is missing",
    );
  }
  const apiBaseUrlLiteral = /\bapiBaseUrl:\s*("(?:[^"\\]|\\.)*")/u.exec(generatedRuntime)?.[1];
  try {
    if (!apiBaseUrlLiteral) throw new Error("missing API URL");
    assertReleaseApiBaseUrl(JSON.parse(apiBaseUrlLiteral));
  } catch {
    findings.push(
      "apps/mini-program/dist/config/runtime.generated.js: production API URL is an example placeholder or otherwise non-publishable",
    );
  }
  if (generatedRuntime.includes("allowInsecureLocalhost: true")) {
    findings.push(
      "apps/mini-program/dist/config/runtime.generated.js: insecure localhost is enabled",
    );
  }
  if (
    !generatedRuntime.includes(
      `legacyWifiAdapterEnabled: ${process.env.MINIPROGRAM_ENABLE_LEGACY_WIFI_API === "true"}`,
    )
  ) {
    findings.push(
      "apps/mini-program/dist/config/runtime.generated.js: production legacy Wi-Fi API must match the explicit build setting",
    );
  }
  try {
    const pages = JSON.parse(generatedManifest).pages;
    if (!Array.isArray(pages) || pages.includes("pages/wifi-diagnostics/index")) {
      findings.push(
        "apps/mini-program/dist/app.json: production manifest must exclude the Wi-Fi diagnostic page",
      );
    }
  } catch {
    findings.push(
      "apps/mini-program/dist/app.json: production manifest is missing or invalid JSON",
    );
  }
  if (diagnosticsPageStat) {
    findings.push(
      "apps/mini-program/dist/pages/wifi-diagnostics: production diagnostic page artifact must not exist",
    );
  }
}

for (const clientRoot of clientRoots) {
  const absoluteRoot = join(rootPath, clientRoot);
  const files = await collectFiles(absoluteRoot);
  for (const file of files) {
    if (!textExtensions.has(extname(file))) continue;
    const content = await readFile(file, "utf8");
    const displayPath = relative(rootPath, file);

    for (const marker of forbiddenServerMarkers) {
      if (content.includes(marker)) {
        findings.push(`${displayPath}: contains forbidden server marker ${marker}`);
      }
    }

    for (const [environmentName, value] of secretValues) {
      if (content.includes(value)) {
        findings.push(`${displayPath}: contains the current value of ${environmentName}`);
      }
    }

    for (const match of content.matchAll(viteSecretNamePattern)) {
      findings.push(`${displayPath}: contains forbidden secret-like client variable ${match[0]}`);
    }
  }
}

if (productionMode) {
  for (const artifactRoot of ["apps/api/dist", "apps/admin-web/dist"]) {
    const files = await collectFiles(join(rootPath, artifactRoot));
    for (const file of files) {
      if (!textExtensions.has(extname(file))) continue;
      const content = await readFile(file, "utf8");
      for (const [environmentName, value] of secretValues) {
        if (content.includes(value)) {
          findings.push(
            `${relative(rootPath, file)}: production artifact contains the current value of ${environmentName}`,
          );
        }
      }
    }
  }
}

if (findings.length > 0) {
  console.error(
    "Client secret boundary scan failed:\n" + findings.map((item) => `- ${item}`).join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log(
    productionMode
      ? "Production client build secret boundary scan passed."
      : "Client secret boundary scan passed.",
  );
}
