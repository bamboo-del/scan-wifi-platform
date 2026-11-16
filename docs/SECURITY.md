# 安全说明

## Wi-Fi 密码

- AES-256-GCM；32 字节主密钥只从环境读取。
- 每次写入生成独立随机 12 字节 IV；分列保存 ciphertext、IV 和 auth tag。
- 解密认证失败一律视为数据损坏，不回退到未认证解密。
- 管理后台只有掩码和“替换密码”，不提供读取原密码接口。
- 页面配置接口永不返回密码；凭据接口仅在兼容开关开启且用户、二维码、Wi-Fi 均启用时瞬时解密，独立限流并设置 `private, no-store`。小程序仅在点击连接时调用，重试重新校验。

### 密钥轮换

当前 schema 通过配置版本为轮换预留审计点。正式轮换应增加 key ID：部署新旧双读 -> 批量事务重加密 -> 核对数量与认证 -> 停止旧 key -> 安全销毁。不要直接覆盖唯一旧密钥后再尝试恢复。

## 管理员安全

- Argon2id 哈希；初始化密码不输出。
- HttpOnly、生产 Secure、SameSite=Strict Cookie；服务端可撤销的短会话。
- 登录和管理接口分层限流；错误响应不区分用户名是否存在。
- 敏感写操作写入不可含秘密的 operation log。
- 生产建议再加反向代理 IP 限制、MFA/SSO 和异常登录告警。

## 日志脱敏

禁止字段：`password`、`encrypted_password`、`password_iv`、`password_auth_tag`、Cookie、Authorization、AppSecret、加密主密钥。Fastify 请求日志对这些路径做 redact；外部微信错误只保存白名单错误码和截断后的安全消息。

## Scene token

- 128-bit CSPRNG，32 字符小写 hex，不连续、不包含业务含义。
- 数据库唯一约束；公共接口采用严格 regex 和长度校验。
- 公共查询对非法、不存在、停用资源返回统一不可用语义，降低枚举反馈。
- 按 IP/匿名维度限流；不要把 token 写入分析日志全文。

## Web 安全

- 管理写接口服务端 Zod 校验；Drizzle 参数化查询防 SQL 注入。
- React 默认转义文本；不要使用未经清洗的 `dangerouslySetInnerHTML`。
- API 设置 `nosniff`、frame deny、严格 referrer 和 Permissions-Policy；管理后台 Nginx 配置 CSP，并通过 `add_header_inherit merge` 保证设置缓存头的子路径仍继承安全头（要求 Nginx 1.29.3+；生产镜像为 1.30.3）。
- Cookie 会话配合 SameSite；若跨站部署必须增加显式 CSRF token。
- 所有接口统一错误 envelope，生产不回传 stack、SQL 或上游响应体。
- `TRUST_PROXY_HOPS=0` 禁用代理信任；非零时必须配置 `TRUST_PROXY_ADDRESSES` 的明确 IP/CIDR 白名单。该旧变量只作为开关，不再仅凭跳数信任转发头。生产 Caddy 固定为 `172.30.250.2`，API 仅信任此地址且不发布宿主端口。调整网段时必须同步 Caddy 地址、白名单和静态预检。
- API 请求日志及 Caddy 日志遮蔽连接 URL 中的 scene；管理接口的成功与错误响应均不缓存。

## PostgreSQL 权限

- 本地 Compose 和生产都区分迁移 owner 与 API 运行账号。
- `MIGRATION_DATABASE_URL` 只供部署迁移；API 只读取 `DATABASE_URL`。
- API 账号禁止 SUPERUSER、CREATEDB、CREATEROLE 与 schema CREATE，只授予业务表 DML 和必要序列权限。
- PostgreSQL 不暴露公网；本地端口也只绑定 `127.0.0.1`。

## 事件防刷

- 仅接受固定 event type、平台和已知错误码；未知错误码归一化为 `UNKNOWN`，客户端错误详情不原样入库。
- 单请求事件数和请求体大小受限，匿名接口严格限流。
- 不信任客户端 `store_id`：由 scene/QR 关系解析或交叉验证。
- 统计是产品观测数据，不作为广告计费凭证；不伪造广告/连接事件。

## 前端秘密边界

- Vite 只能获得公开的 API base 等值，服务器秘密不得带 `VITE_`。
- AppSecret、数据库连接串、加密主密钥不得出现在小程序工程。
- QR 图不含 SSID/密码，正式小程序码只能由后端微信 provider 生成。

## 已知限制

1. 微信官方当前标记 Wi-Fi API 系列已下架；真实一键连接不能在无目标 AppID 真机证据时保证。
2. 兼容连接开启时，知道有效 scene 的客户端可调用凭据接口取得访客密码；“点击后获取”是减少暴露的客户端流程，不是服务端身份证明。二维码是持有者凭证，限流和 no-store 不能让已经收到的密码失效；泄露后仍需在路由器更换密码。
3. 现阶段仅管理员/同仁两种固定角色：同仁按当前用户负责人隔离；没有财务角色、商户账号、MFA或分佣权限。账号停用/重置/本人改密撤销旧会话；用户变更在事务内锁用户后校验归属，二维码生成在上游响应后再次校验。
4. 本地文件二维码存储不适合多实例生产，需替换为私有对象存储。
5. IP 限流在代理/多实例部署下需正确配置可信代理并使用集中式限流存储。

## 上线前复核清单

- 搜索仓库和构建产物中的测试密码、SSID、AppSecret、密钥和连接串。
- 检查请求/错误/审计日志 redaction。
- 验证用户、Wi-Fi、二维码每个管理路由的认证和资源存在性。
- 压测公共事件限流和请求体上限。
- 验证停用用户/二维码即时使公共配置失效。
- 检查 Cookie、CORS、CSP、TLS 和代理 IP 配置。
- 对 API 做依赖审计和只读安全扫描，逐条人工确认真实可达性。
