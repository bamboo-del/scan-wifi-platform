你现在直接接管当前仓库中的 WiFi 贴微信小程序项目。

不要重新创建新项目，不要只写方案，不要输出教程，直接阅读现有代码并修改。

## 一、总目标

将当前项目改造成：

**商户录入 WiFi → 系统生成门店专属小程序码 → 打印成 WiFi 贴 → 顾客扫码 → 获取对应门店 WiFi → 一键连接 → 记录连接数据 → 后续支持广告变现**

参考以下开源项目的产品设计和技术思路：

1. `Steven8427/wechat-free-wifi-miniprogram`
2. `hanxiaoyuJS/wifi`
3. `Yonatan-D/WiFiConnector`
4. `zhangsanproject/sharewifi`

注意许可证问题：

- CC BY-NC 项目只允许参考架构和实现思路，不得直接复制代码用于本商业项目
- GPL 项目不得直接复制代码进入当前项目
- 无明确 License 的项目只参考设计思路
- MIT 项目可以合理参考和复用，但仍优先保持当前项目自身代码风格

最终代码必须是当前项目自己的实现。

---

## 二、第一原则：保护现有成果

当前项目已经有可运行的小程序、WiFi 连接页和诊断能力。

先完整阅读：

- 项目目录
- README
- package.json
- 小程序配置
- `pages/connect`
- `pages/wifi-diagnostics`
- WiFi API 封装
- 当前数据模型
- 当前二维码参数解析逻辑
- 环境判断逻辑
- develop / trial / release 区别

不要破坏已经通过的功能。

尤其保留：

- `wx.startWifi`
- `wx.connectWifi`
- `wx.stopWifi`
- WiFi diagnostics
- iOS / Android 兼容处理
- 日志脱敏
- release 环境隐藏诊断入口
- 当前体验版扫码能力

现有正确代码优先保留，只在必要位置重构。

---

## 三、重构整体业务结构

将系统整理成以下模型：

```text
商户 Merchant
   ↓
门店 Store
   ↓
WiFi Network
   ↓
WiFiCode
   ↓
小程序码
   ↓
顾客扫码
   ↓
解析 storeId / wifiId
   ↓
获取 SSID
   ↓
连接流程
   ↓
连接成功
   ↓
Event / Analytics
```

数据层至少支持：

### Merchant

```text
id
name
contact
status
createdAt
updatedAt
```

### Store

```text
id
merchantId
name
address
status
createdAt
updatedAt
```

### WifiNetwork

```text
id
storeId
ssid
password
bssid
enabled
createdAt
updatedAt
```

### WifiCode

```text
id
storeId
wifiId
scene
qrCodeUrl
createdAt
```

### WifiConnectEvent

```text
id
storeId
wifiId
devicePlatform
result
errorCode
createdAt
```

不要过度设计数据库，但数据关系必须清晰。

---

## 四、改造顾客扫码连接流程

重点重写顾客端连接流程。

目标：

```text
扫描 WiFi 贴
↓
进入小程序
↓
解析 scene
↓
获得 storeId / wifiId
↓
请求 WiFi 信息
↓
显示门店名称 + SSID
↓
点击“一键连接”
↓
wx.startWifi()
↓
wx.connectWifi()
↓
成功
↓
记录连接事件
```

scene 不直接携带 WiFi 密码。

禁止：

```text
二维码参数直接包含 password
```

二维码只能携带：

```text
wifiId
```

或者：

```text
storeId + wifiId
```

密码必须通过后台根据 wifiId 获取。

---

## 五、WiFi 连接必须做完整降级

参考 WiFiConnector 的思路，但自己实现。

连接函数必须变成统一 service，例如：

```text
services/wifi
```

或者当前项目更合理的位置。

统一处理：

```text
startWifi
connectWifi
stopWifi
```

状态至少有：

```text
idle
loading
connecting
success
failed
manual
```

连接失败时不能只显示错误码。

必须提供：

```text
连接失败
↓
显示 SSID
↓
复制密码
↓
提示前往系统 WiFi 设置手动连接
```

同时将：

```text
errorCode
platform
wifiId
storeId
```

记录到日志系统。

密码不得写入日志。

---

## 六、把密码获取机制改安全一点

参考 `hanxiaoyuJS/wifi` 的设计。

第一阶段：

```text
getWifiInfo
```

只返回：

```text
storeName
ssid
wifiId
```

不要直接返回密码。

用户真正点击：

**一键连接**

以后，再调用：

```text
getWifiCredential
```

获取密码。

如果当前技术架构不适合拆两个接口，可以自行设计更合理方案。

核心要求：

**不能用户一打开页面就直接把所有门店 WiFi 密码裸露到前端。**

---

## 七、新增商户 WiFi 管理

如果当前项目没有完整商户端，则增加基础版本。

至少做到：

### 门店管理

```text
创建门店
编辑门店
查看门店
启用/禁用
```

### WiFi 管理

```text
SSID
Password
BSSID 可选
更新密码
启用
停用
```

一个商户以后可以有：

```text
1 商户
N 门店
每个门店 1~N WiFi
```

当前 MVP UI 不必复杂。

优先把数据结构和功能打通。

---

## 八、增加“小程序码生成”

为每个 WiFi 生成自己的小程序码。

使用微信官方：

```text
wxacode.getUnlimited
```

scene 建议：

```text
w=xxxx
```

