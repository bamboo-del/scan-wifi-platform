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

先在同版本预生产数据库验证。迁移采用 expand/contract；不要在应用仍依赖旧列时做破坏性删除。生产数据库启用自动备份与 WAL/PITR，至少每季度做恢复演练，并监控连接数、慢查询、锁等待、磁盘与 autovacuum。

## API

```powershell
pnpm.cmd --filter @scan-wifi/api build
node apps/api/dist/server.js
```

生产要求：

- 以非特权操作系统用户运行。
- `NODE_ENV=production`、`COOKIE_SECURE=true`、精确 `ADMIN_WEB_ORIGIN`。
- 直连保持 `TRUST_PROXY_HOPS=0`；启用代理时设置 `1` 并填写 `TRUST_PROXY_ADDRESSES`（逗号分隔的受控代理 IP/CIDR）。不再仅按跳数信任转发头。生产 Compose 使用固定网段 `172.30.250.0/28` 和 Caddy 地址 `172.30.250.2`；如果与宿主已有网络冲突，应同步调整网段、Caddy 地址、API 白名单及预检。
- `DATABASE_POOL_MAX` 与数据库容量匹配；多实例总连接数必须受控。
- 健康检查使用 `/health`，会执行 `select 1` 数据库就绪探测且不输出秘密。
- OpenAPI UI 位于 `/documentation`；生产可在反向代理层限制访问。

Cookie 当前为 HttpOnly、Secure（生产强制）、SameSite=Strict、Path=`/api/admin`。若后台与 API 跨站，必须重新设计 CSRF/Cookie 策略，不能只放宽 CORS 或 SameSite。

## 管理后台

```powershell
pnpm.cmd --filter @scan-wifi/admin-web build
```

将 `apps/admin-web/dist` 作为静态文件部署，并为 SPA 路由配置回退到 `index.html`。只允许注入公开的 `VITE_API_BASE_URL`；不得注入 AppSecret、数据库 URL、Wi-Fi 主密钥或会话密钥。

## 微信小程序

```powershell
$env:MINIPROGRAM_API_BASE_URL="<真实已备案 HTTPS API 地址>"
$env:MINIPROGRAM_ALLOW_PLACEHOLDER_API="false"
$env:MINIPROGRAM_BUILD_MODE="production"
pnpm.cmd --filter @scan-wifi/mini-program build:production
```

生产构建拒绝空 URL、HTTP URL 和不安全本地开关。随后在微信开发者工具中使用真实 AppID 完成编译、预览、真机矩阵、上传与平台审核；仓库命令不代替微信平台操作。

## 二维码与对象存储

当前生产 Compose 把 `LocalFileQrCodeStorage` 放在持久化 `qr_data` volume，可用于单 CVM、单 API 实例首发。多实例或跨主机高可用前必须实现并注入 S3/COS 兼容的 `QRCodeStorage`：

- bucket 私有；后台通过认证 API 或短时签名 URL 下载。
- 限制文件大小和 PNG/JPEG 内容签名，设置 `nosniff` 与安全文件名。
- 不在对象 metadata、文件名或 URL 中写入 Wi-Fi 密码、AppSecret 或 scene 以外的敏感信息。
- 多实例间共享，设置生命周期与备份策略。

生产必须使用 `QR_CODE_PROVIDER=wechat`；配置解析会拒绝 `local-placeholder`。数据库备份不包含二维码 volume，服务器快照或独立文件备份必须覆盖该 volume。

## 生产环境变量

至少包含：

- `DATABASE_URL`
- `MIGRATION_DATABASE_URL`（只给迁移任务）
- `WIFI_ENCRYPTION_KEY_BASE64`
- `SESSION_SECRET`
- `ADMIN_WEB_ORIGIN`
- `COOKIE_SECURE=true`
- `TRUST_PROXY_HOPS`
- `TRUST_PROXY_ADDRESSES`（代理启用时必填）
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `QR_CODE_PROVIDER=wechat`
- `QR_CODE_STORAGE_DIR` 或生产对象存储适配器配置

秘密进入云密钥管理或受控运行环境，不写镜像、Compose、Git、前端变量或小程序配置。应用进程不应获得迁移 owner 凭据。

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
