import automator from "miniprogram-automator";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout, clearTimeout } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";

const projectPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(tmpdir(), "wifi-customer-ui");
await mkdir(output, { recursive: true });
const mini = process.env.WECHAT_AUTOMATION_WS
  ? await automator.connect({ wsEndpoint: process.env.WECHAT_AUTOMATION_WS })
  : await automator.launch({
      cliPath: process.env.WECHAT_DEVTOOLS_CLI,
      projectPath,
      timeout: 60000,
      trustProject: true,
    });
const exceptions = [];
const screenshot = async (name) => {
  // Let the finite entry/feedback transitions finish before capturing layout.
  await delay(750);
  await mini.screenshot({ path: path.join(output, name) });
};
const timeout = setTimeout(() => {
  process.stderr.write("Native smoke timed out. Check the DevTools runtime.\n");
  mini.disconnect();
}, 90000);
mini.on("exception", (exception) => exceptions.push(exception));
try {
  // HTTP/WiFi fixtures verify rendered behavior, never physical connectivity.
  await mini.mockWxMethod("getEnterOptionsSync", { query: {} });
  await mini.mockWxMethod("getLaunchOptionsSync", { query: {} });
  await mini.mockWxMethod(
    "request",
    `function(options) {
    const second = options.data && options.data.sceneToken === 'b'.repeat(32);
    const long = options.data && options.data.sceneToken === 'c'.repeat(32);
    const ssid = long ? 'QA-Long-Network-Name-1234567890123' : second ? 'QA-Second' : 'QA-Guest';
    const wifiId = long ? 'wifi-long' : second ? 'wifi-second' : 'wifi-first';
    let data = {};
    if (options.url.includes('/public/connect')) data = { store: { id: 'store', name: '验收门店', shortName: null, logoUrl: null }, wifi: { id: wifiId, ssid: ssid, bssid: null, securityType: 'WPA2' }, ad: { enabled: false, unitId: null }, compatibility: { legacyWifiApiEnabled: true } };
    else if (options.url.includes('/public/credential')) data = { storeId: 'store', wifiId: wifiId, ssid: ssid, password: long ? '0123456789'.repeat(6) + 'abc' : second ? 'second-fixture-password' : 'first-fixture-password', bssid: null };
    return { statusCode: options.url.includes('/events') ? 202 : 200, data: data };
  }`,
  );
  let page = await mini.reLaunch("/pages/connect/index");
  await page.waitFor(async () => (await page.data("phase")) === "idle");
  assert.equal(await page.data("password"), "");
  assert.equal(await page.$("#merchant-entry"), null);
  await screenshot("home.png");
  page = await mini.reLaunch("/pages/connect/index?scene=invalid");
  await page.waitFor(async () => (await page.data("phase")) === "invalid");
  assert.equal(await page.data("password"), "");
  await screenshot("invalid.png");

  await mini.mockWxMethod("startWifi", { errMsg: "startWifi:ok" });
  await mini.mockWxMethod("connectWifi", { errMsg: "connectWifi:ok" });
  await mini.mockWxMethod("getConnectedWifi", {
    wifi: { SSID: "QA-Other", BSSID: "", secure: true, signalStrength: 80 },
  });
  page = await mini.reLaunch("/pages/connect/index?scene=" + "a".repeat(32));
  await page.waitFor(async () => (await page.data("phase")) === "waiting");
  assert.equal(await (await page.$("#wifi-ssid")).text(), "QA-Guest");
  assert.equal(await (await page.$("#wifi-password")).text(), "first-fixture-password");
  assert.equal((await page.$$("button")).length, 1);
  assert.equal(await page.$("ad"), null);
  assert.equal(await page.$("input"), null);
  await screenshot("connect-ready.png");
  await (await page.$(".primary-button")).tap();
  await page.waitFor(async () => (await page.data("phase")) === "connecting");
  assert.equal(await page.data("buttonDisabled"), true);
  await page.callMethod("onHide");
  assert.equal(await page.data("motionActive"), false);
  await page.callMethod("onShow");
  assert.equal(await page.data("motionActive"), true);
  await screenshot("connecting.png");
  await mini.mockWxMethod("getConnectedWifi", {
    wifi: { SSID: "QA-Guest", BSSID: "", secure: true, signalStrength: 80 },
  });
  await page.waitFor(async () => (await page.data("phase")) === "success");
  assert.equal((await mini.currentPage()).path, "pages/connect/index");
  assert.equal(await (await page.$(".primary-button")).text(), "已连接 Wi-Fi");
  await screenshot("connected.png");

  await mini.mockWxMethod("getEnterOptionsSync", { query: { scene: "b".repeat(32) } });
  await page.callMethod("onShow");
  await page.waitFor(async () => (await page.data("ssid")) === "QA-Second");
  assert.equal(await (await page.$("#wifi-password")).text(), "second-fixture-password");
  assert.equal(JSON.stringify(await page.data()).includes("first-fixture-password"), false);
  await screenshot("second-network.png");

  await mini.mockWxMethod("getEnterOptionsSync", { query: { scene: "c".repeat(32) } });
  await page.callMethod("onShow");
  await page.waitFor(async () => (await page.data("phase")) === "waiting");
  assert.equal(await (await page.$("#wifi-ssid")).text(), "QA-Long-Network-Name-1234567890123");
  assert.equal(await (await page.$("#wifi-password")).text(), "0123456789".repeat(6) + "abc");
  await screenshot("long-credentials.png");
  assert.equal(exceptions.length, 0, "Native runtime exceptions were observed");
  process.stdout.write(
    `PASS native customer page: SSID/password/button, no merchant/ad/input, connecting/success feedback, hide/show motion pause, scan isolation, long credentials. Screenshots: ${output}\nHTTP/WiFi fixtures; physical connectivity not verified.\n`,
  );
} finally {
  clearTimeout(timeout);
  for (const method of [
    "request",
    "getEnterOptionsSync",
    "getLaunchOptionsSync",
    "startWifi",
    "connectWifi",
    "getConnectedWifi",
  ])
    await mini.restoreWxMethod(method).catch(() => undefined);
  await mini.reLaunch("/pages/connect/index?home=1").catch(() => undefined);
  mini.disconnect();
}
