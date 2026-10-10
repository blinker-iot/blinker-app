# Device V2 App 配网、绑定与凭据实施方案

> **归档说明（2026-08-19）：**本文保留早期分批记录，不再作为执行主线。App 当前唯一实施主线为同目录
> `DEVICE_V2_ONBOARDING_IMPLEMENTATION_PLAN.md`；DeviceKey、PageSchema、Manifest/State 和发布状态都以该
> 文件及设备仓权威合同为准。本文后续出现的 `ManualDeviceKey/bdk_`、刷新不掉线、CloudCredential 默认链
> 或每 App controller 槽均属于历史内容，不得继续实现。

> **2026-08-18 设备 access wire 修订：**P6 `blinker-config/2` GetInfo 为 2/24 B；首次使用 101 B
> Bootstrap 原子提交 DeviceKey + accessEpoch + Admin，P3 才使用 45 B Install。Ticket/JWT 只在 App/Service
> 外层授权，不进入设备 body。详细边界以 `DEVICE_V2_ONBOARDING_IMPLEMENTATION_PLAN.md` 和设备仓
> `DEVICE_V2_AUTHORIZATION_AND_SHARING_DECISION.md` 为准。

> **2026-08-17 新优先级：**DeviceKey 与 ESP32 WiFiProv 的当前 App 权威执行方案为
> `APP_DEVICE_V2_DEVICE_KEY_WIFIPROV_PLAN.md`。本文中 `ManualDeviceKey/bdk_`、刷新不掉线、默认
> CloudCredential、默认 Noise 8-operation BLE 配网和旧 R5 顺序均为历史记录。新语义为无前缀 DeviceKey、
> 刷新立即强吊销旧 session/连接，ESP32 首先联调 WiFiProv Security1。

> 状态：2026-08-17 设计基线，App 生产代码尚未修改。当前 MAC/deviceName 扫描、authKey 页面/缓存、
> legacy JSON/TLV 和旧 AP 配网继续服务 Legacy；新 V2 必须走独立 coordinator/model，不在旧 service 上继续
> 堆条件。权威语义：`D:\codes\blinker-library\docs\DEVICE_V2_WIFI_BLE_ONBOARDING_DECISION.md`；跨模式总览：
> `D:\codes\blinker-library\docs\DEVICE_V2_MODES_ONLINE_AND_PROTOCOL_OVERVIEW.md`。

> 2026-08-17 R4b-6B 增量：设备已冻结 LocalBLE application envelope 与扫描 capability 分流，但 App
> production coordinator 尚未实现。扫描到 `LocalControllerPairingV1` 必须走纯本地 flow，不能请求 Ticket；
> 扫描到 `EnrollmentV1` 才进入平台 BLE-only/WiFi+BLE flow。两种 capability 同时出现视为设备协议错误。

> 2026-08-17 R4b-6C 增量：设备已在 ESP32/UNO R4 上分别实编 Platform BLE 与 LocalBLE 四个 internal
> product graph。Platform BLE 只接受 `ticketOperations=0`，不应出现 Network/Cloud 步骤；LocalBLE 的设备包
> 没有 server signing/cloud 配置，因此 App 不得“尝试联网失败后回退本地”，必须在扫描时一次分流。公开 facade
> 和真机尚未完成，不代表 App 已可连生产固件。

> 2026-08-17 手动模式修订：短期 EnrollmentKey/RecoveryKey 双码 UX 已撤回。App 为手动设备长期显示一个
> 可查看/复制/刷新的 `ManualDeviceKey/bdk_`；同一 Key 用于首次烧录和全擦恢复。独立 RecoveryGrant 保留。
> 权威合同为 `DEVICE_V2_MANUAL_DEVICE_KEY_CONTRACT.md` 与 `DEVICE_V2_DEVICE_RECOVERY_CONTRACT.md`；
> production codec/route 尚未实现，不能用旧 authKey 临时代替。

> 2026-08-16 接口增量：设备侧 Ownership Reset/Transfer v1 已冻结。App 必须把
> `D:\codes\blinker-library\tests\golden\ownership_release_golden_vectors.properties` 纳入生产 codec CI；
> 旧 Enrollment/1、ResetCoordinator 和 ProductOrchestrator 不再存在，禁止按旧 body 对接。

> 2026-08-16 R4b-3 历史增量：WiFi-only EnrollmentKey 四路 HTTP软件探针、设备 staged lifecycle 与
> 1,414 B 共享 arena 已完成公共软件层；下一段 crypto profile 已补齐软件 provider，但 official 设备产品
> 仍等待真机/组合门禁。App 当前只按 exact bytes/状态机实现，不得把 MQTT 在线作为注册前提，也不得假设
> 设备已能进行生产联调。R4b-4a EnrollmentTicket signed body、R4b-4b 普通 DIY Noise NN secure Core
> wire、R4b-4c LocalSetup application envelope 与 R4b-4d durable setup saga 已冻结。设备公共层已实现
> 1..8 操作、ConfigureNetwork exact body、App exact-relay Cloud path 与 R4b-5A 设备端单 Client lifecycle；
> R4b-5B/5C 两平台 internal composition 与 R4b-5D session/fault gate 也已完成软件验证；尚未完成的是公开
> WiFi+BLE facade、App production coordinator、动态资源/双无线真机门禁与三端 E2E。R4b-5D 不新增 wire
> 字段，但要求 App 严格按每次 BLE connect 重建本地 session。

