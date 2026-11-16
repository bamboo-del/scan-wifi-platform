import "../src/lib/load-environment.js";
import { loadAdminInitConfig } from "@scan-wifi/config";
import { createDatabaseConnection } from "../src/db/client.js";
import { PostgresPlatformRepository } from "../src/repositories/platform-repository.js";
import { PasswordService } from "../src/services/password-service.js";

const config = loadAdminInitConfig();
const connection = createDatabaseConnection({
  databaseUrl: config.DATABASE_URL,
  poolMax: config.DATABASE_POOL_MAX,
  applicationName: "scan-wifi-admin-init",
});
try {
  const repository = new PostgresPlatformRepository(connection.db);
  const passwordHash = await new PasswordService().hash(config.INITIAL_ADMIN_PASSWORD);
  const result = await repository.createAdminIfAbsent(config.INITIAL_ADMIN_USERNAME, passwordHash);
  process.stdout.write(
    result.created
      ? `Administrator ${result.admin.username} initialized.\n`
      : `Administrator ${result.admin.username} already exists; no changes made.\n`,
  );
} finally {
  await connection.close();
}
