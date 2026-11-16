import "./lib/load-environment.js";
import { loadConfig } from "@scan-wifi/config";
import { buildApplication } from "./app.js";

const config = loadConfig();
const app = await buildApplication(config);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "Shutting down API");
  await app.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.error(
    { errorName: error instanceof Error ? error.name : "UnknownError" },
    "API failed to start",
  );
  await app.close();
  process.exit(1);
}
