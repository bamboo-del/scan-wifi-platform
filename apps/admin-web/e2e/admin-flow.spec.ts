import { expect, test } from "@playwright/test";

test("平台管理员可创建用户、替换 Wi-Fi、生成二维码并停用用户", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/login");
  await expect(page).toHaveTitle(/轻连 WiFi/);
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("Admin123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();

  const mainNavigation = page.getByRole("navigation", { name: "主导航" });
  await mainNavigation.getByRole("link", { name: "用户管理" }).click();
  await page.getByRole("link", { name: "新建用户" }).click();
  await expect(page.getByLabel("备注")).toHaveCount(0);
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.getByText("请输入用户名称")).toBeVisible();

  const storeName = `自动化验收用户-${Date.now()}`;
  await page.getByLabel(/用户名称/).fill(storeName);
  await page.getByLabel(/简称/).fill("自动化用户");
  await page.getByLabel(/^地址/).fill("深圳市南山区自动化路 1 号");
  await page.getByLabel(/联系人/).fill("测试联系人");
  await page.getByLabel(/联系电话/).fill("138 0000 2026");

  await page.getByRole("tab", { name: "Wi-Fi 配置" }).click();
  await expect(page.getByText("请输入 Wi-Fi 名称")).toBeVisible();
  await page.getByLabel(/Wi-Fi 名称/).fill("Codex-QA-WiFi");
  await page.getByLabel(/^Wi-Fi 密码/).fill("Initial-WiFi-2026!");
  await page.getByLabel(/确认新密码/).fill("Initial-WiFi-2026!");
  await page.getByRole("button", { name: "保存更改" }).click();

  await expect(page).toHaveURL(/\/stores\/store-[^/]+\/edit$/);
  await expect(page.getByRole("heading", { name: storeName })).toBeVisible();
  await expect(page.getByText("用户已创建")).toBeVisible();

  await page.getByRole("tab", { name: "Wi-Fi 配置" }).click();
  await page.getByRole("button", { name: "修改密码" }).click();
  await page.getByLabel(/新 Wi-Fi 密码/).fill("Updated-WiFi-2026!");
  await page.getByLabel(/确认新密码/).fill("Updated-WiFi-2026!");
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.getByText("更改已保存")).toBeVisible();

  await page.getByRole("tab", { name: "二维码" }).click();
  let formSubmissions = 0;
  await page.exposeFunction("recordStoreSubmission", () => {
    formSubmissions += 1;
  });
  await page.locator("#store-editor-form").evaluate((form) => {
    form.addEventListener("submit", () => {
      void (
        window as unknown as Window & { recordStoreSubmission: () => Promise<void> }
      ).recordStoreSubmission();
    });
  });
  await page.getByRole("button", { name: "生成二维码" }).click();
  await expect(page.getByAltText(`${storeName} 小程序码预览`)).toBeVisible();
  await expect(page.getByText("二维码已生成")).toBeVisible();
  expect(formSubmissions).toBe(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(`${storeName}-小程序码.png`);

  await mainNavigation.getByRole("link", { name: "用户管理" }).click();
  await page.getByLabel("搜索用户").fill(storeName);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByText(storeName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `停用 ${storeName}` }).click();
  await page.getByRole("button", { name: "确认停用" }).click();
  await expect(page.getByText("用户已停用")).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: storeName }).getByText("停用", { exact: true }),
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
