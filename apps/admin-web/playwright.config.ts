import { defineConfig, devices } from "@playwright/test";

const live = process.env.E2E_LIVE === "true";
const port = live ? 4174 : 4173;

export default defineConfig({
  testDir: "./e2e",
  ...(live ? { testMatch: "merchant-network-flow.spec.ts" } : {}),
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_DEMO_MODE: live ? "false" : "true",
    },
  },
});