> 2026-08-16 R4b-4a 增量：App production codec 应接入
> `D:\codes\blinker-library\tests\golden\enrollment_ticket_golden_vectors.properties`。Ticket 最大 268 B，
> 绑定当前 device/setupSession/setupTranscriptHash、generation、首个 controller digest/权限和 operation
> mask；raw controller secret 只留 Keystore/受保护内存。参考 TypeScript golden 不是生产实现。

> 2026-08-16 crypto profile 修订：设备软件层已提供 ESP32 native P-256、UNO R4 可选
> `SoftwareATSE` P-256，以及 UNO R4/Wio portable Ed25519 验签；Cloud envelope/Noise 仍统一为
> X25519/HKDF-SHA256/AES-256-GCM。真机与 production E2E 尚未完成。

## 0. R5 App 生产实施决策

### 0.1 当前代码审查结论

当前 App 不能在既有 service 上渐进增加 V2 分支：

- `DeviceService` 和 `DeviceProtocolService` 已分别约 166 KB/149 KB，混合 MQTT、BLE、JSON/TLV、在线探测、
  页面数据和兼容逻辑；继续加入 Noise/CBOR/分页会扩大共享可变状态；
- 当前 BLE 是 FFE0/FFE1、换行分帧和 JSON 解析，扫描依赖 FFE0/FFF0、MAC 与广播名，不能承载 V2 4 B
  fragment、连接级 session reset 或 physicalDeviceId；
- 当前 `BlinkerDevice` 同时保存 MQTT password、authKey、layout 和运行状态，且 `data.state/onlineStatus`
  混合 Broker 连接、探测回复和业务状态；这不是 V2 identity/session model；
- 当前依赖中没有 production restricted-CBOR、X25519/AES-GCM Noise、Controller OS 安全存储或可证明
  GATT encrypted/bonded 状态的实现。开始真实配网前必须先补齐这些平台能力门禁。

因此 V2 新建独立 feature，旧 `AdddeviceService/DeviceService/DeviceProtocolService/BlinkerDevice` 只服务
Legacy。底层 BLE 插件可以由 adapter 复用，但 scanner、session、codec、状态和 credential 不能共用。

~~~text
src/app/device-v2/
  protocol/       restricted-cbor、bbp2、fragment、exact onboarding codec
  platform/       ble、crypto、secure-secret-store、clock/random adapter
  onboarding/     wifi-key、device-recovery、platform-ble、wifi-ble、local-ble reducer
  session/        direct-bbp2、cloud-normalized session
  model/          identity、manifest、source-lane state、readiness
  page/           page-schema、widget-registry、binding、renderer bridge
~~~

禁止把新实现继续写入现有两个超大 service，也禁止为了“复用”让 V2 解析器 sniff JSON/TLV/BBP2。

### 0.2 App 与服务器的数据面决策

Direct BLE 使用设备原生 BBP/2；cloud 路径不把设备 session 的 sequence、ACK、Field ID 或 raw frame 透传
给 App。Broker 终止设备 session 后，通过账号级 MQTT-over-WebSocket 基础设施发送独立的 stable-key
normalized envelope。该 envelope 可使用易调试 JSON，因为它不是 MCU wire，也不是 Legacy JSON device
协议。两种 transport 最终只调用同一 reducer：

~~~text
Direct BLE BBP/2 -> DirectSessionAdapter --+
                                             +-> V2DeviceReducer -> PageSchema renderer
Account cloud JSON -> CloudSessionAdapter ---+
~~~

cloud 最小消息族为 `state.snapshot`、`state.patch`、`property.apply`、`action.invoke`、`event`、
`request.ack` 和 `request.error`。它们使用 `logicalDeviceId + stable key + requestId`；服务器为设备侧另建
BBP/2 sequence/correlation。App 不缓存 cloud Field ID，也不把 cloud requestId 当设备 sequence。

App 管理 API 使用普通 JSON DTO；exact Ticket/Grant bytes 以 base64url 交付后只 decode 一次。BLE relay
调用 `/api/v2/app-onboarding/transactions/{ticketId}/...` 下四个 `application/cbor` endpoint，body/response
都是不包装的 exact bytes。它与 WiFi-only 设备的 `/api/v2/device-onboarding/...` + ManualDeviceKey proof
明确分开，不能让 App 拼装 Key header 或让设备 endpoint 接受用户 JWT 代替 bootstrap context。

每个来源保留自己的 `(sessionEpoch, manifestFingerprint, stateRevision)` lane。设备重启后 revision 可从零
开始，Direct 与 cloud 的 revision 也没有跨 session 可比性；不得简单取较大 revision。Direct 在线时 UI
优先显示已完整验证的 Direct snapshot，否则显示 cloud snapshot；任一 lane 只有完整 snapshot staging 后
才能变为 fresh。

### 0.3 “上线”不是一个 boolean

~~~text
ownership        unclaimed | pending | active | releasePending | revoked
network          absent | candidateStored | connected | failed
cloudCredential  absent | pending | active | revoked
cloudTransport   offline | mqttConnected
cloudProtocol    negotiating | ready | failed
cloudState       absent | staging | fresh | stale
directBle        undiscovered | provisioning | connected | authenticated | ready
controller       absent | pending | active | revoked
~~~

