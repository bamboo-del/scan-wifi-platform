# 轻连 WiFi

本分支记录商户自助配置、多点位、海报和数据统计的开发版本。默认分支是平台统一运营及同仁权限版。两个分支各有独立数据库迁移，请用单独的本地数据库体验。

“轻连 WiFi”是一套门店免费扫码连接 Wi-Fi 系统。平台管理员维护商户、门店、多个 Wi-Fi 网络、每个网络的小程序码和 WiFi 贴海报，查看连接统计；原生小程序新增商家微信登录及本人 WiFi 贴的创建、编辑、停用、恢复、删除、制码与海报保存。

本轮重构与验收见 [E2E_TEST](docs/E2E_TEST.md)。自动化检查不代表上线：当前尚无正式 HTTPS 后端，真实微信码和目标 AppID 真机链路未验收，生产自动连接继续关闭。

业务链路：商户 → 门店 → Wi-Fi → 随机 scene 小程序码 → 打印海报 → 顾客扫码查看 SSID → 点击连接或复制密码时获取最新凭据 → 自动连接或系统设置手动连接 → 统计。更新密码保留原 scene，不需要重印 WiFi 贴。

> 真实限制：微信官方当前把 Wi-Fi API 系列标记为“已下架”。仓库保留隔离且有测试的旧接口兼容层，但生产默认关闭。只有目标 AppID 在当前微信版本、iOS 与 Android 真机均验证通过后，才可显式开启；否则小程序提供清晰的不可用状态和手动连接指引。

## 项目结构

```text
apps/admin-web        React + Vite 管理后台
apps/api              Fastify + Drizzle API
apps/mini-program     原生微信小程序
packages/config       服务端环境变量校验
packages/validation   Zod 输入校验
packages/shared-types 跨端公开类型
docs                  架构、微信、部署与安全文档
```

## 环境要求

- Node.js 22+
- pnpm 11
- PostgreSQL 16；本地推荐 Docker Desktop
- 微信开发者工具；仅小程序调试和发布需要

本机 PowerShell 的执行策略可能阻止 `pnpm.ps1`。下列 Windows 命令统一使用 `pnpm.cmd`；macOS/Linux 可把它替换为 `pnpm`。

## Windows 一键本地启动

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd setup:env
docker compose up -d postgres
pnpm.cmd db:migrate
pnpm.cmd admin:init
pnpm.cmd dev
```

`setup:env` 从 `.env.example` 生成本机 `.env`，并随机生成数据库、Wi-Fi 加密、会话和初始管理员密码。脚本不会覆盖已有 `.env`；需要明确重建时运行 `pnpm.cmd setup:env -- --force`。

初始管理员用户名为 `wifi_admin`，随机密码保存在本机 `.env` 的 `INITIAL_ADMIN_PASSWORD`。完成 `admin:init` 并记录密码后，应删除该变量；`.env` 已被 Git 忽略，禁止提交。

本地服务：

- 管理后台：`http://localhost:5173`
- API：`http://127.0.0.1:3100`
- OpenAPI / Swagger：`http://127.0.0.1:3100/documentation`
- PostgreSQL：只绑定 `127.0.0.1:5432`

Docker Compose 使用两个数据库角色：

- `MIGRATION_DATABASE_URL`：迁移所有者，只用于 schema 迁移。
- `DATABASE_URL`：API 运行账号，无超级用户、建库、建角色或建表权限。

如果不用 Docker，请自行创建 PostgreSQL 16 数据库和最小权限运行账号，并设置这两个连接串。

## 微信小程序构建配置

微信开发者工具导入 `apps/mini-program`，不要直接导入 `src` 或 `dist`。`project.config.json` 的 `miniprogramRoot` 指向 `dist/`；运行构建后，开发者工具直接读取其中已转译的 JavaScript、WXML、WXSS、页面 JSON 和图片。

默认开发构建生成安全配置：API 地址为空、旧 Wi-Fi 兼容层关闭、广告位为空，并包含仅开发版/体验版可访问的 Wi-Fi 诊断页：

```powershell
pnpm.cmd --filter @scan-wifi/mini-program build:develop
```

`build` 是 `build:develop` 的兼容别名；`build:production` 是 `build:release` 的兼容别名。

开发者工具连接本机 API：

```powershell
pnpm.cmd --filter @scan-wifi/mini-program build:local
```

该命令只允许 `localhost`、`127.0.0.1` 或 `::1` 的显式 HTTP 开发地址。真机不能访问电脑自身的 `127.0.0.1`，真机联调应使用已备案/允许的 HTTPS 域名：

```powershell
$env:MINIPROGRAM_API_BASE_URL="https://api.example.cn"
$env:MINIPROGRAM_ALLOW_PLACEHOLDER_API="true"
$env:MINIPROGRAM_ENABLE_LEGACY_WIFI_API="false"
$env:MINIPROGRAM_AD_UNIT_ID=""
pnpm.cmd --filter @scan-wifi/mini-program build:trial
```

正式构建必须使用真实、非 `example.cn` / `example.com` 的公开 HTTPS 地址，并会排除诊断页。下面的尖括号内容必须替换，原样执行会失败：

