import { cp, copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { verifyMiniProgramArtifact } from "./artifact-integrity.mjs";
import { assertReleaseAppId } from "../../../scripts/production-gates.mjs";

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(packageRoot, "src");
const stagingRoot = path.join(packageRoot, ".build");
const artifactRoot = path.join(packageRoot, "dist");
const localMode = process.argv.includes("--local");
const trialMode = process.argv.includes("--trial");
const productionMode = process.argv.includes("--production");
const mode = productionMode ? "production" : trialMode ? "trial" : "development";

if ([localMode, trialMode, productionMode].filter(Boolean).length > 1) {
  throw new Error("--local, --trial and --production are mutually exclusive");
}

function runNode(scriptPath, arguments_ = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...arguments_], {
      cwd: packageRoot,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(scriptPath)} exited with code ${code}`));
    });
  });
}

async function copyRuntimeFiles(sourceDirectory, targetDirectory) {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  await mkdir(targetDirectory, { recursive: true });
  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = path.join(sourceDirectory, entry.name);
      const targetPath = path.join(targetDirectory, entry.name);
      if (entry.isDirectory()) {
        await copyRuntimeFiles(sourcePath, targetPath);
      } else if (!entry.name.endsWith(".ts")) {
        await copyFile(sourcePath, targetPath);
      }
    }),
  );
}

const runtimeGenerator = path.join(packageRoot, "scripts", "generate-runtime-config.mjs");
const manifestGenerator = path.join(packageRoot, "scripts", "generate-app-manifest.mjs");
const tscPath = require.resolve("typescript/bin/tsc");

try {
  if (productionMode) {
    const projectConfig = JSON.parse(
      await readFile(path.join(packageRoot, "project.config.json"), "utf8"),
    );
    assertReleaseAppId(projectConfig.appid);
  }
  await rm(stagingRoot, { recursive: true, force: true });
  await rm(artifactRoot, { recursive: true, force: true });
  await cp(sourceRoot, stagingRoot, { recursive: true });

  const modeArgument = productionMode
    ? "--production"
    : trialMode
      ? "--trial"
      : localMode
        ? "--local"
        : undefined;
  await runNode(runtimeGenerator, [
    ...(modeArgument ? [modeArgument] : []),
    "--output=.build/config/runtime.generated.ts",
  ]);
  await runNode(manifestGenerator, [
    ...(productionMode ? ["--production"] : []),
    "--source=.build/app.json",
    "--output=.build/app.json",
  ]);

  await runNode(tscPath, ["-p", path.join(packageRoot, "tsconfig.build.json")]);
  await copyRuntimeFiles(stagingRoot, artifactRoot);

  if (productionMode) {
    await rm(path.join(artifactRoot, "pages", "wifi-diagnostics"), {
      recursive: true,
      force: true,
    });
    await rm(path.join(artifactRoot, "core", "wifi-diagnostics.js"), { force: true });
  }

  const summary = await verifyMiniProgramArtifact({
    packageRoot,
    mode,
    legacyWifiApiEnabled: process.env.MINIPROGRAM_ENABLE_LEGACY_WIFI_API === "true",
  });
  process.stdout.write(
    `Built runnable ${summary.mode} mini-program artifact in ${path.relative(
      packageRoot,
      summary.artifactRoot,
    )} (${summary.pages.length} pages, ${summary.relativeDependenciesChecked} relative dependencies, ${summary.localComponentsChecked} local components).\n`,
  );
} catch (error) {
  await rm(artifactRoot, { recursive: true, force: true });
  throw error;
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
