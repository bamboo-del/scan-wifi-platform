import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

import {
  assertProductionDomain,
  assertReleaseApiBaseUrl,
  assertReleaseAppId,
} from "./production-gates.mjs";

const pnpmCli = process.env.npm_execpath;
const command = pnpmCli ? process.execPath : process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const commandPrefix = pnpmCli ? [pnpmCli] : [];
const apiDomain = assertProductionDomain(process.env.API_DOMAIN, "API_DOMAIN");
assertProductionDomain(process.env.ADMIN_DOMAIN, "ADMIN_DOMAIN");
const apiBaseUrl = process.env.MINIPROGRAM_API_BASE_URL ?? `https://${apiDomain}`;
assertReleaseApiBaseUrl(apiBaseUrl);
const projectConfig = JSON.parse(
  await readFile(new URL("../apps/mini-program/project.config.json", import.meta.url), "utf8"),
);
assertReleaseAppId(projectConfig.appid);

function run(arguments_, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...commandPrefix, ...arguments_], {
      stdio: "inherit",
      env: { ...process.env, ...environment },
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm ${arguments_.join(" ")} exited with code ${code}`));
    });
  });
}

await run(["--filter", "@scan-wifi/api", "build"]);
await run(["--filter", "@scan-wifi/admin-web", "build"], {
  VITE_API_BASE_URL: apiBaseUrl,
  VITE_DEMO_MODE: "false",
});
await run(["--filter", "@scan-wifi/mini-program", "build:production"], {
  MINIPROGRAM_API_BASE_URL: apiBaseUrl,
  MINIPROGRAM_BUILD_MODE: "production",
  MINIPROGRAM_ALLOW_INSECURE_LOCALHOST: "false",
  MINIPROGRAM_ENABLE_LEGACY_WIFI_API: process.env.MINIPROGRAM_ENABLE_LEGACY_WIFI_API ?? "false",
  MINIPROGRAM_AD_UNIT_ID: process.env.MINIPROGRAM_AD_UNIT_ID ?? "",
  MINIPROGRAM_BRAND_NAME: process.env.MINIPROGRAM_BRAND_NAME ?? "轻连 WiFi",
});
await run(["security:scan:production"]);
