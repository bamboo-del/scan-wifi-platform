# 目标架构与实现边界

保留 pnpm workspace、Fastify/PostgreSQL 后端、React 管理后台和原生小程序。WifiSpot 是已有商户、门店、网络和小程序码的业务聚合，不新建一套云数据库或复制 GitHub Demo。代码结构已按下面的职责组织；是否达到真实闭环，以 [E2E_TEST.md](E2E_TEST.md) 的证据为准。

## 业务对象

| 业务字段                | 实际存储或呈现                                                               |
| ----------------------- | ---------------------------------------------------------------------------- |
| id                      | `wifi_configs.id`，内部 UUID                                                 |
| shortId                 | `wifi_configs.short_id`，永久随机 32 位小写 hex；对应 `qr_codes.scene_token` |
| ownerId                 | `stores.merchant_id`；服务端从商家会话确定，不接收客户端指定归属             |
| shopName / spotName     | `stores.name` / `wifi_configs.spot_name`                                     |
| ssid / bssid / status   | 网络配置字段                                                                 |
| password                | 数据库仅存 AES-256-GCM 密文；不在管理 DTO 返回                               |
| qrFileId / qrUpdatedAt  | 当前码记录 ID / 图片生成时间；刷新图片不轮换永久 ID                          |
| connectCount            | 连接成功事件统计，不作为自然人人数或实际在线设备数                           |
| createTime / updateTime | 数据库 `timestamptz`，API 输出 ISO UTC                                       |

原生商家创建一个 WiFiSpot 时创建一个所属门店和网络，复用网页后台已有的一商户多门店、多网络模型。没有单独增加 `qrVersion` 计数器；图片更新时间标明最近一次重新制码。

## 不变量

- 新建网络时先生成 shortId，再保存记录；制码失败保留记录，允许重试。
- 修改 SSID、密码、点位名称不会改变 shortId。重新制码只刷新图片，保留已有 scene 和停用状态。
- 场景值不携带 SSID、密码、商户 UUID 或 OpenID。入口固定 `pages/connect/index`。
- 暂停和删除同时阻断公共元信息与凭据查询。删除采用软删除并擦除当前行的密码密文、IV、认证标签，已打印贴纸随即不可用。
- 原生商家用 `wx.login` 换取服务端商家会话，网页管理员继续使用 HttpOnly Cookie。商家每次读取、编辑、删除和下载图片都检查归属。
- 顾客先读公开元信息；主动连接或复制密码时才获取最新凭据，凭据不进入页面数据、URL、日志或本地 storage。
- 连接成功必须读到目标 SSID；成功页只消费当前进程中一次性的核验结果。广告状态不参与连接条件。

## 代码职责

`core/scene.ts` 处理 page scene/shortId/id 及冷、热启动 query；`ConnectController` 管理顾客状态、重试、复制和统计；`LegacyWeChatWifiAdapter` 独立封装 Wi-Fi 能力、连接核验和清理。页面只绑定视图及交互。

`services/wifi-spot-service.ts` 是原生商家 API 客户端；服务端 `MerchantAuthService` 处理微信身份和会话，`WifiSpotService` 处理归属及生命周期，`QrCodeService` 处理永久映射和图片替换。`qr-code-service.ts` 只把已下载的真实微信图片合成海报。

开发/体验构建可显式开启兼容 Wi-Fi 适配器和诊断入口；正式包排除诊断并继续禁止启用该适配器。目标 AppID 的 Android/iOS 真机证据获得前，这个限制不能由模拟回调、函数存在检查或编译成功解除。

## 达成标准

必须使用同一 AppID、真实 HTTPS API、持久数据库和微信生成的图片，完成创建、预览、相册保存、打印扫码、读取网络、设备连接和 SSID 核验；修改密码后重复扫描旧码也必须成功。体验码只用于体验成员验证，正式实体贴应在正式版本可用后生成 release 码。当前缺失条件和逐项结果记录在 [DEPLOYMENT.md](DEPLOYMENT.md) 与 [E2E_TEST.md](E2E_TEST.md)，不以代码实现代替上线验收。
