import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
    migrate: "scripts/migrate.ts",
    "init-admin": "scripts/init-admin.ts",
  },
  format: ["esm"],
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: ["@scan-wifi/shared-types", "@scan-wifi/validation", "@scan-wifi/config"],
});
