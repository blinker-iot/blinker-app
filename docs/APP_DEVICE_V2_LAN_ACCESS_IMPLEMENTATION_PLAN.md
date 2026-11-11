# App LAN接入：默认明文、可选加密与实施路径

> **2026-09-22 执行入口：[新进度与后续计划](../../blinker-library/docs/DEVICE_V2_NEXT_EXECUTION_PLAN.md) §6。** App LAN 默认关闭，既有缓存协商只接线 BLE；新任务合同不自动开放 LAN，也不继续抢占扩展。

> **2026-09-14 当前 C2 已完成，下一步 C3：** 原共享账号增权后云端/页面/LAN 就绪已真机；同 caller 15 秒租约自然到期后，原页面经现有 handover/pending/ACK 流程约 3.1 秒恢复，同一账户 MQTT 保持可用。App 无新增生产代码或重试器，9 文件 163/163；源码与现场 LAN 开关仍 false。服务修复同 scope 到期漏退休，未扩大 MCU 槽位。详细证据和未测边界见[唯一主线 §10](../../blinker-library/docs/DEVICE_V2_CORE_STABILITY_EXECUTION_PLAN.md#10-c2-已知恢复断点收口下一步-c32026-09-14)。以下旧“下一步”和新 caller/全平台 LAN 不自动执行。

**执行优先级见[核心稳定版唯一入口](../../blinker-library/docs/DEVICE_V2_CORE_STABILITY_EXECUTION_PLAN.md)。当前先首次配网恢复及基础矩阵，LAN 只定点修已有恢复问题；下方新 caller 抢占/全平台 LAN 的历史“下一包”不自动执行。**

最新 **B4-1 实际页面/共享 ACL（2026-09-13，优先于下方批次）**：修正 `DeviceV2Page.canControl` 以库存 `cloudReachable` 否决已鉴权 LAN 的旧分支，改为所选通道 ready＋fresh snapshot，保留原 scope/同步/可见/活动检查。ACL 仍在原发送路径执行，未新增 UI、MQTT、重试器或权限缓存。187/187、App/spec 类型、eslint、匹配 debug APK 通过。真实缩权＋故障延迟 Retire 时，页面云控 141/137 ms；LAN 8 次查询结束后不关闭页面，受限按钮得到真实云端拒绝。ACK 后 Observer LAN 恢复，写入先走既有逐组件云鉴权；首个 pending 退出 27 ms 回收且无后续本地工作。详见[设备 LAN §70.5](../../blinker-library/docs/DEVICE_V2_LAN_WEBSOCKET_DISCOVERY_IMPLEMENTATION_PLAN.md#705-b4-1-实际-acl延迟退休与页面原-mqtt-闭环2026-09-13)，保留首轮未开 Broker 跨片及增权 8 秒观察窗未 ready 的失败记录，不作切换 SLA 承诺。测试分享/owner/运行开关已收尾，源码 LAN 默认仍关；新 caller/换账号/到期竞争、通用产品矩阵未完成。

最新 **B4-1 真机修正（2026-09-13，优先于下方软件批次）**：生产拦截器会将原始 HTTP 错误转换为 `GatewayHttpError`，首轮因 API 仅识别原始类型而提前结束，虽然设备退休 ACK 已成功。仅在 API 边界兼容既有强类型的准确 HTTP 状态/错误码，connector 仍只消费独立准备错误；添加实际 interceptor→HttpClient→API 回归及负测，149/149、App/spec 类型/eslint/debug 构建通过。修正 APK 保留数据安装，真实 Observer→Control 3,025 ms 完成精确退休、新握手、Manifest/State；Property/Action 133～212 ms，提交后取消不重试、原 MQTT 控制及再次 LAN 恢复通过，资源已回收。下一包补真实 ACL 变化＋延迟 ACK/页面自动回云，不能用本轮内部只读子集准备和明确云 API 测试替代；新 caller/换账号/到期竞争、通用产品发布仍未过。完整证据/制品/未过项见[设备 LAN §70.4](../../blinker-library/docs/DEVICE_V2_LAN_WEBSOCKET_DISCOVERY_IMPLEMENTATION_PLAN.md#704-b4-1-匹配制品短真机与-http-边界修正2026-09-13)。源码 LAN 默认开关不变，没有 UI/原生插件/设备槽位修改。

最新 **B4-1（2026-09-13）**：同 caller/self scope 接替已接现有 connector/API，不改页面、账户 MQTT 或 native 插件。只对真实 HTTP 签发前 handover 等待旧连接清理，有限查询原 context，精确退休 ACK 就绪后同候选新 request/challenge 重握手一次；首次 context 待同步也可有限等待。8 次/1 秒准备查询受原 30 秒单调总预算约束，取消/账户/网络/身份/模式变化和清理失败终止，业务/未知 Action 不自动重试。8 文件 147 项、App/spec 类型及变更 eslint 通过；尚未安装本批 APK 或宣告真实接替通过。与 Service/设备的唯一边界、下一包及未处理新 caller/换账号见[设备 LAN §70](../../blinker-library/docs/DEVICE_V2_LAN_WEBSOCKET_DISCOVERY_IMPLEMENTATION_PLAN.md#70-b4-1-同-callerself-scope-接替2026-09-13)。LAN 默认开关不变。

最新 B2a 真机后续（2026-09-12）：已保留数据更新 debug APK，用真实 owner/原设备设置确认处理器完成 COM11 临时 WiFi 删除：202 pending、清展示 Key/刷新库存、重复查询 200；始终提示本地未确认。COM3 在同一个账户 MQTT 上完成 24 次 Property ACK 与真实 State，账号不重连、COM12 保留；见 [真机报告](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_HARDWARE_REPORT.md)。普通 WiFi 此主路径收口；BLE/网关本地 retirement 未开放，LAN 源码默认仍关闭，下一步按 B2b 而非新增连接/页面协议推进。

最新 B2a 补充（2026-09-12，同日后续）：普通 WiFi owner 删除已接通 V2 回执，App 严格核对 202/200 与 pending，清除设置页展示的 Key，提示“云端撤销/通信清理中”及“本地权限尚未确认清除”；BLE/网关未开放时展示明确 409 原因，不从页面假移除。删除旧 `UserService.delDevice`、`API.USER.DEL_DEVICE` 与 Legacy GET 回退，不新增 MQTT/本地连接或轮询。删除/设置页、用户服务、鉴权拦截器和分享服务 64 项通过、App 类型检查通过；未安装 APK/删除现场设备，LAN 开关不变。当前合同及下一批真机条件见 [B2 owner 移除方案](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_IMPLEMENTATION_PLAN.md)。

最新补充（2026-09-12，同日后续）：§57已补R4第二物理设备隔离；原App单账户MQTT同时服务LAN目标页面和另一WiFi见证，撤销前者不影响后者。R4本工作包收口，回到B1接入/B2 owner解绑→B3→B4。没有本批App生产/UI/APK改动；通知后台/冷启动、其余分享体验和全平台发布仍单列。下方旧日期的“下一步”保留为历史，当前顺序以[基础路线](../../blinker-library/docs/DEVICE_V2_BASELINE_CLOSURE_ROADMAP.md)为准。

当前入口（2026-09-11）：Service跨分片§31及[分享用户流程/执行合同](../../blinker-library/docs/DEVICE_V2_SHARING_USER_FLOW_AND_R3C_PLAN.md)。R3c公开分享一致性软件基线已收口，App已消费mutation当前状态/pending、默认viewer、去9人伪限制，重复邀请/领取有幂等保护。下一步完成统一链接/二维码/邀请预览与登录返回，再R4实际双账号LAN。源码LAN仍关；本批改App源码，未安装APK/部署/验证物理ACK。总顺序仍按[基础收口路线](../../blinker-library/docs/DEVICE_V2_BASELINE_CLOSURE_ROADMAP.md)，不扩Hub/S4。

历史现场（2026-09-10，GATT§10.143/本文§22）：Service首次需求准入与竞态已修；本机Gateway更新、shard0旧镜像对齐后，手机新真实账号ME200/MQTT及账户BBP ready，未共享目标403，原账号已恢复。receiver normal route0、目标normal route1，正式接受分享仍被真正跨分片限制拒绝；无grant，邀请已撤销。按设备库[LAN计划§44](../../blinker-library/docs/DEVICE_V2_LAN_WEBSOCKET_DISCOVERY_IMPLEMENTATION_PLAN.md)及Service§34.3先补内部跨shard合同，再真实LAN ACL/Retire门禁，最后Hub/S4。App本批无源码/UI/APK改动，单账户MQTT、10秒轮次/15秒候选及源码LAN关闭不变，P3未整体通过。

## 1. 已实现的模块边界

| 模块 | 唯一职责 | 不负责 |
| --- | --- | --- |
| `local-access/discovery.ts` | 唯一capacitor-mdns browser、公开提示校验/removed、自己的watch与listener清理 | 候选缓存、账户身份、判断在线 |
| `local-access/directory.ts` | 共享10秒轮次、16候选/读者上限、15秒缓存、替换/removed/最后读者清理 | 原生socket、Grant、MQTT、逻辑身份 |
| `local-access/native-link.ts` | 实现原LocalAccessMessageLink，精确native id、单发单收、abort/迟到清理 | Noise、MQTT、业务重试 |
| Android `lan/LocalDestination` | 私有IPv4字面量/同链路判断 | DNS、授权 |
| Android `lan/LocalWebSocketDraft` | 限制现有WS库的HTTP/raw frame准入、字节/片数/进度 | 自造WS编解码、密码 |
| Android `lan/LocalWebSocketSession` | 单socket与有界读写、原生期限/关闭 | 页面状态、账户身份 |
| Android `lan/BlinkerLocalWebSocketPlugin` | 当前WiFi Network绑定、前后台/换网/bridge owner清理 | 服务端签发、BBP权限 |
| 原`local-access/api.ts` / `client.ts` | HTTPS v2可信模式/exact Grant校验、预期instance校验、共同期限和收发清理 | 发现引擎、原生socket实现、BBP业务 |
| `local-access/records.ts` | 注入Plain HMAC握手/raw BBP或既有Noise/LocalSecureRecord处理 | 连接/队列、ACL、页面/路由、MQTT |
| `protocol/device-v2/direct-session.ts` / `direct-hello.ts` | BLE/LAN共享self BBP的Hello、Manifest/State、命令、ACK/通知 | Broker Route/Delivery、原生socket、BLE密钥操作 |
| `local-access/session.ts` | 安全open后Hello/Manifest/State，协商帧大小和单写入队列，返回ready候选 | 页面路由选择、账户MQTT、发现 |
| `local-access/connector.ts` | 身份→短时发现→link→self session；单native槽及准备/释放 | Angular、MQTT、页面/业务重试 |
| `services/device-v2-lan.service.ts` | Android组合、HTTPS/平台准入、账户/网络/前台代际及一次有界预热 | UI、设备持久目录、命令队列 |
| 原`DeviceUiPort.ConnectionGroup` | 页面owner共享LAN、准备与路由、状态/事件投影、最后页面退出清理 | 原生协议、签发、另建账户MQTT |

Android插件已注册，并由原DeviceUiPort页面owner按需调用；`deviceV2LanEnabled`在三个环境源码均默认false，§7已安装临时启用LAN的本机debug包，§8有实际Ready/Property证据，不是发布包。新native端口只支持Android；其他平台明确不可用，不静默回退浏览器WebSocket。
首批只准入当前默认WiFi、同子网私有IPv4、8920和`/bbp2`；不允许公网/域名/localhost/本机/广播/跨网段/VPN。
SRV和4项TXT只给候选；随机locator、IP、服务名不是logicalId/instance/MAC，不允许“扫描到第一个”就视为目标设备。

## 2. 数据与生命周期

- 每条原生WS HTTP头≤1024 B，binary单帧及重组≤420 B、最多16片；禁text/压缩/RSV/server mask/重定向/非canonical长度。
  raw头检查在上游解码前执行，避免解码丢失mask标记；解析/重组仍使用Java-WebSocket 1.6.0，不维护第二套codec。
- 单待发、单待收、单mailbox和一个待发Pong；无无限native→JS事件队列。慢消费者、未完成帧/分片、发送期限均3秒；open15秒、物理会话上限300秒。
- send Promise以实际socket写完为界，仍非BBP ACK；超时/不确定写不能自动换路重发。显式close、退后台、失去默认WiFi或link properties变化都关原socket。
- 原页面/账户/网络owner通过AbortSignal持有link；迟到close带旧id，不能关闭下一连接。close结果现逐层传播到共享session；native失败不得伪报物理释放。
  BBP直连核心不处理账户Broker的demand/Route/Delivery，也未新增LAN telemetry协议；由原业务owner处理后续路由与需求，不能混用两种Session。
- 原Manifest已有全局`usesCleartextTraffic=true`；此次只新增ACCESS_NETWORK_STATE，不新增该例外或mixed-content放宽。
  不能以局部native端口受限声称整个App全局cleartext已收口，须结合现有开发HTTP服务另做专项。

## 3. §10.126时的接线任务（历史快照）

第2～4项的源码接线与软件边界已由§6完成；本机可信HTTPS部署及手机↔MCU门禁仍未完成，当前后续顺序以§6.4为准。

1. Service本机HTTPS终止源码及真实TLS测试已修正；下一步部署时仍须受限backend、精确可信peer和Android认可的测试证书。
   不使用跳过证书验证或`isSecure=()=>true`，不能把未更新的旧TCP透传容器IP直接加入可信列表。
2. 页面/账户/网络scope持有短时发现与native link；目标instance必须来自当前账户可信设备记录，不来自TXT。
   组合 `NativeLocalAccessLink.open(...) → LocalAccessClient → openLocalDeviceSession(...)`；后者已包含安全open、加密Hello、Manifest/State校验。
   在所有await后核对scope/账户代际；不能使用账户`DeviceV2Session`替代共享self `DirectDeviceSession`（前者发Broker Route/Delivery）。
3. 保持**唯一账户MQTT常驻**。LAN准备阶段云端已ready则照常控制，LAN授权/Noise/BBP Ready成功后才升级路由；退出最后一个本地owner则断本地。
   不给每页/每子设备新建账户MQTT，不重新实现command ledger/Action自动重试，不为LAN增加第三套业务缓存。
4. scope集成测试覆盖退出页面、切账号、后台/杀进程、换网、超时与迟到完成；撤销/到期必须立即停止原通路，不把discovery可见当作认证ready。
5. 明确Hub/A/B板卡角色与隔离普通WiFi身份/恢复方案后，再ADB+MCU测Hello/Manifest/控制/ACK/State、MQTT并行、真实caller退休和Key刷新旧登录拒绝。

网关多目标、本机LAN远程路由、WiFi+BLE/其他MCU/IPv6不是首条self闭环前置。页面编辑器和UI不在本批修改范围。

## 4. §10.126已有验证与不可替代的门禁

- 本批`vitest run`：local-access、ble-direct、protocol/device-v2和connection-scope共250项通过，24个测试文件。
- 本批App/spec TypeScript、13个变更TS文件lint通过。
- 上批`:app:testDebugUnitTest`：16项通过，其中LAN8项为真实JVM loopback TCP；Android编译通过。本批未改Java/重编APK。
- 上批Service正式路由与隔离PostgreSQL28项通过；本批签发/载体24项回归、开发TLS代理4项真实TLS/socket测试通过，未重跑PG。

尚未安装APK或测试Android Network回调/实际mDNS/手机到MCU，因此不宣称LAN生产可用或无缝体验。
原运行服务、Hub/A/B身份/Key/拓扑均未改。后续按上节完成纵向接线，不用100次交替循环替代功能与资源验收。

## 5. §10.126共享核心收缩与安全边界

原BLE session中约400行业务实现迁入唯一`DirectDeviceSession`；BLE子类仅保留Controller/PresenceKey三个操作，删除旧副本及BLE专属FrameChannel接口名。
Hello编码也迁到协议层：BLE canonical字节不变、仍要求Method 2；LAN在Grant+Noise完成后显式选transport模式，发400 B/window1，不发Authenticate。
两者共用原Store实现，LAN不新增账户MQTT/页面cache/第三份业务状态机；§10.126时返回session仅为内部准备能力，§6已经由DeviceUiPort持有。

准备阶段Hello/同步15秒，协商后实际帧上限可低至SMALL的256 B；一个业务请求和一个通知ACK最多2个待发，底层LocalAccessClient仍单写。
测试覆盖错误Hello、损坏Manifest、超出协商大小、取消/迟到open、准备超时、ACK并发、原序号重传、不确定写和native关闭失败。
这些软件证据不能替代页面/账户/网络owner集成、真实mDNS身份匹配、手机证书信任或MCU无线门禁。

## 6. 页面owner与可信身份接线（GATT§10.127）

### 6.1 首次进入普通WiFi页面的实际调用顺序

1. 原`openConnection()`持有页面scope，马上开始原cloud `waitUntilReady`；账户MQTT原连接不停止、不按页新建。
2. 后台LAN组合调用HTTPS GET `/api/v2/devices/:id/local-access`获得可信self instance与权限。要求`local-access-context/1`、no-store、canonical非零16 B instance、permissions=1/3、期限1000～300000 ms；逐次检查账户代际。
3. 复用短时mDNS扫描，收到合法候选立即连接，不等10秒结束；候选名称/IP/locator只作发现。预期instance只来自GET，与设备Challenge对比后才POST签发。
4. `LocalAccessClient`做Grant+Noise，`openLocalDeviceSession`做加密Hello/verified Manifest/fresh State；全部完成且原页面/账户/网络仍有效才将LAN设为首选。
5. 原UI命令、状态、事件接口保持不变。LAN准备失败不阻断已可用cloud；确定选择LAN后失败的命令不会向cloud重发，下次显式操作可走cloud。

GET复用Service原实时ACL、authority/Key/exactACK屏障，不创建授权、解密DeviceKey或缓存PSK；POST重新检查最新权限，GET不是离线永久授权。
全设备operator为3，viewer/组件限定operator为1；后两种分享的写请求在发送之前就走原cloud ACL，不扩大成整机本地Control。

### 6.2 生命周期和资源边界

- 一个App一个native LAN槽，无每设备socket池/第二套调度器；每页面组一次准备。最多16候选/10秒扫描、4次不同instance尝试、30秒总准备；只有签发前instance不符可换下一候选。
- 多页面共享当前session，退出最后页面、后台、删除设备或切账号关闭本地。网络代际事件立即失效旧owner，包括WiFi→WiFi但connected未改变；IP不跨代持久缓存。
- 每层取消继续等待精确native清理；失败不伪报释放/再开socket。mDNS unwatch或监听器移除失败保留占用，普通发现失败且清理成功不永久锁死。
- 页面State/Event仅选当前通路；verified Manifest发生变化时写原账户缓存，退休/晚到结果不能写入新账户。缓存不是在线状态或业务执行证据。
- 被动列表、一次性读取不启动LAN。Telemetry仍走原账户云租约；LAN安全会话最长300秒，本轮不实现自动无空档续期/多目标/IPv6/其他平台。

### 6.3 软件门禁与当前限制

新增测试覆盖并行cloud准备、ready后升级、最后页面清理、账户/后台/删除/网络代际失效、迟到完成丢弃、命令未知结果不重发、Observe-only写路由、State/Event/Manifest缓存和原生释放失败。
Service本机专项17项、隔离真实PG/正式路由30项通过，包含GET不解密Key/不创建授权行；无线/手机证书仍须单独验证。
扩大回归需走项目`ng test --configuration=ci --watch=false`，因为旧测试依赖Angular JIT/浏览器存储；直接Node/Vitest不能代表完整门禁。
本轮将Vitest工作进程上限限制为2，保留isolate，避免Windows大量fork同时启动超时；新测试不用Angular不支持的relative-import vi.mock。
最终项目`ng test`：51个文件、507项全部通过，无skip/未处理错误；包含LAN、原BLE、账户协议、网关路由及两个设备页面。
App/spec TypeScript与变更TS/lint通过。首次裸Node运行缺浏览器/JIT环境、首次Angular运行多fork超时和测试mock不兼容的结果不作为通过证据；已按上述配置修正重跑。
未修改Java/设备固件，未重新安装APK或改变Hub/A/B的Key/身份/拓扑；没有暂存、提交或推送。

### 6.4 下一批部署及真机顺序

1. Service先处理公开HTTP backend映射、更新真正终止HTTPS的代理、精确可信peer与手机认可且SAN正确的证书。禁止跳过验证或用HTTP获取LAN材料。
2. 验证实际GET/POST/no-store与明文/伪造头负测后，只在本地测试环境开启App/Service开关，构建并安装APK。
3. 核对三块板角色并备份选定测试板应用/NVS，使用隔离普通WiFi身份跑mDNS→Grant/Noise→Hello/Manifest→Property+Action/ACK/State，同时确认账户MQTT不断开。
4. 测页面退出/后台/换网、真实授权撤销/到期断流和Key刷新旧登录拒绝，记录栈/heap/延迟。先闭合此self切片，再进入WiFi+BLE/Hub多目标与S4暖切换。

新网络SSID“带翅膀的蜗牛”；密码只入ignored临时配置，不写示例/文档。当前尚无LAN无线业务通过、无缝体验或正式发布的声明。

## 7. 可信调试APK与真实鉴权入口修复（GATT§10.128）

- 增加可选仓外`BLINKER_DEBUG_NETWORK_CONFIG_DIR`，只注入debug manifest/resources；本机证书仅信任指定开发authority域名/IP，release合并清单不含networkSecurityConfig。
  开发CA不提交、不过全局用户CA、不关闭TLS验证，不开放全局cleartext；机制参考[Android Network Security Configuration](https://developer.android.com/privacy-and-security/security-config)。
- HTTPS origin的App通过USB reverse连接本地HTTPS/WSS，设备8920 WebSocket仍使用Android绑定的真实WiFi，不经USB转发。
  这是第一条LAN门禁的云端bootstrap环境，不是手机离USB/外网生产部署证据。只有本次debug APK临时启用LAN；源码local/default/prod均已恢复/保持false。
- 真机发现GET/POST local-access不在`isGatewayUrl`鉴权白名单，原API单测使用mock HttpClient而未覆盖真实拦截器，导致401。
  加入统一`API.DEVICE_V2.LOCAL_ACCESS(id)`，删除调用层重复拼路径，复用原Bearer/刷新/请求ID；新增GET/POST认证及外部主机/本地WS不泄漏Bearer测试。
- 修复后真实GET从未上线409进展到设备同步后200且`private, no-store`；非法POST400。没有成功签发POST证据，不能声称Noise已经完成。
- 原用户会话保留，创建独立普通WiFi `LAN Self 20260909`；App云端同步得到power/buttonPresses/button能力与初始状态。
  ESP32修正dual-stack v4-mapped准入后，真实mDNS发现→native WS打开成功，但首个Challenge receive仍15秒超时，LAN未被选为首选，没有发送Property/Action。
  有界门禁复用DeviceUiPort页面owner，记录同一个账户MQTT session贯穿本地准备；不是UI点击全流程或无缝完成证据。
- App7文件95项、App TypeScript/本批lint通过；Debug APK/Release manifest任务和Android/JVM16项通过。首次旧URL mock的2项失败修复后已全量重跑这95项。
  设备侧Host Debug/ASan及SDK3.3.11通过，Service TLS/WSS真实socket5项通过。此前507项为上一批证据。
- COM12已经恢复原固件/NVS，App调试包和本机部署保留供后续；原页面布局、Hub/子设备拓扑不改，无暂存/提交/推送。

以上为§7当批后续快照，首包/SDK缺陷已按§8处理，当前顺序由§8及设备LAN§29替代。

## 8. 默认明文修订、实际LAN Ready与待执行工作（GATT§10.129）

### 8.1 本批事实

设备适配修复HTTPD不再回调GET及空payload GCM指针后，当前debug APK已完成实际mDNS/native WS、HTTPS Grant、Noise、Hello/verified Manifest/fresh State；原DeviceUiPort选择LAN，用原账户MQTT持续ready。
本轮观察page open→LAN约3.8秒，包含发现/云授权和同步；不是控制ACK分位或无缝承诺。`power=true`真实LAN ACK/State及MCU执行日志通过。
门禁脚本向无参`BLINKER_ACTION(button)`误传1，codec按Manifest Null类型拒绝发送，脚本已改null，尚未再次真机验证Action。不能放松生产codec类型检查迁就测试；下次先校验fixture与真实Manifest，再发一次命令，未知结果不跨路重发。
页面关闭成功，账户MQTT未换；手机到MCU走真实WiFi，HTTPS/账户WSS仍走原USB reverse开发环境。设备已恢复原应用及测试前NVS/OTA，未改App UI布局、原设备拓扑或Key。
本轮未改App生产TS/Java，未重建APK；§7的95项App和16项JVM是已有证据，不冒充本轮重跑。

### 8.2 新策略与模块归属

- **LAN业务默认明文，可显式要求加密；当前Plain尚未编码/发布。** App依可信设备能力、用户策略与服务器授权确定模式，mDNS/IP/MAC只是候选线索，不能授权控制或要求降级。
- 复用原native WS、connection/page/account/network owner、DirectDeviceSession、Manifest/State缓存及command队列。将模式差异留在byte session/记录处理，不给普通WiFi/WiFi+BLE/Hub各造客户端，不另建账户MQTT。
- 明文不等于无鉴权。优先复用有限Grant及HMAC挑战证明而不加密业务帧，具体证明、模式绑定与互操作版本随设备LAN§29 P0冻结；未完成之前不得跳过Noise并伪报已认证。短期秘密仍经HTTPS获取、仅内存使用，不发送长期DeviceKey/账户Bearer到设备WS。
- 明文模式不保证防监听、防业务帧篡改；会话认证不能阻止恶意链路中继/已建立连接注入。敏感场景应要求加密，不用序号、hash或WS mask当安全保护。当前加密模块继续可选复用，要求加密时失败关闭，不自动落到Plain。
- 保留当前原生端口私网/接口/期限/大小限制；不用全局WebView cleartext放宽来实现模式切换。其他平台未适配时明确不支持；页面无需新增配置对象或不同MCU写法。

### 8.3 执行顺序

1. 与设备/Service共同冻结Plain鉴权和显式模式合同，补模式冲突、错误实例、授权过期/撤销与降级负测；不临时复制`local-access/1`或改变已有PSK字段含义。
2. 对原会话组合注入Plain/Encrypted的最小byte session，业务核心和原路由选择保持一份；有限授权回收、快速退出/重开需明确，不增加第二个全局socket池。
3. 真实普通WiFi先验默认Plain的Hello/Manifest/Property/无参Action/ACK/State、页面退出/重开、MQTT并行、权限退休，再用同一门禁补可选加密回归。未Ready期间继续用既有Cloud；在途未知Action不能靠Cloud重发。
4. 首条self闭环与资源边界通过后再扩WiFi+BLE/Hub子目标及S4暖切换，不恢复100轮交替，不扩页面编辑器或新的telemetry协议。

## 9. P0三端Plain合同与P2接线边界（GATT§10.130）

### 9.1 本批实现与验证

- `protocol/device-v2/local-access.ts`扩展原securityProfile：1仍为Noise，2为PlainHmacSha256；Challenge/Grant外层version及字段数不变，未知profile继续拒绝。
- 原codec增加37 B canonical CBOR caller/recipient proof，方向分别8/9；通过注入只含`hmac`的接口计算证明，不在协议层导入BLE/Noise客户端或复制密码实现。设备库golden覆盖双方证明、错方向/反射、截断/非canonical及profile边界。
- 当前`local-access/1 + noisePsk`消费API、Noise client在请求HTTP前拒绝Plain Challenge，HTTP响应Grant还必须匹配Challenge profile。不能由于通用codec接受2就把它当原Noise连接消费。
- Angular项目原测试入口的local-access目录：**6文件70项全部通过**；App/spec TypeScript和本批5个TS文件eslint通过。使用仓库配置运行，不用裸Node导入Angular服务冒充测试。
- 未修改页面UI/native socket、构建安装APK或改测试身份；本批不是Plain手机互操作证据。三个环境LAN开关仍关闭；§8已有加密手机证据不抵扣Plain。

### 9.2 下一批最小接线顺序

1. 与Service先接可信模式能力/策略和原HTTPS `local-access/2 + sessionKey`合同；值必须绑定已证明的recipient instance/Key/authority，不能靠mDNS或未鉴权Challenge自行决定。要求加密不能自动尝试Plain。
2. 在原byte client拆出最小Plain/Noise会话策略：共同保留Challenge→Grant校验→有限期限/owner→业务byte stream；只替换握手与记录encode/decode，不复制DirectDeviceSession、manifest/cache、command/ACK和路由选择。
3. Plain验证recipient证明后才ready，清sessionKey/临时证明；业务直接BBP，不加逐帧包装。通过HTTPS取得的临时sessionKey不进本地持久化、日志、LAN消息。仅握手鉴权不能保证后续帧保密/完整性，风险说明见设备LAN§30.1。
4. 原HTTP接口演进完成后删除真正被替代的内部noisePsk专用合同/兼容壳；不是保留两个永久签发API。接线前不提前删仍工作且有实测的加密客户端。
5. 同时回归旧加密、Plain、禁止跨profile、过期/撤销、账户/网络代际、退出/快速重开与单槽授权容量；维持唯一账户MQTT，不跨路径重发结果未知Action。随后真实普通WiFi验Property/无参Action/ACK/State与Cloud并行，再推广其他产品。

## 10. P2统一会话与同账户有限授权重开（GATT§10.131）

### 10.1 已完成接线

- GET原URL读取`local-access-context/2`，取得Service依据当前DeviceKey/proof签名Progress声明的profile及实例；模式未知或未通过精确ACK ready不能打开LAN。mDNS的plain/noise只作候选，不做模式授权；错误实例可关闭后尝试另一个有界候选，匹配实例的错误模式必须失败，禁止加密失败自动Plain。
- POST原六项加`contract:'local-access/2'`，统一读取`exactGrant/sessionKey/validForMillis`，精确比对profile、实例/Key、挑战、caller、target、权限/期限。旧v1 HTTP合同明确拒绝；已删除被替代的noisePsk字段消费，不维护两个客户端。
- `LocalAccessRecords`仅负责握手和bytes转换：Plain 37 B双向证明后raw BBP、Noise复用既有密码核心。`LocalAccessClient`保留唯一socket、15秒握手、400 B业务帧、单发单收、取消/迟到清理和绝对期限。晚到crypto结果清理后不能发送，错误写入退役本连接，不能换通道重发Action。
- 上层继续使用DirectDeviceSession、Hello/Manifest/State、command/ACK、DeviceUiPort的page/account/network owner与一个账户MQTT。没有改页面布局、native socket或生成每模式的连接池；Plain没有逐帧完整性/保密保护，风险与敏感操作边界不变。

### 10.2 页面退出与快速重开

原connector每次开页新建caller ID，可能产生新的authorization并用尽设备单槽。现由`DeviceV2LanService`在同accountId/authority/sessionEpoch内生成一次16 B公开caller ID，connector接收快照；退出/换网后同账户再开可复用。每次连接仍用新request ID、设备fresh challenge与Grant；不缓存sessionKey、IP或native连接，不增加设备ledger容量。

Service同caller/scope复用原有限authorization。`validForMillis`为原截止时间的剩余量，App从HTTP请求开始的单调时刻扣减已耗时间；页面重开不能重置300秒。设备仍负责自己的原始有限期限/撤权。App进程终止、新账户或新权限scope可能在旧授权退休/过期前遇到单槽拒绝，尚未实测解决；不是所有重连均已无缝。未Ready时原Cloud可用，已发命令的未知结果不能自动重放。

### 10.3 验证和后续

本批Angular正式测试入口 **7文件88项通过**，App/spec TypeScript与LAN文件及service的eslint通过。涵盖两种记录、错误模式/实例、旧合同拒绝、材料清理、发送终态失败、延迟timer、账户/网络代际、重开caller及剩余期限。没有把mock测试称为手机互操作。

本批未构建/安装APK、修改原生/页面、改设备绑定或部署服务；三个环境源码LAN开关仍false，手机上此前加密debug包不是本批新合同客户端。下一批须与Service migration030/新协议包和设备v2 Progress声明配套更新，先普通WiFi Plain的真实Property、无参Action(null)/ACK/State、退出/重开/到期及原账户MQTT并行；再同脚本Noise。新caller单槽回收和真实延迟必须单独记录，首个self闭环前不扩Hub child或100轮。

## 11. P3默认Plain真机证据与性能阻碍（GATT§10.132）

### 11.1 本轮已完成

本地debug APK已重新构建安装，使用原仅debug信任的CA与USB reverse HTTPS/WSS；登录态保留，手机→COM12实际经WiFi WebSocket。源码临时local配置在构建后恢复LAN=false/原本地URL，不改页面或原生实现，不把临时测试入口开放成发布配置。

真实context由设备声明前503 PROFILE_REQUIRED转为签名模式/ACK就绪后的200 context/2/profile2，证明没有仅信mDNS。5次有界开页均完成Plain双向37 B证明、Hello、verified Manifest及fresh State。3组Property和无参Action(null)获得LAN ACK，计数1→2→3；门禁逐命令验证LAN Control权限，避免把Observe-only的Cloud写入算成LAN。

同一账户caller ID在重开时复用，真实服务器authorization及绝对expires_at不变，未增加设备槽。剩余有限期限内重开后能观察到LAN收取结束、回Cloud，未从新连接开始给满300秒；未独立区分App/MCU各自的期限拒发，手机/服务器墙钟也未对齐。全过程同一个账户MQTT保持ready。

门禁工具首两次open的CDP对象返回失败不等于App操作失败；检查已有checkpoint后继续，无盲目重开/重发。改用JSON限定快照后后续四种操作返回正常；保留跨open的账户session基准及每命令ACK耗时。临时trace仅记录长度、时间及Plain BBP公开头，不记录Key、Grant或业务值，结束恢复原hook并关闭页面。

### 11.2 不可据此宣称无缝

首开LAN Ready约4.49秒、后续约3.5～4.0秒。StatePage收取后至Ready仍约2秒，后续须分段量测mDNS停止/owner清理；不能直接删清理步骤或提前释放仍占用的资源。

状态发生变化的命令ACK约1.09～1.25秒；值未变、无Patch时约112/177 ms。真实帧显示Action序号6先产生Patch，再在约1秒后重发同序号6才收到ACK；设备只执行一次。设备源码先settle并fan-out状态，单发送槽被Patch占用，ACK遇到WouldBlock后依赖可靠重传，根因见设备LAN§32.3。当前App同连接同帧重传为安全兜底，不是新的业务Action，也未跨Cloud重发。

下一批先由公共Runtime处理有界待补发ACK，保留去重/关联/原结果和动态鉴权，再复测原App默认重试间隔下的控制延迟。此后才测精确撤权/Key刷新、新caller单槽、Noise及发现清理性能；不先优化UI、扩Hub协议或跑100轮。App源码本批没有业务改动；debug/Android构建与真实操作是本批证据，§10的88项不是本批重跑。

## 12. P3设备ACK修复后的手机复测与发现退休准入（GATT§10.133）

本轮只修改设备公共Runtime，复用§11已安装debug APK/Service，以真实page port和Android native WebSocket完成Plain复测，没有修改App业务、UI、1000 ms重试间隔或重新安装APK。3组power/button ACK分别163/147、185/130、120/149 ms；每组两个Command序号各只发一次，Action计数1→2→3，verified Manifest/fresh State正常，账户MQTT保持同一session且ready。与§11相比，正常状态变化不再需要等一秒重传；这些是短样本，不是性能分位或无缝完成声明。

开页仍需3791/3537/3514 ms。另一次只开页、不下发控制的同手机分段证据：session开始至返回344 ms（含Plain握手及BBP同步）；随后1 ms触发扫描abort；scan promise再经过**2031 ms**才返回，之后5 ms发布LAN Ready。现能确认等待在扫描退休阶段，不再仅凭约2秒猜测；尚未分别测量native unwatch和listener.remove，不能直接断言某个函数独占全部耗时。

下一批优先处理`local-access/connector.ts`成功同步后`scanning.abort(); await scan`与发现清理的职责边界。当前discovery finally等待unwatch和listener移除；安装的capacitor-mdns Android最后一个浏览者释放共享JmDNS时同步close，是待进一步测量的下层调用链。插件维护源码在`D:/codes/capacitor-mdns`，不得直接以修改node_modules作为发布修正。

实施约束：

1. 分开定义“停止接受发现结果”“已鉴权WebSocket可用”“native资源完全退休”；评估保留原owner的后台扫描退休，避免连接就绪等待JmDNS关闭，但不能简单删await/忽略rejection。
2. 页面close必须汇合session与scan退休；网络/账户代际变化不得发布迟到Ready，cleanup失败仍禁止二次native open。不能用长期占用mDNS/socket、跳过设备challenge或缓存旧Grant降低数字。
3. 先补延迟清理、退出/取消、cleanup失败、网络/账号变化与快速重开回归，再手机复测。原账户MQTT保持独立，未知命令不可跨lane重放。
4. 精确到期/ACL撤销/Key刷新、新caller槽恢复、Noise及其他产品仍待验证；本批不增加协议或100轮长测。设备Host撤权回归不能替代真正App/Service撤权门禁。

完整软件/资源/真机证据见设备LAN§33。本轮未重跑App88项或Service历史测试，未改绑定或部署；结束关闭gate/trace hook并恢复COM12原应用与NVS。主线仍P3。

## 13. P3扫描退休/Ready解耦的软件完成与真机阻碍（GATT§10.134）

### 13.1 本轮实际修改

只修改`local-access/connector.ts`及其回归，不增加用户API、协议字段、native插件、页面或账户MQTT职责。成功路径依然要求context、exact实例Challenge、Grant、Plain/Noise与Hello/verified Manifest/fresh State全部通过，owner有效且session ready；发现仅提供候选，完成鉴权后不再等待mDNS清理才返回连接。

connector在byte link外组合幂等关闭屏障：send/receive原样委托，close立即启动native关闭，并等待扫描退休；全部成功后才允许释放单一connector槽。采用allSettled，native先失败也不能跳过扫描退休。匹配前关闭候选不终止整场扫描；匹配后后台scan出错会abort原lifetime。确认已清理的普通发现错误可在退休后重新打开，真正cleanup失败仍保持BUSY。

新增检查禁止将owner转交给“native close已开始、但BBP receive-loop尚未更新closed状态”的link。旧成功分支串行`await scan`已删除，其清理责任并未删除，而是归入已建立连接的close屏障；失败准备路径同样汇合两个资源。

注意：页面scope.closed只是需求取消；真实资源退休以精确session.close及connector槽为准。清理期间二次open仍BUSY，没有扩展排队/自动重试；原Cloud可用不代表任意快速重开都立即回到LAN。

### 13.2 验证与现场

旧实现下“扫描清理延迟但连接应已Ready”回归失败，新实现通过。connector14项，连同LocalAccess各层、LAN service、DeviceUi LAN，正式Angular入口**8文件106项全部通过**；App/spec TypeScript和修改文件eslint通过。涵盖延迟清理期间Ready、close汇合、取消、扫描/原生清理失败、迟到身份代际、关闭中的link以及原匹配/禁止重试语义。

local web与debug APK已构建、安装，App当前`/home/device`，登录态保留。构建使用原debug私有CA与HTTPS USB reverse；源码临时local配置已恢复LAN=false及原URL，release无测试CA。前一APK保存在设备ignored证据目录`scan-App-before.apk`，本轮没有修改插件仓库或node_modules来修行为。

真机准备使用§12同一设备门禁binary，但Docker引擎未运行；尝试启动时后台报dockerInference IPC文件无法访问并退出。App Cloud为retrying，设备WiFi在线但仍starting，故没有发起有效的本轮LAN授权/控制，**不能报告新App的实测延迟收益**。§12的344/2031 ms和120～185 ms都是上一批证据。已请求Quit后重开Docker，禁止恢复出厂；设备COM12已恢复原应用/NVS/OTA并校验，其他板和绑定不变。

### 13.3 下一批

恢复原测试服务后，先核对Cloud ready与隔离设备登录，再用已安装APK做有界分段测试：Ready后立刻在scan尚未结束时下发一组Property/Action并得到ACK；另外在清理期间取消，等待精确session.close、确认槽退休，再重开。对比同手机时间轴，不跨手机/服务器墙钟相减；不更改重试间隔或自动重放不确定Action。

此后才是精确到期、真实ACL/Key、新caller与Noise等P3剩余项；不跑100轮、不扩Hub/S4。执行依据同步到设备LAN§34。未暂存/提交/推送。

## 14. P3生命周期修正的Android真机验收（GATT§10.135）

Docker恢复后沿用原测试服务、签入App及同一ACK修复固件；未修改生产源码、插件、协议或页面。HTTP context/2实返200/profile2/private-no-store，随后真实Android native WebSocket完成Grant、Plain、Hello、verified Manifest和fresh State，不用模拟端口或Cloud命令代替LAN。

- 前三次开页到LAN Ready为1660/1437/1603 ms；session准备313/317/365 ms，返回后4～5 ms即可Ready。扫描退休仍需2029～2032 ms，但已离开就绪关键路径。
- 两组Property/Action ACK分别135/87与38/136 ms，完成时scan均未返回，距退出还有1744/1797 ms。Command各只发一次；Action计数1→2，没有重传或重执行。所有控制均在LAN，原账户MQTT仍为同一ready session。
- 第二次Ready后立即取消：native close在6 ms开始、18 ms返回；精确session.close等到2001 ms、scan完成后释放槽。其后重开并控制成功。页面scope.closed仍不等于该屏障；快速重开BUSY策略没有删除或改成连接池。
- 第四次开页验证App精确期限：只延长私有测试页面watchdog，不改授权/timer/时钟。沿原授权剩余145343.4 ms等待，期限后3.4 ms开始close、37.0 ms完成session退休，页面尚未退出，槽释放、路由回Cloud且原账户MQTT不变。已过期LAN session的只读refresh拒绝、新发送数0。

这确认原生清理在后台继续时可以真正通信，而非只提前UI状态。数据是短程样本；扫描仍占单槽直到完整退休，不能宣称任意快速重开都无缝。App主动到期关闭不证明MCU独立到期拒绝。到期后补发新Cloud控制的准备被测试页面watchdog挡在发送前，未执行、未重试，故仍未取得该业务ACK证据。

正式Angular入口8文件106项重跑通过；设备架构和三仓diff检查通过。本批无新MCU编译、Host/ASan或Service历史测试。结束恢复COM12原应用/NVS/OTA并hash验证；gate、trace、临时close观察hook均恢复，其他开发板、绑定、Key/ACL不变。debug APK保留、源码LAN开关仍关闭，未暂存/提交/推送。

下一批按设备LAN§35：先MCU独立到期拒绝及新Cloud意图的ACK，再真实撤权/Key、新caller和Noise。不要为了进一步降低Ready数字先扩永久mDNS、缓存Grant、额外socket或UI重试队列。

## 15. 接收端期限对照、Cloud新命令和前台预发现设计（GATT§10.136）

### 15.1 本轮实测完成

Android原生WS有300秒硬期限，不能只停JS的300秒timer就宣称验证MCU。改用正式HTTPS合同签发30/15秒Grant，前两组仅在隔离debug会话停用JS主动timer，保留逐操作检查、原生/设备限制；第三组保留正常timer。产品源码与签发策略没有改变。

前两组实际完成LAN同步和读取，随后底层在Grant发送返回后约30066/15439 ms关闭，首次client close已有底层失败、页面未退出；第三组则是App在自身期限后3.7 ms主动关闭。网络观察时间不是MCU准入时钟，不能把差值当设备硬实时误差。三组旧LAN refresh拒绝且没有新发送、槽完全退休；随后**新**Cloud power命令ACK为165.7/158.6/158.8 ms，状态false/true/false，原账户MQTT不变，无Action重放。

15秒组使用正式签发的新随机caller，等旧期限和15秒challenge墓碑窗口结束后正常复用单槽；不代表第二真实账户分享或Key/ACL变更后的恢复已验证。私有timer/close/session/trace hook均恢复；COM12原固件与NVS/OTA恢复且hash通过，其他板未改。

本批3组x64 Host/ASan及19项Service专项、架构检查通过；没有重跑§14的App106项或重新构建APK/设备。证据统一见设备LAN§36，未暂存/提交/推送。

### 15.2 对“首页就扫描以降低Ready”的修订

当前确实是开页后扫描。新分段测得首候选等待865～968 ms、native open206～302 ms、鉴权/同步681～842 ms；本轮冷开页约2.0～2.2秒，旧约1.5秒不是稳定上界。预发现能减少候选等待，不能消除建立连接及鉴权/同步。

采用前台共享mDNS候选目录、开页按需建连的方向，不提前为每个设备占socket。保留现有纯发现/安全/BBP分层：目录拥有唯一browser及其退休，页面只拥有自己的订阅和native会话；页面退出不能关闭其他前台消费者仍在使用的browser。当前重复watch会替换、LocalLanDiscovery是独占scan，因此**先统一所有权，再接首页，禁止两处各调scan**。

候选仅内存有界公开地址、locator和单调观察时间，按账户/网代隔离；不缓存Grant/PSK/权限，不持久化新IP表。插件不提供TTL，需单独冻结短有效期和有界刷新；expired/removed/换网/注销/退后台必须失效或退休，不能永久后台扫描。进页仍走context、Challenge/实例验证、正式Grant、Hello/Manifest/State。

随机locator不是deviceId/MAC，context/2也无locator绑定；首页发现一个服务不能直接给某个账户设备点亮LAN附近状态。第一批可仅提供候选预热，不增新广播身份协议/UI。

执行：先当前Plain ACL/Key闭环，再目录/共享生命周期回归、原connector注入、真机冷热对照；Noise沿同一合同继续。详细边界/门禁见设备LAN§37。本批仅设计与测量，**首页预发现尚未启用**。

## 16. 正式Key刷新后旧LAN失效与新Key恢复（GATT§10.137）

复用已安装debug App与隔离COM12，真实LAN就绪/读取后，经原HTTPS正式rotate接口一次幂等请求把隔离Key从1更新到2。响应返回后5859.8 ms精确LAN session关闭，授权还剩284094.5 ms，页面未退出；旧session读取拒绝、无新发送、connector槽释放，账户MQTT仍同一ready session。新context409 AUTHORITY_CHANGED。没有停用App/native期限保护或改连接策略。

保留隔离NVS、仅更新固件Key后，设备同一身份版本2登录和Enable ACK同步；context恢复200，App重新完成LAN授权/Hello/Manifest/State。新power=true经LAN ACK233 ms；主动关闭精确LAN后，页面仍有效，新power=false经原Cloud ACK108.3 ms，无Action重放、MQTT重连或伪造账户。

必须区分：rotate的HTTP200/disconnected只是云端完成，不是本地连接已关闭。页面应按自身session关闭事件退回可用lane；Cloud账户ready也不等于被刷新设备在线。当前普通WiFi产品对明确鉴权拒绝采取终止产品/本地会话的保守策略，网络暂时不可达不视为撤权。离线设备不能获得即时撤权事实，只受原有限授权期限约束；不把单次5.86秒或剩余300秒上限宣传为全网络撤权SLA。

本批App无源码/插件/UI改动或新APK，106项App回归仍是前批证据。新验证为4组Host/ASan、Service19项及独立schema真实PG/worker/carrier33项。App测试page/session/trace hook已关闭恢复，COM12原固件/NVS/OTA已恢复且写后hash通过；隔离服务器Key保留版本2，原Hub/A/B身份不变。未暂存/提交/推送。

下一步需第二真实账户正式分享、撤销及重新分享，要求接收端Retire ACK与提前关会话，而不是仅HTTP403/DB状态。首页预发现按§15.2/设备LAN§37后续实施，本批没有启用首页扫描或预连接。

## 17. 原客户端Noise真机与取消清理回归（GATT§10.138）

第二真实账户材料未具备，前移独立的record模式验证，不放宽ACL门禁。复用原native link、LocalAccessClient和BBP session，只用注入的Noise records策略；无需新增连接栈或账户MQTT。可信HTTPS context/2实际profile1，Grant后双方52 B Noise握手、后续LocalSecureRecord(type3)，Hello/verified Manifest/fresh State通过，未降级Plain。

沿同一正式90秒authorization及原expires_at完成五个场景：首次power=true/button(null)的LAN ACK314/305 ms；只读refresh单次tag篡改、已用密文重放均被拒且提前关闭，旧session再读0发送；主动精确关闭后重开；最后只停隔离debug的JS主动timer，保留逐操作/native/MCU保护，接收端到期回收后原页面发送**新**Cloud power=false，ACK168.1 ms。五次Ready为1381～2281 ms，button仅执行一次，原账户MQTT始终同一ready session。

篡改/重放从异常send开始到native close开始分别183/38 ms，但精确session退休约1.6秒，包含原扫描退出屏障；主动close汇合1743.8 ms，其中native仅14 ms。不能把全退休耗时当密码计算成本，也不能为减数字删除清理责任。五次开页不续期；末次回收晚于App保守截止时间318.3 ms不是MCU定时精度，此项仅证明既有会话到期，未测试过期Grant注入。

`client.spec.ts`复用既有fixture新增send/receive两项：owner取消后才返回的crypto结果清零、业务不续发、native仅关一次。正式Angular入口8文件108项、spec类型与文件lint通过；fixture不是实际密码学证据，真机另列。无App生产源码、插件、UI、APK变更。测试注入/timer/session/trace已恢复，COM12原区域及存储恢复且写后hash通过，其他板/绑定未动，隔离Key保持2；源码LAN=false，未暂存/提交/推送。

详见设备LAN§39。下一步仍优先真实第二账户分享→Retire ACK/提前关闭→重新分享恢复，保留owner；若账号条件仍缺，可先做§15.2候选目录的独立生命周期测试，再注入原connector并真机冷热对照。首页发现尚未实施，不能扫描到随机locator就给某个账户设备标“附近”，也不提前获取Grant/占每设备socket。

## 18. 前台候选预热与共享扫描实现（GATT§10.139）

已接原LAN service，不改首页UI：满足LAN/Android/HTTPS/登录/WiFi准入的前台代际先预热一轮，最多10秒；普通开页仍用同一目录/connector。目录缓存最多16个公开候选，有效期严格小于15秒，最多16读者；当前真实消费者是一个预热和一个合并后的页面连接。轮次结束不周期重扫；热提示先消费，过期/未命中则开页按需新轮。页面退订不能停止别人持有的watch，最后读者等待真正清理。

账户/网络/前后台代际由service持有，目录本身无Angular依赖；退后台/换网/注销/销毁关闭旧目录和缓存，新代际等待全部旧清理，拒绝迟到结果。旧独占scan的seen与超时已删除并统一归目录；没有两套扫描或全局removeAllListeners。缓存不包含授权/PSK，也不将locator映射为账户设备在线；每次依旧取得可信context、校验真实instance、签发/握手/Hello/Manifest/State。

缓存IP不可达时，只有native open指定错误且精确close成功、未交出byte link/发送Grant，才可标记`LOCAL_ACCESS_CANDIDATE_UNAVAILABLE`；connector仅在建连前消费，最多4候选/30秒。取消/BUSY/cleanup失败不重试，任何Grant/Noise/BBP/业务失败不适用此标记。保留原native open期限，因此过期地址仍可能拖慢准备；未承诺所有页面亚秒就绪。

本批15文件201项、App/spec类型、改动文件lint、设备架构检查通过；覆盖原页面/Direct/网关路由及需求，不仅新目录单测。没有新APK/插件/设备/Service修改或真机收益数据；LAN默认false，未暂存/提交/推送。

接着沿设备LAN§40安装隔离debug包做首页暖/冷/过期对照与真实控制、精确关连接、前后台/换网恢复。mDNS现有native插件未提供pause钩子，10秒JS预算不能当JS挂起后原生硬上限，需真机门禁及必要的插件仓修订，禁止直接改node_modules。双账号ACL门禁仍未过；发现优化不改变P3发布判定。

## 19. 首页预扫描真机与resume合并（GATT§10.140）

Android resume的foreground先于network事件约21 ms。§18立即预热触发两轮先后watch，中间unwatch约2017 ms；不是两个并发连接或MQTT。修订只在service的新scope将推测性预热延后250 ms，下一代际取消旧timer；显式open取消尚未启动的预热并立即走connector，不等待250 ms。原目录/原生清理屏障、账户/网络失效及页面所有权不改，无新队列/插件或UI实现。

修订debug APK实测：首页回前台在最新网络事件后约251～252 ms仅启动一次watch。正常HOME退后台发起unwatch，约2023 ms完成，scope/活动watch/listener清零、connector空闲；原账户MQTT维持同一ready session。完整无人开页轮次约10002 ms开始退休，native返回另耗约2035 ms，不再自动重扫。不是“原生总占用严格10秒”，也不代替JS挂起/杀进程门禁。没有提前context/Grant/设备WS或基于locator点亮设备在线。

本批设备最初reason201，之后实际连mostfun2026的2.4 GHz/信道6，但没有完成云端登录，手机到设备TCP探测失败；因此**冷热Ready、Property/Action控制收益未测**。手机账户HTTPS通过ADB reverse可用；debug CA仅精确信任127.0.0.1/旧局域网地址，直接fetch新PC地址TLS失败不能用作TCP不可达证据。未放宽CA、鉴权或明文策略。

15文件203项（新增2项）、App/spec类型、lint及设备架构通过，测试hook已恢复/监听器清零，COM12原区域恢复且hash通过，其他板/绑定未改。安装包为隔离debug LAN开启版，三个源码环境LAN仍false；未暂存/提交/推送。下一批按设备LAN§41用确认的2.4 GHz网络完成association→登录/ACK→冷热/过期控制；真实双账号ACL和原生挂起硬边界保持未通过，不扩大到Hub/S4。

用户随后切YYSC：手机2.4 GHz且到PC192.168.50.13的服务TCP可达，账户HTTPS/MQTT仍正常；设备产品及完全不含Blinker的官方WiFi-only程序均未完成WiFi认证，后者可见目标−55 dBm却两次reason2/无IP，具体原因尚未定。不能据此调整App Grant/会话策略，也没有进行冷热开页或Property/Action重试。产品新候选超时会回退旧网的语义已列入设备侧独立复核；下一步先独立WPA2网络对照，见设备LAN§41.4。板和App hook已恢复、账户MQTT ready，原生JS挂起/真实ACL仍待验。

## 20. i3water真实冷/热/过期开页收益（GATT§10.141）

设备官方WiFi-only对照与正式Plain产品均在新网连接成功，正式context200/profile2后才开始门禁。使用§19既有debug APK、已登录真实Android及DeviceUiPort页面owner，不是伪造native/Grant的单测，也不是布局按钮UI门禁；没有改App源码/UI/插件或重装APK。

| 一次实测 | LAN Ready | 候选交付 | 完整页面close等待 |
| --- | ---: | ---: | ---: |
| 冷开页，无缓存/扫描 | 3657 ms | 923 ms | 1860 ms |
| 回前台预发现后开页 | 969 ms | 0.5 ms | 51 ms |
| 缓存年龄15018 ms后开页 | 1574 ms | 850 ms | 1851 ms |

每次均verified Manifest/fresh State；仅热页发送power=true和button(null)各一次，实际LAN ACK249/374 ms。过期后重新获取的State为power=true/buttonPresses=1。账户MQTT始终原ready session，命令不跨路重放。冷/热native open及session耗时也不同，不能把整个差值归因预扫描或将一个亚秒样本当p95/无缝承诺。

热页退出释放精确设备session/connector，原首页预热读者仍持有单轮watch，随后自然退休；不是额外设备连接。冷/过期close包含约1.85秒原生发现清理，不能据此声称socket关闭慢。最终connector/round/watch/listener为0，观察hook/订阅全部恢复，账户MQTTready。目录仍只有公开候选/15秒TTL，不缓存Grant/PSK、不提前连设备、不把locator当账户设备在线。

本批设备修正手动SSID失败后的重试策略，不改变App配网事务、授权或UI接口；设备6组Host/ASan、Win32和架构通过。§19的203项App回归未在本批重跑，不能当新增次数。COM12已恢复本批原固件/存储并hash通过，其他板/Key/ACL未改；源码三个环境LAN=false、未暂存/提交/推送。

接下来真实第二账户分享/撤销/提前关闭/恢复与owner隔离，独立补JS挂起/杀进程后的native资源上限；后者不能用正常HOME清理替代。P3完成前不扩大Hub/S4，也不继续用重复冷热测量代替缺失的鉴权边界。详细阶段证据见设备LAN§42。

## 21. Android扫描原生守卫与真实账号切换（GATT§10.142）

仅在原`LocalLanDiscovery`的watch传入`timeoutMs: 10000, stopOnPause: true`，补精确参数断言；不新增页面扫描器、不修改UI/账户协议。实现位于独立`capacitor-mdns`源码仓，经本地包依赖正常更新及Capacitor构建进入APK，不能只交付node_modules副本。可选原生期限复用原串行执行器，按session精确退休；pause代际阻止旧队列调用在resume后启动。其他browser/publisher不受影响，无自动resume扫描。

原生守卫用于JS暂停时回收资源，原目录仍持有10秒轮次/15秒公开候选及JS owner/listener清理。原生到期没有terminal JS事件，也不清JS缓存；恢复时原有abort/精确unwatch仍必须执行。期限表示开始退休，JmDNS关闭存在尾时延；iOS无这两个选项，不宣称跨平台硬边界完成。

真实手机先以CDP确认Debugger.paused，旧版3秒watch在约8.6秒检查仍有组播锁；新debug APK相同场景已释放且PID未变。30秒watch先暂停JS再HOME，约6.1秒检查锁已释放，证明不是依赖JS或等30秒到期。force-stop后的检查亦无锁，随后重开；各一个样本/离散检查，不是精确释放时延或OS整体进程挂起保证。4项独立Android真实JmDNS Instrumentation通过（13.365秒），覆盖池/锁引用、旧deadline替换隔离及其他watch/publisher保护。构建runner的UTP下载失败通过标准ADB runner执行同APK绕开，不关闭下载TLS校验。

App14文件197项、App/spec类型、改动文件lint、local build、debug APK及设备架构检查通过。生成资产只为本机debug启用LAN并保持原HTTPS域/CA；三个源码环境仍false。无新MCU控制/冷热性能复测，不套用§20的结果为本批新APK通过。

用户授权的第二主体由本机认证既有admin CRUD准备普通账号，再实际密码登录取得令牌。App走原DataService/用户加载切换，ME200匹配主体、分享前context403正常；无设备时自动账户连接stopped是按需行为，不应误修为所有空账号常驻连接。显式正式start返回账户connection503；owner邀请201、新主体接受409。Service只读确认receiver无route，却被合并报成跨分片，不是App授权缓存/本地连接问题。邀请已通过正式DELETE撤销（state=revoked），无grant；原账号已恢复、账户MQTTready/context200/profile2、connector空闲。没有验证密码输入页面或短信注册UI。

手机按用户确认回i3water，原生组播锁为零。已卸载仅本批Instrumentation测试包，Blinker debug APK及数据保留，原账号恢复材料/新测试账号密码仅ignored私有文件；未动板/Key，未暂存/提交/推送。下一批先修服务端首次账户/接受分享的路由准入和错误分类，再正式分享→LAN控制→撤权/设备Retire ACK→未到期关闭→重新分享/owner隔离；不要在App中为无路由503做无限重试或假装已接入。完整证据和跨端下一步见设备LAN§43/Service§33。

## 22. 新账号真实MQTT就绪与跨shard分享前置（GATT§10.143）

本批没有App源码/UI/APK变更。Service新增统一首次路由准入，合法账户请求及邀请接受可以触发原allocator，不需先创建设备。新真实主体首次获得normal shard0、connection200；初次App报MQTT channel closed，本机shard0还是旧镜像，shard1已为近期联调版。备份shard0数据库并对齐同版镜像后，同一手机/账号ME200、账户MQTT/BBP ready，未共享设备local-access403正常，connector空闲。不能据此新增手机第二个MQTT或修改LAN授权逻辑。

owner正常shard1与receiver正常shard0之间的正式邀请201/接受409，证明当前真实cross-shard合同未完成，与上一批无route误报不同。邀请已DELETE撤销、无grant；原账号已恢复ME200/MQTTready/context200，手机i3water。Service软件10项/隔离PG13项通过；本批未重跑App197项、未发设备命令/刷板，也未完成LAN Retire ACK。

下一批按Service§34.3先分离设备ACL与物理shard，由服务内部处理跨shard请求/回流/撤权，App保持原单账户MQTT及Route/Delivery/本地会话。协议/API错误只反映尚未满足的服务器能力，不做假成功或无限页面重试；不能把receiver移到owner shard制造通过。真实分享成功后才做未到期LAN会话撤权、设备exact ACK、重新分享与owner隔离，之后Hub/S4。证据及部署恢复见设备LAN§44，源码LAN关闭，未暂存/提交/推送。

## 23. Service跨分片R0与App边界不变（GATT§10.144）

Service已完成只读源/目标权限与routeVersion的软件准入基线，不是跨Broker业务完成；仍不开放不同shard分享。后续按Service `DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md` R1～R4实现执行、订阅回流和双端撤权，最后原route0/1真实账号做LAN P3。App不新增MQTT、shard选择或device credential，不通过页面假成功掩盖服务缺口。

当前编码器基准需区分设备frame与App Route/Delivery：power Command13/57 B，8路灯PATCH33/59 B；额外路由身份是单账户连接复用多device所需，不能用设备33 B宣称App全链路33 B。详情见Service `DEVICE_V2_WIRE_SIZE_AND_ROUTING_REVIEW.md`。本批仅Service源码/软件测试及文档，App源码、APK、开关、登录和设备都未操作；无新App真机证据，未暂存/提交/推送。

## 24. Broker目标模块复用与会话代际（GATT§10.145）

本批没有App源码/APK/登录修改。Broker抽取target执行、保留原签名JWT routeVersion及每连接sessionGeneration；App仍原HELLO/Route/Delivery，不增加字段或MQTT。原JWT已含route_version，Broker不再丢弃它，也不为缺失字段猜默认代际。

R1a/b软件底座完成（192项定向及原Broker回归），不代表跨分片分享已开放。下一批R1c处理源端远端peer解析、目的端授权与binary relay，R2/R3结果/订阅回流、撤权及received inventory统一通过后再真实App LAN P3。不要给App加shard选择器或以页面重试代替服务器缺口。详情Service跨分片方案§7、设备LAN§46；LAN开关仍关闭，无暂存/提交/推送。

## 25. R1c查询边界完成，App通信合同不变（GATT§10.146）

Service已提供canonical peer权威解析及目的端独立路由/ACL复核，原internal HMAC replay边界已修正并测试。198项Broker定向、identity2项/HMAC4项、PG与真实Gateway HTTP27项及原回归通过；尚未接通signed binary执行/真实source generation/remote gates，不能称不同shard分享已可用。

App仍一条账户MQTT和原BBP Route/Delivery，不增加shard字段、设备凭据、额外MQTT或UI重试。下一批Service跨分片方案§9同时接通request/response与会话归属，并核对App超时预算（3s ACL不是整个设备command期限）；之后R2/R3通过再App真实双账号LAN P3。本批App源码/APK/登录与开关均未变，无暂存/提交/推送。

## 26. Service R1请求闭环完成，App等待R2/R3（GATT§10.147）

Service的源Broker→Gateway→目标Broker签名原字节转交与source session proof、remote gate已通过隔离两Broker软件测试。原BBP Route/requestId不变，App仍一个账户MQTT；无需新增shard选择、设备凭据或改变6000ms等待窗。服务端整条5500ms，3.1s模拟设备ACK通过，不是LAN ready或真实网络延迟测量。

尚未跨shard实现主动State/Event/Presence、Telemetry和ConnectionDemand，也未完成双端撤权/received inventory；不得用页面重试或解除分享检查替代。下一批Service跨分片方案§10.5依序R2/R3，再原双账号LAN P3和Hub/S4。本批App源码/UI/APK/登录/开关不变，未部署或操作MCU，未暂存/提交/推送。

## 27. R2a通知底座与App订阅语义核对（GATT§10.148）

本批无App源码/UI/APK/登录修改。Service本地producer/sink已解耦并通过通知21项、Broker定向220项及原R1/协议回归，尚未接通远端主动推送。权威后续见Service跨分片方案§11；App仍仅一条账户MQTT，wire不变，分享和LAN发布准入未开放。

核对实际代码后明确：PresenceControl只有Subscribe，其在线信息供首页使用，不能随设备页面退出全部退订；ManifestAccept只表示模型已协商，不证明页面仍打开；unsolicited Manifest/Error也未被当前notification处理器支持。R2b先在服务器接通会话级Presence watch及短租约。R2c再接实际页面/业务owner生命周期，评估复用原ConnectionDemand owner，增加被双方识别的Manifest变化与重新协商处理；不能由服务端猜页面状态或直接发送不受支持的kind。核心通信需要时可以修改App，不以页面美化为前提。R2/R3完成后再原双账号LAN P3与Hub/S4。

## 28. R2b远端Presence已接通，R2c先补目标级失效恢复（GATT§10.149）

Service已在默认关闭路径接通原Subscribe→远端watch→首次响应/变化通知，App仍一条账户MQTT，原Presence Delivery不变。两Broker与生命周期40项在Windows/Linux分别通过；尚非真实App/账号/设备门禁，本批无App源码/UI/APK/登录修改。完整实施结果、预算和证据见Service跨分片方案§12。

当前Presence只有cloudReachable布尔值，不能表达watch丢失。Service暂在已建立watch续期失败时关闭原账户并由现有App重连/重订阅，防止旧online永久残留；这会牵连同账户其他设备，不是最终无缝方案。下一批R2c-1应先在核心通信层明确单目标lost/unknown、temporary unavailable与ACL/placement改变的区别，实现有界重建且保持账户MQTT及其他watch。不能静默假offline、永久重试或仅服务端新增App不识别的通知。

同时落实State/Event页面或业务interest的真实acquire/renew/release，再接Manifest变化及原Telemetry/ConnectionDemand等跨shard合同。Presence仍供首页使用，不随单设备页面退出一并退订。R3撤权/分享和真实LAN P3未完成，发布开关未开放；未暂存/提交/推送。

## 29. R2c-1a目标级unknown与有限恢复（GATT§10.150）

本批已修改App核心通信，不改UI样式/APK。`PresenceRecovery` bit20与`PresenceLost` kind0x2a已接Session；19 B失效body绑定原Subscribe requestId，不复用已结束请求的许可。原两个Presence集合归一为独立manager；仅目标失效，保留页面历史数据但清accepted/fresh，cloudReachable置null，旧inventory不能解除失效。AccountClient仅在session真的closed时重连，目标错误不会拖断其他设备。

自动恢复只重试Subscribe，最多3次、1/3/10 s、实际并发≤4；成功不补预算。原ready wait新消费者可显式重启该目标的耗尽周期，普通首页/Store通知不无限续试；旧requestId/换登录/不协作晚结果不能污染新订阅。命令不会随恢复器自动重做，State仍重新协商。完整wire、准入拒绝与异常区别见Service跨分片方案§13。

App34个独立Vitest suite/425项及类型检查通过，另有Service两平台44项与Broker220项；12个需要Angular/Jasmine浏览器环境的suite不计入本批通过范围。未做浏览器UI/APK/真实账号/MCU联调或部署，未暂存/提交/推送。下一步R2c-1b实际页面/业务owner和State/Event/Manifest变化，不能将首页Presence等同页面租约；分享仍关闭。


## 30. R2c-1b显式页面/业务StateInterest（GATT§10.151）

本批修改核心通信与测试，不改UI样式。Service跨分片方案§14为权威合同。App新增bit21及StateInterest(0x2b)/Status(0x2c)，复用原canonical owner数组和现有有限租约引擎的独立实例，不增加账户MQTT或MCU/LAN/BLE字段。

- openConnection在持续Cloud路径获取StateInterest；一次性connect/同步读不建立长期观察。普通WiFi/Hub只需观察owner，Cloud子设备还持有原ConnectionDemand。首页Presence不能替代页面观察，也不能随退页取消。
- DeviceUiConnectionScope从单owner字段改为owner集合；退页、后台、换账户及移除设备回收各自资源。Cloud观察owner结束不会关闭已就绪LAN或账户MQTT；必需的Hub连接/Direct Ready owner仍沿原准入，不放宽。
- State owner首次接受、最后一个accepted owner结束时保留历史值和Manifest，但State stale/Event interrupted；只有pending acquire不能伪装持续接收。没有accepted owner时忽略旧State/Event，不影响独立Telemetry。旧State读跨越观察区间时，在写Store前以现有sync generation和一次StateConflict重读隔离，不新建永久代际表或无限重试。
- 业务入口acquireStateInterest返回accepted/closed/release，调用者必须管理整个使用期限。accepted仅确认接收者租约，不是设备在线/新State；仍须waitUntilReady。单实例≤16 owner、每10 s续期、30 s租约、5 s控制请求期限，复用实际未settle请求配额及原账户Route限额。
- 未协商新feature时仍用旧accepted-gate行为；但严格旧Broker可能拒绝新Hello bit，App/Broker需要协调部署。新Status绝不能与ConnectionDemandStatus混用。

本地Broker筛选与跨分片owner控制均已实现；**远端主动State/Event回流、Manifest变化通知、StateInterest失效后的有限自动重建仍待R2c-2**，不可把accepted显示成“无缝推送已完成”。观察失效后会保守置stale，当前仅新显式页面/业务可重新获取；不以重连整个账户兜底。

App34个headless Vitest suite/436项、类型检查通过；Windows/Linux各47项relay及Broker225项通过，详见Service§14。无完整Angular浏览器/UI/APK、真实账号或MCU测试；未部署、切账号、刷板、暂存/提交/推送。下一步远端State/Event与Manifest变化，再原租约跨shard、R3和原真实LAN P3/Hub S4；分享继续关闭。

## 31. R2c-2a模型变化提示与有限恢复（GATT§10.152）

权威合同见[Service跨分片方案§15](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md)。新增bit22及server-only ManifestChanged(0x2d)，仅在同时协商StateInterest时接收。原Delivery无requestId/inner flags=0，body为旧/新32 B fingerprint与新revision的canonical map，73～77 B。hint不是新能力或布局：必须匹配当前已验证/在途模型且有accepted观察者，再走完整Manifest SHA-256→Accept/ACK→State；不直接生成或替换控制页面。

- 普通设备和网关子设备由服务端同一lane事件入口通知。App不感知shard或增加MQTT，不让服务端直接推送当前不支持的unsolicited Manifest。
- 自动恢复附着现有观察组；每个连续区间最多3次（立即、失败后1 s/3 s），实际并发≤4。成功和续期不补预算，最后观察者退出停止新重试；已发出的共享任务有限完成且槽保留到settle。不是“三帧/三秒”，也不是无限跟随固件更新。
- 已有sync增加Manifest代际，与State代际共同隔离迟到页、hash和Accept ACK；不能拿旧字段表解码新状态。pending期间的新hint不会在任务收尾被吞掉，旧观察周期不能重新启动新周期的任务。恢复不重演Command/Action、不影响其他设备及已就绪LAN。
- 仅hint来源与App恢复基础完成；初次ACL临时失败可导致App未收到hint，尚无完整被动观察丢失检测。StateInterest失效自动重获及远端State/Event/Manifest仍待R2c-2b，不能称无缝通信完成。

新增13项App测试，headless回归与服务端最终证据见`blinker-library/build/lan-cross-shard-manifest-change-20260910/`；完整Angular浏览器/UI/APK、真账号/MCU未测。下一步R2c-2b持续source proof与观察丢失/反向投递门禁，再原租约跨shard→R3→原真实LAN P3→Hub/S4。未部署、动账户/硬件、暂存/提交/推送，分享仍关闭。

## 32. R2c-2b1服务器持续观察基础，App通知交接待下一批（GATT§10.153）

服务器源端已将远端accepted观察接回原StateInterest owner registry，退出、到期、换账户及重获不能复活旧证明。内部`state-current`独立于单次请求，App无需新增MQTT、shard信息或凭据。它只证明原消费者仍在，不表示设备在线、State fresh或消息已交付；本批没有新增App协议bit/body/API。

下一批R2c-2b2必须同步处理首个State/Manifest响应与通知交接、远端通知序号/缺口、单目标observation lost及原owner有限重获；复用§31恢复预算，不重演Command、不关闭已就绪LAN或其他设备。之后才原租约跨shard→R3→真实双主体LAN P3→Hub/S4。服务器证明和只读投影不能代替这批App行为，跨分片分享仍关闭。

具体合同/结果统一见[Service跨分片方案§16](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md)。App35个headless Vitest suite/449项及类型检查复跑通过；未修改App生产代码、安装APK、切账号或执行真机测试，未暂存/提交/推送。

## 33. R2c-2b2a共享观察及目标级有限恢复（GATT§10.154）

一个target的多个页面/业务caller现在共享原StateInterest网络owner，API仍为accepted/closed/release；仅最后caller退出才释放。caller总数≤16，沿原owner/Route实际配额，不新增租约引擎或timer。已就绪LAN和其他设备不跟随本目标的可恢复云端故障关闭。

bit23 StateRecovery协商后，接收无requestId的StateInterestStatus，仅stale/denied。先核对target、owner和当前/最近accepted revision，同tick立即令State stale/Event interrupted；旧owner或已被新accepted revision替换的旧失效被忽略。stale/超时有限重获网络owner并ensureReady，明确拒绝不恢复。初次acquire失败不自动重试，Command/Action不重演。

模型恢复与观察恢复共用原3次预算、4个实际任务以及1/3 s失败退避。预算以**显式caller组生命周期**为准，自动重获成功不补预算，修正§31按accepted区间理解可能产生的无限恢复问题。最后caller退出或账户关闭停止新任务；失效恢复耗尽关闭组，已发分页有限收尾。新Manifest依然完整SHA-256/Accept ACK/State验证，不直接接受hint为模型。

新增12项App测试及实际App↔Broker互通2项；App35个headless suite/461项、类型检查及Service软件回归通过，权威合同/日志见[Service跨分片§17](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md)。未跑完整Angular浏览器/APK、真实账号/MCU；未部署、暂存/提交/推送。

下一批R2c-2b2b远端首次同步与通知交接、反向数据及context/序号故障接入本批失效入口，然后原租约→R3→真实双主体LAN P3→Hub/S4。尚非远端持续推送/无缝完成，分享与源码LAN开关不变。

## 34. R2c-2b2b1同步发布确认对App的边界（GATT§10.155）

本批仅Service/Broker执行确认：原账户MQTT发布成功后，目的Broker才能确认StateInterest、Manifest ACK、State末页的交接条件。App不新增请求、ACK或另一条MQTT，不引入服务器shard概念；现有BBP体积不变。发布失败/超时依旧通过§33的target-level stale有限恢复；明确拒绝为denied，禁止自动重放用户Command/Action。

发布器回调不等于App已处理，目的ready也不代表同步窗口无数据遗漏。下一批R2c-2b2b2必须一起处理窗口State补齐、Event有界保存/明确interrupted、反向序号与失联。App461项/类型检查及实际App↔Broker2项软件回归通过；完整合同/跨分片验证见Service方案§18。本批未修改App源码、UI/APK或真机现场，不将软件互通测试当远端推送完成。

## 35. R2c-2b2b2远端通知接入既有App核心（GATT§10.156）

远端State/Event/Manifest现经原账户MQTT、原Delivery与App Session/store接收。App不感知shard、内部序号或baseline，不需要增加客户端协议/API。窗口补State、Event有界顺序、模型hint→canonical hash/ACK/State复用原实现；内部缺口与失败转原Status，App仍最多三次恢复，明确denied不恢复、不重演Command/Action。

实际App→真实source lane/Relay→真实destination target/producer/sink的内存承载互通6项通过，含窗口数据、模型刷新、序号缺口、明确拒绝、真实10 s续期定时器发现静默context丢失、同一账户另一target仍可收Patch。单次owner请求预算5 s，前台正常调度下约10+5 s内检测；不是手机后台硬上界或每次切路延迟。实际publisher callback仍不等于App应用ACK。

App461项/类型检查、原本地互通2项、Windows/Linux各105项relay及Broker249项/原构建回归通过；权威合同/证据见[Service跨分片§19](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md)。本批App源码/UI/APK不变，无账号/手机/MCU/部署/暂存/提交/推送。下一步R2c-3a原业务租约跨shard，再R3→真实LAN P3；分享/源码LAN开关不变，尚不宣称无缝通信完成。

## 36. R2c-3a原ConnectionDemand API跨shard互通（GATT§10.157）

App继续调用原session.acquireConnectionDemand(logicalDeviceId)，只走当前账户的一条MQTT。源Broker不创建第二账户/设备client；目的Broker将需求汇入原唯一活动registry。App不感知shard，不新增BBP字段/API。

owner.accepted只表示需求接受，不代表Ready、已认证BLE、Manifest或State可用。owner.release/账户关闭停止原owner；目的context重启后原10 s续期得到stale，owner.closed结束。**本批没有为ConnectionDemand增加StateInterest式自动重获**；明确新caller可申请新owner，后续路径仲裁不得重演Command/Action。超时检测是前台约10+5 s，不能作为Android后台硬期限。

实际App Session/source/target内存互通3项覆盖正常释放、目的拒绝及原定时器检测丢context；此前State远端6项/本地2项继续回归。两独立Broker真实签名HTTP另有3项需求子测试；身份/ACL/物理transport为fixture，不等于APK/真机通过。权威边界及最终回归见[Service跨分片§20](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md)，ignored证据build/lan-cross-shard-demand-20260911。

本批原“下一步远端Direct”已由§37纠正。不能按普通read/share授予DirectAdmin，也不能把ConnectionDemand accepted显示为已可直连。无UI/APK/账号/部署/设备操作、暂存/提交/推送。

## 37. Direct权限与Telemetry租约回执边界（GATT§10.158）

DirectPriority是owner-only射频优先权，合法账户/设备共tenant、共shard，继续原本地Hub/Ready流程；远端云端reader/operator不得转交此操作获取DirectAdmin。此结论不把云端分享、LAN/BLE LocalGrant和Direct优先权合并为一个权限，不要求App增加账户MQTT或理解物理shard。

Broker原Telemetry路径已共用中性target控制入口，并拒绝失效消费者的缓存Open/Renew成功。活跃exact重复不续租；旧epoch/已关闭/到期或已失效Manifest gate不能表示仍可收流。App原协议/API不变，调用方仍按实际Status/错误处理，不能把旧回执当作新租约、物理采样ACK或自动重发Command。

App461项/类型检查、既有实际App核心互通State6/ConnectionDemand3/本地2通过；没有新增远端Telemetry互通，也未构建/安装APK。服务端Broker262、relay双平台各121和PG31详情见[Service跨分片§21](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md)。下一步R2c-3c-2远端消费者及Status/Data发布次序/生命周期，再R2组合→R3→真实LAN P3；分享/源码LAN关闭，未改UI、真实账号、设备或部署，无暂存/提交/推送。

## 38. Telemetry真实会话与队列生命周期（GATT§10.159）

Broker本地生产Telemetry现持有exact App claims/session，不按同clientId查找新连接。队列在准备和发布前复核具体消费者/租约；Close、过期或重开后跳过旧样本，旧epoch终止通知不能清掉新epoch数据。Open/Renew期限不超过认证session，低于原5 s最小期限时拒绝，不向上补足。App继续原API/Status/错误处理，不增加MQTT或自动重演Action。

新增实际lane/sink5项及中性消费者11项；Broker278、Linux Telemetry23、双平台relay各121通过。App461/类型和原State6/ConnectionDemand3/本地2互通继续通过，未新增远端Telemetry互通或APK/手机证据。完整边界见[Service跨分片§22](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md)。下一步R2c-3c-2b远端原租约/Status/Data与回执发布顺序，再R2组合→R3→真实LAN P3；本批无UI/源码/账号/部署/设备变更或暂存/提交/推送，分享/源码LAN关闭。

## 39. 接受回执与采样交接顺序（GATT§10.160）

Broker本地生产现在先发布exact Open接受回执，再释放交接中保留的一条最新样本；最多等待5 s，重复回执不续租，超时/关闭/模型或gate换代不会恢复旧流。Broker的publisher回调不是手机业务ACK或物理采样ACK，App仍按原Status/epoch/有限租约处理，API/wire不变。

原App461项、类型与State6/ConnectionDemand3/本地2互通回归通过，无App生产源码/UI/APK变更。下一步远端2b-2必须同批补Status/Data签名回流、源关联证明及原App Telemetry互通，不能拿这11项既有互通替代。完整清单/执行入口见[Service跨分片§23](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md#23-r2c-3c-2b-1发布交接前置与源准入gatt10160)；之后R2→R3→真实LAN P3，保持单账户MQTT及分享/源码LAN关闭。

## 40. 原App Telemetry接口跨分片互通（GATT§10.161）

原`DeviceV2Session.openTelemetry`仍使用唯一账户MQTT和原Status/Data/epoch；无需App感知shard或接收内部签名envelope。内部绝对deadline只用于Broker证明，App body不增加字节。Opened接受不等于物理设备采样ACK；服务器先完成原账户publisher交接，再释放窗口内最新样本/终止状态。

新增实际App Session＋生产source/target/core内存互通2项，验证open/样本/Close及`setVisible(false/true)`关闭旧流并恢复新epoch，不新增MQTT；原35 suites/461项、类型及State6/需求3/本地2互通通过。独立两Broker签名HTTP另有实验证据，不把两套fixture拼成手机四端测试。完整范围见[Service跨分片§24](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md#24-r2c-3c-2b-2原telemetry跨分片小闭环gatt10161)。

下一步配合R2混合容量、丢失/重启和原App失效恢复门禁，再R3主动失效/share/Retire ACK→真实LAN P3。当前有限租约不代表立即撤权，原账户底层错误仍可能影响多个target；无本批UI/生产源码/APK/账号/手机操作，分享/源码LAN继续关闭。用户最新现场SSID为mostfun2026，后续手机/电脑/板卡需核对同网。

## 41. 原Telemetry恢复行为与混合资源验收边界（GATT§10.162）

新增原DeviceV2Session互通2项（Telemetry共4项）：目的context丢失后，原30 s租约的10 s续期timer收到拒绝，流变inactive、清样本并报告错误；账户仍ready。调用方显式`refresh`重新协商，然后`setVisible(true)`取得新epoch。不新增心跳、MQTT、自动重放Action或宣称完全无感恢复。另验证关闭同设备一条Telemetry流不停止另一条流及共同物理采样。

测试使用实际App协议/管理器和Broker source/target/core、内存传输和fake timer；不是Android后台期限或手机四端验收。App原461项/类型及State6/需求3/本地2互通回归通过，无本批生产源码/UI/APK变化。服务器真实HTTP丢包及混合池/实际槽修复详见[跨分片§25](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md#25-r2d-1实际资源所有权http断开与第一组组合门禁gatt10162)。

下一步集中实际多target通知拥塞/隔离、进程故障和R2退出矩阵，再R3主动双端失效/share/设备Retire exact ACK→原真实LAN P3。单stream隔离不能推出账户socket故障也可隔离；分享/源码LAN关闭，无真实账号/手机/网络或暂存/提交/推送操作。

## 42. 账户共享传输的真实隔离边界（GATT§10.163）

同账户多个target共享原publisher/序号，单target的准备/模型变化可隔离，但账户publisher暂停会使该账户所有target等待；另一账户仍可工作。Event不能按Telemetry/Presence最新值语义合并，超额时明确终止对应观察；App用新owner/revision1重开观察，不能重用已退休owner增加revision。物理采样序号由设备管理，同一聚合流仍在时不能因某App重开而回拨。原App封装保持原有会话内分配规则，不要求用户手工管理内部ID。

本批新增服务器生产者/账户sink组合及真实进程故障测试；原App461项/类型、Telemetry4及State6/需求3/本地2互通回归通过，并非真实APK/手机四端测试。R2软件基线已收口，见[Service跨分片§26](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md#26-r2d-2多目标混合生产者实际进程故障与软件退出矩阵gatt10163)。下一步R3原失效入口贯通源/目的→可靠投递/Retire exact ACK及received/share/leave统一，之后真实LAN P3。不得只去掉分享409或增加第二条MQTT；开关保持关闭，无本批App业务源码/UI/APK或账号/网络变更。

## 43. 原账户下的主动失效与发布确认边界（GATT§10.164）

服务器原invalidate已清指定旧grant的State/Presence/Telemetry/需求和无效队列，源可发送原denied/PresenceLost；不会关闭整个账户或其他设备。旧版本失效/cancel保留已证明新版授权，真实操作未结束继续占原槽。App仍一条账户MQTT，复用既有失效/重新同步流程，不新增协议/API、重放Action或复制远端Manifest gate。

本批原App35 suites/461项、类型及Telemetry4/State6/需求3/本地2互通通过。一次稳态模型变更测试暴露了测试完成点错误：`ensureReady()`表示App已收State，不表示目的Broker已收到publication proof。稳态测试补等待后仍要求只acquire一次；新增正式Broker负测覆盖初始交接前模型变化、迟到确认及新owner恢复。不能把这些软件等待时间解释成真实页面无缝性能。

服务器470项/两BrokerHTTP44项与Linux relay179项为重叠口径，见[跨分片§27](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md#27-r3a原撤权入口双端生命周期和版本隔离gatt10164)。下一步R3b可靠双端失效和设备Retire exact ACK，再R3c received/share/leave一致，之后原双账号LAN P3→Hub/S4。单端HTTP成功不能显示整个撤权已完成；尚未开放跨shard分享/源码LAN，无本批App业务源码/UI/APK/手机/真实账号/网络操作或暂存/提交/推送。

## 44. 分享提交、Broker刷新与本地退休状态分离（GATT§10.165）

Service已移除旧单shard同步尝试：share事务提交即持久待发，后台分别重试source/target。原`realtimeRefreshPending`可先返回true，重复点击不是重试前提；幂等重放已确认操作返回false且不重复投递。状态回调缺失/查询失败/未知job不能返回完成。

此false仅代表Broker失效检查点，不可显示“设备本地权限全部撤销”或“迁移结束”。设备离线时原LocalGrant退休仍pending，重分享的本地签发继续受退休障碍约束；精确ACK和全局屏障superseded分别处理。当前不添加新的UI/轮询接口、账户MQTT或App协议。

专项PG runner60项及完整Gateway清单、Broker470/Linux179、App461/类型/原15项互通通过；软件证据范围及下一步见[Service跨分片§28](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md#28-r3b-1事务持久投递双端确认与设备退休解耦gatt10165)。下一批将实际PG、两个Broker和原Retire协议ACK串联，再统一跨shard分享入口，最后真实LAN P3。未部署/安装APK/操作手机、账号、Key或网络，开关仍关，现场SSID仍mostfun2026。

## 45. 分享与owner解绑不可混淆，基础功能优先（GATT§10.166）

成员leaveShare与owner删除是不同接口。当前App设置页走management.deleteDeviceV2→DELETE /api/v2/devices/:id，而Service detailRoute只接受GET，会405；不能因按钮存在宣称解绑完成。B2须先冻结云端撤销/离线本地待退休/物理reset/重新认领的合同，再接原UI；不只删卡片或把刷新Key、重新配网当作解除所有权。

本批未改App运行代码，新增的7项PG/真实两Broker/原Retire协议ACK及85项相关回归属于Service隔离测试，不是APK或无线证据。按[Service跨分片§29](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md#29-r3b首组真实pg两broker退休ack串联与基础主线收敛)完成R3余项/R3c、R4最小真机，再[基础B1～B4](../../blinker-library/docs/DEVICE_V2_BASELINE_CLOSURE_ROADMAP.md)。BLE授时拟在已认证Direct会话提供与WiFi/网关共用的业务UTC样本，当前未实施，不能影响安全租约。LAN开关仍关，Hub/S4/UI扩散暂后。

## 46. R3c分享反馈修正与链接/二维码后续包（2026-09-11）

执行合同归[单设备分享流程](../../blinker-library/docs/DEVICE_V2_SHARING_USER_FLOW_AND_R3C_PLAN.md)，不是复制设备Key给成员。本批已修改App：

- `DeviceV2ShareMutation`统一保留logicalDeviceId/current share/replayed/realtimeRefreshPending/presenceRotationRequired。accept/update/revoke/leave校验身份与返回状态，不再只取grant或丢弃整个响应；取消邀请验证返回的邀请状态。
- 默认新邀请viewer，可选operator；删除无服务器依据的9人/邀请合并限制。超时重试相同权限邀请复用原Idempotency-Key，处理中不再次创建；接受动作防重入。
- 已撤销接受重放不提示“设备已添加”；权限保存/退出/解除展示Broker同步pending。已接受邀请取消时提示去成员中解除，不谎称已撤权。设备设置页的成员退出也消费同步状态；owner删除仍是B2缺口。
- 解除分享提示离线本地凭据需同步/到期，不把Broker完成当LocalRetire ACK。BLE PresenceKey同步仍是已有best-effort发现凭据操作，不证明成员控制权限已安全撤销。不新增轮询/账户MQTT或本地权威ACL。
- 网络失败不再一律提示邀请码无效；接受/创建异常不打印含邀请proof的完整HTTP对象。后续邀请确认页还需精确错误分类、安全成员展示名、预览和账号切换确认。

测试 **46/46**：sharing service 6、设备分享页4、分享管理页3、原设备设置8、Manifest异步恢复25；应用`tsc --noEmit`通过。本次Angular测试构建发现已有Manifest测试digest默认返回值推断过窄（ArrayBuffer/ArrayBufferLike），仅补了fixture函数签名的Uint8Array返回类型，原25项通过，无生产协议更改。不是全量App/原生测试。

下一批实现只读预览→统一邀请确认→链接/二维码/扫码/粘贴→登录返回→接受成功进入同一设备页面与权限选择器。HTTPS分享域名、Android/iOS关联配置和冷/热启动要实际验收，不能只生成scheme冒称通用链接可用。之后受控开启R4双账号真实App/LAN/设备撤权；当前未安装APK、部署服务、开启LAN或操作手机/Flash/网络。

## 47. 便携链接确认闭环；唯一账号与系统notify后续接线

owner生成`diandeng://share/<canonical proof>`，接收者在“分享给我的”显式粘贴链接或原码。严格解析固定scheme/host/path，不抓取任意URL或后台剪贴板。一个`DeviceV2ShareInvitationService`持有当前内存流程，API/UI分离；设备信息与权限来自只读服务预览，确认前不accept。独立`/share-invitation`提供登录/预览/接受/取消/错误重核对；深链与登录返回接同一控制器，proof不入router参数/存储/日志，匿名初次登录保留输入，退出/换账号清理，旧响应不得串账号。

领取成功刷新原设备目录再进入原device页；目录失败保留“已领取、重试进入”而不再次accept；revoked不进入。管理页两标签“我分享的/分享给我的”，保留已接收设备，局部owner清单失败不影响接收列表；清单按账号/请求代际防晚到覆盖。删除旧直接领取逻辑及无消费者row-actions样式，不另加ACL、MQTT、设备协议或二维码依赖。

验证：链接2、flow6、sharing API7、确认页4、管理页3、owner页4、ntfy15、message深链3、interceptor28，共 **72/72**；额外native URL/login路由单元 **2/2**。应用类型检查通过，Angular测试编译当前模板；不是原生扫码/通知/登录全流程。Service预览6项、原分享20项和正式清单通过，见Service§32。未安装APK、部署、操作手机/Flash/网络或开启LAN。

下一项按[分享方案§8](../../blinker-library/docs/DEVICE_V2_SHARING_USER_FLOW_AND_R3C_PLAN.md)接唯一不变账号的定向邀请、原notify与真实待处理收件箱。通知仅messageId→认证消息详情→invitationId→同一确认页，不自动领取；被禁通知/漏通知仍可从收件箱处理。当前服务端接口未接，不声称已经真实推送或显示待认领；组件权限选择、QR、域名关联/原生门禁随后，再R4。

## 48. 定向收件箱与共用邀请决策

“分享给我的”从原Gateway认证GET `/api/v2/share-invitations/received`加载真实pending数据，单页20、cursor加载更多；不混入已接收设备，不生成通知替身或本地假邀请。错误独立展示，失败不影响其他分享列表；换账号清空、旧结果按epoch/generation隔离，单独刷新/重入不重复合并。展示计数为已加载pending数（有下一页时加+），不是已授权设备或总未读数。

`DeviceV2ShareInvitationService`原内存输入由code扩为code/定向ID二选一，复用同一个preview/accept与登录返回。`stageDirected(id)`仅负责输入，不授权；HTTP服务校验canonical 22位ID/targeted预览，服务端检查登录目标，开放链接ID不可领取。确认页新增“拒绝此次邀请”及明示不影响已有share；接受/拒绝互斥，重复点击合并、换号/迟到结果隔离。API新增inbox/decline，未建第二个接收控制器、HTTP客户端或通知授权逻辑。

本节记录的是上一批状态；§49已修正为邮箱→UUID并补邮箱创建入口，不要求不可改公开账号。NtfyService/消息中心仍未重写，**真实消息内容→invitationId动作尚待接线**；不得从通知正文自动accept，也不得依赖通知到达才能查收件箱。设备Key、账号MQTT及LAN路由不变，设备编辑器不扩展。

软件验证 **35/35**（link2、flow9、API9、管理列表5、确认4、owner4、入口2）；ntfy15＋message深链3＋interceptor28，额外 **46/46**。Angular测试编译当前页面，应用类型检查通过。服务器PG定向9、原分享20、index HTTP/auth接线1及正式Device V2清单通过。未装APK/实际通知/真实用户邀请或实体设备验收，不能将这些软件结果写成R4或分享产品上线。

最新下一项按[分享方案§8.6](../../blinker-library/docs/DEVICE_V2_SHARING_USER_FLOW_AND_R3C_PLAN.md)和下节：Q2系统消息/通知实际交付→Q3真实账号与消息点击/原生门禁→组件权限/扫码及R4，不重开R3故障扩展。

## 49. 邮箱邀请入口与可变邮箱/稳定UUID边界

2026-09-11。注册邮箱就是本阶段用户可填写的账号，无需增加“不可改公开账号”。Gateway权威查询当前有效邮箱后固定UUID，App不查本地最近登录记录、不允许填内部UUID、不新增用户搜索服务；邮箱按Auth注册语义trim/lower，不去点/去加号。原非定向链接入口保留，未来二维码携带同一链接。

设备分享页提供“邮箱邀请”和“生成分享链接”。邮箱输入→原权限选择（默认仅查看）→同一个sharing.createInvitation接口；第五参数recipientAccount可选，省略仍要求原code，填写则要求targeted且无code，防止服务误回开放邀请。两个入口复用原收件箱/确认/accept，不建第二套授权流。待领取条目区分定向/链接，列表仍使用服务端真实邀请。

处理中禁用重复创建；丢响应重试Key按sessionEpoch/设备/权限/邮箱隔离；换号/退出页后旧结果不能写新账号共享清单或弹出分享链接。失败区分查无有效邮箱、目录未配置/不可用、限流、已有pending、幂等冲突和本人，绝不静默降为开放链接。目录不可用时可由用户另行选择链接。

成功文案：“邀请已创建，对方可在‘分享给我的’查看。系统通知尚未接通，请自行提醒对方。”没有伪造已送达通知，没有自动accept；账号目录配置与私网可达后才可真实调用。本批未部署常驻环境或安装APK。原安全展示名/更完整目标确认、消息动作、二维码/原生链接以及实际双账号流程仍需后续门禁。

软件验证 **83/83**：sharing API10、owner8、统一flow9、收件箱/管理5、确认页4、link2、entry2、既有ntfy15、interceptor28；类型检查通过，测试构建编译当前HTML。不是原生通知/扫码或视觉真机验收。设备库生产代码未改；账号接口/Gateway门禁及环境问题见[Service§34](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md)。

下一批Q2实际消息/安装与notify worker、认证消息的invitationId动作；Q3覆盖禁通知/重复/过期/换号/账号注销恢复与真实领取，再R4，不扩设备协议。

## 50. Q2a持久站内消息与邀请确认复用

2026-09-11。本批配合Gateway迁移034/真实`/api/v2/messages`接口，不新增消息中心页面、HTTP客户端或接受分享实现。消息模型只新增严格的`share_invitation`动作（canonical invitationId），拒绝未知动作、额外URL字段及任意正文指令；只有已认证详情的正确messageId/type/category可生成可用动作，列表/推送文本不是可信动作来源。

消息详情提供“查看设备分享邀请”。点击先重新读取认证详情，当前动作有效才`stageDirected(id)`进入原`/share-invitation`；同一个控制器继续预览→用户接受/拒绝→原目录/设备页。已撤销/终态或失活动作为空时不导航；消息已读/删除与接受/拒绝不同，不用删除消息代替拒绝。无新share/grant/MQTT逻辑。

补充sessionEpoch、请求代际与页面销毁守卫：晚到详情不覆盖新账号/其他消息，已显示详情换号后隐藏；动作重复点击不重复发起，换号/销毁后不stage或导航。原消息页使用可变MessageService，而当前Angular默认OnPush会使异步详情变更后按钮不刷新；现显式Eager（与既有profile徽章一致），用真实模板断言动作按钮已出现，不只检查组件字段。

验证：Angular **113/113**（message service13、message page14、分享API10、owner8、flow9、管理5、确认4、link2、entry2、ntfy15、message deep-link3、interceptor28）；类型检查通过。覆盖详情ID不匹配/未知动作、撤销后点击、重复点击、换号晚到与销毁；服务器PG11、真实dispatcher/auth夹具1及正式Device V2链通过，见[Service§35](../../aily-blinker-services/docs/DEVICE_V2_CROSS_SHARD_ROUTING_IMPLEMENTATION_PLAN.md)。不把模板/HTTP测试称为原生通知或视觉真机验收。

Q2a完成仅表示站内可读及统一确认入口接好；系统通知仍提示“尚未接通”。下一批Q2b核对原ntfy安装合同并补服务端注册/轮换/退出撤销、每安装回执/有界投递；通知只携messageId，由登录后详情取当前邀请，不直接携proof/Key或执行accept。Q3再真实邮箱邀请/领取、禁通知、重复/过期、换号/安装撤销/冷启动及Auth账号生命周期，随后R4实体LAN撤权、B1～B4。

未安装APK、部署常驻schema、改LAN/分享开关、操作真实账号/网络/Flash或暂存/提交/推送。主线见[分享方案§8.7](../../blinker-library/docs/DEVICE_V2_SHARING_USER_FLOW_AND_R3C_PLAN.md)；不扩编辑器、设备协议或Hub/S4。

## 51. Q2b1原通知客户端与安装API闭环

2026-09-11。沿用NtfyService原POST注册/恢复、SecureStorage、DELETE退出清理及原生插件，不重写通知客户端。Gateway现已实现原合同，激活前202不下发凭据，active才200；revoke_pending必须等待远端删除确认，重复重试不改变退避。服务端provider/状态/部署细节集中在[通知安装与投递方案](../../aily-blinker-services/docs/NOTIFICATION_INSTALLATIONS_AND_DELIVERY_PLAN.md)。

App移除原宽松字符串/事件准入：只收HTTPS根地址、单一合法username/topic、无控制字符token。消息事件必须是当前账号active安装、精确topic且event=message；只消费合法sequence_id再查认证详情，不相信ntfy正文中的邀请或链接。退出、换号和其他topic不能驱动旧账号消息刷新，原256条去重上限保持。没有新增UI或设备连接。

关联Angular **46/46**（ntfy16＋消息service13＋page14＋deep-link3），类型检查通过；Gateway真实临时ntfy＋隔离PG＋index合同 **12/12**验证创建/恢复/续期/退出竞态、旧token失效及已建立订阅关闭。它不是Android系统显示/后台保活、公开TLS或真实邀请测试；客户端离线退出仍可能尚未完成远端撤销，不声称立即删除已在途系统提醒。

下一项Q2b2原messageId→每安装持久投递；然后Q3部署私有通知HTTPS/Auth目录，做真实双账号、禁通知/点击/冷启动/换号/离线退出与账号生命周期。当前保留“系统通知尚未接通”文案，不把安装API可用冒充真实邀请已发。R4和基础B1～B4顺序不变；无APK、常驻部署、网络/硬件/开关或暂存/提交/推送。

## 52. Q2b2发送合同接好；App进入部署/原生验收

2026-09-11。App生产代码无需新增通知解析、MQTT或邀请控制器：服务端按当前合同只发送通用提示与sequence_id=messageId，原NtfyService→认证消息详情→同一邀请确认页保持。服务端每安装检查点、退避/取消和最小发布权限已实现，详见[通知方案§7](../../aily-blinker-services/docs/NOTIFICATION_INSTALLATIONS_AND_DELIVERY_PLAN.md)。

注意三条体验边界：后注册手机不补发历史通知，但可查持久收件箱；本阶段供应商不缓存通知，离线不保证系统补推；服务端accepted只表示供应商受理，不能显示“对方已收到/已同意”。旧提醒点击仍需认证详情与当前preview，通知不携设备Key/proof，也不自动接受。当前常驻开关关闭，成功提示保留；真实部署后再按实际能力调整文案。

下一批Q3先补Auth/Kong/私有HTTPS，测试两账号邮箱定向＋开放链接、实时提醒、原生冷启动/杀进程/禁通知/换号/离线退出及注销同步，再R4实际LAN撤权。服务端隔离真实供应商/PG/入口25/25，App相关46/46；它们不是Android系统通知或视觉真机证据。本批无APK/设备/网络变更，不扩编辑器或设备协议。

## 53. Q3c真实Android订阅、系统显示与安装撤销恢复

2026-09-11。常驻部署与备份见[Service通知方案§10](../../aily-blinker-services/docs/NOTIFICATION_INSTALLATIONS_AND_DELIVERY_PLAN.md)。本批已构建/安装修订debug APK，保留真实登录和原页面数据；不修改源码API环境或LAN默认开关，只在生成制品使用原本机HTTPS入口。严格CA校验最初失败是本轮构建漏传既有`BLINKER_DEBUG_NETWORK_CONFIG_DIR`，补回原debug-only配置后匿名403及认证订阅通过，未绕过TLS或修改release信任。

两处小范围修正：NtfyService先getNotificationPermission，仅prompt时请求，重连不因已授权而再次等待Activity；独立`capacitor-ntfy`保持已运行Service状态，旧worker只关闭自身连接，避免finally关闭替代连接，移除无消费者线程引用。运行状态、网络线程、账号安装、消息来源校验继续解耦，不新增分享控制器/设备协议。

验收：App ntfy20/20＋消息/页面/深链/拦截器58/58，类型/local构建、原生JVM5/5及APK通过。真实手机生产安装active；3次ensure重启订阅、超过原10秒误报窗口、精确sequence_id接收及Android NotificationManager对应记录通过。消息由原生产provider向当前真实安装发送，但messageId是合成测试值，没有生成邀请或grant，也不证明点击后的认证详情可用。

再调用原revoke，验证本地停止/历史清除、服务端精确安装revoked、旧token401/403；恢复同账号新安装并重新连通。此次未真正退出登录，不能代替换号/离线退出/冷启动验收；其他账号2条待清理记录不以当前身份强删。系统已经显示的通知是否删除另验，不与订阅终止混淆。

本机Gradle init显式引用维护中的原生依赖源码；普通file依赖仍是包管理器快照。后续发布须刷新该快照或发布插件版本，否则仅App源码更新会漏掉原生修正。installation开、delivery关；成功提示暂保留，下一项真实邀请投递、通知点击路由/冷启动/账号生命周期，再R4及基础B1～B4。不刷板、不改设备绑定或分享权限、未暂存/提交/推送。

## 54. Q3d点击入口解耦与真实邀请验收

2026-09-11。插件`notificationAction`只唤醒，`consumeNotificationAction`消费一个最新点击；不执行raw/click URL，仅按配置signature/topic/transportId的opaque引用查当前本地历史，stop/clear/切配置清理。冷启动不依赖JS已经注册监听，也不使用无界事件积压。App原NtfyService统一复用当前账号active安装和sequence_id校验，异步消费前后复核session/安装；点击不受消息接收去重抑制，ViewService复用原消息路由，业务仍由认证详情和邀请确认页决定。

App **84/84**（ntfy23、消息/页面/深链/拦截器58、入口3）、类型/local构建，原生 **8/8**、插件TS/rollup、普通APK构建通过。已刷新本地file依赖/cap sync，实际安装不再需要临时Gradle源码覆盖；保留debug-only测试CA，未关闭校验。真实warm邀请系统点击→exact认证详情→确认页明确拒绝通过；开放链接预览与owner撤销后拒绝通过。未测试二维码扫描或接受share。

冷门禁未通过：终止本App进程后该手机删除已有通知，原生服务自动恢复；WebView未启动时后续真实邀请供应商accepted但原生历史/通知栏无精确消息，native持久状态却为connected，回前台转reconnecting。必须区分持久status、真实socket活动、后台系统/网络行为，不能直接以系统限制或根因猜测结案；冷点击缓存单元测试不是实际冷启动证明。

原账号、`/home/device`与通知订阅已恢复；5条测试邀请已全部拒绝/撤销，无新增设备授权。本机delivery开、跨shard分享关；完成后台恢复/冷点击及真实接受/账号生命周期后再R4。完整部署和证据见[Service§11](../../aily-blinker-services/docs/NOTIFICATION_INSTALLATIONS_AND_DELIVERY_PLAN.md)。无设备/网络/Flash修改、未暂存/提交/推送。

## 55. Q3e实际授权闭环与后台冻结边界

2026-09-11。目标App的原生线程停在do_freezer_trap，UID父层freeze=1、进程frozen=1，回前台归0后收信恢复；FGS存在/virtualFreeze=false不能作为健康证明。插件只增加实际open/keepalive/message的诊断观察，HTTP头不再提前报告connected；不改权限、不加JS保活。具体系统策略仍待对照，详见[Service§12](../../aily-blinker-services/docs/NOTIFICATION_INSTALLATIONS_AND_DELIVERY_PLAN.md)。

真实通知在结束Activity后收到，用户实际点击重新创建页面，认证详情/邀请确认/拒绝通过；不是冻结期间送达或进程死亡冷启动通过。两真实账号在Broker1/0，受控开本机原跨片开关后，认证邀请列表→明确接受viewer→自动进入设备页通过；owner公开撤销后接收列表不再返回该设备，旧已接受邀请不再授予权限。两个实际Broker确认授权/route精确失效；设备物理ACK/本地提前断连尚未验证。

ViewService删除未使用newIntentData及废弃快捷入口注释，继续共享原验证/路由；App97/97、类型/local构建、原生8/8和普通Gradle制品通过，最终保留数据更新到手机。原账号/首页、通知连接恢复，测试grant已撤销，跨片开关恢复关闭，delivery保持开。通知兼容性不阻塞核心授权链，下一批R4物理闭环；后台/进程冷启动/账号生命周期/QR与组件权限仍保留发布门禁，不宣称全量上线完成。

## 56. R4 真实共享账号 LAN 撤权与恢复

2026-09-12。使用原认证收件箱/分享确认页，两次接受operator后自动进入设备页；原页面连接端口在Cloud ready同时建立LAN，Property/Action和设备State回报通过。owner公开撤销后，两真实Broker回执、MCU精确Retire ACK与App旧LAN关闭分别有证据；共享账号保留原MQTT Session。再次签发403；重分享恢复，旧Session对象继续command被拒。恢复owner同设备读/控仍正常。详情见[设备侧集中报告](../../blinker-library/docs/DEVICE_V2_LAN_R4_HARDWARE_REPORT.md)。

测试工具修正：caller scope.closed只代表页面所有者结束，不能当作原生socket关闭；复用原subscribeClosed观测最终释放，独立close复测29 ms，不增加另一套清理器。68/68 App回归和debug构建/安装通过。App生产源码/权限/UI没有本批改动；源码LAN默认关，生成的本机debug开启。安装保留用户数据，收尾原owner/首页/MQTT ready/通知connected、LAN caller空闲。

R4最小物理闭环已过，但另一物理设备同账号并行隔离仍待补，不能把owner同设备恢复算作另一设备未受影响。下一批结合第二板普通WiFi示例补该项、开始B1，再B2owner解绑；后台通知/QR/逐组件与全平台发布仍独立，暂不扩编辑器/网关。未暂存/提交/推送。

## 57. R4第二物理设备与原账户MQTT隔离

2026-09-12。真实共享账号中COM12 LAN控制/撤权/设备exact ACK/原连接关闭期间，COM3普通WiFi设备持续13次Property ACK（撤权完成后5次）和实际State更新、Action确认；两条业务路径共享原App唯一账户MQTT，Session保持ready/不重连。普通WiFi首次登录、Manifest/State、硬复位后恢复也有证据。汇总、资源与部署边界见[集中报告§6](../../blinker-library/docs/DEVICE_V2_LAN_R4_HARDWARE_REPORT.md#6-第二物理设备隔离与b1普通wifi初步见证)。

测试通过原DeviceV2Service持有有界State interest，不创建另一MQTT、不修改UI/路由策略；结束仅释放本观察者。最终原owner/首页/MQTT ready/通知connected、LAN caller空闲，两个测试share撤销。三端跨片测试开关复原；本批无App源码/APK变更。R4第二设备尾项关闭，下一步B1/B2；App的owner DELETE仍须Service实现，不能将分享撤销当成owner解绑完成。
