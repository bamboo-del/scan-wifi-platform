# 部署

## 推荐拓扑

```text
api.<真实根域名>   -> Caddy HTTPS -> Fastify
admin.<真实根域名> -> Caddy HTTPS -> nginx static admin-web
Fastify -> private PostgreSQL
Fastify -> WeChat server API / persistent QR volume
```

- PostgreSQL 不暴露公网；本地 Compose 也只绑定 `127.0.0.1:5432`。
- API 原始端口只允许受控反向代理或内网访问。
- 全站 HTTPS，HTTP 永久跳转 HTTPS。
- 管理后台与 API 使用同一注册域名下的两个 HTTPS 子域名，保持 SameSite=Strict Cookie 和精确 Origin 校验。

## PostgreSQL 角色与迁移

生产使用两个独立角色：

1. `MIGRATION_DATABASE_URL`：schema owner，仅部署迁移任务可读取。
2. `DATABASE_URL`：API 运行角色，只授予现有业务表的 SELECT/INSERT/UPDATE/DELETE 与必要序列权限；禁止 SUPERUSER、CREATEDB、CREATEROLE 和 schema CREATE。

部署迁移：

```powershell
pnpm.cmd db:migrate
```

生产 Compose 会先运行一次性 `migrate` 容器，成功后才启动 API。迁移容器只获得 owner URL；API 容器只获得最小权限 app URL。

新环境先创建数据库及 owner/app 两个角色，再执行仓库迁移；不要手工只创建 WifiSpot 单表。已有环境先备份，再顺序执行未应用迁移。`0005_keen_sir_ram.sql` 扩展商户身份、12 小时商家会话、永久 shortId、点位名称和软删除标记；已有网络继承当前启用码或最新历史码的 scene。迁移后确认 `merchant_sessions` 存在、short_id 唯一、现有有效码的 scene 未改变，并给 API 运行角色授予新增表的必要 CRUD 权限。

该迁移不删除旧商户、网络、密码密文和码，也不会自动恢复历史上已废弃的旧码。不要用重建数据库替代生产迁移。

先在同版本预生产数据库验证。迁移采用 expand/contract；不要在应用仍依赖旧列时做破坏性删除。生产数据库启用自动备份与 WAL/PITR，至少每季度做恢复演练，并监控连接数、慢查询、锁等待、磁盘与 autovacuum。

## API

```powershell
pnpm.cmd --filter @scan-wifi/api build
node apps/api/dist/server.js
```

生产要求：

- 以非特权操作系统用户运行。
- `NODE_ENV=production`、`COOKIE_SECURE=true`、精确 `ADMIN_WEB_ORIGIN`。
- API 仅经过一层可信反向代理时设置 `TRUST_PROXY_HOPS=1`；直连保持 `0`。不要无条件信任所有 `X-Forwarded-For`。
- `DATABASE_POOL_MAX` 与数据库容量匹配；多实例总连接数必须受控。
- 健康检查使用 `/health`，会执行 `select 1` 数据库就绪探测且不输出秘密。
- OpenAPI UI 位于 `/documentation`；生产可在反向代理层限制访问。

Cookie 当前为 HttpOnly、Secure（生产强制）、SameSite=Strict、Path=`/api/admin`。若后台与 API 跨站，必须重新设计 CSRF/Cookie 策略，不能只放宽 CORS 或 SameSite。

原生商家走 `/api/merchant`：微信 code 登录后取得 12 小时 Bearer 会话，token 仅保存在小程序内存。反向代理必须保留 `Authorization` 请求头，包括图片下载；不得缓存商家接口和 `/api/public/credential`，不得在访问日志记录认证头或请求体。商家路由根据服务端会话检查归属，不能依靠客户端隐藏按钮做隔离。

## 管理后台

```powershell
pnpm.cmd --filter @scan-wifi/admin-web build
```

将 `apps/admin-web/dist` 作为静态文件部署，并为 SPA 路由配置回退到 `index.html`。只允许注入公开的 `VITE_API_BASE_URL`；不得注入 AppSecret、数据库 URL、Wi-Fi 主密钥或会话密钥。

## 微信小程序

开发者工具导入目录为 `apps/mini-program`，项目已指定 `miniprogramRoot=dist/`。先运行构建，再导入或重新编译，不导入 `src` 或仓库根目录，也不改用另一个 AppID。

