import { randomBytes } from "node:crypto";
import { access, constants, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const examplePath = path.join(projectRoot, ".env.example");
const environmentPath = path.join(projectRoot, ".env");
const force = process.argv.includes("--force");

try {
  await access(environmentPath, constants.F_OK);
  if (!force) {
    process.stdout.write(".env already exists; no changes made.\n");
    process.exit(0);
  }
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
}

const databaseName = "scan_wifi";
const ownerUser = "scan_wifi";
const applicationUser = "scan_wifi_app";
const ownerPassword = randomBytes(24).toString("base64url");
const applicationPassword = randomBytes(24).toString("base64url");
const connectionUrl = (user, password) =>
  `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:5432/${databaseName}`;

const replacements = new Map([
  ["POSTGRES_DB", databaseName],
  ["POSTGRES_OWNER_USER", ownerUser],
  ["POSTGRES_OWNER_PASSWORD", ownerPassword],
  ["POSTGRES_APP_USER", applicationUser],
  ["POSTGRES_APP_PASSWORD", applicationPassword],
  ["DATABASE_URL", connectionUrl(applicationUser, applicationPassword)],
  ["MIGRATION_DATABASE_URL", connectionUrl(ownerUser, ownerPassword)],
  ["WIFI_ENCRYPTION_KEY_BASE64", randomBytes(32).toString("base64")],
  ["SESSION_SECRET", randomBytes(48).toString("base64url")],
  ["INITIAL_ADMIN_USERNAME", "wifi_admin"],
  ["INITIAL_ADMIN_PASSWORD", `Wifi-${randomBytes(18).toString("base64url")}`],
]);

const template = await readFile(examplePath, "utf8");
const environment = template
  .split(/\r?\n/u)
  .map((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) return line;
    const key = line.slice(0, separator);
    const replacement = replacements.get(key);
    return replacement === undefined ? line : `${key}=${replacement}`;
  })
  .join("\n");

await writeFile(environmentPath, environment, {
  encoding: "utf8",
  flag: force ? "w" : "wx",
  mode: 0o600,
});
process.stdout.write(
  `${force ? "Replaced" : "Created"} .env with random local secrets. Initial administrator: wifi_admin. ` +
    "The generated password is stored in INITIAL_ADMIN_PASSWORD; remove it after administrator initialization.\n",
);
