# Wi-Fi 诊断页

诊断页路径为 `pages/wifi-diagnostics/index`，只用于正式 AppID 的开发版和体验版真机验证。它不会请求后端、写入缓存或上传诊断数据；所有输入和结果只存在于当前页面实例中。

## 安全与发布边界

- 页面通过 `wx.getAccountInfoSync().miniProgram.envVersion` 只允许 `develop` 和 `trial`，`release` 或无法识别的环境立即返回连接页。
- 开发/体验构建会把诊断页加入 `app.json`；`build:production` 会把它从页面清单中移除。
- `app.json` 启用 `lazyCodeLoading: "requiredComponents"`；开发、体验和正式产物都会自动验证该字段。
- 生产密钥扫描会再次断言诊断页不在页面清单，且 `legacyWifiAdapterEnabled` 仍为 `false`。
- 连接页入口只在 `develop` / `trial` 显示，正式版没有诊断导航。
- 密码输入使用密码框。回调对象、同步异常和监听数据在进入页面状态前递归脱敏，不调用日志、网络请求或本地存储。
- 只有同时存在监听和对应 `off*` 方法时才注册监听；注册和清理使用同一个函数对象。页面结束诊断或卸载时还会尽力调用 `wx.stopWifi`。

生产默认值保持：

```text
MINIPROGRAM_ENABLE_LEGACY_WIFI_API=false
```

诊断页直接探测微信运行时，不会打开该生产兼容开关。

## 微信开发者工具

1. 在仓库根目录执行：

   ```powershell
   pnpm.cmd --filter @scan-wifi/mini-program build:develop
   ```

   本机 API 联调可改用 `build:local`。两个命令都会生成包含诊断页的开发/体验页面清单。

2. 用微信开发者工具导入 `apps/mini-program`，确认 AppID 为 `YOUR_WECHAT_APP_ID`。
3. 在开发者工具顶部菜单执行“工具”→“清除缓存”→“全部清除”。模块文件名变更后不得只使用热重载缓存。
4. 选择项目已有的编译模式“Wi-Fi 诊断（仅开发版/体验版）”，点击“编译”，确认控制台没有 `module is not defined` 或 `wx://not-found`。
5. 打开“代码质量”面板并点击“重新扫描”，确认运行中的 `dist/app.json` 已识别 `lazyCodeLoading: "requiredComponents"`。
6. 从连接页底部进入诊断页，检查页面显示的基础库版本、手机系统和六项运行时方法存在性。开发者工具模拟器不代表 Wi-Fi 硬件结果；接口缺失和实际连接必须以真机为准。
7. 输入测试路由器的 SSID、密码和可选 BSSID，点击“开始顺序诊断”。不要使用门店生产密码截图、录屏或提交工单。
8. 检查 `startWifi`、`connectWifi` 的完整脱敏结果、`errCode`、`errMsg`、耗时、监听次数和清理状态。页面和控制台都不应出现密码。
9. 中途返回上一页，再次进入并执行一轮，确认没有重复监听计数；这同时验证页面卸载清理。

本轮修复改变了连接页的运行时模块产物，并新增依赖闭包门禁。修复前的真机结果只能作为历史记录，不能自动继承为修复后构建的验收结论；必须完成上述清缓存、重新编译和真机复测。

构建会同时从源码生成 `core/mini-program-environment.js` 与 `core/wifi-diagnostics-environment.js`。前者是对稳定诊断环境模块的兼容导出，使开发者工具中曾缓存的新旧两种路径都能解析；它不是空文件，也不是手工复制的产物。

## 真机开发版与体验版

1. 在开发者工具中使用上述诊断编译模式点击“预览”，分别用 iOS 和 Android 微信扫码进入开发版。
2. 体验版使用专用构建命令，并要求非空 HTTPS API 地址：

   ```powershell
   $env:MINIPROGRAM_API_BASE_URL="https://api.example.cn"
   $env:MINIPROGRAM_ALLOW_PLACEHOLDER_API="true"
   $env:MINIPROGRAM_ENABLE_LEGACY_WIFI_API="false"
   $env:MINIPROGRAM_AD_UNIT_ID=""
   pnpm.cmd --filter @scan-wifi/mini-program build:trial
   ```

   该命令保留诊断页，但不会上传代码。只有账号持有人明确执行上传并在公众平台设为体验版后，体验成员才能扫码；不要运行 `build:production`，否则诊断页会被排除。

3. 体验成员扫码进入后，从连接页底部的开发/体验专用入口打开诊断页。
4. 每个平台至少覆盖：
   - Wi-Fi 开启，密码正确；
   - 密码错误；
   - Wi-Fi 关闭；
   - 权限首次询问和拒绝；
   - 已连接目标 SSID 后再次连接；
   - 连接过程中离开页面；
   - 连续进入两次页面，确认监听没有累积。
5. Android 10 及以上和当前 iOS 版本分别记录实际回调。`connectWifi.success` 只表示调用受理；有可清理监听时，诊断会继续等待目标 SSID 的连接事件，超时会如实显示。
6. 页面优先使用 `onWifiConnected` / `offWifiConnected`；若标准组合不完整，才回退到 `onWifiConnectedWithPartialInfo` / `offWifiConnectedWithPartialInfo`。任何缺少配对清理方法的监听都不会注册。
7. 将脱敏结果人工填写到 本地真机验收记录。不得粘贴密码、完整凭证、环境变量内容或未脱敏回调对象。

## 正式构建确认

需要验证正式包边界时使用占位或已授权的 HTTPS API 域名：

```powershell
$env:MINIPROGRAM_API_BASE_URL="<真实已备案 HTTPS API 地址>"
$env:MINIPROGRAM_ALLOW_PLACEHOLDER_API="false"
$env:MINIPROGRAM_ENABLE_LEGACY_WIFI_API="false"
pnpm.cmd --filter @scan-wifi/mini-program build:release
Get-Content apps/mini-program/dist/app.json
Select-String -Path apps/mini-program/dist/config/runtime.generated.js -Pattern "legacyWifiAdapterEnabled: false"
```

此时 `dist/app.json` 只能保留正式页面，且 `dist/pages/wifi-diagnostics` 目录不得存在。需要继续诊断时重新执行普通 `build`，不要更改生产默认开关。