### 本地开发与项目检查

```powershell
pnpm.cmd --filter @scan-wifi/mini-program build:local
node scripts/check-project.mjs
```

`build:local` 仅面向电脑开发者工具，默认 API 为 `http://127.0.0.1:3100`；手机上的 localhost 不是这台电脑，不能用它完成真机链路。检查器读取 `.env` 和当前进程环境，返回 FAIL 时退出码为 1；它检查配置存在性及页面文件，不把数据库 URL 存在当成数据库已连通。云开发项为 N/A，隐私/域名/真机为人工项。

构建器将配置写入暂存区和 `dist`，不会改写源码中的运行时配置模板。实际验收应检查构建输出及 `verify:artifact`，不能只看源码模板。占位地址仅能用于明确标注的内部构建，不是部署地址。

### 微信公众平台与体验版

1. 在服务器配置同一 AppID `YOUR_WECHAT_APP_ID` 与其 AppSecret；`QR_CODE_PROVIDER=wechat`、`WECHAT_QR_PAGE=pages/connect/index`、`WECHAT_ENV_VERSION=trial`。服务端必须能访问微信登录、token 与制码接口；按后台实际要求配置服务器出口 IP。
2. 部署并验证真实 HTTPS API、完整证书链、持久数据库和二维码目录；公众平台分别配置 request 和 downloadFile 合法域名。仅关闭开发者工具域名校验不能代替这一步。
3. 按目标 AppID 后台当前要求确认服务类目、接口权限及隐私说明。商家微信身份会生成不可逆 OpenID 摘要；顾客主动连接会临时处理 Wi-Fi 凭据；保存相册需要用户许可。保留已有声明，在提审前补齐本次实际使用的能力。
4. 将 Android 测试账号加入体验成员。只有开发者工具登录，并不保证手机微信账号已具备体验版权限。
5. 用实际 HTTPS 地址构建 trial 包并上传，在后台选为体验版。试验自动连接时可显式开启兼容适配器；这不解除正式发布限制。

```powershell
$env:MINIPROGRAM_API_BASE_URL="<真实已备案 HTTPS API 地址>"
$env:MINIPROGRAM_ALLOW_PLACEHOLDER_API="false"
$env:MINIPROGRAM_ENABLE_LEGACY_WIFI_API="true"
$env:ENABLE_ADS="false"
pnpm.cmd --filter @scan-wifi/mini-program build:trial
pnpm.cmd --filter @scan-wifi/mini-program verify:artifact:trial
```

6. 商家在体验版新建点位，生成微信返回的 PNG，预览、保存相册、生成海报并打印。用手机微信扫一扫进入 connect 页；不得把开发者工具里手输 scene 当作实体扫码通过。
7. 按 TEST 01–15 验证目标 SSID、错误密码、关 Wi-Fi、拒绝权限、超出范围、暂停，以及修改路由器和系统中的密码后旧码仍取最新凭据。Android 和 iOS 分开记录；当前没有 iOS 设备，该项保持待验收。

`WECHAT_ENV_VERSION` 是后端制码版本，`build:trial` 是客户端构建，两者必须配套。develop/trial 的 `check_path=false` 仅用于联调；已打印体验码不会因后端改成 release 自动变成正式码，不能用于正式铺贴。

### 正式构建与发布门禁

```powershell
$env:MINIPROGRAM_API_BASE_URL="<真实已备案 HTTPS API 地址>"
$env:MINIPROGRAM_ALLOW_PLACEHOLDER_API="false"
$env:MINIPROGRAM_BUILD_MODE="production"
$env:MINIPROGRAM_ENABLE_LEGACY_WIFI_API="false"
pnpm.cmd --filter @scan-wifi/mini-program build:production
```

生产构建拒绝空 URL、HTTP URL、不安全本地开关和启用兼容 Wi-Fi 适配器，移除诊断页面与诊断实现。当前正式包可保留手动复制兜底，但不等于满足“一键连接 WiFi”的完成定义。取得目标 AppID 的 Android/iOS 实测证据并确认平台准入后，才可据证据单独复核此发布门禁；不要为了让构建通过而取消保护。