MQTT CONNECT 只推进 `cloudTransport`；HELLO + 当前 Manifest 完整验证/接受 + 所需 auth 才推进
`cloudProtocol=ready`。仅在协商 EndpointIds 时要求 ID gate。StatePage 完整原子提交后才推进
`cloudState=fresh`。平台 BLE-only 可以 ownership/controller Active 但永远没有 cloud online；LocalBLE
没有服务器 ownership/logicalDeviceId。

### 0.4 App 端四条正式上线流程

1. **WiFi-only 手动模式**：App 先创建 AwaitingFirstClaim logical device/PageSchema，并长期显示
   ManualDeviceKey；设备完成 Claim/Cloud commit。正常重启不发送 Key；全擦后同一 Key触发 RecoveryGrant。
2. **WiFi+BLE**：扫描 Provisioning capability -> 新 Noise session -> 读取完整 Hello context -> App 生成
   controller secret 并申请 Ticket -> exact relay operation 1..8 -> 断开 Provisioning -> 重扫 Direct ->
   GATT 加密 + Method 2 -> Direct HELLO/Manifest/State；cloud 分支在 network confirm 后独立进入
   Cloud Session/MQTT/BBP2。
3. **平台 BLE-only**：Ticket + operation 1..4，跳过 Network/Cloud；Direct ready 即可控制。App 可同步公开
   ownership 元数据，但不能上报为 broker online。
4. **LocalBLE**：扫描时按互斥 capability 直接分流；Noise + 物理确认 + Local controller pairing + Method 2；
   PageSchema 与状态只存本地，不调用 Gateway，不能“联网失败后回退 Local”。

### 0.5 App 分批与阻断门禁

| 批次 | 交付 | 退出门禁 |
|---|---|---|
| R5-A1 | `device-v2` 空壳、strict CBOR/BBP2/fragment、全部 shared golden | valid/invalid exact 全通过；零 legacy import |
| R5-A2 | `CryptoProvider`、CSPRNG、ControllerSecretStore、V2 BLE adapter | X25519/AES-GCM KAT；secret 不进普通 storage/log；能证明或明确拒绝 GATT security |
| R5-A3 | scanner + 四种 onboarding reducer + exact relay client | App kill/掉包/过期/同事务恢复不重复创建设备 |
| R5-A4 | DirectSession 与 cloud normalized adapter | session reset、source lane、command correlation 全隔离 |
| R5-A5 | Manifest/State reducer、PageSchema/WidgetRegistry | 缺页/乱序/版本冲突不污染 UI；拖拽与 Agent 同构 |
| R5-A6 | fake Gateway/device E2E 后再接真机 | 四 profile、日志脱敏、断线/长稳门禁通过 |

R5-A1 在设备 R4b-2F 冻结 ManualDeviceKey/Recovery shared golden 后立即实施；不得在此之前自行猜测数字 key、
错误码或 DTO。R5-A2 在选择 production crypto/OS secret bridge 以及补齐 BLE link-security 可观测性前
不得假装完成。PWA 不具备可靠 BLE/安全存储时应明确不提供 durable Direct Controller，而不是降级到
localStorage/Ionic Storage。

### App 对 staged onboarding 的执行项

1. WiFi-only Key 卡片负责长期 reveal/copy/refresh；设备 Active 后重启或普通断网不要求用户重新输入 Key，
   但用户换电脑或全擦重烧时始终可以重新复制当前 Key；
2. 状态按 BoundClaim / OwnershipAcked / CloudPending / Complete 展示并允许恢复，不以 MQTT online、HTTP
   2xx 或本地倒计时替代 exact CommitAck；
3. `signatureAlgorithm`、`serverKeyId`、`envelopeAlgorithm` 对 App 都是 opaque metadata；App
   不自行选择 profile、不重编码 body、不丢失字段，也不提供“跳过验签”开发开关；
4. 设备团队完成目标真机 crypto/组合门禁前，UI/QA 必须把 WiFi-only V2 标记为未联调能力，而不是回退到
   legacy authKey 或复活 SetupCode。

App 的 BLE/HTTP relay 必须原样保留 `signatureAlgorithm + serverKeyId + signature`。App 不承担曲线运算
时，不需要内置 server public key；但必须拒绝本 App 版本无法透明承载的长度/版本，并将“设备不支持该
服务器 profile”作为可诊断错误展示，不能本地改成另一个算法重试。

### Ownership Release App 执行项

1. 只允许当前已认证 owner/controller 发起：Reset 可选 Preserve/Clear Network，Transfer 固定 Clear；
2. 以 opaque bytes relay Request、Grant、Receipt、CommitAck，缓存 `requestId/grantId/currentGeneration`
   用于断线恢复，禁止 decode 后重建 canonical CBOR；
3. 在设备确认 Released 前保留当前 ControllerCredential 和连接；成功后再删除 OS Keychain/Keystore 中的
   旧 controller secret，并使旧页面/Direct BLE session 失效；
4. UI 明确显示 Prepared、等待服务器提交、设备清理中、Released/可重新认领；重复点击复用原事务；
5. 不能用 HTTP 2xx、本地成功提示、MQTT PUBACK 或 App 自签内容替代 server-signed CommitAck；
6. Transfer 不提供“保留原 WiFi”，common body 不添加 owner、tenant、productId、MAC 或 JWT。

## 历史附录边界

