import type { AppConfig } from "@scan-wifi/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export interface DatabaseConnection {
  db: NodePgDatabase<typeof schema>;
  close: () => Promise<void>;
}

export function createDatabase(config: AppConfig): DatabaseConnection {
  return createDatabaseConnection({
    databaseUrl: config.DATABASE_URL,
    poolMax: config.DATABASE_POOL_MAX,
    applicationName: "scan-wifi-api",
  });
}

export function createDatabaseConnection(input: {
  databaseUrl: string;
  poolMax: number;
  applicationName: string;
}): DatabaseConnection {
  const pool = new Pool({
    connectionString: input.databaseUrl,
    max: input.poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: input.applicationName,
  });

  return {
    db: drizzle(pool, { schema }),
    close: async () => pool.end(),
  };
}

export type Database = DatabaseConnection["db"];