```powershell
$env:MINIPROGRAM_API_BASE_URL="<真实已备案 HTTPS API 地址>"
$env:MINIPROGRAM_ALLOW_PLACEHOLDER_API="false"
$env:MINIPROGRAM_ENABLE_LEGACY_WIFI_API="false"
$env:MINIPROGRAM_AD_UNIT_ID=""
pnpm.cmd --filter @scan-wifi/mini-program build:release
```

`build:release` 会拒绝示例域名和 `touristappid` / `testappid`。trial 只有同时设置 `MINIPROGRAM_ALLOW_PLACEHOLDER_API=true` 时才接受示例 API，该开关不会放宽 release 门禁。

所有构建命令都会先在受忽略的临时目录生成公开运行配置，再把 TypeScript 编译为 CommonJS JavaScript 并复制静态资源到 `apps/mini-program/dist`；不会在 `src` 中生成 JavaScript。开发、本地和体验构建包含诊断页，正式构建会从清单和产物中删除诊断页。`app.json` 固定启用 `lazyCodeLoading: "requiredComponents"`，产物完整性检查会防止清单生成时丢失该配置。

可公开注入项见 `apps/mini-program/runtime.env.example`。构建后的产物完整性检查会验证每个页面的 JS/WXML/WXSS/JSON、全部相对 `require`、静态 import、动态 import 的大小写精确依赖闭包、本地组件资源、开发/正式页面边界和客户端密钥边界；任一运行时模块缺失都会使构建失败。AppSecret、数据库连接、Wi-Fi 主密钥和会话密钥不会进入小程序包。`dist/` 是可重建且被 Git 忽略的运行产物，不提交仓库。

旧 Wi-Fi 兼容层必须同时满足后端与小程序构建开关，并完成目标 AppID 真机矩阵后才能开启。详见 [微信配置](docs/WECHAT_SETUP.md)。

## 二维码模式

- 本地默认 `QR_CODE_PROVIDER=local-placeholder`，输出会明确标记“仅供本地测试”，不是正式微信小程序码。
- 生产必须配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`QR_CODE_PROVIDER=wechat` 和持久化二维码存储；生产配置会拒绝本地占位 provider。

## 质量门禁

```powershell
pnpm.cmd format:check
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
pnpm.cmd security:scan
pnpm.cmd e2e
```

`pnpm.cmd quality` 会依次执行格式、lint、类型、测试、构建和客户端秘密边界扫描。E2E 单独运行，覆盖管理员登录、商户/门店创建、多网络管理、二维码、海报预览及 PNG 下载、密码更新、停用和移动端统计页面。默认使用演示数据；`E2E_LIVE=true` 使用真实 API，需要配置 `DEV_API_PROXY_TARGET`、`E2E_ADMIN_USERNAME`、`E2E_ADMIN_PASSWORD`，API 允许来源应为 `http://127.0.0.1:4174`。真实数据库测试通过 `TEST_DATABASE_URL` 指向已迁移的专用测试库，不应指向正式库。

统一功能开关：`ENABLE_ADS=false`、`ENABLE_ANALYTICS=true`、`ENABLE_WIFI_DIAGNOSTICS=true`。API 读取前两项；小程序构建读取三项，release 强制关闭并移除诊断页。广告还受后台全局开关、门店开关及广告位 ID 控制，不影响连接与复制密码。每日 UV 使用本地按 UTC 日期轮换的随机标识，后端只保存每日 HMAC；跨日统计是访客日数，不代表跨日去重人数。

## 安全边界

- Wi-Fi 密码使用 AES-256-GCM；管理端只能替换，不能读取旧密码。
- scene 是 16 个随机字节编码的 32 字符小写 hex，不含门店 ID、SSID 或密码。
- 管理员使用服务端可撤销的 HttpOnly、SameSite=Strict Cookie；前端不保存长期 token。
- `/api/public/connect` 只返回门店和网络信息，不含密码；点击时才请求 `/api/public/credential`，返回 `private, no-store` 凭据并限流。自动连接关闭时仍可复制密码手动连接；密码不写入页面状态或小程序存储，用户主动复制时进入系统剪贴板。
- 匿名事件只接受白名单字段和错误码，不记录原始访问 ID、完整 scene 或密码。
- AppSecret、数据库连接、加密密钥与会话密钥只存在于服务端环境。

部署、反向代理、可信代理跳数、备份、密钥轮换与已知限制见 [部署文档](docs/DEPLOYMENT.md) 和 [安全说明](docs/SECURITY.md)。

## 生产部署

仓库现已提供单机生产编排：PostgreSQL、一次性迁移、Fastify API、管理后台静态容器、Caddy 自动 HTTPS、定时数据库备份和容器日志轮换。预留域名为 `api.example.cn` 与 `admin.example.cn`；正式部署前必须在 `.env.production` 中替换为已备案且已解析的真实域名。

```bash
cp .env.production.example .env.production
# 编辑真实域名、随机密钥、数据库密码和微信服务端凭证
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml build --pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml --profile init run --rm admin-init
docker compose --env-file .env.production -f docker-compose.prod.yml --profile ops up -d backup
```

备案或域名尚未完成时，可运行不读取真实凭证的静态/模板预检：

```powershell
pnpm.cmd prod:preflight:template
```

正式 `.env.production`、真实域名和可写备份目录准备好后，`pnpm.cmd prod:preflight` 才能通过；`prod:config`、`prod:build` 和 `prod:up` 都会先执行该严格预检。

## 许可证

项目源码采用 [MIT](LICENSE)。
