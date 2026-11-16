# 轻连 WiFi

默认分支提供平台统一运营版，包含管理员和同仁权限、用户归属、二维码及创建人记录。[商户自助开发分支](https://github.com/bamboo-del/scan-wifi-platform/tree/merchant-self-service) 展示商户侧自主配置和多点位流程。

“轻连 WiFi”是一套由平台统一运营的用户免费扫码连接 Wi-Fi 系统。管理员管理全部用户与同仁账号，同仁管理自己名下的用户、Wi-Fi、小程序码和匿名连接统计；系统不提供商户注册、付费、会员、优惠券、代理商、分佣或提现功能。

> 真实限制：微信官方当前把 Wi-Fi API 系列标记为“已下架”。仓库保留隔离且有测试的旧接口兼容层，但生产默认关闭。只有目标 AppID 在当前微信版本、iOS 与 Android 真机均验证通过后，才可显式开启；否则小程序提供清晰的不可用状态和手动连接指引。

## 当前已实现功能

| 模块       | 功能                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 管理员     | 初始化账号、密码登录、会话查询、退出和服务端会话撤销；登录限流，失效后返回登录页                                                            |
| 同仁协作   | 管理员新增、启停、重置同仁密码；本人修改密码；同仁仅管理自己的用户与统计；管理员转移归属并保留审计记录                                      |
| 用户管理   | 分页、名称/地址/SSID 搜索、状态筛选；新建、编辑、详情；名称、简称、Logo、地址、联系人、电话、广告开关；用户启用/停用                        |
| Wi-Fi      | 每位用户一套配置：SSID、密码、可选 BSSID、安全类型及启停状态；加密保存、仅显示密码掩码、替换密码、版本记录；更新密码无需重印现有码          |
| 二维码     | 生成/重建微信小程序码；预览、下载、复制 scene；启用/停用；搜索和状态筛选；每位用户最多一个启用码；本地占位码用于测试                        |
| 统计       | 用户总数、启用码数、今日扫码/连接/成功率、近 7 日趋势及漏斗；用户按时间范围统计访问、广告、点击、成功/失败和常见错误；统计按 UTC 日界线聚合 |
| 操作日志   | 分页、搜索、操作类型/资源类型过滤；查看操作者、时间、资源和脱敏元数据                                                                       |
| 系统设置   | 修改全局广告开关；查看广告位、微信二维码提供器和兼容连接开关的配置状态                                                                      |
| 顾客小程序 | scene 校验、用户/Logo/SSID 展示；有效性检查、连接状态和错误提示、重试、手动连接排障；广告展示、失败折叠及匿名事件上报                       |
| 兼容连接   | 前后端开关都开启且设备支持时，点击才取最新凭据，调用旧微信接口，核验连接的 SSID/可选 BSSID，超时或卸载清理；生产默认关闭                    |
| 开发诊断   | 仅开发/体验版：系统和 SDK 信息、Wi-Fi 能力、手动测试、脱敏回调、耗时与监听清理；正式包剔除诊断页                                            |
| 工程运维   | OpenAPI（非生产）、健康检查、数据库迁移、单机 Docker/HTTPS 编排、备份脚本；分环境构建、发布预检、密钥边界扫描及自动化测试                   |

当前是平台统一管理、每位用户一个网络；支持管理员/同仁两种角色与用户归属隔离；没有商户自助注册、多网络选择、会员支付、分佣提现、MFA或自动密钥轮换功能。真机一键连接、微信正式码与广告的实际可用性仍需对应 AppID、配置和现场验证。

本次安全修复将页面配置与凭据接口分离：API 和小程序需配套更新。旧客户端不能继续依赖 `GET /api/public/connect/:sceneToken` 返回密码；新版仅在主动连接时调用 `POST /api/public/credential`。

## 和同仁一起使用

1. 按下方启动流程配置服务；已有数据库先运行 `pnpm.cmd db:migrate`，升级 API 和后台。
2. 用原管理员账号登录，在“同仁账号”创建账号，私下交付初始密码。
3. 同仁使用同一后台地址登录，在“修改密码”更换初始密码，再创建自己的用户、配置 Wi-Fi、生成二维码。
4. 原有用户升级后仍由平台管理；管理员在用户详情的“用户归属”指定同仁，填写原因完成交接。
5. 停用同仁不影响顾客现有码，原会话立即撤销；需要交接时由管理员转移用户。转移不改创建人、Wi-Fi 或二维码，记录可在操作日志中查看。

详见 [多人协作使用说明](docs/TEAM_USAGE.md)。本地演示数据不代表微信真机或广告验收。

“用户”指保存资料与网络的业务记录，不是后台登录账号。用户保留名称、简称、Logo、地址、联系人和电话；备注已从表单、接口与数据库移除。升级时先备份，再运行 `0004_remove_user_notes` 迁移。

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

默认初始管理员用户名为 `wifi_admin`，由 `INITIAL_ADMIN_USERNAME` 指定，随机密码保存在本机 `.env` 的 `INITIAL_ADMIN_PASSWORD`。完成 `admin:init` 并记录密码后，应删除该变量；`.env` 已被 Git 忽略，禁止提交。

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

`pnpm.cmd quality` 会依次执行格式、lint、类型、测试、构建和客户端秘密边界扫描。E2E 单独运行，以 Playwright 验证管理员登录、表单校验、用户创建、Wi-Fi 替换、二维码和停用流程。

## 安全边界

- Wi-Fi 密码使用 AES-256-GCM；管理端只能替换，不能读取旧密码。
- scene 是 16 个随机字节编码的 32 字符小写 hex，不含用户 ID、SSID 或密码。
- 管理员使用服务端可撤销的 HttpOnly、SameSite=Strict Cookie；前端不保存长期 token。
- 公共连接响应设置 `Cache-Control: no-store`；匿名事件只接受白名单字段和错误码。
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
