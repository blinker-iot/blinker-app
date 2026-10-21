# 点灯 Blinker App

当前主线面向 Device V2。App 不再建立 Legacy JSON/TLV 设备连接；设备实时通信统一使用账户级 MQTT-over-WebSocket、BBP/2 与 canonical CBOR。

## 当前边界

- 账户登录、设备管理、DeviceKey、分享和反馈：Gateway HTTP/JSON 管理面。
- 实时设备状态与控制：账户 MQTT JWT + BBP/2/CBOR。
- App 不使用设备登录凭据，不以设备身份登录 MQTT。
- 服务器根据账户身份与单设备 access grant 转发消息。
- 协议失败直接报错，不回退旧 JSON payload。

## 页面迁移策略

现有 Layouter、Customizer、组件、设置、图表、定时器和场景页面源码保留。当前 `/device/:id` 已通过统一 `DeviceUiPort` 接入 Manifest、State、Event 与 typed Command，并通过 PageLayout V1 渲染 Switch、Action Button、Slider、Text/数值基础控件；后续按相同端口和布局 schema 迁移现有页面。

Manifest 描述设备 endpoint 能力，PageLayout 描述 App 的组件、位置和样式。布局可由用户拖拽、Agent 生成或 App 自动生成；固件 Manifest fingerprint 变化时提示更新布局，并保留仍有效的 endpoint 绑定。

PageLayout V1 使用固定 8 列网格、五种基础组件与有限外观枚举。所有外部/Agent 草稿必须经过严格解析，不接受任意 JavaScript、CSS 或未知字段。当前默认布局只保存在页面内存中，服务端持久化尚未接入。

## 核心目录

```text
src/app/core/device-v2/          账户 MQTT channel 与页面 DeviceUiPort
                                PageLayout schema、校验与默认生成
src/app/core/protocol/device-v2 BBP/2、CBOR、session 与 store
src/app/core/services/          Device V2 管理/实时服务
src/app/device/v2/              当前 V2 核心设备页
src/app/device/layouter2/       保留的页面布局与组件实现
```

## 本地开发

维护者如需脱离现有node_modules交接Android候选，使用[六仓源码闭包与隔离重建](docs/APP_DEVICE_V2_SOURCE_HANDOFF.md)。保持五个相邻file插件，不复制本机生成的Android路径；源码/依赖构建与实际已安装APK分开验收。

App/页面模板仅使用 `pnpm-lock.yaml` 安装，版本固定为 packageManager 声明的 pnpm 11.19.0；不要在 App 根目录执行 npm install/ci 或重新生成 npm 锁。五个独立插件仍分别按其 npm 锁安装、显式构建，再安装 App。已有 npm run 脚本只执行任务，不解析依赖。

```bash
pnpm install --frozen-lockfile --ignore-scripts
npm test -- --watch=false
npm run build
```

环境端点位于 `src/environments/`，在构建时选择，不在运行中切换或修改打包后的 JS：

- 云端受限内测：`pnpm run build:cloud-beta`，使用 `https://iot.yiyu.pro`，复用当前 Aily 测试 Auth。该显式 beta 开放既有最小自动化及任务页面，须匹配服务器的 automation／单设备 Task 部署；普通 production／development 配置保持关闭。任务页面只允许所有者查询普通 WiFi 设备，实际准入名单、签发及容量仍由服务器和设备的新鲜结果确认，不代表所有设备均支持四槽。Direct、定向分享及通知／消息不因此开放；H1／H2和原控制沿用现有链路，权限与 CAS 不变。
- 浏览器本地：`ng build --configuration local`，使用 `environment.local.ts` 的 HTTP `127.0.0.1:17000`。
- Android USB 联调：`npm run build:local-device`，叠加 `environment.local-device.ts`，使用 HTTPS `127.0.0.1:17000`；随后执行原 Capacitor copy 和 Android debug 构建。需要匹配的本机 HTTPS proxy、ADB reverse 和仓外 `BLINKER_DEBUG_NETWORK_CONFIG_DIR` CA 配置，不关闭证书校验。默认仍 `deviceV2LanEnabled=false`。
- 生产：原 production 配置和 release 签名/信任链，不使用本地 authority 或 debug CA。

云端 beta Android 的正常源码入口（先按上方手册构建相邻插件并安装锁定依赖）：

```powershell
pnpm run sync:cloud-beta
cd android
.\gradlew.bat assembleBeta
```

该入口先构建 production Web＋cloud-beta 配置，再运行官方 `cap sync android` 生成原生注册表；不能以 `cap copy` 或手抄旧注册表替代。`beta` 使用独立包名 `iot.diandeng.tech.beta`／“Blinker 内测”、HTTPS WebView、禁止明文和本地 debug CA，仍为内部 debug 签名，不是商店 release。原普通 debug／release 包名不变；不得卸载旧包、清数据或复用另一 authority 的凭据来处理安装签名冲突。安装前另备份已有 beta 的账号和日志，并核对签名；本次源码入口的软件验证不等于新 APK 已编译／安装或真机验收。

`BLINKER_LOCAL_CLEARTEXT` 和 `BLINKER_DEBUG_NETWORK_CONFIG_DIR` 不得用于 beta。切回本机或普通包时，重新构建对应 Web 配置并执行正常 Capacitor sync，不混用共享的 `www`／原生 assets；本入口不自动安装、操作 ADB 或部署服务。

2026-09-15：上述 Android 构建入口已在保留数据安装的 debug APK 上验证实际 HTTPS authority、
原账号目录/账户 MQTT，以及 ESP32S3 BLE 属性/按钮/状态、App 冷启动和退出回收；打包后未修改 JS。
这不代表当前换网后的设备 MQTT、跨分片分享或生产 release 已通过。具体制品和边界见
[C4 执行记录](../blinker-library/docs/DEVICE_V2_C4_REPRODUCIBLE_DEPLOYMENT_PLAN.md)。

authority 同时参与本机凭据隔离；换服务地址不是只改一条 URL，不能复制另一 authority 的授权来绕过隔离。不要提交真实账户 token、DeviceKey、WiFi 密码、地图 key 或签名文件。

## 协议与服务文档

- 服务端 App 对接：[app-integration.md](../aily-blinker-services/docs/app-integration.md)
- 服务端 API：[API.md](../aily-blinker-services/docs/API.md)
- App Device V2 计划：[APP_DEVICE_V2_ONBOARDING_IMPLEMENTATION_PLAN.md](docs/APP_DEVICE_V2_ONBOARDING_IMPLEMENTATION_PLAN.md)

本软件使用 GPLv3 发布；商业使用请联系[点灯科技](https://diandeng.tech/)。
