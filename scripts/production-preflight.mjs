import { constants } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertProductionDomain, assertReleaseAppId } from "./production-gates.mjs";

const defaultRepositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const selectedEnvironmentNames = new Set([
  "API_DOMAIN",
  "ADMIN_DOMAIN",
  "ACME_EMAIL",
  "BACKUP_HOST_DIR",
  "MINIPROGRAM_ENABLE_LEGACY_WIFI_API",
  "MINIPROGRAM_AD_UNIT_ID",
  "WECHAT_APP_ID",
]);
const forbiddenClientMarkers = [
  "WECHAT_APP_SECRET",
  "WIFI_ENCRYPTION_KEY_BASE64",
  "SESSION_SECRET",
  "DATABASE_URL",
  "POSTGRES_OWNER_PASSWORD",
  "POSTGRES_APP_PASSWORD",
  "INITIAL_ADMIN_PASSWORD",
];

function fail(message) {
  throw new Error(`Production preflight failed: ${message}`);
}

function requireCondition(condition, message) {
  if (!condition) fail(message);
}

function extractService(compose, name) {
  const lines = compose.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start < 0) fail(`docker-compose.prod.yml is missing service ${name}`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^(?: {2}[A-Za-z0-9_-]+:|networks:|volumes:)\s*$/u.test(lines[index] ?? "")) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

async function collectTextFiles(root) {
  const rootStat = await stat(root).catch(() => undefined);
  if (!rootStat) return [];
  if (rootStat.isFile()) return [root];
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => collectTextFiles(path.join(root, entry.name))),
  );
  return nested.flat();
}

export function validateProductionStaticConfiguration({
  compose,
  dockerfile,
  caddyfile,
  nginxConfiguration,
  backupScript,
}) {
  compose = compose.replace(/\r\n/gu, "\n");
  dockerfile = dockerfile.replace(/\r\n/gu, "\n");
  const postgres = extractService(compose, "postgres");
  const api = extractService(compose, "api");
  const admin = extractService(compose, "admin");
  const caddy = extractService(compose, "caddy");
  const backup = extractService(compose, "backup");

  requireCondition(!/^ {4}ports:/mu.test(postgres), "PostgreSQL must not publish host ports");
  requireCondition(!/^ {4}ports:/mu.test(api), "API must not publish host ports");
  requireCondition(
    api.includes('TRUST_PROXY_ADDRESSES: "172.30.250.2"') &&
      caddy.includes("ipv4_address: 172.30.250.2") &&
      compose.includes("subnet: 172.30.250.0/28"),
    "API must trust only the fixed Caddy peer",
  );
  requireCondition(
    nginxConfiguration.includes("add_header_inherit merge;"),
    "nginx cache locations must inherit security headers",
  );
  requireCondition(
    caddyfile.includes(
      'request>uri regexp "/api/public/connect/[^/?]+" "/api/public/connect/[REDACTED]"',
    ),
    "Caddy logs must redact public scene tokens",
  );
  requireCondition(
    compose.includes("backend:\n    internal: true"),
    "the backend Docker network must remain internal",
  );
  requireCondition(api.includes("NODE_ENV: production"), "API NODE_ENV must be production");
  requireCondition(api.includes('COOKIE_SECURE: "true"'), "API COOKIE_SECURE must be true");
  requireCondition(
    api.includes("WECHAT_ENV_VERSION: release"),
    "API WECHAT_ENV_VERSION must be release",
  );
  requireCondition(api.includes("QR_CODE_PROVIDER: wechat"), "API QR_CODE_PROVIDER must be wechat");
  requireCondition(
    api.includes(
      "MINIPROGRAM_ENABLE_LEGACY_WIFI_API: ${MINIPROGRAM_ENABLE_LEGACY_WIFI_API:-false}",
    ),
    "legacy Wi-Fi API must default to false",
  );
  requireCondition(
    api.includes("MINIPROGRAM_AD_UNIT_ID: ${MINIPROGRAM_AD_UNIT_ID:-}"),
    "an empty advertising unit ID must remain valid",
  );
  requireCondition(
    !api.includes("INITIAL_ADMIN_PASSWORD"),
    "the long-running API container must not receive the initial administrator password",
  );
  requireCondition(
    admin.includes("VITE_API_BASE_URL: https://${API_DOMAIN:?API_DOMAIN is required}"),
    "admin production build must require API_DOMAIN",
  );
  requireCondition(
    caddy.includes("API_DOMAIN: ${API_DOMAIN:?API_DOMAIN is required}") &&
      caddy.includes("ADMIN_DOMAIN: ${ADMIN_DOMAIN:?ADMIN_DOMAIN is required}"),
    "Caddy must require both production domains",
  );
  requireCondition(
    caddy.includes("- caddy_data:/data") &&
      caddy.includes("- caddy_config:/config") &&
      /^ {2}caddy_data:\s*$/mu.test(compose) &&
      /^ {2}caddy_config:\s*$/mu.test(compose),
    "Caddy data and configuration volumes must be persistent named volumes",
  );
  requireCondition(
    backup.includes("${BACKUP_HOST_DIR:?BACKUP_HOST_DIR is required}:/backups"),
    "backup service must require an explicit host directory",
  );
  requireCondition(
    dockerfile.includes("ARG VITE_API_BASE_URL\n") &&
      !dockerfile.includes("ARG VITE_API_BASE_URL=https://"),
    "Docker admin build must not default to an example API URL",
  );
  requireCondition(
    dockerfile.includes("assertReleaseApiBaseUrl(process.env.VITE_API_BASE_URL"),
    "Docker admin build must validate its public API URL",
  );
  requireCondition(
    caddyfile.includes("{$API_DOMAIN}") &&
      caddyfile.includes("{$ADMIN_DOMAIN}") &&
      !/example\.(?:cn|com)/iu.test(caddyfile),
    "Caddyfile must not have example-domain fallbacks",
  );
  requireCondition(
    nginxConfiguration.includes("server_tokens off") &&
      nginxConfiguration.includes("location = /healthz"),
    "admin nginx configuration must keep server tokens disabled and expose only its health check",
  );
  requireCondition(
    backupScript.includes('mkdir -p "$BACKUP_DIR"') &&
      backupScript.includes('pg_restore --list "$temporary"'),
    "backup script must create its target and verify each dump before promotion",
  );
}

