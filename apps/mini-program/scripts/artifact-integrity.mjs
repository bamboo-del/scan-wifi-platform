import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertReleaseApiBaseUrl } from "../../../scripts/production-gates.mjs";

const diagnosticsPage = "pages/wifi-diagnostics/index";
const textExtensions = new Set([".js", ".json", ".wxml", ".wxss", ".svg"]);
const forbiddenMarkers = [
  ["WECHAT", "APP", "SECRET"].join("_"),
  ["WIFI", "ENCRYPTION", "KEY", "BASE64"].join("_"),
  ["SESSION", "SECRET"].join("_"),
  ["DATABASE", "URL"].join("_"),
  ["MIGRATION", "DATABASE", "URL"].join("_"),
  ["POSTGRES", "OWNER", "PASSWORD"].join("_"),
  ["POSTGRES", "APP", "PASSWORD"].join("_"),
  ["INITIAL", "ADMIN", "PASSWORD"].join("_"),
];
const viteSecretPattern =
  /\bVITE_[A-Z0-9_]*(?:SECRET|PASSWORD|DATABASE|ENCRYPTION|SESSION|PRIVATE_KEY|TOKEN)[A-Z0-9_]*\b/gu;
const relativeModulePatterns = [
  ["require", /\brequire\s*\(\s*(["'])(\.\.?[\\/][^"'\r\n]+)\1\s*\)/gu],
  ["dynamic import", /\bimport\s*\(\s*(["'])(\.\.?[\\/][^"'\r\n]+)\1\s*\)/gu],
  [
    "static import",
    /\b(?:import|export)\s+(?:[^"'();]*?\s+from\s*)?(["'])(\.\.?[\\/][^"'\r\n]+)\1/gu,
  ],
];
const componentExtensions = [".js", ".json", ".wxml", ".wxss"];
const externalComponentPrefixes = ["wx://", "plugin://", "dynamicLib://", "ext://"];
const textOpeningTagPattern = /<text\b[^>]*>/giu;
const deprecatedSelectableAttributePattern = /(?:^|\s)selectable(?=\s|=|\/?>)/iu;

async function isFile(filePath) {
  return (await stat(filePath).catch(() => undefined))?.isFile() === true;
}

async function collectFiles(root) {
  const rootStat = await stat(root).catch(() => undefined);
  if (!rootStat) return [];
  if (rootStat.isFile()) return [root];

  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => collectFiles(path.join(root, entry.name))),
  );
  return nested.flat();
}

function isProductionExcluded(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  return (
    normalized.startsWith("pages/wifi-diagnostics/") || normalized === "core/wifi-diagnostics.ts"
  );
}

function isTestArtifact(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  return (
    /(?:^|\/)(?:tests?|__tests__)(?:\/|$)/u.test(normalized) ||
    /\.(?:test|spec)\.js$/u.test(normalized)
  );
}

function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}

function isProductionDiagnosticArtifact(relativePath) {
  const normalized = toPosixPath(relativePath);
  return (
    normalized.startsWith("pages/wifi-diagnostics/") || normalized === "core/wifi-diagnostics.js"
  );
}

function resolveArtifactReference(ownerRelativePath, reference) {
  const normalizedReference = toPosixPath(reference);
  const resolved = path.posix.normalize(
    normalizedReference.startsWith("/")
      ? normalizedReference.slice(1)
      : path.posix.join(path.posix.dirname(ownerRelativePath), normalizedReference),
  );
  if (resolved === ".." || resolved.startsWith("../") || path.posix.isAbsolute(resolved)) {
    return null;
  }
  return resolved;
}

function runtimeDependencyCandidates(ownerRelativePath, reference) {
  const resolved = resolveArtifactReference(ownerRelativePath, reference);
  if (!resolved) return [];
  return [".js", ".json", ".node"].some((extension) => resolved.endsWith(extension))
    ? [resolved]
    : [`${resolved}.js`, path.posix.join(resolved, "index.js")];
}

function componentBaseCandidates(ownerRelativePath, reference) {
  const resolved = resolveArtifactReference(ownerRelativePath, reference);
  if (!resolved) return [];
  const extension = path.posix.extname(resolved);
  const base = componentExtensions.includes(extension)
    ? resolved.slice(0, -extension.length)
    : resolved;
  return [base, path.posix.join(base, "index")];
}

function findCaseMismatch(candidates, caseInsensitiveFileMap) {
  for (const candidate of candidates) {
    const actual = caseInsensitiveFileMap.get(candidate.toLowerCase());
    if (actual && actual !== candidate) {
      return { expected: candidate, actual };
    }
  }
  return null;
}

function collectRelativeModuleReferences(content) {
  const references = [];
  for (const [kind, pattern] of relativeModulePatterns) {
    for (const match of content.matchAll(pattern)) {
      references.push({ kind, reference: match[2], index: match.index ?? 0 });
    }
  }
  return references.sort((left, right) => left.index - right.index);
}

async function loadCurrentSecretValues(repositoryRoot) {
  const secretNames = new Set(forbiddenMarkers);
  const values = new Map();
  for (const environmentFile of [".env", ".env.production"]) {
    const content = await readFile(path.join(repositoryRoot, environmentFile), "utf8").catch(
      () => "",
    );
    for (const line of content.split(/\r?\n/u)) {
      const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/u.exec(line);
      if (!match || !secretNames.has(match[1])) continue;
      const value = match[2].replace(/^(["'])(.*)\1$/u, "$2");
      if (value.length >= 8) values.set(match[1], value);
    }
  }
  for (const name of secretNames) {
    const value = process.env[name];
    if (value && value.length >= 8) values.set(name, value);
  }
  return values;
}

export async function verifyMiniProgramArtifact({
  packageRoot,
  mode,
  legacyWifiApiEnabled = false,
}) {
  if (mode !== "development" && mode !== "trial" && mode !== "production") {
    throw new Error(`Unsupported mini-program artifact mode: ${mode}`);
  }

  const sourceRoot = path.join(packageRoot, "src");
  const artifactRoot = path.join(packageRoot, "dist");
  const findings = [];
  const requiredArtifactFiles = [
    "app.js",
    "app.json",
    "app.wxss",
    "sitemap.json",
    "core/mini-program-environment.js",
    "core/wifi-diagnostics-environment.js",
  ];
  for (const relativePath of requiredArtifactFiles) {
    if (!(await isFile(path.join(artifactRoot, relativePath)))) {
      findings.push(`${relativePath}: required artifact is missing`);
    }
  }

  let pages = [];
  try {
    const manifest = JSON.parse(await readFile(path.join(artifactRoot, "app.json"), "utf8"));
    if (manifest.lazyCodeLoading !== "requiredComponents") {
      findings.push('app.json: lazyCodeLoading must be "requiredComponents"');
    }
    if (
      !Array.isArray(manifest.pages) ||
      !manifest.pages.every((page) => typeof page === "string")
    ) {
      findings.push("app.json: pages must be an array of strings");
    } else {
      pages = manifest.pages;
    }
  } catch {
    findings.push("app.json: missing or invalid JSON");
  }

  if (pages[0] !== "pages/connect/index") {
    findings.push("app.json: pages/connect/index must be the first page");
  }
  const diagnosticsIncluded = pages.includes(diagnosticsPage);
  if (mode !== "production" && !diagnosticsIncluded) {
    findings.push(`app.json: ${diagnosticsPage} must be included in ${mode}`);
  }
  if (mode === "production" && diagnosticsIncluded) {
    findings.push(`app.json: ${diagnosticsPage} must be excluded from production`);
  }

  for (const page of pages) {
    if (page.startsWith("/") || page.split("/").includes("..")) {
      findings.push(`app.json: unsafe page path ${page}`);
      continue;
    }
    for (const extension of [".js", ".wxml", ".wxss", ".json"]) {
      const relativePath = `${page}${extension}`;
      if (!(await isFile(path.join(artifactRoot, relativePath)))) {
        findings.push(`${relativePath}: page artifact is missing`);
      }
    }
  }

  const sourceFiles = await collectFiles(sourceRoot);
  for (const sourceFile of sourceFiles) {
    const relativePath = path.relative(sourceRoot, sourceFile);
    if (mode === "production" && isProductionExcluded(relativePath)) continue;
    if (relativePath.endsWith(".d.ts")) continue;

    const artifactRelativePath = relativePath.endsWith(".ts")
      ? relativePath.slice(0, -3) + ".js"
      : relativePath;
    if (relativePath === "app.json") continue;
    if (!(await isFile(path.join(artifactRoot, artifactRelativePath)))) {
      findings.push(`${artifactRelativePath}: source file was not emitted or copied`);
    }
  }

  const artifactFiles = await collectFiles(artifactRoot);
  const artifactRelativePaths = artifactFiles.map((filePath) =>
    toPosixPath(path.relative(artifactRoot, filePath)),
  );
  const artifactFileSet = new Set(artifactRelativePaths);
  const caseInsensitiveFileMap = new Map(
    artifactRelativePaths.map((relativePath) => [relativePath.toLowerCase(), relativePath]),
  );
  for (const artifactFile of artifactFiles) {
    const relativePath = path.relative(artifactRoot, artifactFile);
    if (relativePath.endsWith(".ts") || relativePath.endsWith(".d.ts")) {
      findings.push(`${relativePath}: TypeScript source leaked into the runtime artifact`);
    }
    if (isTestArtifact(relativePath)) {
      findings.push(`${relativePath}: test source or test data leaked into the runtime artifact`);
    }
    if (mode === "production" && isProductionDiagnosticArtifact(relativePath)) {
      findings.push(`${relativePath}: diagnostics source leaked into the production artifact`);
    }
    if (path.extname(artifactFile) === ".wxml") {
      const content = await readFile(artifactFile, "utf8");
      if (
        [...content.matchAll(textOpeningTagPattern)].some((match) =>
          deprecatedSelectableAttributePattern.test(match[0]),
        )
      ) {
        findings.push(
          `${relativePath}: text selectable attribute is deprecated; use user-select instead`,
        );
      }
    }
  }

  let relativeDependenciesChecked = 0;
  for (const artifactFile of artifactFiles) {
    if (path.extname(artifactFile) !== ".js") continue;
    const ownerRelativePath = toPosixPath(path.relative(artifactRoot, artifactFile));
    const content = await readFile(artifactFile, "utf8");
    if (
      mode === "production" &&
      /\b(?:setStorage|getStorage|setStorageSync|getStorageSync|localStorage|sessionStorage)\b/u.test(
        content,
      )
    ) {
      findings.push(
        `${ownerRelativePath}: release runtime must not persist customer connection data locally`,
      );
    }
    for (const dependency of collectRelativeModuleReferences(content)) {
      const { kind, reference } = dependency;
      relativeDependenciesChecked += 1;
      const candidates = runtimeDependencyCandidates(ownerRelativePath, reference);
      if (candidates.length === 0) {
        findings.push(`${ownerRelativePath}: relative ${kind} ${reference} escapes the artifact`);
        continue;
      }
      if (candidates.some((candidate) => artifactFileSet.has(candidate))) continue;

      const mismatch = findCaseMismatch(candidates, caseInsensitiveFileMap);
      findings.push(
        mismatch
          ? `${ownerRelativePath}: relative ${kind} ${reference} has a casing mismatch; expected ${mismatch.expected}, found ${mismatch.actual}`
          : `${ownerRelativePath}: relative ${kind} ${reference} cannot resolve to ${candidates.join(" or ")}`,
      );
    }
  }

  let localComponentsChecked = 0;
  for (const artifactFile of artifactFiles) {
    if (path.extname(artifactFile) !== ".json") continue;
    const ownerRelativePath = toPosixPath(path.relative(artifactRoot, artifactFile));
    let json;
    try {
      json = JSON.parse(await readFile(artifactFile, "utf8"));
    } catch {
      if (ownerRelativePath !== "app.json") {
        findings.push(`${ownerRelativePath}: invalid JSON`);
      }
      continue;
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) continue;
    const usingComponents = json.usingComponents;
    if (usingComponents === undefined) continue;
    if (!usingComponents || typeof usingComponents !== "object" || Array.isArray(usingComponents)) {
      findings.push(`${ownerRelativePath}: usingComponents must be an object`);
      continue;
    }

    for (const [componentName, reference] of Object.entries(usingComponents)) {
      if (typeof reference !== "string") {
        findings.push(`${ownerRelativePath}: component ${componentName} path must be a string`);
        continue;
      }
      if (externalComponentPrefixes.some((prefix) => reference.startsWith(prefix))) continue;
      localComponentsChecked += 1;
      const bases = componentBaseCandidates(ownerRelativePath, reference);
      if (bases.length === 0) {
        findings.push(`${ownerRelativePath}: component ${componentName} escapes the artifact`);
        continue;
      }
      const completeBase = bases.find((base) =>
        componentExtensions.every((extension) => artifactFileSet.has(`${base}${extension}`)),
      );
      if (completeBase) continue;

      const expectedPaths = bases.flatMap((base) =>
        componentExtensions.map((extension) => `${base}${extension}`),
      );
      const mismatch = findCaseMismatch(expectedPaths, caseInsensitiveFileMap);
      findings.push(
        mismatch
          ? `${ownerRelativePath}: component ${componentName} has a casing mismatch; expected ${mismatch.expected}, found ${mismatch.actual}`
          : `${ownerRelativePath}: local component ${componentName} at ${reference} is incomplete or missing`,
      );
    }
  }

  const diagnosticsDirectory = path.join(artifactRoot, "pages", "wifi-diagnostics");
  if (mode === "production" && (await stat(diagnosticsDirectory).catch(() => undefined))) {
    findings.push("pages/wifi-diagnostics: production artifact directory must not exist");
  }

  const runtimeConfigPath = path.join(artifactRoot, "config", "runtime.generated.js");
  const runtimeConfig = await readFile(runtimeConfigPath, "utf8").catch(() => "");
  if (mode === "production") {
    const apiBaseUrlLiteral = /\bapiBaseUrl:\s*("(?:[^"\\]|\\.)*")/u.exec(runtimeConfig)?.[1];
    try {
      if (!apiBaseUrlLiteral) throw new Error("missing API base URL");
      assertReleaseApiBaseUrl(JSON.parse(apiBaseUrlLiteral));
    } catch {
      findings.push(
        "config/runtime.generated.js: production API URL must be real HTTPS and not an example placeholder",
      );
    }
  }
  if (!runtimeConfig.includes(`legacyWifiAdapterEnabled: ${legacyWifiApiEnabled}`)) {
    findings.push(
      "config/runtime.generated.js: legacy Wi-Fi adapter must match the explicit build setting",
    );
  }
  if (!runtimeConfig.includes('adUnitId: ""')) {
    findings.push(
      "config/runtime.generated.js: advertising must remain disabled without an ad unit ID",
    );
  }

  if (mode === "production") {
    const connectWxml = await readFile(
      path.join(artifactRoot, "pages", "connect", "index.wxml"),
      "utf8",
    ).catch(() => "");
    if (/<input\b/iu.test(connectWxml)) {
      findings.push(
        "pages/connect/index.wxml: release customer page must not contain input fields",
      );
    }
  }

  const repositoryRoot = path.resolve(packageRoot, "../..");
  const secretValues = await loadCurrentSecretValues(repositoryRoot);
  for (const artifactFile of artifactFiles) {
    if (!textExtensions.has(path.extname(artifactFile))) continue;
    const content = await readFile(artifactFile, "utf8");
    const relativePath = path.relative(artifactRoot, artifactFile);
    for (const marker of forbiddenMarkers) {
      if (content.includes(marker)) {
        findings.push(`${relativePath}: contains forbidden server marker ${marker}`);
      }
    }
    for (const [name, value] of secretValues) {
      if (content.includes(value)) {
        findings.push(`${relativePath}: contains the current value of ${name}`);
      }
    }
    for (const match of content.matchAll(viteSecretPattern)) {
      findings.push(`${relativePath}: contains forbidden client variable ${match[0]}`);
    }
  }

  if (findings.length > 0) {
    throw new Error(
      `Mini-program ${mode} artifact verification failed:\n${findings
        .map((finding) => `- ${finding}`)
        .join("\n")}`,
    );
  }

  return {
    mode,
    pages,
    artifactRoot,
    diagnosticsIncluded,
    relativeDependenciesChecked,
    localComponentsChecked,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const mode = process.argv.includes("--production")
    ? "production"
    : process.argv.includes("--trial")
      ? "trial"
      : "development";
  const summary = await verifyMiniProgramArtifact({
    packageRoot,
    mode,
    legacyWifiApiEnabled: process.env.MINIPROGRAM_ENABLE_LEGACY_WIFI_API === "true",
  });
  process.stdout.write(
    `Verified ${summary.mode} mini-program artifact (${summary.pages.length} pages, ${summary.relativeDependenciesChecked} relative dependencies, ${summary.localComponentsChecked} local components).\n`,
  );
}