> 从本标题到文件末尾是 2026-08-17 Ownership/CloudCredential/每 App controller 方案的历史设计记录，
> **不得继续作为实现输入**。当前 App 只执行 `APP_DEVICE_V2_DEVICE_KEY_WIFIPROV_PLAN.md` 以及设备仓
> `DEVICE_V2_AUTHORIZATION_AND_SHARING_DECISION.md`：DeviceKey/session、每用户每设备 ACL、每设备
> Admin/Shared、`accessEpoch` 与 `blinker-config/2`。

## 1. App 必须理解的对象（历史）

| 对象 | App 是否持有 | UI/存储规则 |
|---|---:|---|
| physicalDeviceId | 是，公开 | 设备详情/诊断可用；不从 MAC 推导 |
| logicalDeviceId | 是，公开 | 服务器设备、页面和 ACL 主键 |
| ManualDeviceKey | 是，仅手动模式 | 设备详情长期 reveal/copy/refresh；`bdk_` 用于首次 Claim/全擦 Recovery，不是 MQTT key |
| EnrollmentTicket | 短暂 | 只放内存和当前 BLE session；不展示/复制/持久化/埋点 |
| OwnershipReceipt/Grant | 可缓存公开状态 | 只信 server signature/commit；exact bytes 透明 relay，不保存设备 BOS2 |
| RecoveryGrant/CommitAck | 可 relay exact bytes | 只授权 new instance 取得旧 logical ID 的 N+1 base；不是 cloud online |
| CloudCredential | 否 | App 永不读取、展示、复制、分享或备份 |
| SessionCredential | App 自己的 App session 可持有 | 与设备 MQTT credential 分开 |
| ControllerCredential | 是 | 每安装独立：16 B controllerId + 32 B HMAC secret；secret 只进 OS Keychain/Keystore |

App 文案禁止把这些都叫“设备 Key”。V2 页面不再提供 authKey 查看、复制、分享、轮换；旧页面只对
Legacy device 显示。

## 2. 设备发现与身份

BLE 扫描器使用 V2 Service Data：protocol major、mode、8 B setupSessionLocator、capability。MAC、
广播名、FFE0/FFF0 名称规则只用于当前扫描列表，不进入持久设备 model，不作为绑定去重或 deviceId。

扫描 model 至少包含：

~~~text
transportLocator          // 当前连接用，短期
physicalDeviceId?         // 连接/安全会话后读取
setupSessionLocator       // 广播8 B定位值，不是Ticket完整ID
setupSessionId?           // 受保护握手后取得的16 B完整ID
mode = Provisioning | Direct
capabilities
securityLevel = Education | Enhanced | Manufactured
signal/lastSeen
~~~

相同 physicalDeviceId 的多个 locator 可以合并为当前候选；相同 MAC 不得自动判定为同一服务器设备。
Gateway 返回 `AlreadyClaimed/PossibleClone` 时，App 显示“已绑定/可能重复身份”的恢复或售后入口，不能
自动改用 MAC、重新创建设备或覆盖本地缓存。

## 3. WiFi-only 教育流程

适用于没有 BLE/App 本地通道、用户在 Sketch 中写 SSID/password 的设备：

1. 用户选择 project/template 和显示名；
2. App 创建 `AwaitingFirstClaim` logical device、PageSchema 和 ManualDeviceKey；
3. 设备详情长期显示 Arduino 示例中的 `BLINKER_DEVICE_KEY`，提供显示/复制/刷新，并说明它不是
   deviceId/MQTT key；
4. 设备 claim/credential commit 后，App 继续使用同一 logical device card，按各 readiness 显示上线；
5. 正常设备重启不使用 Key；用户误擦 Flash 后仍复制同一个当前 Key，服务器转入 RecoveryGrant；
6. 刷新 Key 只影响未来首次/恢复请求，不轮换 CloudCredential、不让 Active 设备掉线。

若旧 Key 已轮换，App 指向当前设备页复制最新值；若服务器已经锁定 claim/recovery 但响应丢失，展示“正在
恢复同一事务”，不得重复创建设备或 generation。

## 4. WiFi+BLE App 配网流程

~~~text
scan Provisioning device
-> Noise HelloResponse reads deviceInstanceId + setupSessionId + generation + ticketOperations
-> responder handshake completes; App obtains final setupTranscriptHash
-> App JWT requests short EnrollmentTicket
  -> Ticket binds exact transcript/controller ID/secret digest/permissions and upgrades authenticated local session
-> operations 1..3 relay Ownership request/grant/receipt/commit ACK
-> operation 4 installs the App-generated controller secret in the protected session
-> operation 5 writes a WiFi candidate and receives CandidateStored
-> operations 6..8 relay Cloud request/grant/receipt/commit ACK
-> observe network confirmation, CloudCredential Active and Controller Active independently
-> reconnect Direct BLE / wait MQTT online
~~~

详细要求：

1. 只有首次启动或用户物理操作打开的 setup window 才允许开始；
2. owner/product intent 留在 Gateway transaction；signed Ticket 绑定 deviceInstanceId、setupSessionId、
   完整 Noise transcript hash、generation、当前 16 B controllerId、`SHA-256(controller secret)`、
   permissions、operation profile、nonce 和 TTL。初始 Noise 只提供 provisional encryption，设备验
   server Ticket并匹配全部 context 后才把会话升级为 authenticated；
3. Ticket、Ownership ClaimRequest、Grant、Receipt、CommitAck 作为 exact bytes relay，不转 JSON 再编码；若 UI/恢复状态
   需要 receipt fingerprint，只接受 Gateway 返回的 `SHA-256(exact signed receipt bytes)`，禁止对解析后的
   map/JSON 重新编码再 hash；