或者更短的唯一 ID。

不要把：

```text
SSID
Password
门店名称
```

直接塞进 scene。

后台保存：

```text
wifiCodeId
wifiId
scene
qrCodeUrl
```

以后商户修改密码时：

**二维码不需要重新打印。**

这点非常重要。

---

## 九、增加 WiFi 贴海报能力

为门店生成基础 WiFi 贴。

至少包含：

```text
门店名称
免费 WiFi
微信扫码连接
小程序码
简单提示文字
```

二维码下方：

```text
微信扫码 · 一键连接 WiFi
```

不要设计得花里胡哨。

优先提供：

```text
预览
保存图片
```

后续再考虑批量导出。

---

## 十、广告系统先预留，不强行启用

产品未来主要依靠广告变现。

但当前版本不要为了广告破坏体验。

增加统一：

```text
AdService
```

配置：

```text
enableAds = false
```

默认关闭。

预留：

```text
banner
rewardedVideo
interstitial
```

但当前扫码连接主流程必须：

**即使广告系统完全关闭，也能正常连接 WiFi。**

禁止把广告 SDK 写死在核心 WiFi 逻辑里。

---

## 十一、增加统计系统

至少统计：

```text
页面访问 PV
独立访问 UV
扫码次数
点击连接次数
连接成功次数
连接失败次数
手动复制密码次数
```

后台以后能够计算：

```text
连接成功率
```

公式：

```text
成功连接数 / 尝试连接数
```

需要按照：

```text
商户
门店
WiFi
日期
```

进行统计。

当前阶段允许先实现基础 event 数据表。

---

## 十二、日志隐私要求

继续保持当前项目日志脱敏。

严禁日志出现：

```text
WiFi Password
用户敏感信息
完整 Token
```

SSID 可以记录。

密码最多记录：

```text
hasPassword: true
```

不能记录实际内容。

---

## 十三、错误处理

所有 WiFi 错误必须转换成人能理解的信息。

例如：

```text
WiFi 未开启
定位权限不足
系统不支持
SSID 不存在
密码错误
连接超时
未知错误
```

不要把：

```text
12005
12006
12007
```

直接扔给普通用户。

但 diagnostics 页面可以显示：

```text
用户提示
+
原始 errorCode
+
原始 errMsg
```

方便开发。

---

## 十四、不要破坏 diagnostics

`pages/wifi-diagnostics`

继续保留。

它只属于：

```text
develop
trial
```

正式：

```text
release
```

隐藏入口。

继续用于：

```text
SSID
Password
BSSID
startWifi
connectWifi
stopWifi
错误日志
设备平台
环境信息
```

这是以后排查不同手机兼容问题的重要工具。

---

## 十五、UI 调整

连接页面保持极简。

主要结构：

```text
门店名称

免费 WiFi

WiFi：
XXXXXX

[ 一键连接 WiFi ]

连接遇到问题？
复制密码手动连接
```

状态变化：

```text
准备连接
正在启动 WiFi
正在连接
连接成功
连接失败
```

成功后：

```text
✓ WiFi 已连接
```

避免：

- 大量说明文字
- 技术术语
- 花哨动画
- 用户不知道下一步做什么

---

## 十六、代码架构

优先把逻辑拆成：

```text
services/
repositories/
utils/
config/
types/
```

类似：

```text
services/wifi
services/store
services/analytics
services/ad

repositories/wifi
repositories/store

utils/wifi-error
utils/scene

config/features
```

不要为了“架构漂亮”过度抽象。

目标：

**简单、清晰、可继续扩展。**

---

## 十七、Feature Flag

增加统一配置：

```text
ENABLE_ADS=false
ENABLE_WIFI_DIAGNOSTICS=true
ENABLE_ANALYTICS=true
```

release 时：

```text
ENABLE_WIFI_DIAGNOSTICS=false
```

不要再让这些配置散落在不同文件。

---

## 十八、完成后必须自己测试

修改完成后执行：

1. 安装依赖
2. TypeScript / lint 检查
3. build
4. 检查小程序构建产物
5. 检查引用不存在问题
6. 检查 module not defined
7. 检查 ENOENT
8. 检查 wx API 调用
9. 检查 scene 参数
10. 检查密码没有写入日志

不要只修改代码而不运行验证。

---

## 十九、重点测试路径

至少验证：

```text
普通打开小程序
```

```text
扫描有效 WiFi 二维码
```

```text
扫描不存在 wifiId
```

```text
WiFi 密码错误
```

```text
WiFi 关闭
```

```text
用户权限拒绝
```

```text
connectWifi 失败
```

```text
复制密码
```

```text
连接成功
```

```text
develop diagnostics
```

```text
trial diagnostics
```

```text
release 无 diagnostics
```

---

## 二十、最后输出

完成后不要给我长篇解释。

只输出：

### 1. 本次修改

列出实际修改的功能。

### 2. 文件变化

```text
新增：
修改：
删除：
```

### 3. 当前业务链路

用简单流程说明。

### 4. 测试结果

列：

```text
build
typecheck
核心连接流程
二维码 scene
diagnostics
日志脱敏
```

### 5. 尚未完成

只列真正还需要：

```text
微信后台配置
云环境配置
AppID
广告位 ID
正式主体/备案
真机操作
```

这类必须人工或外部完成的工作。

不要把你自己可以完成的开发工作留给我。

直接开始扫描当前仓库并修改。
