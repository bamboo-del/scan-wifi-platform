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

async function loadStaticConfiguration() {
  const [compose, dockerfile, caddyfile, nginxConfiguration, backupScript] = await Promise.all([
    readFile(path.join(repositoryRoot, "docker-compose.prod.yml"), "utf8"),
    readFile(path.join(repositoryRoot, "Dockerfile"), "utf8"),
    readFile(path.join(repositoryRoot, "deploy", "Caddyfile"), "utf8"),
    readFile(path.join(repositoryRoot, "deploy", "nginx-admin.conf"), "utf8"),
    readFile(path.join(repositoryRoot, "scripts", "backup-postgres.sh"), "utf8"),
  ]);
  return {
    compose: compose.replace(/\r\n/gu, "\n"),
    dockerfile,
    caddyfile,
    nginxConfiguration,
    backupScript,
  };
}

test("release values reject example domains and non-formal AppIDs", () => {
  assert.throws(() => assertProductionDomain("api.example.cn", "API_DOMAIN"), /placeholder/u);
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

test("static preflight accepts Windows CRLF configuration files", async () => {
  const configuration = await loadStaticConfiguration();
  validateProductionStaticConfiguration({
    ...configuration,
    compose: configuration.compose.replace(/\n/gu, "\r\n"),
    dockerfile: configuration.dockerfile.replace(/\r?\n/gu, "\r\n"),
  });
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

test("static preflight rejects proxy trust and security-header regressions", async () => {
  const configuration = await loadStaticConfiguration();
  for (const compose of [
    configuration.compose.replace("  api:\n", '  api:\n    ports:\n      - "3100:3100"\n'),
    configuration.compose.replace(
      'TRUST_PROXY_ADDRESSES: "172.30.250.2"',
      'TRUST_PROXY_ADDRESSES: "0.0.0.0/0"',
    ),
    configuration.compose.replace("ipv4_address: 172.30.250.2", "ipv4_address: 172.30.250.3"),
  ]) {
    assert.throws(
      () => validateProductionStaticConfiguration({ ...configuration, compose }),
      /API must/u,
    );
  }
  assert.throws(
    () =>
      validateProductionStaticConfiguration({
        ...configuration,
        nginxConfiguration: configuration.nginxConfiguration.replace(
          "add_header_inherit merge;",
          "",
        ),
      }),
    /inherit security headers/u,
  );
  assert.throws(
    () => validateProductionStaticConfiguration({ ...configuration, caddyfile: "" }),
    /redact public scene/u,
  );
});

test("strict environment preflight accepts real-shaped values and a writable backup directory", async () => {
  const backupDirectory = await mkdtemp(path.join(tmpdir(), "scan-wifi-backup-preflight-"));
  try {
    await validateProductionEnvironment(
      {
        API_DOMAIN: "api.scan-wifi-production.cn",
        ADMIN_DOMAIN: "admin.scan-wifi-production.cn",
        ACME_EMAIL: "ops@scan-wifi-production.cn",
        BACKUP_HOST_DIR: backupDirectory,
        MINIPROGRAM_ENABLE_LEGACY_WIFI_API: "false",
        MINIPROGRAM_AD_UNIT_ID: "",
        WECHAT_APP_ID: "wx0123456789abcdef",
      },
      repositoryRoot,
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