4. WiFi credential 只在 Ticket 绑定的受保护 BLE session 中发送；operation 5 成功只返回
   `CandidateStored` 与 `networkGeneration`，表示候选已原子保存，不表示 AP 已连接、网络已确认或云在线。
   R4b-5 composition 负责异步连接并调用 confirm；失败时允许同一 durable ticketId 在新 Noise transcript/
   新 signed Ticket 下替换未确认候选，不得清 ownership 或创建第二台 logical device；
5. App 永远看不到设备 CloudCredential；设备自己安装并换取 SessionCredential；
6. UI 分别显示 Ownership、Network、Cloud credential、MQTT online、Controller、Direct BLE；
7. Provisioning 完成后设备不会在当前 session 中途强切。App 收到最终 operation response 后主动断开、重新
   扫描 Direct mode 并建立新 session；若最终响应因断链丢失，但扫描已看到同一 physicalDeviceId 的 Direct
   mode，应向 Gateway 查询 durable transaction，不得重新创建 logical device；
8. Direct mode 建连必须先完成平台 GATT 加密/配对，再执行 Controller Method 2。发现设备只支持未加密 GATT
   时必须显示 capability/security error，不能把“能写 characteristic”当作已认证。UNO R4 official profile 在
   设备端取得当前连接真实 encrypted 状态前不得进入可发布矩阵。
9. 断连、加密丢失或 mode 切换时，立即清除 BLE fragment、BBP/2 sequence、Method 2、Field ID map 和 pending
   command。即使底层再次给出相同数值 sessionId，也必须从 HELLO/Manifest/Auth 开始；不得把它当成旧连接恢复。

无 factory root 的 Education 档只能证明当前用户在短 setup window 内控制了该实例，不能保证硬件不可克隆
或抵抗全部主动近场冒充。App 必须显示安全级别；Enhanced/Manufactured 才要求 QR/factory proof。

## 5. BLE-only 与 LocalBLE

### 平台 BLE-only

App 使用用户 JWT 请求 EnrollmentTicket，在受保护会话中 relay exact Ownership ClaimRequest、server-signed
Grant、device Receipt 与 server-signed CommitAck。首个 controllerId/32 B secret 由 App CSPRNG 生成，Ticket
已签名绑定其 digest/权限；Ownership commit 后 App 在同一 LocalSetup transaction 中发送 raw secret，设备执行
`InstallInitialController` 并返回 HMAC receipt。不能先要求一个尚不存在 controller 才能建立的 authenticated
local session，也不为首个 controller 重复请求 ControllerGrant；后续管理才使用 Controller Control。设备没有
CloudCredential/MQTT 仍是有效 logical device；App 可在联网时同步“来源为 App relay”的状态，但不能将
本地 cache 标记为设备 cloud online。

### LocalBLE

LocalBLE 可在物理确认后直接安装 generation 0 的本地 ControllerCredential，不要求用户登录、Ticket 或 logicalDeviceId。
页面仅本地保存。以后升级为平台模式必须显式 Ownership Claim，不能把旧 `paired=true` 上传成所有权。

R4b-6A/6B exact flow 已冻结，R4b-6C 已接入双平台 internal product graph：先发送 application Hello
`{0:1,1:1,2:requestId}`，strict decode
HelloResponse 中的 `deviceInstanceId/setupSessionLocator`，完成同一 Noise handshake 后等待设备侧物理确认；再发
Challenge request，并 strict decode
`PairingChallenge(deviceInstanceId, pairingNonce, setupTranscriptHash, permissions, expiresInMillis)`；生成独立
controllerId/secret，在 Noise transport 内发送 canonical PairingRequest body。只有 requestDigest、secretDigest、
HMAC proof 和随后 Method 2 都验证成功，才把 secret 写入 Keychain/Keystore 并提交本地 paired reducer。

application type 固定为 request `1/2/3`、response `129/130/131`、error `255`；wire error `1200..1299` 与
retry class `Never/Backoff/PhysicalConfirm/RestartSession` 必须显式进入 reducer，不从文本推断。固定向量大小为
Hello `7/36 B`、Challenge `7/91 B`、Pairing `141/177 B`、physical-confirm error `14 B`。共享 golden 为
`D:\codes\blinker-library\tests\golden\local_controller_pairing_golden_vectors.properties`。

response 丢失但 App 仍保有本次内存 secret 时，只重发同一窗口 exact bytes；不得换 identity。若 App 已被杀死并
丢失未提交 secret/receipt，不写 `paired=true`，也不上传半成品；引导用户在设备上重新打开 Local pairing mode，
对新 Noise session 再做物理确认和新 controller 安装。已成功持久化且 Method 2 可用时，普通重启直接连接 Direct，
不重配、不请求 Ticket。新增手机同样使用重新打开 pairing mode，而不是复制旧 controller secret。

SetupCode 对两者都不是统一必填项。产品需要更高误绑定保护时可增加 QR secret/短码 PAKE/factory proof，
但这是 security profile 能力，不是 BLE deviceId。

## 6. 重启、重配网、解绑和转让 UX

