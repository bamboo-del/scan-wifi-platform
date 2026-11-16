import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = [
  "README.md",
  "AGENTS.md",
  "Dockerfile",
  ".env.example",
  ".env.production.example",
  "apps",
  "packages",
  "deploy",
  "docs",
  "scripts",
];
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "coverage",
  "playwright-report",
  "test-results",
  "backups",
  "work",
]);
const textExtensions = new Set([
  ".conf",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".sh",
  ".sql",
  ".ts",
  ".tsx",
  ".wxml",
  ".wxss",
  ".yaml",
  ".yml",
]);
const suspiciousMarkers = [
  ["replacement character", /\uFFFD/u],
  [
    "common GBK mojibake",
    /(?:\u951f\u65a4\u62f7|\u675e\u660f\u7e5b|\u5bee\u20ac|\u7ecb\u5b2a\u7c2d|\u9286\?|\u9983)/u,
  ],
  [
    "common Latin-1 mojibake",
    /(?:\u00c3[^\s]|\u00c2[^\s]|\u00e2(?:\u20ac|\u20ac\u2122|\u20ac\u0153|\u20ac\u201d))/u,
  ],
];

async function collectFiles(target) {
  const targetStat = await stat(target).catch(() => undefined);
  if (!targetStat) return [];
  if (targetStat.isFile()) return [target];
  const entries = await readdir(target, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !ignoredDirectories.has(entry.name))
      .map((entry) => collectFiles(path.join(target, entry.name))),
  );
  return nested.flat();
}

const findings = [];
for (const root of roots) {
  for (const file of await collectFiles(path.join(repositoryRoot, root))) {
    if (!textExtensions.has(path.extname(file)) && path.basename(file) !== "Dockerfile") continue;
    const content = await readFile(file, "utf8");
    for (const [label, pattern] of suspiciousMarkers) {
      if (pattern.test(content)) {
        findings.push(`${path.relative(repositoryRoot, file)}: ${label}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error(`Text integrity scan failed:\n${findings.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Text integrity scan passed; no known mojibake markers were found.");
}
