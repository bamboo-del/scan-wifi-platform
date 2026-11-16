import { describe, expect, it } from "vitest";

import { loadAdminInitConfig, loadConfig, loadMigrationConfig } from "./index.js";

const VALID_ENVIRONMENT: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://app:password@127.0.0.1:5432/app",
  WIFI_ENCRYPTION_KEY_BASE64: Buffer.alloc(32).toString("base64"),
  SESSION_SECRET: "s".repeat(32),
};

describe("loadConfig", () => {
  it("does not trust forwarded addresses by default", () => {
    const config = loadConfig(VALID_ENVIRONMENT);

    expect(config.TRUST_PROXY_HOPS).toBe(0);
  });

  it("accepts an explicit bounded reverse-proxy hop count", () => {
    const config = loadConfig({ ...VALID_ENVIRONMENT, TRUST_PROXY_HOPS: "1" });

    expect(config.TRUST_PROXY_HOPS).toBe(1);
  });

  it("rejects an unbounded proxy chain", () => {
    expect(() => loadConfig({ ...VALID_ENVIRONMENT, TRUST_PROXY_HOPS: "4" })).toThrow();
  });

  it("requires HTTPS and release QR codes in production", () => {
    const production = {
      ...VALID_ENVIRONMENT,
      NODE_ENV: "production",
      COOKIE_SECURE: "true",
      ADMIN_WEB_ORIGIN: "https://admin.scan-wifi-production.cn",
      QR_CODE_PROVIDER: "wechat",
      WECHAT_APP_ID: "wx0123456789abcdef",
      WECHAT_APP_SECRET: "server-only",
      WECHAT_ENV_VERSION: "release",
    };

    expect(loadConfig(production).WECHAT_ENV_VERSION).toBe("release");
    expect(() =>
      loadConfig({ ...production, ADMIN_WEB_ORIGIN: "http://admin.scan-wifi-production.cn" }),
    ).toThrow(/HTTPS/u);
    expect(() => loadConfig({ ...production, WECHAT_ENV_VERSION: "trial" })).toThrow(/release/u);
    expect(() =>
      loadConfig({ ...production, ADMIN_WEB_ORIGIN: "https://admin.example.cn" }),
    ).toThrow(/占位域名/u);
    expect(() =>
      loadConfig({ ...production, ADMIN_WEB_ORIGIN: "https://admin.prelaunch.invalid" }),
    ).toThrow(/占位域名/u);
    expect(() => loadConfig({ ...production, WECHAT_APP_ID: "touristappid" })).toThrow(
      /正式微信小程序 AppID/u,
    );
  });

  it("loads one-shot task configuration without application secrets", () => {
    expect(loadMigrationConfig({ MIGRATION_DATABASE_URL: VALID_ENVIRONMENT.DATABASE_URL })).toEqual(
      { databaseUrl: VALID_ENVIRONMENT.DATABASE_URL, poolMax: 1 },
    );
    expect(
      loadAdminInitConfig({
        DATABASE_URL: VALID_ENVIRONMENT.DATABASE_URL,
        DATABASE_POOL_MAX: "10",
        INITIAL_ADMIN_PASSWORD: "correct-horse-battery-staple",
      }),
    ).toMatchObject({ INITIAL_ADMIN_USERNAME: "admin", DATABASE_POOL_MAX: 10 });
  });
});