| 用户操作 | App 调用 | 设备结果 |
|---|---|---|
| 普通重启/等待上线 | 无新 Claim | 设备用 CloudCredential 申请新 SessionCredential |
| 更换 WiFi | 请求 NetworkProvisioningGrant | 只写新 WiFi，保留 logical ID/Cloud/controller |
| 撤销某手机 | Controller revoke | 只撤销对应 controller |
| 解绑/转让 | OwnershipReset/TransferGrant + 风险确认 | generation 前进并保留 Unclaimed floor，旧 cloud/controller 失效 |
| 全片擦除后恢复当前设备 | 同一 ManualDeviceKey/登录 App intent + signed RecoveryGrant | 新 physical instance 在 N+1 接管原 logical ID；保留页面/历史 |

不能把以上操作合并成一个“恢复出厂”。网络失败也不能自动删除服务器设备或清除 ownership。
转让默认让旧 logical device 归档、新 owner 获得新 logicalDeviceId；旧页面、历史和分享关系不自动转移。
若产品支持数据随设备转让，App 必须单独展示双方授权和数据范围，不能藏在普通“解绑”按钮中。

### 6.1 全片恢复 UX

现有设备详情必须把三个 action 分开：

1. “重新配置 WiFi”只改网络；
2. “重新烧录/恢复设备”保留 logicalDeviceId、PageSchema 和历史，但最终 cutover 会断开旧实例；
3. “删除设备及数据”是不可恢复的 destructive delete。

手动 WiFi-only 设备详情始终只有一个“设备 Key / `bdk_`”卡片，提供显示/复制/刷新；同一 Key 用于首次烧录
和全擦后的重新接入。BLE profile 不显示 raw ManualDeviceKey，而由登录 App + 当前 secure setup session 创建
recovery intent 并 exact relay Recovery wire。旧实例在线时 UI 明示“最终 Claim 提交后旧设备会断开”，并
要求 owner 确认；离线时 Education 手动档允许同一 Key 自动恢复。

用户换电脑但设备仍有 Active storage 时，可以省略 Key或从页面再次复制；设备继续凭 OwnershipRecord +
CloudCredential 上线。Key 刷新只让旧 Key 无法开始新 bootstrap，不让已上线设备掉线。成功必须等所选
profile 的 Ownership/Cloud/Controller readiness，而不是 RecoveryCommitAck。新 Manifest 与旧 PageSchema
不兼容的 binding 标记 disabled/needs-review，不自动删除组件、页面或历史。

## 7. App 状态模型

~~~text
V2DeviceSummary
  identity: physicalId/logicalId/securityLevel
  ownership: unclaimed/pending/active/resetPending/revoked
  network: unknown/staged/connected/failed
  cloudCredential: absent/pending/active/revoked
  cloudConnection: offline/sessionReady/mqttOnline
  controller: absent/pending/active/revoked
  ble: notDiscovered/provisioning/directReady/connected
  manifestFingerprint/revision
  stateLanes[direct|cloud]: sessionEpoch/stateRevision/freshness/observedAt
~~~

Reducer 必须按 server/device signed result 推进 durable 状态。BLE link、HTTP 200、WiFi 测试成功、MQTT
credential issued 都只是各自维度，不得设置全局 `deviceActive=true`。

设备内部 112 B `BOS2` 是 `state/generation/logicalDeviceId/receiptFingerprint` 的 flash ABI，不是 App
协议或缓存格式。Claim Pending 时 App 只搬运 exact receipt；Gateway commit 后 App 保存公开 ownership
summary。设备 reset 后返回 Unclaimed/nextGeneration 时，App 不得以本地旧 logicalDeviceId 或 receipt cache
恢复 Active，而应等待新的 server-authorized Claim。

## 8. PageSchema 与设备状态

配网完成后仍沿用统一 Property/Action/Event：

- 设备 Manifest 描述能力，不描述 Button/Switch/Slider/Text；
- App 拖拽编辑器、模板和 Agent 都生成同一个 PageSchema；
- PageSchema 绑定 stable key，session Field ID 只放当前连接 cache；
- State snapshot 分页完整 staging/校验后一次发布；PATCH Report 原子更新 normalized state，再合并一次
  renderer transaction；
- Direct BLE 与 cloud 保留独立 source lane；renderer 按明确 source policy 选择完整快照，不能跨 lane 比较
  revision 或把分页中的临时值写入统一 UI；
- 设备不得下发任意 JS/CSS。WidgetRegistry/renderer 是 App 受信代码或签名资源。

## 9. 模块建议

~~~text
src/app/device-v2/onboarding/
  discovery
  enrollment-key
  enrollment-ticket
  secure-local-session
  ownership-claim-relay
  wifi-provisioning
  controller-enrollment
  reset-transfer
  reducer

src/app/device-v2/protocol/
  restricted-cbor
  enrollment-messages
  bbp2-frame
  ble-fragment
  manifest-state-staging

src/app/device-v2/model/
  identity
  manifest
  normalized-state
  page-schema
  widget-registry
~~~

V2 coordinator 不直接调用 legacy authKey/TLV service。共享底层 BLE adapter 时也必须在 mode/codec 层明确
分流，不能逐包 sniff。

## 10. 安全与隐私要求

- ManualDeviceKey/Ticket、WiFi、controller secret、MQTT token 不进入日志、Redux/devtools persistence、
  analytics、Sentry breadcrumb、剪贴板或截图缓存；
