# 安全说明

## Wi-Fi 密码

- AES-256-GCM；32 字节主密钥只从环境读取。
- 每次写入生成独立随机 12 字节 IV；分列保存 ciphertext、IV 和 auth tag。
- 解密认证失败一律视为数据损坏，不回退到未认证解密。
- 管理后台只有掩码和“替换密码”，不提供读取原密码接口。
- `/public/connect` 不解密或返回密码。顾客扫码后调用 `/public/credential`，检查商户、门店、网络和二维码状态后解密，通过 HTTPS 在当前页面显示对应密码；点击连接前重新读取当前密码。响应设置 `private, no-store` 和独立限流。密码不进入统计、日志或本地持久存储，换码及卸载页面时清空。
- 商家删除 WiFiSpot 时软删除网络、停用相关码，并擦除当前行的密文、IV 和认证标签；暂停不擦除。历史备份和快照不会被同步改写，按独立保留策略管理，恢复后必须复核删除状态。

### 密钥轮换

当前 schema 通过配置版本为轮换预留审计点。正式轮换应增加 key ID：部署新旧双读 -> 批量事务重加密 -> 核对数量与认证 -> 停止旧 key -> 安全销毁。不要直接覆盖唯一旧密钥后再尝试恢复。

## 管理员安全

- Argon2id 哈希；初始化密码不输出。
- HttpOnly、生产 Secure、SameSite=Strict Cookie；服务端可撤销的短会话。
- 登录和管理接口分层限流；错误响应不区分用户名是否存在。
- 敏感写操作写入不可含秘密的 operation log。
- 生产建议再加反向代理 IP 限制、MFA/SSO 和异常登录告警。

## 原生商家安全

- `wx.login` 临时 code 只交给后端换取微信身份；不接受客户端传入 ownerId/OpenID，不保存原始 OpenID、code 或微信 session_key。
- 单 AppID 部署中，以 `SHA-256("wechat-merchant:v1:" + OpenID)` 保存稳定商家身份摘要；摘要仍属于可关联账号的数据，不对客户端返回。身份映射不依赖 SESSION_SECRET，轮换会话密钥不会丢失商家归属。
- 随机 Bearer token 有效期 12 小时，只在小程序进程内存持有；数据库只存 token HMAC、归属和到期时间。退出撤销当前会话，过期后重新登录；轮换 SESSION_SECRET 会使既有会话失效。
- 每次读取、编辑、删除、制码与图片下载都检查会话和资源归属；其他商家的点位返回安全的不存在响应。管理 DTO 不含密码、OpenID、身份摘要或会话散列。
- 下载图片时使用 Authorization 请求头，反向代理须透传且不得记录；不把 token 放进 URL。商家接口及图片响应为 private, no-store。
- Canvas 只合成已下载的微信码与文字，导出临时 PNG；相册保存由用户主动授权，不读取整个相册。已保存图片和纸质副本由商家管理，删除点位通过服务端停用令旧码不可用。
- 仓库文档新增的数据处理说明不等于公众平台声明已更新；上线前仍须核对实际后台隐私配置。

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
- API 设置 `nosniff`、frame deny、严格 referrer 和 Permissions-Policy；管理后台静态宿主还需配置与资源清单匹配的 CSP。
- Cookie 会话配合 SameSite；若跨站部署必须增加显式 CSRF token。
- 所有接口统一错误 envelope，生产不回传 stack、SQL 或上游响应体。
- `TRUST_PROXY_HOPS` 默认 0；仅在 API 原始端口只允许受控代理访问时，按实际代理层数显式设置，避免伪造客户端 IP 或所有用户共用代理 IP 限流桶。

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
2. 主动操作的凭据接口返回所扫码网络的密码，包括手动复制场景。它是受 scene 约束的公开访客凭据接口，拆分请求减少不必要暴露，但不能从服务端证明用户确实点击了按钮；安全仍依赖 scene 保管、启停、限流和 TLS。复制后系统剪贴板的生命周期由设备管理。
3. 单管理员角色是 MVP；多角色/细粒度权限需要新增授权模型和越权测试。
4. 本地文件二维码存储不适合多实例生产，需替换为私有对象存储。
5. IP 限流在代理/多实例部署下需正确配置可信代理并使用集中式限流存储。

## 上线前复核清单

- 搜索仓库和构建产物中的测试密码、SSID、AppSecret、密钥和连接串。
- 检查请求/错误/审计日志 redaction。
- 验证门店、Wi-Fi、二维码每个管理路由的认证和资源存在性。
- 验证原生商家跨账号读取、编辑、删除和图片下载均被阻断；核对会话过期/退出、软删除擦除凭据及备份恢复边界。
- 压测公共事件限流和请求体上限。
- 验证停用门店/二维码即时使公共配置失效。
- 检查 Cookie、CORS、CSP、TLS 和代理 IP 配置。
- 对 API 做依赖审计和只读安全扫描，逐条人工确认真实可达性。
