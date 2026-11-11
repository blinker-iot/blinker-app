# Device V2 App：DeviceKey 与 ESP32 WiFiProv 实施方案

> **2026-09-22 执行入口：[新进度与后续计划](../../blinker-library/docs/DEVICE_V2_NEXT_EXECUTION_PLAN.md) §6。** C1～C3 及缓存小包已收口；BLE 有界优化和任务页面/类型化服务接线按[三端合同](../../blinker-library/docs/DEVICE_V2_SCHEDULING_AUTOMATION_AND_BLE_PLAN.md) §3/5/6/7。旧定时 JSON/场景页面不代表 V2 执行器已完成；本页下方 C1/C2/C3 是历史记录。

> **当前执行状态（2026-09-14）：C1/C2 冻结范围已完成，进入 C3 基础矩阵。** 增权和同 caller 自然到期恢复已按[唯一主线 §10](../../blinker-library/docs/DEVICE_V2_CORE_STABILITY_EXECUTION_PLAN.md#10-c2-已知恢复断点收口下一步-c32026-09-14)收口；以下 C1-d/C2“下一步”为历史记录，不重复删设备、reset 或配网。本轮 App 生产代码/已安装 APK 未变。

> **当前 C1-d 已完成（2026-09-14，覆盖下条历史待办）：** 原设置删除后 scoped 精确退休 WiFiProv journal/Admin；原配网入口对空根＋owner GET 明确 deleted＋用户确认，复用原 DELETE 重试清理并新建。正常退休和注入一次本机清理失败/进程重启两条真机链通过；两轮各有 BLE/MQTT 控制、MCU/App 重启及见证，**172/172、类型/lint/已安装 APK** 通过。小型协调器只依赖接口，不读 UI、不新增 native 插件/服务协议；页面不遍历存储，管理客户端不做本地清理。最终现场保留 `C1d Retry WiFiBLE COM11`；下一步为[核心稳定版 C2](../../blinker-library/docs/DEVICE_V2_CORE_STABILITY_EXECUTION_PLAN.md#9-c1-d-完成与-c2-定点验收入口2026-09-14)，详情见[报告 §6](../../blinker-library/docs/DEVICE_V2_FIRST_PROVISIONING_RECOVERY_HARDWARE_REPORT.md#6-c1-d明确移除退休重认领及清理失败恢复2026-09-14)。不重复下方 C1-d reset/删除，也不转向无缝扩展。

> **当前主线 C1（2026-09-14，真机修订）：** 唯一进度及下一步见[核心稳定版 §7～§8](../../blinker-library/docs/DEVICE_V2_CORE_STABILITY_EXECUTION_PLAN.md#7-c1-三个真实中断窗口与双通道恢复2026-09-14)。CREATE→context、context→pending、Bootstrap→首次 WiFi 三个进程中断窗口已真机，原 BLE/MQTT 控制及普通 MCU/App 重启通过；最终 **131/131、类型/lint/build/APK** 已过并保留数据安装。**纠正：不能在 Bootstrap 后清 journal**，服务器可能还无首次 session/instance 关联且本机历史 Admin 不唯一；原 store 只读 load 精确逻辑 ID交给原 Admin 核验，关联确认后才 best-effort 清理。不存 DeviceKey/密码/额外 Admin secret，不增加 wire/服务事务。最终现场 journal 因关联较晚而保留，故 **C1-d 明确移除后的精确退休/重新认领仍待补，不能标 C1 全部完成**。下一批先闭合这项生命周期，不扩无缝/网关/LAN；见[真机报告](../../blinker-library/docs/DEVICE_V2_FIRST_PROVISIONING_RECOVERY_HARDWARE_REPORT.md)。Cloud-only ACK 丢失、清数据/跨安装等仍未通过；下方历史“下一步”不再自动执行。

> **最新 B2b-13（2026-09-13，覆盖下列历史“下一步”）：** B2b-12 已修正测试 CA 并恢复真实双通道；本批原重新配网页面完成同 ID 空根恢复：1 rotate/1 条件 PATCH、0 create/enable/register，旧 Key/MQTT/Controller 拒绝，新 MQTT/BLE/重启及联合删除 202→200 均通过。COM3 24 次控制同会话、COM12 保持；COM11 最后显式 resetAccess、Security1 GetInfo 空根，现待配网，库存 16→15。App 唯一生产修正是原扫描协调器的外部 SDK 所有权交接：排空 Presence/Direct native start/stop 后才能 WiFiProv 扫描，页面重复扫描共用租约，退出排空迟到 start 和 stop/clear 后释放，关闭失败不重叠启动。App **135/135**、类型/构建及匹配 APK 真实交接/退出回收通过；不新增 MCU/Service 协议。详细边界/构建与证据见 [混合真机报告 §7](../../blinker-library/docs/DEVICE_V2_MIXED_LIFECYCLE_HARDWARE_REPORT.md)。下一包回 B1→B3→B4；首次 create→pending、未测杀进程/无线故障和 B2c 保留，不宣称全部完成。

> **跨日续测（2026-09-13）：** 已修复 BLE-origin 原生 WiFi 被误判网关子设备：原目录投影显式返回有效拓扑 `gatewayRouted`，App 两处共用判断，离线缓存保留非秘密标记；不以 Key/类型/MAC 代替拓扑。App 223/223、PG 65/65 再次通过，匹配本机单模块 Gateway/APK 更新已完成。自动页面 BLE ready 3,638 ms、开关/按钮 334/350 ms、离页退出已验。混合固件 cloudReady=0/无 challenge-session 和最新 COM3 见证离线仍待定位；不重复 enable-cloud/038、不先换根。详见 [最新真机报告 §5](../../blinker-library/docs/DEVICE_V2_MIXED_LIFECYCLE_HARDWARE_REPORT.md#5-跨日补测自动-ble-页面及显式拓扑路由)。以下 116 项/8 模块等为此前部署阶段记录，不代替最新结果。

> **最新 B2b-11（2026-09-12，本机已部署）：** schema 37 实际备份完整恢复演练后升级 38，44 张原表数据保持、重复迁移零写；本机 Gateway 8 个关联模块/hash/healthy 已验，Broker/Auth 未重启。匹配 APK 保留数据安装，App 116/116、PG 65/65 本批重跑。COM11 真实 BLE→WiFi enable-cloud 一次、无 create/rotate，原 ID/type/页面/epoch 保留并自动进入原页；原根 Direct 控制与 COM3 MQTT 见证已过。云端实际控制、自动 BLE-first、后续 reset/PATCH/联合移除以 [混合真机报告](../../blinker-library/docs/DEVICE_V2_MIXED_LIFECYCLE_HARDWARE_REPORT.md) 的最新分项为准；首次分配窗口仍待补。未部署远端、未清授权；下文“本机未部署/未安装”为历史，不重复迁移或安装旧包。

> **最新 B2b-10（2026-09-12）：** App 已在原 WiFiProv 页面/协调器实现已有设备换根恢复：secure prepared→固定幂等 ID rotate→secure key-ready→原 PATCH/PUT→复查 GetInfo→Bootstrap/精确 ACK→active。没有新设备 wire、无 raw Key 持久副本；schema 6 隔离轮换 journal，普通 active 仍 schema 5。页面重建复用同操作，网络重试保留真实 epoch；App 十文件 116/116、类型及 local 构建通过。Service/MCU 本批未改，PG 65/65 为前批结果、未重跑；**尚未部署/安装/真机，首次 create→pending 分配窗口仍待补**。下一包先 037→038 存量升级演练/备份与关联部署，再专用混合真机；详见 [owner §18](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_IMPLEMENTATION_PLAN.md#18-b2b-10-key-轮换前安全检查点与页面恢复接线2026-09-12)。下文“页面仍阻断/检查点未接”为历史，不是当前源码状态。

> **2026-09-12 B2b-9：** Service 新增保留原 ID/页面的 PATCH 条件替换，App 管理客户端已严格接入且共用登记响应校验；App 95/95、类型及构建通过。尚不从页面调用：先补 rotate 前安全 prepared 检查点、同操作恢复、新根 exact Bootstrap，不能把旧 active 无条件改成 pending 或将 HTTP 201 当设备安装成功。当前纯 BLE/首次 WiFiProv 原路径不改，APK 未安装。下一包固定顺序及 source/实例/Presence 退休边界见 [owner §17](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_IMPLEMENTATION_PLAN.md#17-b2b-9-新根条件替换实例连续性及旧授权隔离2026-09-12)，下文 B2b-8 的“条件更新未实现”按历史读取。

> **2026-09-12 B2b-8：** A-DA0 首次登记/检查点恢复软件已接线（App 92/92）；secure pending 先于 PUT/Bootstrap，exact ACK 后 active，再配 WiFi。指纹复用 BleDirectCrypto，Admin 不放页面状态；cloudContext 只存版本/locator，Key 从 owner reveal 重新获取。原 endpoint 新增 GET 作冲突预检；reset 后新 Admin 替换仍待条件更新合同，当前明确阻断而非静默覆盖。未部署/装 APK/真机，完整边界与后续见[owner §16](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_IMPLEMENTATION_PLAN.md#16-b2b-8-wifiprov-首次-admin-登记与检查点恢复2026-09-12)。下段未接线状态为本批之前。

> **2026-09-12 接线状态校正：** 当前页面已完成生成/Bootstrap/安全保存 Admin，但未调用本文 S-DA0 对应登记接口。本文表格“已实现”仅指 Service API，不能表示 App 的 A-DA0 已闭环。既有 API 首次登记/精确重放，不支持 reset 后新根覆盖；下一包须同时处理登记、Bootstrap 中断恢复和新根冲突，不能只插一次 PUT。Service 混合退休软件已完成，不证明配网全链已验收。当前顺序与边界见[owner 移除 §15](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_IMPLEMENTATION_PLAN.md#15-b2b-7-混合身份联合退休软件收口2026-09-12)。

> 2026-08-29 Presence P1-E：ESP32、UNO R4 与 Wio 真机门禁已完成，设备正式构建已删除
> authorized-presence 预览开关。App 保留 Direct v2 仅用于无 PresenceKey 的旧设备有界 Method 2 升级；列表
> 具体设备 nearby 仍只接受 Direct v3 exact match，控制前仍必须 Method 2/DirectSecureRecord。
>
> 2026-08-28 Presence P1-D1/D2：Direct v3 matcher、BLE enrollment v3、HTTPS `no-store` client、secure-storage
> schema v4，以及运行期 `0x34/0x35` rotation/receipt/Service confirm 已完成。owner `:sync` 先落盘 current +
> previous，再经 Method 2 安装；分享撤销页立即 best-effort sync，设备离线时 owner 下次进入控制页继续。连续撤销
> 由 Service rotation generation 保留，不会被上一轮 pending 安装吞掉。正式 Direct v3 广播、真实数据库与三端掉电
> 竞态仍属于 P1-E 发布门禁。
>
> 2026-08-28 Presence P1-A：Direct v3 decoder 与纯 HMAC matcher 已按
> `D:\codes\BLINKER_BLE_AUTHORIZED_PRESENCE_V1_CONTRACT.md` 冻结，跨 C++/TypeScript/Node golden vector
> 已通过。该记录仅描述当时的纯协议里程碑；后续 P1-D1 已完成安全存储与列表扫描接线。正式设备广播在 P1-E
> 前仍保持 v2。v3 locator 只驱动“蓝牙在附近”，Method 2
> 成功后才能显示 ready 或发送控制。

> 2026-08-27 正式修订：设备控制页新增 V2 接入设置入口。设备 Key 长期支持查看、复制和显式刷新；刷新
> 使用破坏性确认并立即吊销旧版本。“重新配网”是独立流程：App 先提醒用户在设备侧触发
> `Blinker.resetAccess()`，仅在连接到同一物理设备并确认其 Key/access 均已清空后，才以稳定幂等键轮换原
> `logicalDeviceId` 的 DeviceKey、写入 Direct Admin 和 Wi-Fi。配网成功刷新设备清单并进入原设备控制页，
> 不新建页面或逻辑设备。WiFi+BLE 的运行时路由以本机安全存储中的设备级 Direct credential 和本次 BLE
> nearby 结果为准：BLE 可连接时使用 Direct BBP/2，未发现时使用云端 BBP/2；纯 BLE 始终 Direct，不能按
> `device_`/`ble_` 字符串单独推断混合设备能力。已建立的混合设备 Direct 会话若被外设回收或发生链路故障，
> App 切回仍可用的 Cloud 会话；已经发送的业务命令不跨通道自动重放。
>
> 本批新增 owner-scoped `POST /api/v2/devices:resolve-instance` 连续性查询，并继续复用已冻结的 reveal/rotate API。
> App 不在点击“重新配网”入口时提前 rotate，
> 防止用户尚未重置设备便使在线设备失效；rotate 发生在 Blinker custom endpoint GetInfo 校验成功之后，
> 网络超时重试必须复用同一 Idempotency-Key。
>
> “重新配网”入口不能按本机 WiFiProv 历史、`device_` 前缀、设备名称或 MCU 名称猜测。当前以 Gateway/Broker
> 返回的 `cloudLastSeenAt != null` 作为“该逻辑设备至少成功完成过一次 DeviceKey MQTT 上线”的历史事实；设备
> 当前离线不隐藏入口。未来若同一页面支持多种网络适配器，再增加服务器确认的 onboarding profile 选择具体向导。
>
> 2026-08-28 transport identity 纠正：两个物理设备可能出现相同 BLE MAC/peripheral id，同一设备也可能换址，
> 因此 App 已删除 credential 中的持久 transport hint 和 Direct v2 的“唯一地址候选”归属。地址只在当前扫描结果
> 内供系统连接；Direct v2 只能表示 Blinker family candidate，具体 `LogicalDeviceNearby` 只接受 PresenceKey
> 授权的 Direct v3 locator。进入单设备页仍可逐候选执行有界 Method 2，不按 MAC 删除、合并或创建设备。
>
> 同日冻结纯 BLE → WiFi+BLE 升级：WiFiProv GetInfo 若返回现有 access，App 以 DeviceInstanceId 查询当前
> owner 的 committed BLE enrollment，并核对本机 ControllerCredential/accessEpoch；Service 通过
> `POST /api/v2/devices:enable-cloud` 为原 logical device 幂等创建首个 DeviceKey、准备 Broker。设备只安装
> DeviceKey，原 BLE access、PresenceKey、页面和 logicalDeviceId 均保留；中途重试返回同一 Key。
> 同一物理板 access reset 后，保留的 DeviceInstanceId 可能还存在于旧 DeviceKey session；Service 必须先选
> 当前 owner 的唯一 active BLE enrollment，只有无 active enrollment 时才使用历史 session。App 不能以 MAC
> 消歧，仍须用 secure storage 中该 logicalDeviceId 的 ControllerCredential 和 GetInfo accessEpoch 校验。

> 2026-08-23 实施核对：App 已新增
> `src/app/core/device-v2/provisioning/esp32-wifiprov.ts`，按设备端实际合同实现 2 B GetInfo、45 B Install、
> 101 B Bootstrap、严格 DeviceKey/Base64URL 校验和首次/刷新操作选择。ESP32 向导已改为 `BLINKER_` 服务名
> 前缀、固定 Security1，并允许 Education profile 的空 PoP。`capacitor-wifiprov` 源码已从公开仓库恢复到
> commit `fd8589c0cfd1363d6a6388cddd4efe4719ca1534`；其 Android/iOS 实现原本已提供 `sendCustomData()`，App 只新增
> `CapacitorEsp32ProvisioningTransport` 将 exact bytes 经 Base64 透传，不在原生层复制 Blinker wire。两组聚焦
> 测试 9/9、Angular local 全量构建均通过。Gateway 现已提供 P6 Admin metadata 幂等登记 route；App 页面仍未
> 生成/安全保存 Admin、调用该 route 并串联 DeviceKey create/reveal + Bootstrap。在此之前，标准 Wi-Fi 成功
> 不能解释为 Cloud Ready。

> 依赖边界：当前 5 个自研 Capacitor 包仍使用 `file:../capacitor-*`，源码仓已恢复并可构建，但干净 clone 不能
> 自动取得它们。不得用空 `.d.ts` 或提交生成的 `node_modules` 掩盖问题；发布前统一选择“发布带 dist 的固定 npm
> 版本”或“受控 workspace/submodule + prepare”，不能继续依赖开发机偶然存在的兄弟目录。

> 2026-08-18 增量：WiFi-only MQTT 不保存 Direct credential；WiFi+Direct 首次配网同时安装每设备 Admin，
> Shared 后续按具体设备 ACL 交付。不存在家庭全局 key。Plain MQTT 的消息级 MAC/replay 尚未冻结，故当前
> Plain package 只用于内部资源验证，不能据此开放生产 App。

> 2026-08-18 设备 wire 更新：`blinker-config/2` 不接收 Ticket。P3 首次/刷新用 45 B Install；P6 首次用
> 101 B Bootstrap，一次携带 DeviceKey、非零 accessEpoch、Admin groupId/version/secret。Admin secret 由 App
> 在受保护内存生成，只把 groupId/version/fingerprint 登记到 Service；设备固定 Admin 权限
> 为 All 并写入 176 B atomic DeviceAccessStore。GetInfo 为 24 B；P6 首次误发 Install 返回 AccessRequired。
> Ticket/provisioning intent 只在 App 与 Service 间授权这次操作。

> 状态：2026-08-23 当前 App 第一优先级方案；DKEY-1 登录与 `blinker-config/2` 本地安装是两个独立合同。
> 前者已有 App BBP/2/DeviceKey 会话实现，后者的纯 TypeScript exact codec 与原生 transport adapter 已落地；
> P6 服务入口已完成，App coordinator 接入仍未完成。
> Key 权威语义：`D:\codes\blinker-library\docs\DEVICE_V2_DEVICE_KEY_CONTRACT.md`。
> ESP32 配网边界：`D:\codes\blinker-library\docs\DEVICE_V2_ESP32_WIFIPROV_PRIORITY_PLAN.md`。
> 本文取代旧 App 计划中 `ManualDeviceKey/bdk_`、刷新不掉线、默认 Noise 8-operation 配网和默认
> CloudCredential 的描述；Legacy JSON/authKey 页面继续隔离运行。

## 1. App 用户模型

用户只看到“设备 Key”：

- 固定 43 字符、无前缀 Base64URL；
- 可以长期查看、复制；
- 可以刷新，但刷新会立即让所有旧设备和旧会话离线；
- 手动烧录和 BLE 配网安装的是同一种 DeviceKey；
- DeviceKey 不是设备 ID、页面 ID 或 MQTT 密码。

设备详情冻结为紧凑图标操作，刷新图标必须带说明标签并在点击后显示破坏性确认：

```text
设备 Key    •••••••••••••••••••••••••••••••••••••••2R4
                                        [显示] [复制] [刷新]
```

显示完整值前重新确认当前用户权限；复制后提示剪贴板风险。完整 Key 不进入 Redux/Pinia/Vuex 持久化、
Ionic Storage、analytics、crash report、URL、通知或普通调试日志。

## 2. 刷新 UX 与强吊销

刷新必须是破坏性确认，而不是无提示的小图标动作：

> 刷新后，正在使用旧 Key 的设备会立即离线，旧登录信息不能重新连接。你需要重新烧录代码或重新配网。

流程：

1. 用户点击刷新并通过账号权限/二次验证；
2. App 调用服务器 rotate API，提交唯一 `requestId`；
3. 服务器完成版本递增、session revoke 和 broker disconnect 后才返回成功；
4. App 清除旧 Key、旧 reveal cache、旧 provisioning draft；
5. 显示新 Key，并把设备状态标为 `AuthorizationRequired/Offline`；
6. 用户选择“复制到代码”或“重新配网”。

不得显示“刷新成功”但让旧 MQTT/WS 继续在线。网络超时后 App 用同一 requestId 查询结果，不能再次生成一把 Key。

“刷新 Key”与“重新配网”的边界：

- 刷新 Key：只调用 rotate，显示新 Key，用户随后自行复制到 Sketch；不扫描 BLE、不写 Wi-Fi；
- 重新配网：先提示设备物理重置，再进入 WiFiProv；GetInfo 未显示 `hasDeviceKey=false` 且
  `hasAccessState=false` 时拒绝 rotate；
- 重新配网只更新原 logical device，禁止静默创建新设备；
- rotate 已成功而后续 BLE/Wi-Fi 失败时，页面保留当前事务和幂等键，重试同一事务；
- 完成后刷新账户设备数据并导航到 `/device/{logicalDeviceId}`。
- WiFi+BLE 只有一个 inventory `displayName`。重新配网、纯 BLE 升级 Cloud 及 Direct/Cloud 切换均复用原
  logical device 的名称；BLE advertisement `localName` 只用于 family discovery，不覆盖用户名称。

### 2.1 米家式双入口

1. **设备页 → 重新配网**：仅 owner 且 `cloudLastSeenAt != null` 时显示。引导用户执行
   `Blinker.resetAccess()`；GetInfo 证明 Key/access 已清空后才 rotate 原设备。
2. **添加设备 → 直接配网**：连接处于 Provisioning 的设备并读取 `deviceInstanceId`；App 调用
   `devices:resolve-instance`。若当前账号已有 active BLE enrollment 或一次成功 DeviceKey session 证明该实例
   属于某个 logical device，
   显示“发现已添加设备”确认，随后复用其 ID、控制页面、Manifest/Layout 和自动化，只覆盖 Key/access/Wi-Fi；
   未命中才创建新 logical device。

查询不返回其他账号的匹配，也不能以名称、MAC、广播名或设备自报 logical ID 覆盖设备。`deviceInstanceId`
只是 owner-scoped 连续性提示，不是登录凭据：`Blinker.resetAccess()` 必须保留它；彻底擦除 Flash 或迁移 Sketch
会生成新实例，此时使用 DeviceKey/Recovery 流程，不能静默猜测为原设备。若不存在当前 active BLE enrollment，
而同一实例的历史 session 关联当前 owner 的多个 logical device，服务器返回明确歧义错误，要求从目标设备页发起。
存在唯一 active BLE enrollment 时它代表当前 Direct ownership 生命周期，优先于 access reset 前遗留的 cloud
session；这只是 owner-scoped 连续性选择，后续仍需本机 ControllerCredential/accessEpoch 校验。

## 3. ESP32 WiFiProv 第一优先流程

App 新建独立 `device-v2/provisioning/esp32` coordinator，不在 Legacy scanner/authKey service 中叠加条件。

```text
Create/Open logical device
  -> reveal current DeviceKey in protected memory
  -> user opens physical provisioning window
  -> scan/connect ESP32 WiFiProv
  -> Security1 session
  -> read Blinker deviceInstanceId/setupSession/capability
  -> send exact P3 Install or P6 Bootstrap to blinker-config endpoint
  -> standard WiFiProv set WiFi candidate
  -> poll/subscribe Gateway onboarding state
  -> Cloud Ready
  -> optional rescan Direct BLE BBP/2
```

已有设备重新配网使用下列收敛流程：

```text
device control -> access settings -> 重新配网
  -> 提醒用户触发 Blinker.resetAccess() 并等待 BLINKER_ 广播
  -> /tools/esp32-provision?mode=reconfigure&logicalDeviceId=<existing>
  -> Security1 + GetInfo
  -> require no DeviceKey and no access state
  -> rotate existing DeviceKey with stable idempotency key
  -> Bootstrap DeviceKey + per-device Direct Admin
  -> send Wi-Fi candidate
  -> refresh account inventory
  -> /device/<existing logicalDeviceId>
```

进入配网页面、开始扫描或建立 Security1 都不能提前 rotate。这样用户取消、权限失败或尚未完成设备重置时，
原设备仍可继续使用当前 Key。

### 3.1 WiFi+BLE 运行时 Direct-first

运行时选择不是协议降级；两条路径都使用 BBP/2 和同一 logical device：

```text
cloudEnabled=false                 -> Direct BLE
cloudEnabled=true + local controller record
  -> cancel list scan + bounded Method 2
       -> proved                    -> Direct BLE
       -> timeout / not connectable -> Cloud BBP/2
cloudEnabled=true without controller record -> Cloud BBP/2
```

`cloudEnabled` 是 inventory 的显式能力，logical ID 文本前缀只表示 canonical identity，不能据此推断纯 BLE、
WiFi 或 WiFi+BLE。BBP/2 异步 Delivery 的 16 B peer 必须按当前会话已授权 Route alias 还原到同一 canonical ID，
不得一律还原为 `device_<uuid>`。

一旦 Direct 命令已经发送，不因 ACK 丢失自动用 Cloud 重发，避免产生重复副作用。Direct 建连阶段失败可以在尚未
发送业务命令前回退 Cloud；已连接 Direct 后若外设主动回收 GATT 或链路故障，后续 UI/state/command 切回 Cloud，
但不重放故障前的业务命令。页面关闭后释放 BLE；下次进入重新做短扫描。当前 BLE telemetry 尚未冻结时，不能在
同一页面把 Direct command 与 Cloud state 静默混合成一个有序流。

首页使用一次有界 foreground presence 扫描更新状态图标，不建立多设备 GATT，也不把扫描 promise 复用为单设备
连接门禁。WiFi+BLE 同时具备本地 Direct credential 时，`scanning/nearby/connecting/ready` 均优先显示蓝牙语义；
否则显示独立的 Cloud reachability。设置页监听设备清单完成信号，而不是更早发出的用户资料完成信号。

App 使用 Espressif 官方 Android/iOS provisioning library；ESP32 protocomm/protobuf 只存在于该 adapter，不能
成为 App 的跨平台 device-v2 model。Blinker custom endpoint 只收发 `Uint8Array/Data` exact bytes，页面层不
解析/重编码 CBOR。

### Security1 UI 分级

| 场景 | PoP/信任锚 | App 必须显示 |
|---|---|---|
| 已预置或重新配网 | 由当前 DeviceKey 派生独立 PoP | 已验证当前 Key 持有者 |
| 全新 Education 设备 | 无唯一 PoP；物理按键 + 短窗口 | 附近配网，不能宣称防主动中间人 |
| Enhanced/Factory | QR/factory secret；Security2 或 Noise | 按实际验证等级显示 |

App 不得给无唯一 PoP 的 Security1 使用“安全验证设备”“防冒充”文案。Security2/Noise 不进入第一版
ESP32 快速向导；以后作为显式 profile 加载。

## 4. App 状态机

至少分开保存：

```text
provisioningTransport: idle | connecting | secure | transferring | closed | failed
network:               absent | candidate | connecting | confirmed | failed
deviceKey:             absent | staged | installed | rotated | revoked
registration:          pending | active | conflict
directAccess:          absent | adminReady | sharedReady | rotationPending
cloud:                 offline | authenticating | transportConnected | protocolReady | stateFresh
directBle:             unavailable | scanning | authenticated | ready
```

BLE endpoint 返回成功只表示本地传输/安装完成，不等于 Cloud Ready。App 以 Gateway/Broker 的
`transportConnected/protocolReady/stateFresh` 判断设备上线；Direct BLE 是独立会话。

App 被系统杀死或蓝牙断开后：

- 使用 transactionId 查询服务器状态；
- 重新扫描实时 capability，不复用旧 peripheral/MAC 作为身份；
- 不保留 raw Key；需要继续时重新从服务器 reveal；
- exact Ticket/bundle 是否可重试由协议 transaction 状态决定，不自行生成新 logical device。

## 5. 非 ESP32 平台

- UNO R4 第一版先支持手动 DeviceKey + WiFi；当前设备库虽有 ArduinoBLE 加密链路检查和 Noise 配网软件图，
  但没有真机门禁，也没有移除 Noise 后的轻量默认 driver，App 不应提前开放“UNO R4 自动配网”。
- 后续 UNO R4 coordinator 复用相同 DeviceKey/Ticket/状态语义，但本地 transport 是 ArduinoBLE，不模拟
  WiFiProv protobuf。
- Wio Terminal 当前只显示手动接入；设备仓没有 rpcWiFi/rpcBLE product adapter，不能按板名猜测支持。
- NCP/串口产品由模块对 App 暴露对应的 setup transport；App 仍只消费统一 provisioning semantic DTO。

## 6. App 与服务器 API 候选

管理 API 使用用户 JWT 和普通 JSON；下列管理 path 仍是实施命名，不是 DKEY-1 冻结的设备 binary wire：

| 操作 | 候选 API | 结果 |
|---|---|---|
| 创建手动/V2 设备 | `POST /api/v2/devices` | logicalDeviceId + summary |
| 查看当前 Key | `POST /api/v2/devices/{id}/device-key:reveal` | 43 字符 Key |
| 刷新 Key | `POST /api/v2/devices/{id}/device-key:rotate` | new Key/version + revoke result |
| 申请配网 Ticket | `POST /api/v2/devices/{id}/provisioning-tickets` | exact ticket bytes |
| 查询配网 | `GET /api/v2/provisioning-transactions/{id}` | 分维度状态 |
| 登记 Direct Admin | `PUT /api/v2/devices/{id}/direct-access/admin` | 已实现；首次返回 accessEpoch，完全相同请求可安全重放 |
| 查询 Direct Admin | `GET /api/v2/devices/{id}/direct-access/admin` | B2b-8 新增；owner active metadata 或 null，no-store；不是替换授权或事务锁 |
| 分享单台设备 | `POST /api/v2/devices/{id}/shares` | 该用户对该设备的 ACL；可选 Direct Shared 交付 |
| 移除分享 | `DELETE /api/v2/devices/{id}/shares/{userId}` | cloud ACL 立即撤销；必要时进入 DirectRevocationPending |

binary Ticket/bundle 以 base64url 或 binary response 进入 coordinator 后立即解码为 exact bytes；禁止 JSON
object round-trip 后重新 canonicalize。

### 6.1 Direct secret 的 App 边界

- Admin secret 在首次 P6 配网时由 App CSPRNG 生成，当前经过可归零的 WebView 字节数组、配网插件、设备
  Bootstrap 和 OS 安全存储封装；不声称全程 native protected memory。Service 只接收 groupId/version/fingerprint；
- Shared secret 只按当前 `logicalDeviceId` 下载，不能缓存为家庭级对象或从一台设备复制到另一台；
- 用户被分享多台设备时，App 分别保存多条设备级 Shared；只分享一台时只下载这一台；
- 删除成员后 cloud 控制立即消失；只要该成员曾下载 Direct secret，就显示 `DirectRevocationPending`，直到这台
  设备通过附近 Admin Direct 会话完成 Shared N+1、剩余成员取得新 secret；当前不得尝试从 MQTT 下发
  ControllerControl；
- Direct secret 只进系统安全存储，不进全局状态持久化、日志、埋点、崩溃报告、剪贴板或备份。

首次 P6 登记 body 只允许 `controllerId`（16 B/22 字符 canonical base64url）、非零 u32
`credentialVersion` 和 `fingerprint`（32 B/43 字符 canonical base64url）。fingerprint 固定为：

```text
SHA-256(
  ASCII("blinker/direct-admin/fingerprint/v1") || 0x00 ||
  controllerId[16] || credentialVersion[u32be] || controllerSecret[32]
)
```

App 先在可归零字节数组（当前为 WebView JavaScript，不是 native protected memory）中生成 16 B controllerId
与 32 B controllerSecret，先安全保存 pending，再登记元数据；核对返回 epoch 后编码 101 B Bootstrap。
首次 API 固定 epoch=1；完全相同请求的 `200/replayed:true` 可继续，409 必须停止，不自行生成第二套 Admin。
raw secret 不得出现在 **Service HTTP JSON** 或页面状态；安全存储内部序列化不等于外发 secret。

## 7. App 实施批次

1. **A-DK1（已完成）**：消费已冻结的 `device_key_session_golden_vectors.properties` 与
   `app_device_key_session_golden.ts`，实现生产 DeviceKey strict codec、mask/reveal/clipboard 和错误模型；
   不在 App 中重新发明派生 domain/CBOR。
2. **A-DK2（已完成）**：设备详情 reveal/copy/refresh 图标、破坏性确认和重新配网入口；fake server 验证
   强制离线、稳定幂等、所有者权限与原 logical device 保持不变；入口已改为服务端历史上线事实，不读取本机
   WiFiProv 记录。
3. **A-WP1（已完成）**：纯 TypeScript `Esp32ProvisioningTransport`、exact codec 和操作选择已完成；复用插件
   既有 `sendCustomData()`，由 `CapacitorEsp32ProvisioningTransport` 负责 Base64 exact relay。Kotlin/Swift 不理解
   Blinker wire，也没有新增重复的 native request API。
4. **A-WP2（已完成基础闭环）**：先调用 GetInfo/P6 或 P3 并确认设备返回 Success，再发送标准 Wi-Fi
   candidate；首次接入和原设备重新配网成功后先幂等释放 provisioning transport，再刷新设备清单并进入
   `/device/{logicalDeviceId}`，禁止新设备页的 Direct `ensureReady()` 与旧配网 GATT cleanup 并发。路由父页以
   exact URL 显式传递 `viewActive`，嵌套 V2 组件不再假设自己会收到 Ionic page lifecycle；不可见时统一取消
   reconnect timer、telemetry 和在途 BLE open。Cloud fallback 不改变 BLE session 所有权，因此页面退出仍必须
   委托 BLE service 取消。App kill/进程恢复仍属于 A-WP4 稳定性门禁，不应为此复制第二套页面状态机。添加
   设备入口已接 owner-scoped instance resolve；命中已上线设备时经确认复用原设备，未命中才 create。
5. **A-WP3**：接 Gateway Ticket/status，完成首次 ESP32 fake-device E2E。
6. **A-WP4（部分完成）**：ESP32 真机，覆盖无 PoP、错误密码、掉电、App kill、Key 刷新和 Direct-first/Cloud
   fallback。2026-08-27 已完成 Security1、原设备 v1→v2 轮换、Wi-Fi 写入、MQTT 上线、App 云下行、正式
   reconfigure UI、附近 Direct-first 和 Direct `power` 下行。2026-09-02 真机复现并修正配网成功跳转竞态；定向
   定向 3 文件为 31/31、完整 Angular 测试 60 文件 297/297，local build、Capacitor copy、Android
   assemble/install 与可复用真机循环门禁均
   通过。修正后全新 App 进程的连续两轮都在设备页出现后约 4.27 s 自动 BLE ready，无需刷新；WiFiProv GATT
   cleanup 与 Direct scanner 的 Android 时间线不再重叠。错误密码、掉电、App kill 事务恢复及真实刷新 Key
   后旧会话强踢仍需单独门禁；本批未为测试再次破坏当前真机 Key。
7. **A-DA0（B2b-8 首次安装软件已实现）**：共用 fingerprint、OS 安全存储封装与
   `pending -> register -> exact Bootstrap ACK -> active` 协调器。真实 App kill/无线丢包、分配到 pending 的窗口
   和 reset 后新根条件替换仍未闭环，详见 owner 移除 §16；不把 3 B Bootstrap ACK 称为纯 BLE grant receipt。
8. **A-DA1**：实现每设备 Shared 下载、选择性分享和
   `DirectRevocationPending`；禁止 household key。
9. **A-XP1**：ESP32 稳定后再实现 UNO R4 adapter；Wio/NCP 分别按真实能力准入。

退出门禁包括：raw Key 日志扫描为零、旧 version session 被强踢、App 重启不重复创建设备、无 PoP 文案诚实、
Legacy scanner/authKey 与 V2 coordinator 没有共享可变状态。

## 8. 官方依赖参考

- Android：<https://github.com/espressif/esp-idf-provisioning-android>
- iOS：<https://github.com/espressif/esp-idf-provisioning-ios>
- Unified Provisioning：<https://github.com/espressif/esp-idf/blob/master/docs/en/api-reference/provisioning/provisioning.rst>

版本必须由 App lockfile 锁定，并以实际 ESP32 Arduino/IDF 版本做兼容矩阵；不允许运行时根据失败静默切换到
Legacy JSON BLE。