- ControllerCredential 使用 iOS Keychain/Android Keystore，删除 App/退出账号时按产品策略撤销或保留；
- server receipt/grant 验签失败、setupSessionId/physical ID/controllerId/secret digest/permissions 不匹配时 fail closed；
- Ticket 过期后清除内存并重新请求，不重用旧 Ticket；
- App relay 无权改写设备 proof 或 server receipt，也不能本地签发 ownership；
- Legacy 与 V2 的 cache key、storage namespace、analytics event 和 feature flag 分开。

## 11. 实施顺序与门禁

### Ownership Claim v1 已冻结的 App 输入（2026-08-16）

- 使用共享 `ownership_claim_golden_vectors.properties` 实现 strict codec；request/grant/receipt/commit 数字 key 不允许扩展或重排。
- Scanner/setup reducer 生成的外围状态负责 EnrollmentTicket、用户 JWT 与 setup session；这些值不写进 OwnershipClaimRequest，也不持久化为设备登录 key。
- App relay 必须保存/转发 exact grant bytes，不能把 grant 解码后重建 CBOR，也不能用 `bound=true` 替代 device receipt。Gateway 提交后返回的 signed CommitAck 同样按 exact bytes relay；空 204/普通 2xx 不能让设备清 Claim journal。
- receipt 本身没有 bearer proof。App 向 Gateway commit 时必须仍有用户登录态并关联原 claim/setup transaction；Education 档 UI 不得把它描述成硬件真实性证明。
- App kill 后可从非 secret transaction metadata 恢复并向 Gateway 请求同一 exact grant；Ticket 过期只影响未完成的新授权，不影响已 Active 设备重启。
- Ownership 成功不等于 cloud online。WiFi-capable 继续独立 Cloud Credential Enrollment；BLE-only 继续 Controller Enrollment。

### Cloud Credential Enrollment v1 已冻结的 App 输入（2026-08-16）

- 使用共享 `cloud_credential_enrollment_golden_vectors.properties` 实现 exact relay；App reference 已锁定
  request/grant/receipt/commitAck 5 个 wire 值。canonical body 不允许 JSON 投影或 decode 后重建 CBOR。
- App 可见的 48 B `encryptedCredential` 是发给 Gateway pinned X25519 key 的 AES-256-GCM envelope；App
  不持有 cloud secret、device ephemeral private key 或 Gateway encryption private key，也不得把 ciphertext
  当作可展示/复制的“设备 Key”。
- Grant 到达只表示 Gateway 接受 Pending credential；设备 HMAC Receipt 成功后 Gateway 才 Active；设备
  验证 HMAC CommitAck 后才清 journal。UI 必须把 `ownership/cloudCredential/mqttOnline` 三个状态分开。
- App kill/restart 后只从 Gateway 查询非 secret transaction metadata 与首次保存的 exact Grant；不能要求设备
  重新生成 request/secret。相同 request ID 不同 digest 必须显示 conflict，而不是自动开始第二个事务。
- Plain/TLS 只改变承载层；即使 Plain，App 也只能转发 sealed request。TLS 不得静默降级，sealed envelope
  也不表示外围 EnrollmentTicket、用户 metadata 或流量模式已被隐藏。
- BLE-only/LocalBLE 没有 CloudCredential 时不显示错误；它们直接进入 Controller 路径。

### ManualDeviceKey + Device Recovery 正式输入（2026-08-17；codec/golden 待实现）

- 手动创建 API 先生成 AwaitingFirstClaim logical device/PageSchema，再生成固定 70 byte
  `bdk_<22-char-key-id>.<43-char-secret>`；设备详情长期提供 reveal/copy/rotate；
- reveal 响应 `no-store`，raw Key 不进 Redux persistence/localStorage/analytics/log。Gateway KMS 加密保存，
  WiFi-only 设备只发送 key id + key version + exact-body HMAC proof；
- 同一 Key 第一次返回预创建 logicalDeviceId 的 generation-1 Claim；Active logical device收到新 instance
  请求时进入独立 RecoveryGrant。App 不要求用户理解或替换另一种 RecoveryKey；
- 刷新 Key 原子推进 keyVersion。旧 Key 不能开始新事务，已 Bound exact transaction 只能在短 grace 内按
  transactionId/request digest 收口；Active 设备继续用 CloudCredential，不掉线；
- 旧实例仍 ProtocolReady 时，App 必须展示 replacement confirmation；离线时 Education policy 可允许同一
  Key 自动恢复，并生成 owner 可见安全事件；
- WiFi+BLE/BLE-only 不显示 raw ManualDeviceKey，继续使用 App JWT + secure setup context并 exact relay
  59/286/173/258 B Recovery Request/Grant/Receipt/CommitAck；
- Reducer 区分 `AwaitingFirstClaim / KeyCurrent / KeyRotated / RecoveryBound / RecoveryBaseReady /
  OwnershipPending / CredentialPending / Ready / Failed`；RecoveryBaseReady 不等于新实例在线；
- Claim commit 才以 N -> N+1 CAS 切换 relationship并撤销旧 Cloud/Controller/session。PageSchema/history/
  ACL/automation 保留，不兼容 binding 标记 needs-review；
- shared exact/invalid/proof fixture、App production codec 与 E2E 未完成前，本项是 R5-A1 阻断项。

### R4b-4a EnrollmentTicket App 执行边界

- provisional handshake 完成后，App 取完整 `setupTranscriptHash`；不能只绑定 BLE MAC、设备名或单侧
  ephemeral key；
- App 为本次 controller 生成独立 16 B ID 和 32 B secret，向 Gateway 只提交 secret digest。BLE-only
  operation mask 为 0，WiFi+BLE 为 CloudEnrollment bit0 + NetworkProvisioning bit1；