export async function validateProductionRepository(repositoryRoot = defaultRepositoryRoot) {
  const [compose, dockerfile, caddyfile, nginxConfiguration, backupScript] = await Promise.all([
    readFile(path.join(repositoryRoot, "docker-compose.prod.yml"), "utf8"),
    readFile(path.join(repositoryRoot, "Dockerfile"), "utf8"),
    readFile(path.join(repositoryRoot, "deploy", "Caddyfile"), "utf8"),
    readFile(path.join(repositoryRoot, "deploy", "nginx-admin.conf"), "utf8"),
    readFile(path.join(repositoryRoot, "scripts", "backup-postgres.sh"), "utf8"),
  ]);
  validateProductionStaticConfiguration({
    compose,
    dockerfile,
    caddyfile,
    nginxConfiguration,
    backupScript,
  });

  for (const clientRoot of ["apps/admin-web/src", "apps/mini-program/src"]) {
    for (const file of await collectTextFiles(path.join(repositoryRoot, clientRoot))) {
      const content = await readFile(file, "utf8");
      for (const marker of forbiddenClientMarkers) {
        if (content.includes(marker)) {
          fail(`${path.relative(repositoryRoot, file)} contains server-only marker ${marker}`);
        }
      }
    }
  }
}

export function parseSelectedEnvironment(content) {
  const values = {};
  for (const line of content.split(/\r?\n/u)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/u.exec(line);
    if (!match || !selectedEnvironmentNames.has(match[1])) continue;
    values[match[1]] = match[2].replace(/^(?:"(.*)"|'(.*)')$/u, "$1$2");
  }
  return values;
}

export async function validateProductionEnvironment(
  values,
  repositoryRoot = defaultRepositoryRoot,
) {
  const apiDomain = assertProductionDomain(values.API_DOMAIN, "API_DOMAIN");
  const adminDomain = assertProductionDomain(values.ADMIN_DOMAIN, "ADMIN_DOMAIN");
  requireCondition(apiDomain !== adminDomain, "API_DOMAIN and ADMIN_DOMAIN must be different");
  assertReleaseAppId(values.WECHAT_APP_ID, "WECHAT_APP_ID");
  requireCondition(
    values.MINIPROGRAM_ENABLE_LEGACY_WIFI_API === "false",
    "MINIPROGRAM_ENABLE_LEGACY_WIFI_API must remain false before the formal release gate",
  );

  const email = values.ACME_EMAIL ?? "";
  const emailMatch = /^[^@\s]+@([^@\s]+)$/u.exec(email);
  requireCondition(Boolean(emailMatch), "ACME_EMAIL must be configured");
  assertProductionDomain(emailMatch?.[1], "ACME_EMAIL domain");

  const configuredBackupDirectory = values.BACKUP_HOST_DIR ?? "";
  requireCondition(Boolean(configuredBackupDirectory), "BACKUP_HOST_DIR is required");
  const backupDirectory = path.isAbsolute(configuredBackupDirectory)
    ? configuredBackupDirectory
    : path.resolve(repositoryRoot, configuredBackupDirectory);
  requireCondition(
    (await stat(backupDirectory).catch(() => undefined))?.isDirectory() === true,
    "BACKUP_HOST_DIR must already exist as a directory",
  );
  await access(backupDirectory, constants.W_OK).catch(() => {
    fail("BACKUP_HOST_DIR must be writable by the preflight user");
  });
}

export async function validateProductionTemplate(
  templatePath,
  repositoryRoot = defaultRepositoryRoot,
) {
  const values = parseSelectedEnvironment(await readFile(templatePath, "utf8"));
  requireCondition(
    values.API_DOMAIN === "api.example.cn" && values.ADMIN_DOMAIN === "admin.example.cn",
    ".env.production.example must keep clearly recognizable example domains",
  );
  requireCondition(
    values.MINIPROGRAM_ENABLE_LEGACY_WIFI_API === "false",
    ".env.production.example must keep the legacy Wi-Fi API disabled",
  );
  requireCondition(
    values.MINIPROGRAM_AD_UNIT_ID === "",
    ".env.production.example must allow advertising to remain disabled",
  );
  requireCondition(Boolean(repositoryRoot), "repository root is required");
}

async function main() {
  const templateMode = process.argv.includes("--template");
  const environmentArgument = process.argv.find((argument) => argument.startsWith("--env-file="));
  const environmentPath = path.resolve(
    defaultRepositoryRoot,
    environmentArgument?.slice("--env-file=".length) ??
      (templateMode ? ".env.production.example" : ".env.production"),
  );

  await validateProductionRepository(defaultRepositoryRoot);
  if (templateMode) {
    await validateProductionTemplate(environmentPath, defaultRepositoryRoot);
    process.stdout.write(
      "Production static/template preflight passed; example values remain non-deployable by design.\n",
    );
    return;
  }

  const selectedValues = parseSelectedEnvironment(await readFile(environmentPath, "utf8"));
  await validateProductionEnvironment(selectedValues, defaultRepositoryRoot);
  process.stdout.write(
    "Production preflight passed: domains, release flags, client secret boundary, backup path, network exposure, and persistent proxy volumes are valid.\n",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
