import { expect, test } from "@playwright/test";
import { join } from "node:path";

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`同仁新增和二维码权限，主账号查看创建人 ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const login = async (username: string, password: string) => {
      await page.getByLabel("用户名", { exact: true }).fill(username);
      await page.getByLabel("密码", { exact: true }).fill(password);
      await page.getByRole("button", { name: "登录", exact: true }).click();
    };
    const go = async (path: string) => {
      await page.evaluate((value) => {
        window.history.pushState({}, "", value);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, path);
    };
    const logout = async () => {
      await page.getByRole("button", { name: "管理员菜单" }).click();
      await page.getByRole("menuitem", { name: "退出登录" }).click();
      await expect(page.getByRole("button", { name: "登录", exact: true })).toBeVisible();
    };
    await page.goto("/login");
    await expect(page).toHaveTitle(/轻连 WiFi/);
    await login("admin", "Admin123!");
    await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();
    await go("/accounts");
    await expect(page.getByRole("heading", { name: "同仁账号", exact: true })).toBeVisible();
    const operator = `colleague_${viewport.width}`;
    await page.getByLabel("用户名", { exact: true }).fill(operator);
    await page.getByLabel("初始密码").fill("Colleague123!");
    await page.getByRole("button", { name: "创建账号", exact: true }).click();
    await expect(page.getByText("同仁账号已创建", { exact: true })).toBeVisible();
    await logout();
    await login(operator, "Colleague123!");
    await expect(page).toHaveURL(/\/stores$/);
    if (viewport.width < 1024) await page.getByRole("button", { name: "打开导航" }).click();
    const nav = page.getByRole("navigation", { name: "主导航" }).filter({ visible: true });
    await expect(nav.getByRole("link")).toHaveCount(2);
    await expect(nav.getByRole("link", { name: "同仁账号" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "操作日志" })).toHaveCount(0);
    if (viewport.width < 1024) await page.keyboard.press("Escape");
    for (const path of ["/accounts", "/operation-logs", "/settings", "/"]) {
      await go(path);
      await expect(page).toHaveURL(/\/stores$/);
    }
    await page.getByRole("link", { name: "新建用户", exact: true }).first().click();
    const name = `同仁测试用户-${viewport.width}`;
    await page.getByLabel(/用户名称/).fill(name);
    await expect(page.getByRole("switch")).toHaveCount(0);
    await page.getByRole("tab", { name: "Wi-Fi 配置" }).click();
    await page.getByLabel(/Wi-Fi 名称/).fill("Colleague-WiFi");
    await page.getByLabel(/^Wi-Fi 密码/).fill("Initial-WiFi-2026!");
    await page.getByLabel(/确认新密码/).fill("Initial-WiFi-2026!");
    await page.getByRole("button", { name: "保存更改", exact: true }).click();
    await expect(page).toHaveURL(/\/stores\/store-[^/]+$/);
    const detailPath = new URL(page.url()).pathname;
    await expect(page.getByRole("link", { name: "编辑用户" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "统计", exact: true })).toHaveCount(0);
    await go(`${detailPath}/edit`);
    await expect(page).toHaveURL(new RegExp(`${detailPath}$`));
    await page.getByRole("tab", { name: "二维码", exact: true }).click();
    await page.getByRole("button", { name: "生成二维码", exact: true }).click();
    await expect(page.getByAltText(`${name} 小程序码预览`)).toBeVisible();
    await expect(page.getByRole("button", { name: "停用", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "下载", exact: true })).toBeVisible();
    if (process.env.QA_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.QA_SCREENSHOT_DIR, `operator-${viewport.width}.png`),
        fullPage: true,
      });
    await logout();
    await login("admin", "Admin123!");
    await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();
    await go("/stores");
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row.getByText(operator, { exact: true })).toBeVisible();
    if (process.env.QA_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.QA_SCREENSHOT_DIR, `user-creators-${viewport.width}.png`),
        fullPage: true,
      });
    await go("/qrcodes");
    await expect(page.getByRole("heading", { name: "二维码", exact: true })).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: name }).getByText(operator, { exact: true }),
    ).toBeVisible();
    if (process.env.QA_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.QA_SCREENSHOT_DIR, `main-creators-${viewport.width}.png`),
      });
    expect(errors).toEqual([]);
  });
}