- Ticket exact bytes 只放当前 reducer/session 内存，禁止 AsyncStorage、剪贴板、analytics、崩溃日志和 UI
  明文展示；断开旧 setup session 后不能把旧 Ticket 带到新 transcript；
- 设备验 Ticket 前 App 不发送 WiFi candidate、Claim 或 Controller mutation。App 只 relay exact signed
  bytes，不 decode 后重编码；
- owner/product intent 由 JWT 与 Gateway ticketId 绑定，device wire 不携带账号文本或稳定 owner digest；
- Active 后删除 Ticket；正常重启、长期断网和 MQTT refresh 不重新配网。

R4b-4b 已冻结：普通 Arduino 使用 suite 1 `Noise_NN_25519_AESGCM_SHA256`，无需 SetupCode；增强型/
量产档才使用 suite 2 NNpsk0 和32 B高熵PSK。Service Data capability bit1/bit5互斥；同时存在、均不存在或
连接内请求切换 suite 都必须拒绝。普通NN第一条 handshake是 `e[32] || clear payload`，第二条才有16 B
AEAD tag，不能继续复用旧的“两条都至少48 B”解析器。

广播8 B `setupSessionLocator`只用于找到当前setup window；Ticket绑定的是16 B `setupSessionId`。App必须
从受保护application handshake取得完整ID，禁止补零、复制或hash locator冒充完整ID。在设备返回受保护的
Ticket accept前，不发送WiFi credential，也不把普通NN本身描述成已认证目标设备。

### R4b-4c/4d LocalSetup App 执行边界

- production codec 必须通过
  `D:\codes\blinker-library\tests\golden\local_setup_golden_vectors.properties`；reference TypeScript
  只用于互操作验证，不直接充当 scanner/reducer；
- HelloRequest 在 ordinary NN initiator handshake 的 clear payload 中，只含 version/type/requestId；
  HelloResponse 在 responder handshake 的受保护 payload 中，字段为 deviceInstanceId、完整 sessionId、
  locator、generation、`ticketOperations`。LocalSetup Hello 不携带 Manifest 或 PageSchema；
- request 严格串行，新的 ID 只能 `+1`；超时重发 exact bytes 与同一 ID。同 ID 不同 bytes 视为认证冲突，
  `CorrectSequence/Backoff/RestartSession` 分别进入修正序号、退避和重新握手路径；
- production codec 必须实现固定 operation 1..8：`BeginOwnershipClaim`、`ApplyOwnershipGrant`、
  `CompleteOwnershipClaim`、`InstallInitialController`、`ConfigureNetwork`、`BeginCloudEnrollment`、
  `ApplyCloudEnrollmentGrant`、`CompleteCloudEnrollment`。1..3 与 6..8 的嵌套 body 是既有 exact wire，
  App 不 decode 后重建；
- operation 4 不是旧 Controller Control grant。body 固定为
  `{0:1,1:controllerSecret(32 B bstr)}`，只在 Ticket 已绑定相同 controllerId/secret digest/permissions 的
  authenticated Noise session 中发送，raw secret 仅保留在 OS Keychain/Keystore 和短期受保护内存；
- operation 5 body 固定为
  `{0:1,1:ssid(bstr),2:authentication,3:credential(bstr),4:hidden(bool)}`，最大 110 B；成功响应固定为
  `{0:1,1:networkGeneration,2:CandidateStored(1)}`，最大 10 B。`CandidateStored` 不能投影成 Tested、
  Connected、CloudActive 或 Complete；
- operation 6..8 是 App 到 Gateway 的 exact Cloud relay。App 永远不解密 CloudCredential，不用 JSON/ORM
  重建 request/grant/receipt/commit ACK，也不能用普通 HTTP 2xx 代替 exact body；
- Gateway 已接受但未完成的同 generation saga，App 允许在新 Noise transcript 下获取绑定同一 durable
  ticketId/context 的新 signed Ticket 并恢复。Ticket bytes 与 transcript 可以更新，transaction identity
  不变；不得因 Ownership Active、App kill 或错误 WiFi 候选创建第二个 claim/device；
- 即使设备 saga 已到 Complete，只要当前 WiFi candidate 尚未 confirm，App 仍显示“修正网络”入口并允许
  operation 5 替换候选；confirm 后普通 setup Ticket 不再开放网络修改，后续改网走 NetworkProvisioningGrant。

1. 先接 LocalSetup 1..8、EnrollmentTicket、Ownership、Cloud exact golden 与 invalid vectors；
2. 实现 V2 scanner/model 和手动设备 ManualDeviceKey 显示/复制/刷新页面；
3. 实现 Ticket + protected BLE session + WiFi candidate store/异步连接/confirm，UI 严格区分三种状态；
4. 实现 Ownership relay、Cloud sealed exact relay/状态恢复与 per-controller Keychain；
5. 实现 BLE-only、Network Reset、Ownership Transfer；
6. 接 BBP/2 Manifest/State/PageSchema renderer；
7. 与 fake Gateway/device 做掉包、过期、重放、App kill/restart，再接真机。

退出门禁：App kill 后不泄露 Ticket/WiFi；同一 claim 能恢复且不重复创建设备；设备关机一个月重启无需
App；Network Reset 不丢 owner；BLE-only 不显示 cloud online；Legacy JSON/authKey 仍能独立工作。
