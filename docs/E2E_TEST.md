# WiFi 贴验收记录

验收日期：2026-09-27；最终原生回归与交付检查：2026-09-28。目标 AppID：`YOUR_WECHAT_APP_ID`；基础库：3.15.2；开发者工具：Stable 2.01.2510290。

**当前结论：No-Go，真实端到端闭环尚未完成。** 用户已确认备案完成，有 Android 手机和微信后台权限；暂时无法配置 AppSecret，且没有服务器和域名。没有生成真实微信码、上传本轮体验版或进行本轮手机扫码/连接。旧文档中的其他 AppID 或历史体验版记录不算本轮证据。

## 自动化与本地验证

| 检查                                   | 结果                      | 证据与边界                                                                                                                |
| -------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm.cmd format:check`                | PASS                      | 全仓格式检查；受保护项目配置仅补文件末尾换行，内容与备份一致                                                              |
| `pnpm.cmd lint`                        | PASS                      | 全仓及根脚本；最终改动另跑相关包检查                                                                                      |
| `pnpm.cmd typecheck`                   | PASS                      | TypeScript strict                                                                                                         |
| `pnpm.cmd test`                        | PASS，203 项              | config 5、validation 4、管理台 15、小程序 117、API 54、发布门禁 8；shared-types 无测试文件                                |
| PostgreSQL                             | PASS，13 项真实数据库测试 | PostgreSQL 16.15，独立临时库 `127.0.0.1:55432/wifi_refactor`，应用角色无建库/建角色/schema CREATE 权限；迁移至 0005       |
| `pnpm.cmd build`                       | PASS                      | 所有 workspace 编译；编译通过不代表已配置可用业务后端                                                                     |
| 本地小程序构建                         | PASS                      | `build:local`，6 页/33 个相对依赖；HTTP localhost 仅供电脑调试                                                            |
| `pnpm.cmd security:scan` / `text:scan` | PASS                      | 客户端秘密边界及乱码检查                                                                                                  |
| 管理台 Demo Playwright                 | PASS，2 项                | 浏览器实际渲染与交互，后端为测试演示模式                                                                                  |
| 管理台真实 API + PG Playwright         | PASS，1 项                | 真数据库、真 HTTP、真实浏览器；微信图片仍为本地占位 provider                                                              |
| 微信开发者工具原生渲染                 | PASS                      | 首页→商家列表→表单事件→保存→详情；占位码明确提示；无效 scene、shortId 别名、SSID 核验后的成功页、返回首页及拒绝伪造成功页 |
| `pnpm.cmd check:project`               | FAIL（预期阻塞）          | 服务端 AppID/AppSecret、微信 provider、正式 HTTPS 未配齐；源码占位模板单独报告，实际 dist 另行检查                        |
| `build:release`                        | FAIL（正确阻断）          | `MINIPROGRAM_API_BASE_URL must be a valid HTTPS URL`；没有替换成伪造正式域名来绕过门禁                                    |

API 数据库回归覆盖：微信登录身份归属、会话过期/撤销、轮换会话密钥后仍找到原商户、所有管理操作的跨商户拒绝、并发制码保持同一 scene、失败保留旧图、修改密码保持永久 ID、停用/恢复、软删除擦除当前密文、锁等待后的归属/删除复核，以及按网络统计连接次数。

小程序回归覆盖：已连接目标 SSID、成功回调/事件与实际 SSID 不一致、延迟连接无事件时轮询核验、超时、权限/关闭 WiFi 等错误、重复点击、卸载清理、凭据请求时暂停及请求重试。HTTP/WiFi 回调由测试夹具提供；这些测试不能证明手机系统真的连接。

## TEST 01–15

PASS 仅表示“已执行范围”通过。真实手机步骤未执行统一保留 FAIL 或 NEEDS_DEVICE，不能把下表拼成整条链已完成。

| 编号 | 项目                       | 已执行范围与结果                                                   | 真实链路状态                                            |
| ---- | -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| 01   | 商家创建店铺/WiFi/密码     | 服务与真实 PG 创建、加密落库 PASS；原生表单保存使用 HTTP 夹具 PASS | 微信真实登录及手机创建未验收                            |
| 02   | 生成永久 shortId           | 32 位随机小写 hex，唯一索引、改密/制码保持不变 PASS                | 后端已验证                                              |
| 03   | 微信码文件/预览/保存       | provider 请求、图片校验、失败保留旧图有回归；占位图单独标明        | **FAIL**：无 AppSecret、无真实微信图片；相册/打印未验收 |
| 04   | 开发者工具解析 scene       | 无效 scene、URL 解码、scene/shortId/id、冷/热入口优先级 PASS       | 本机页面与测试通过；没有把示例 ID 当真实码              |
| 05   | 体验版实体扫码打开 connect | 本轮未上传体验版、未打印真实码                                     | **FAIL**                                                |
| 06   | 展示商家和 SSID            | DevTools 测试夹具渲染 PASS；真实 API 查询 PASS                     | 真实扫码后显示未验收                                    |
| 07   | startWifi/connectWifi      | 状态机、回调及错误映射测试 PASS                                    | **NEEDS_DEVICE**：未在目标 AppID 手机验证               |
| 08   | 手机已连接目标 SSID        | 代码只有 getConnectedWifi 核验匹配才成功；不匹配回归 PASS          | **NEEDS_DEVICE**                                        |
| 09   | 修改密码、旧码继续使用     | 真 PG 和真实 HTTP 验证原 scene 获取新密码 PASS                     | 原实体微信码与路由器改密后重扫未验收                    |
| 10   | disabled 阻止连接          | 真 PG/HTTP 检查 PASS，恢复后可读；删除返回失效码，区别临时停用     | 真实码重扫未验收                                        |
| 11   | 错误密码                   | 中文错误及复制兜底单元测试 PASS                                    | **NEEDS_DEVICE**                                        |
| 12   | WiFi 关闭                  | 错误映射/状态机 PASS                                               | **NEEDS_DEVICE**                                        |
| 13   | 拒绝权限                   | 错误映射/状态机 PASS                                               | **NEEDS_DEVICE**                                        |
| 14   | WiFi 不在范围/弱信号       | 未找到网络、超时提示及重试测试 PASS；弱信号由平台返回结果决定      | **NEEDS_DEVICE**                                        |
| 15   | Android 与 iOS             | Android 可由用户配合，尚未测试；iOS 无设备                         | **NEEDS_DEVICE / NEEDS_DEVICE**                         |

## 渲染 QA 与证据

管理台在 Chromium 桌面和 390px 窄屏执行了商户、门店、双网络、占位码海报、改密、停用、统计流程；真实 API 模式验证密码不在元信息响应、凭据 `no-store`、PV/UV/成功率。海报下载为 1200×1500，移动统计表在卡片内滚动，无页面横向溢出；测试没有捕获到 console/pageerror。

原生截图逐张检查了表单、详情、连接页、无效码和成功页，修复按钮文字裁切、无效码仍显示加载标题和返回首页复用旧 scene。最终脚本未捕获运行异常。成功页截图等待页面完成绘制，避免仅有已更新 data 的空白截图。

DevTools 的 SDK `input()` 在本机组合中出现 timeout，因此脚本使用原生组件 `input` 事件驱动表单，再实际点击保存按钮；这不验证手机键盘。也曾遇到基础库异常断点、模拟器启动失败和旧运行实例未加载最新代码，关闭旧项目、完整构建、重新启用自动化后重跑。脚本等待页面数据更新后再断言；9 月 28 日最终全流程通过，包含成功页返回首页及拒绝 URL 伪造成功状态。单次失败不按通过统计，最终通过日志单独保存。不要一边重建/删除 dist，一边运行 DevTools 自动化。

本机可复查的证据（均不进入 Git）：

- `work/final-format.log`、`final-test.log`、`final-api-test.log`、`final-mini-test.log`、`final-lint.log`、`final-mini-lint.log`、`final-typecheck.log`、`final-build.log`。
- `work/final-e2e.log`、`work/live-e2e.log`、`work/native-smoke.log`。
- `work/final-security.log`、`final-text.log`、`project-check.log`、`release-gate.log`。
- `%TEMP%/wifi-refactor-ui/`：home、merchant-list、merchant-create、merchant-detail、invalid、connect-ready、success PNG。
- `%TEMP%/wifi-platform-validation/`：poster-preview、wifi-poster、network-management、analytics-mobile PNG。

## 复现原生测试

先关闭正在运行该项目的 DevTools 窗口，完成构建后再启动自动化：

```powershell
$env:MINIPROGRAM_ENABLE_LEGACY_WIFI_API='true'
pnpm.cmd --filter @scan-wifi/mini-program build:local
& 'C:/path/to/wechat-devtools/cli.bat' auto --project (Resolve-Path 'apps/mini-program').Path --auto-port 9420 --trust-project --lang zh
$env:WECHAT_AUTOMATION_WS='ws://127.0.0.1:9420'
pnpm.cmd --filter @scan-wifi/mini-program test:devtools
```

脚本结束恢复 wx Mock，并返回首页；正式构建不包含脚本、fixture 或诊断页面。完整生产步骤见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 后续真机记录要求

AppSecret、服务器、域名具备后，先部署 HTTPS 并配置 request/downloadFile 合法域名，再使用同 AppID 的 trial 码上传体验版。每次保存 AppID、代码版本、微信版本、系统版本、机型、路由器/SSID（报告中脱敏）、步骤、实际结果与时间。日志不得包含密码、会话 token 或微信 access token。

Android、iOS 分别完成 TEST 01–15，特别确认相册保存、纸质码可扫、当前 SSID、路由器改密后旧码、停用与恢复。在证据满足前，release 自动连接门禁保持关闭，不宣布项目完成。
