import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertProductionDomain,
  assertReleaseApiBaseUrl,
  assertReleaseAppId,
} from "./production-gates.mjs";
import {
  validateProductionEnvironment,
  validateProductionRepository,
  validateProductionStaticConfiguration,
} from "./production-preflight.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ownerPassword = "a".repeat(48);
const appPassword = "b".repeat(48);

function validProductionValues(backupDirectory) {
  return {
    API_DOMAIN: "api.scan-wifi-production.cn",
    ADMIN_DOMAIN: "admin.scan-wifi-production.cn",
    ACME_EMAIL: "ops@scan-wifi-production.cn",
    BACKUP_HOST_DIR: backupDirectory,
    DATABASE_BACKUP_URL: `postgresql://scan_wifi_owner:${ownerPassword}@postgres:5432/scan_wifi`,
    IMAGE_TAG: "2026-07-29",
    MINIPROGRAM_ENABLE_LEGACY_WIFI_API: "false",
    MINIPROGRAM_AD_UNIT_ID: "",
    POSTGRES_APP_PASSWORD: appPassword,
    POSTGRES_APP_USER: "scan_wifi_app",
    POSTGRES_DB: "scan_wifi",
    POSTGRES_OWNER_PASSWORD: ownerPassword,
    POSTGRES_OWNER_USER: "scan_wifi_owner",
    SESSION_SECRET: "c".repeat(64),
    WECHAT_APP_ID: "wx0123456789abcdef",
    WECHAT_APP_SECRET: "d".repeat(32),
    WIFI_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
  };
}

async function loadStaticConfiguration() {
  const [compose, dockerfile, caddyfile, nginxConfiguration, backupScript] = await Promise.all([
    readFile(path.join(repositoryRoot, "docker-compose.prod.yml"), "utf8"),
    readFile(path.join(repositoryRoot, "Dockerfile"), "utf8"),
    readFile(path.join(repositoryRoot, "deploy", "Caddyfile"), "utf8"),
    readFile(path.join(repositoryRoot, "deploy", "nginx-admin.conf"), "utf8"),
    readFile(path.join(repositoryRoot, "scripts", "backup-postgres.sh"), "utf8"),
  ]);
  return { compose, dockerfile, caddyfile, nginxConfiguration, backupScript };
}

test("release values reject example domains and non-formal AppIDs", () => {
  assert.throws(() => assertProductionDomain("api.example.cn", "API_DOMAIN"), /placeholder/u);
  assert.throws(
    () => assertProductionDomain("api.prelaunch.invalid", "API_DOMAIN"),
    /placeholder/u,
  );
  assert.throws(() => assertProductionDomain("api.localhost", "API_DOMAIN"), /placeholder/u);
  assert.throws(() => assertReleaseApiBaseUrl("https://api.example.com"), /placeholder/u);
  assert.throws(() => assertReleaseAppId("touristappid"), /tourist/u);
  assert.equal(
    assertProductionDomain("api.scan-wifi-production.cn", "API_DOMAIN"),
    "api.scan-wifi-production.cn",
  );
  assert.equal(assertReleaseAppId("wx0123456789abcdef"), "wx0123456789abcdef");
});

test("current production repository passes static safety checks", async () => {
  await validateProductionRepository(repositoryRoot);
});

test("static preflight rejects a published PostgreSQL port", async () => {
  const configuration = await loadStaticConfiguration();
  configuration.compose = configuration.compose.replace(
    "  postgres:\n",
    '  postgres:\n    ports:\n      - "5432:5432"\n',
  );
  assert.throws(
    () => validateProductionStaticConfiguration(configuration),
    /PostgreSQL must not publish/u,
  );
});

test("static preflight rejects an initial password in the API container", async () => {
  const configuration = await loadStaticConfiguration();
  configuration.compose = configuration.compose.replace(
    "  api:\n",
    "  api:\n    # INITIAL_ADMIN_PASSWORD must never be injected here\n",
  );
  assert.throws(
    () => validateProductionStaticConfiguration(configuration),
    /must not receive the initial administrator password/u,
  );
});

test("static preflight rejects nginx cache locations that drop browser security headers", async () => {
  const configuration = await loadStaticConfiguration();
  configuration.nginxConfiguration = configuration.nginxConfiguration.replace(
    /^ {6}add_header Content-Security-Policy[^\n]+\r?\n/gmu,
    "",
  );
  assert.throws(
    () => validateProductionStaticConfiguration(configuration),
    /must preserve Content-Security-Policy/u,
  );
});

test("strict environment preflight accepts real-shaped values and a writable backup directory", async () => {
  const backupDirectory = await mkdtemp(path.join(tmpdir(), "scan-wifi-backup-preflight-"));
  try {
    for (const enabled of ["false", "true"]) {
      await validateProductionEnvironment(
        { ...validProductionValues(backupDirectory), MINIPROGRAM_ENABLE_LEGACY_WIFI_API: enabled },
        repositoryRoot,
      );
    }
    await assert.rejects(
      validateProductionEnvironment(
        { ...validProductionValues(backupDirectory), MINIPROGRAM_ENABLE_LEGACY_WIFI_API: "auto" },
        repositoryRoot,
      ),
      /explicit boolean/u,
    );
  } finally {
    await rm(backupDirectory, { recursive: true, force: true });
  }
});

test("strict environment preflight rejects template credentials and VITE demo drift", async () => {
  const backupDirectory = await mkdtemp(path.join(tmpdir(), "scan-wifi-backup-preflight-"));
  try {
    await assert.rejects(
      validateProductionEnvironment(
        {
          ...validProductionValues(backupDirectory),
          WECHAT_APP_SECRET: "replace_with_server_only_app_secret",
        },
        repositoryRoot,
      ),
      /WECHAT_APP_SECRET/u,
    );

    const configuration = await loadStaticConfiguration();
    configuration.compose = configuration.compose.replace(
      'VITE_DEMO_MODE: "false"',
      'VITE_DEMO_MODE: "true"',
    );
    assert.throws(
      () => validateProductionStaticConfiguration(configuration),
      /VITE_DEMO_MODE false/u,
    );
  } finally {
    await rm(backupDirectory, { recursive: true, force: true });
  }
});

test("strict environment preflight rejects template domains", async () => {
  await assert.rejects(
    validateProductionEnvironment(
      {
        API_DOMAIN: "api.example.cn",
        ADMIN_DOMAIN: "admin.example.cn",
        ACME_EMAIL: "ops@example.cn",
        BACKUP_HOST_DIR: ".",
        MINIPROGRAM_ENABLE_LEGACY_WIFI_API: "false",
        MINIPROGRAM_AD_UNIT_ID: "",
        WECHAT_APP_ID: "touristappid",
      },
      repositoryRoot,
    ),
    /placeholder/u,
  );
});