正式服务使用 `WECHAT_ENV_VERSION=release`、真实微信 provider；正式 connect 页面发布可用后，生成并复验 release 小程序码再批量打印。随后完成平台审核及发布后的冷启动扫码、改密旧码、停用失效复验；仓库命令不代替微信平台操作。

## 二维码与对象存储

当前生产 Compose 把 `LocalFileQrCodeStorage` 放在持久化 `qr_data` volume，可用于单 CVM、单 API 实例首发。多实例或跨主机高可用前必须实现并注入 S3/COS 兼容的 `QRCodeStorage`：

- bucket 私有；后台通过认证 API 或短时签名 URL 下载。
- 限制文件大小和 PNG/JPEG 内容签名，设置 `nosniff` 与安全文件名。
- 不在对象 metadata、文件名或 URL 中写入 Wi-Fi 密码、AppSecret 或 scene 以外的敏感信息。
- 多实例间共享，设置生命周期与备份策略。

生产必须使用 `QR_CODE_PROVIDER=wechat`；配置解析会拒绝 `local-placeholder`。数据库备份不包含二维码 volume，服务器快照或独立文件备份必须覆盖该 volume。

重新生成只刷新图片，保留既有 scene 和停用状态；密码变更无须重印。图片由商家认证接口下载，Canvas 只组合真实微信图片，导出 1200×1500 PNG。应使用原图打印并实际扫码验证，不用截图、占位 SVG 或普通二维码库输出代替微信码。删除点位会令既有实体贴失效，且当前数据库行的凭据已擦除；恢复误删需按备份恢复流程处理，不能点击“恢复”重新启用。

## 生产环境变量

至少包含：

- `DATABASE_URL`
- `MIGRATION_DATABASE_URL`（只给迁移任务）
- `WIFI_ENCRYPTION_KEY_BASE64`
- `SESSION_SECRET`
- `ADMIN_WEB_ORIGIN`
- `COOKIE_SECURE=true`
- `TRUST_PROXY_HOPS`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `WECHAT_QR_PAGE=pages/connect/index`
- `WECHAT_ENV_VERSION`（体验服务 trial，正式服务 release）
- `QR_CODE_PROVIDER=wechat`
- `QR_CODE_STORAGE_DIR` 或生产对象存储适配器配置

秘密进入云密钥管理或受控运行环境，不写镜像、Compose、Git、前端变量或小程序配置。应用进程不应获得迁移 owner 凭据。

`SESSION_SECRET` 用于会话 HMAC；轮换会使已有商家会话失效，重新微信登录后保持同一商户归属。持久身份用独立固定域的 OpenID 摘要，不依赖该密钥。`WIFI_ENCRYPTION_KEY_BASE64` 用于持久密码加密，必须安全备份，不能直接替换后期待旧密码仍可解密；轮换需要受控重加密迁移。

## 生产编排

- `Dockerfile`：`api` 与 `admin` 两个最终镜像；只有公开 `VITE_API_BASE_URL` 进入后台构建。
- `docker-compose.prod.yml`：私有数据库网络、迁移门禁、非特权后台容器、健康检查和持久化 volumes。
- `deploy/Caddyfile`：自动证书、HTTP 到 HTTPS 跳转、HSTS、反向代理；生产隐藏 Swagger UI。
- `deploy/nginx-admin.conf`：SPA 回退、静态缓存和浏览器安全头。
- `scripts/backup-postgres.sh`：custom-format `pg_dump`、可读性校验、原子落盘和保留期清理。
- 所有容器使用 Docker `local` 日志驱动，单文件 10 MB、最多 5 个文件。

逐条腾讯云命令见 [TENCENT_CLOUD_DEPLOYMENT.md](TENCENT_CLOUD_DEPLOYMENT.md)。

## 发布与回滚

1. 备份数据库并验证恢复点。
2. 在预生产运行全量质量门禁与迁移。
3. 部署向后兼容迁移。
4. 滚动部署 API，验证 `/health`、登录、门店读取、二维码下载和停用即时失效。
5. 部署管理后台静态资源并跑核心浏览器流程。
6. 最后发布小程序并验证合法域名、隐私、广告与目标 AppID 真机矩阵。

回滚优先回滚应用而不回滚数据。紧急情况下使用门店/二维码停用或广告全局开关，不删除业务数据。破坏性 schema 变更使用两次发布完成。
