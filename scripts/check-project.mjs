import { readFile, access } from "node:fs/promises";
import { parseEnv } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = process.argv.find((value) => value.startsWith("--env-file="))?.slice(11) ?? ".env";
const env = {
  ...parseEnv(await readFile(path.resolve(root, envFile), "utf8").catch(() => "")),
  ...process.env,
};
const mini = path.join(root, "apps/mini-program");
const project = JSON.parse(await readFile(path.join(mini, "project.config.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(mini, "src/app.json"), "utf8"));
const rows = [];
const check = (name, passed, detail) =>
  rows.push({ name, status: passed ? "PASS" : "FAIL", detail });
check(
  "AppID",
  /^wx[0-9a-f]{16}$/.test(project.appid) && env.WECHAT_APP_ID === project.appid,
  "客户端与后端必须使用同一已备案 AppID",
);
check("Base library", !!project.libVersion, `基础库 ${project.libVersion ?? "未设置"}`);
check(
  "WeChat secret",
  !!env.WECHAT_APP_SECRET && !/YOUR_|replace|placeholder/i.test(env.WECHAT_APP_SECRET),
  "仅检查服务端是否配置，不输出值",
);
check(
  "WxACode provider",
  env.QR_CODE_PROVIDER === "wechat",
  "local-placeholder 不是可扫描的小程序码",
);
check(
  "QR page",
  (env.WECHAT_QR_PAGE ?? "pages/connect/index") === "pages/connect/index",
  "小程序码固定进入 connect",
);
check(
  "QR version",
  ["develop", "trial", "release"].includes(env.WECHAT_ENV_VERSION),
  "体验码只供开发者/体验成员，正式贴纸使用 release",
);
const api = env.MINIPROGRAM_API_BASE_URL ?? "";
check(
  "HTTPS API",
  /^https:\/\//.test(api) && !/example\.|localhost|YOUR_|TODO_API/.test(api),
  "需真实 HTTPS 后端及 request/downloadFile 合法域名",
);
check("Database configuration", !!env.DATABASE_URL, "配置存在不代表连接、迁移和读写成功");
check(
  "Core pages",
  [
    "pages/connect/index",
    "pages/manage/list",
    "pages/manage/create",
    "pages/manage/detail",
    "pages/success/index",
  ].every((page) => manifest.pages.includes(page)),
  "顾客、商家与成功页均需注册",
);
for (const page of manifest.pages)
  for (const extension of [".ts", ".json", ".wxml", ".wxss"]) {
    const exists = await access(path.join(mini, "src", `${page}${extension}`)).then(
      () => true,
      () => false,
    );
    check(`Page ${page}${extension}`, exists, "页面文件存在");
  }
const template = await readFile(path.join(mini, "src/config/runtime.generated.ts"), "utf8");
const builtRuntime = await readFile(
  path.join(mini, "dist/config/runtime.generated.js"),
  "utf8",
).catch(() => null);
const publicSources = [JSON.stringify(project), JSON.stringify(manifest), builtRuntime ?? template];
check(
  "Client placeholders",
  !publicSources.some((text) =>
    /YOUR_APPID|YOUR_ENV_ID|adunit-xxxxxxxx|TODO_API|api\.example\./.test(text),
  ),
  builtRuntime
    ? "扫描当前 dist 构建配置；仍需 verify:artifact 核验目标环境"
    : "缺少构建产物，正在检查源码模板",
);
if (/api\.example\./.test(template))
  rows.push({
    name: "Source template",
    status: "INFO",
    detail:
      "源码模板含 api.example.cn 占位域名；部署时由构建器使用实际环境替换，禁止直接上传源码模板",
  });
check("Ad gate", env.ENABLE_ADS !== "true", "本阶段广告关闭，不阻断连接");
rows.push({
  name: "Cloud functions/database",
  status: "N/A",
  detail: "使用已有 Fastify/PostgreSQL，不使用云开发",
});
rows.push({
  name: "Platform declarations",
  status: "MANUAL",
  detail: "微信后台确认合法域名、商家 OpenID 处理、WiFi/相册相关隐私声明和类目权限",
});
rows.push({
  name: "Physical WiFi",
  status: "NEEDS_DEVICE",
  detail: "Android/iOS 目标 AppID 真机核验；release 自动连接开关保持关闭",
});
console.log(
  process.argv.includes("--json")
    ? JSON.stringify(rows, null, 2)
    : rows.map((row) => `${row.status} ${row.name}: ${row.detail}`).join("\n"),
);
if (rows.some((row) => row.status === "FAIL")) process.exitCode = 1;
