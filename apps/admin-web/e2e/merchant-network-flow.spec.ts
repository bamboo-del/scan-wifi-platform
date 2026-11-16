import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { PublicWifiCredential, WifiNetworkResponse } from "@scan-wifi/shared-types";

test("商户多网络管理、WiFi 贴保存和统计筛选", async ({ page }) => {
  const merchantName = `验收商户-${Date.now()}`;
  const errors: string[] = [];
  let authenticated = false;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      !authenticated &&
      message.location().url.endsWith("/api/admin/auth/session") &&
      message.text().includes("401")
    )
      return;
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/login");
  await expect(page).toHaveTitle(/轻连 WiFi/);
  await page.getByLabel("管理员用户名").fill(process.env.E2E_ADMIN_USERNAME ?? "admin");
  await page.getByLabel("密码").fill(process.env.E2E_ADMIN_PASSWORD ?? "Admin123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("link", { name: "商户管理" }).click();
  authenticated = true;
  await page.getByLabel("商户名称").fill(merchantName);
  await page.getByLabel("联系方式").fill("服务台");
  await page.getByRole("button", { name: "创建商户" }).click();
  await expect(page.getByRole("heading", { name: merchantName })).toBeVisible();
  await nav.getByRole("link", { name: "门店管理" }).click();
  await page.getByRole("link", { name: "新建门店" }).first().click();
  await page.getByLabel("所属商户").selectOption({ label: merchantName });
  await page.getByLabel(/门店名称/).fill("WiFi贴验收门店");
  await page.getByRole("tab", { name: "Wi-Fi 配置" }).click();
  await page.getByLabel(/Wi-Fi 名称/).fill("QA-Primary");
  await page.getByLabel(/^Wi-Fi 密码/).fill("Primary-password");
  await page.getByLabel(/确认新密码/).fill("Primary-password");
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByRole("link", { name: "取消", exact: true }).click();
  await page.getByRole("tab", { name: "Wi-Fi 管理" }).click();
  await page.getByLabel("Wi-Fi 名称", { exact: true }).fill("QA-Secondary");
  await page.getByLabel("Wi-Fi 密码", { exact: true }).fill("Secondary-password");
  await page.getByRole("button", { name: "添加网络" }).click();
  await expect(page.getByText("QA-Secondary", { exact: true })).toBeVisible();
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText("QA-Secondary", { exact: true }) })
    .first();
  await card.getByRole("button", { name: "生成二维码" }).click();
  await expect(card.getByAltText("WiFi贴验收门店 小程序码预览")).toBeVisible();
  await card.getByRole("button", { name: "预览 WiFi 贴" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByAltText("WiFi贴验收门店 WiFi 贴")).toBeVisible();
  const imageSize = await dialog.locator("img").evaluate((image: HTMLImageElement) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
  expect(imageSize).toEqual({ width: 1200, height: 1500 });
  const folder = path.join(tmpdir(), "wifi-platform-validation");
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: path.join(folder, "poster-preview.png") });
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "保存图片" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/WiFi贴\.png$/);
  await download.saveAs(path.join(folder, "wifi-poster.png"));
  await page.keyboard.press("Escape");
  await card.getByRole("button", { name: "更新密码 / 编辑" }).click();
  await page.getByLabel("新密码", { exact: true }).fill("Replacement-password");
  await page.getByRole("button", { name: "保存网络" }).click();
  await expect(card.getByAltText("WiFi贴验收门店 小程序码预览")).toBeVisible();
  if (process.env.E2E_LIVE === "true") {
    const storeId = new URL(page.url()).pathname.split("/")[2];
    const networksResponse = await page.request.get(`/api/admin/stores/${storeId}/networks`);
    expect(networksResponse.ok()).toBe(true);
    const networks = (await networksResponse.json()) as WifiNetworkResponse[];
    const wifi = networks.find((network) => network.ssid === "QA-Secondary")!;
    const sceneToken = wifi.qrCode!.sceneToken;
    const info = await page.request.post("/api/public/connect", { data: { sceneToken } });
    expect(info.ok()).toBe(true);
    expect(await info.text()).not.toContain("password");
    const credential = await page.request.post("/api/public/credential", { data: { sceneToken } });
    expect(credential.ok()).toBe(true);
    const credentialBody = (await credential.json()) as PublicWifiCredential;
    expect(credentialBody.password).toBe("Replacement-password");
    expect(credential.headers()["cache-control"]).toContain("no-store");
    const visitorId = randomBytes(16).toString("hex");
    for (const eventType of [
      "page_view",
      "page_view",
      "scan",
      "connect_click",
      "connect_click",
      "connect_click",
      "connect_success",
      "connect_failure",
      "password_copy",
    ]) {
      const event = await page.request.post("/api/public/events", {
        data: { sceneToken, eventType, visitorId, platform: "devtools" },
      });
      expect(event.status()).toBe(202);
    }
  }
  await card.getByRole("button", { name: "停用网络" }).click();
  await expect(card.getByRole("button", { name: "启用网络" })).toBeVisible();
  await page.screenshot({ path: path.join(folder, "network-management.png") });
  await nav.getByRole("link", { name: "连接统计" }).click();
  await page.getByLabel("商户", { exact: true }).selectOption({ label: merchantName });
  await page.getByLabel("门店", { exact: true }).selectOption({ label: "WiFi贴验收门店" });
  await page.getByRole("button", { name: "查询统计" }).click();
  await expect(page.getByRole("columnheader", { name: "UV", exact: true })).toBeVisible();
  if (process.env.E2E_LIVE === "true") {
    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "QA-Secondary", exact: true }) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("cell").nth(3)).toHaveText("2");
    await expect(row.getByRole("cell").nth(4)).toHaveText("1");
    await expect(row.getByRole("cell").last()).toHaveText(/33\.3/);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: path.join(folder, "analytics-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
