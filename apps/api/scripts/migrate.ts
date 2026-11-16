import "../src/lib/load-environment.js";
import { loadMigrationConfig } from "@scan-wifi/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { createDatabaseConnection } from "../src/db/client.js";

const config = loadMigrationConfig();
const connection = createDatabaseConnection({
  databaseUrl: config.databaseUrl,
  poolMax: config.poolMax,
  applicationName: "scan-wifi-migrate",
});

try {
  await migrate(connection.db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  process.stdout.write("Database migrations completed.\n");
} finally {
  await connection.close();
}
