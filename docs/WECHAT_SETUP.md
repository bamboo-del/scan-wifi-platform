# 微信平台配置

## 当前代码核查结果

- 正式 AppID 位置：`apps/mini-program/project.config.json` 的 `appid`；当前已配置为 `YOUR_WECHAT_APP_ID`。
- API 基础地址：构建时由 `apps/mini-program/scripts/generate-runtime-config.mjs` 写入受忽略的临时源码，再转译到 `dist/config/runtime.generated.js`；生产构建强制非空 HTTPS。
- scene：`src/core/scene.ts` 先执行 `decodeURIComponent`，再严格接受 32 字符小写 hex；服务端数据库也有同样 CHECK 约束。
- Wi-Fi：`src/core/legacy-wechat-wifi-adapter.ts` 隔离调用 `wx.startWifi`、`wx.connectWifi` 与连接监听；前后端双开关默认均为 `false`。
- 隐私接口：当前小程序不调用手机号、头像、昵称、位置等隐私保护 API，也没有调用 `wx.getPrivacySetting`、`wx.requirePrivacyAuthorize` 或 `wx.openPrivacyContract`；仍需在公众平台按实际接口扫描结果配置隐私保护指引和协议入口。
- 小程序码：API 服务端调用 `getwxacodeunlimit`，固定 `check_path: true`、`env_version: release`，scene 只传随机 token。
- 广告：运行时广告位 ID 默认为空，数据库迁移把全局广告默认值设为 `false`；只有全局开关、门店开关和非空广告位 ID 三者同时满足才渲染，广告加载失败不参与连接状态机。

## 1. 凭证

在 API 运行环境设置：

```text
WECHAT_APP_ID=...
WECHAT_APP_SECRET=...
QR_CODE_PROVIDER=wechat
WECHAT_QR_PAGE=pages/connect/index
WECHAT_ENV_VERSION=release
```

`WECHAT_APP_SECRET` 只能进入后端密钥管理，不可写入管理后台 `.env`、任何 `VITE_` 变量、小程序配置、日志、镜像层或仓库。

## 2. 服务器域名

在微信公众平台配置经过备案且启用 HTTPS 的 request 合法域名，指向生产 API 域名。证书链必须完整；小程序不得直连 PostgreSQL 或对象存储私有管理端点。

如果门店 Logo 使用独立 HTTPS 静态域名，还需按当前微信规则把它加入图片下载/资源合法域名；更稳妥的方案是由受控 API 或同一合法域名提供图片。不要使用任意外部 CDN URL。

## 3. 小程序公开运行时配置

小程序不读取根目录 `.env`。构建器只把白名单公开字段写入临时源码并编译到 `dist/config/runtime.generated.js`；`src` 不接收生成 JavaScript。

开发者工具本机联调：

```powershell
pnpm.cmd --filter @scan-wifi/mini-program build:local
```

体验构建：

```powershell
$env:MINIPROGRAM_API_BASE_URL="https://api.example.cn"
$env:MINIPROGRAM_ALLOW_PLACEHOLDER_API="true"
$env:MINIPROGRAM_ENABLE_LEGACY_WIFI_API="false"
$env:MINIPROGRAM_AD_UNIT_ID=""
pnpm.cmd --filter @scan-wifi/mini-program build:trial
```

生产构建：

```powershell
$env:MINIPROGRAM_API_BASE_URL="<真实已备案 HTTPS API 地址>"
$env:MINIPROGRAM_ALLOW_PLACEHOLDER_API="false"
$env:MINIPROGRAM_BUILD_MODE="production"
$env:MINIPROGRAM_ENABLE_LEGACY_WIFI_API="false"
$env:MINIPROGRAM_AD_UNIT_ID=""
$env:MINIPROGRAM_BRAND_NAME="轻连 WiFi"
pnpm.cmd --filter @scan-wifi/mini-program build:production
```

体验和生产生成器强制非空 HTTPS URL，并拒绝本地 HTTP 例外。当前阶段广告位继续为空，生产广告不会被调用。完整公开字段见 `apps/mini-program/runtime.env.example`。生成器不支持任何服务端秘密。

## 4. 小程序码

- 发布 `pages/connect/index` 后再使用 `check_path: true` 生成正式码。
- scene 只包含 32 字符随机 token。
- 生产生成结果保存到持久对象存储；后台下载使用认证 API 或短时签名 URL。
- 本地占位图只能用于开发，且必须显示“仅供本地测试”。

## 5. Wi-Fi API 上线门槛

微信官方 Wi-Fi 总览当前标注系列接口已下架。不要把旧详情页仍存在解释为生产可用。

上线前必须完成：

1. 使用目标 AppID 和当前线上基础库确认接口是否仍对该账号/类目开放。
2. iOS 当前系统版本：首次权限、Wi-Fi 关闭、密码错误、超时、已连接目标 SSID、前后台切换。
3. Android 当前主流版本：定位/WLAN 权限、Wi-Fi 关闭、密码错误、超时、Android 10+ 进程网络行为、手动模式。
4. 验证监听卸载、空 Wi-Fi 事件、重复点击和页面退出。
5. 验证 `connectWifi.success` 只表示接口调用受理；最终成功必须由目标 SSID 的 `onWifiConnected` 事件确认。`maunal=true` 跳到系统设置时也不得直接统计成功。
6. 只有全部通过，才同时设置后端与小程序构建环境的 `MINIPROGRAM_ENABLE_LEGACY_WIFI_API=true`。需要系统设置路径时另行设置 `MINIPROGRAM_LEGACY_WIFI_MANUAL_SYSTEM_CONNECTION=true`；失败则保持 `unsupported` 和手动连接说明。

不要用 `wx.canIUse('startWifi')` 或类似调用判断支持性；官方总览明确说 Wi-Fi 接口不可由 `wx.canIUse` 判断。

开发版和体验版的目标 AppID 验证使用 `pages/wifi-diagnostics/index`，详细步骤见 [`WIFI_DIAGNOSTICS.md`](./WIFI_DIAGNOSTICS.md)。诊断页不依赖也不修改生产兼容开关。

## 6. 隐私保护指引

在公众平台为目标 AppID 完成隐私保护指引：

- 按平台当前接口扫描结果声明实际处理的信息类型。
- 提供隐私协议入口并验证拒绝/重新授权流程。
- 不声明或收集手机号、头像、昵称和身份数据。
- 提审前重新检查基础库要求；不要根据旧文章猜测分类。

## 7. 广告位

1. 在流量主/腾讯广告后台创建适合页面顶部的 Banner 广告位。
2. 构建前把 unit ID 写入公开环境变量 `MINIPROGRAM_AD_UNIT_ID`；生成器会把它注入小程序运行时配置，它不是 API 秘密。
3. 全局和门店开关同时开启时才加载。
4. 真机验证 load、1004 无填充、错误、后台关闭和门店关闭。
5. 广告不能覆盖、阻塞或伪装成连接按钮；不使用插屏或激励视频。

## 8. 人工清单

- `apps/mini-program/project.config.json` 已是正式 AppID `YOUR_WECHAT_APP_ID`。AppID 可公开，但 AppSecret 绝不能写入该文件。
- 注册/认证小程序和选择真实类目。
- 配置服务器域名、隐私指引、广告位。
- 发布连接页以满足小程序码 path 校验。
- 对 Wi-Fi 旧接口做目标 AppID 真机验收。
- 设置正式 AppID/AppSecret、HTTPS、对象存储和监控。
- 提交平台审核。仓库不会代替执行任何注册、付费或提审动作。
