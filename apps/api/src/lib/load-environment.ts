import path from "node:path";
import { config as loadDotEnv } from "dotenv";

// pnpm filters execute from the package directory; direct production starts often execute from the repository root.
// Existing process environment values always win.
loadDotEnv({ path: path.resolve(process.cwd(), "../../.env") });
loadDotEnv({ path: path.resolve(process.cwd(), ".env") });
