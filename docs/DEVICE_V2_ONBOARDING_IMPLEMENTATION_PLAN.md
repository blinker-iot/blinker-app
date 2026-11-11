# Device V2 App 配网、绑定与凭据实施方案

> **最新 B3-4c-4b 南向（2026-09-13）：** 真实 APK 原账号通过单个账户 MQTT 的 connection demand 唤醒原 Hub，再用独立 state interest 获取孩子 State；不是第二条 MQTT。普通 BLE 孩子经原 Method 2/DirectSecure 完成授时/Property/Action/State，手机 BLE links=0。设备修正仅本地 TX WouldBlock 的有界重试，无 App 生产代码/UI/APK 修改。ADB 接回后已补活动断开/holdover、来源不可用时真实 Error/控制与自动授时恢复；两块原 WiFi 固件控制复验及测试 owner 回收通过。USB 间隔原账户 MQTT 曾重连，补验只使用该账号当前唯一 session，不把失联段记为连续。旧 GATT 周期让出仍有控制窗口边缘失败及 State 延迟，不算无缝；原身份/权限未重建。详见[设备授时 §19](../../blinker-library/docs/DEVICE_V2_TIME_SYNC_IMPLEMENTATION_PLAN.md#19-b3-4c-4b-南向真机与本地发送背压修正2026-09-13)，当前回 B4 单槽 scope/caller 接替与通用 LAN；下方“孩子会话尚未建立”为历史。

> **当前 B3-4c-4b 自身台架（2026-09-13）：** 在本轮已安装修正版 APK 上，原 Hub 身份的 Manifest/State、普通重启后恢复和原账户 MQTT 保持通过；未打开孩子控制需求，不能宣称子设备授时/控制已过。没有增加 App UI/账号连接或改身份方案。下一包复用现有真实网关会话驱动原孩子短闭环；台架弱存储边界及状态见[授时 §18](../../blinker-library/docs/DEVICE_V2_TIME_SYNC_IMPLEMENTATION_PLAN.md#18-b3-4c-4bhub-自身台架准入与普通重启2026-09-13)，然后回 B4。

> **当前 B3-4c-4a-r（2026-09-13）：** 精确检查点修正已完成匹配 APK 保留数据安装及真实添加入口回归。设备仅 resetNetwork，原 Key/接入根保留；Security1 GetInfo flags=7，真实 resolve 后只 load 当前逻辑 ID，旧模糊查找调用 0 次。原 enable-cloud replay 一次、Key/version/epoch/本地控制 secret 均未改变；无 create/rotate/reset、无清凭据。自动回原页、BLE 属性/按钮与原账户 MQTT 并行、退出回收/原固件恢复通过。旧/新缓存共存仅软件门禁，不伪造历史记录；72 项/两套类型与 Android 构建通过。本轮不增加 UI 或身份方案；下一步 Hub/子设备授时，再 B4。证据与边界见[授时 §17](../../blinker-library/docs/DEVICE_V2_TIME_SYNC_IMPLEMENTATION_PLAN.md#17-b3-4c-4a-r匹配-apk-与仅重置网络真机2026-09-13)。下方 APK 待验为历史。

> **当前 B3-4c-4a（2026-09-13）：** 原 BLE 身份经真实 WiFiProv 保留 ID/控制权启用 WiFi、自动进入控制页、BLE 与原账户 MQTT 并行 Property/Action、设备普通重启已通过。首次失败发现同物理实例的旧退役 WiFiProv checkpoint 误选；精确清理一条已无服务端 Admin 的测试缓存后完成硬件闭环。生产逻辑现已改为：添加入口在已有接入根时先 resolve 当前账号逻辑 ID，再精确恢复其检查点；不改空根 pending/显式 expected ID、不得吞 epoch 错误或自动删未知凭据。相关 6 文件/72 项和 app/spec 类型检查通过；**该修正尚未构建/安装匹配 APK**，不能把人工清理后的硬件结果当作修复已真机验证。下一包短回归此边界，再 Hub/子设备授时，随后 B4；不新增 UI、账号 MQTT、授时路由或服务器接口。证据/安全边界见[授时 §16](../../blinker-library/docs/DEVICE_V2_TIME_SYNC_IMPLEMENTATION_PLAN.md#16-b3-4c-4a正式-wifible-图的短真机闭环2026-09-13)。

> **当前 B3-4c-3（2026-09-13）：** 设备侧已接网关南向可选 Time responder、真实 Method 2 权限和 Hello/executor 边界，软件已过、短真机未过。Hub 自身 feature 仍不能替代子设备的实际协商/权限；App 不新增连接、授时路由或 UI。本批未改 App 生产源码/安装包，下一包设备短闭环后回 B4，唯一状态见[授时 §15](../../blinker-library/docs/DEVICE_V2_TIME_SYNC_IMPLEMENTATION_PLAN.md#15-b3-4c-3唯一南向-executor-的可选授时2026-09-13)。下方“南向未接线”为历史。

> **当前 B3-4c-1/2（2026-09-13）：** 设备侧已接 WiFiBLE/内部 Hub 自身可选授时、共享只读业务快照及独立回应策略；本批不改 App 生产代码/页面/账户 MQTT，也不安装 APK。**网关南向 responder 仍未接线/宣告能力**，App 不得据 Hub 自身 TimeSync feature 推断所有子设备可授时。下一包补设备 Method 2 真实权限快照→按安装情况协商→唯一 executor/队列/会话退役围栏及短真机，再回 B4；现有 BLE/LAN responder 合同不变。状态和资源以[授时 §14](../../blinker-library/docs/DEVICE_V2_TIME_SYNC_IMPLEMENTATION_PLAN.md#14-b3-4c-12混合与-hub-自身共享快照和回应策略2026-09-13)为准。下方 B3-4b 已过项保留，不重复清授权/刷板。

> **当前 B3-4b LAN 真机（2026-09-13）：** 已保留数据安装包含 §12 LAN 授权/responder 接线的 APK；沿用已验 418 项源码，本批重新构建/安装而非又一次全组执行。普通 ESP32 明文 LAN 经真实 HTTP grant/recipient proof/Hello 后，原五分钟到期完成 28/40 B 授时，Property/Action 168/84 ms，账户 MQTT 不重连。真实 Observer 显式丢失业务锚点后不授时、写控制被拒；原固件/Key/ID 已恢复，台架工厂/owner 已回收。首次改权限的新 scope 握手因现有单槽边界未通过，等待原期限/保留窗口后成功，此限制仍归 B4，不能称即时切换。没有 UI/登录/新 MQTT 修改，源码 LAN 默认仍关闭。本批为服务级真实会话门禁，不替代全部页面/杀进程/加密和分享撤权。下一步 B3-4c 混合/Hub 同一时钟及南向回应→B4，详见[授时 §13](../../blinker-library/docs/DEVICE_V2_TIME_SYNC_IMPLEMENTATION_PLAN.md#13-b3-4b-lan-授时真机2026-09-13)。原 BLE Control/R4 安装对照已过，Observer BLE/平台/一小时过期仍单列；以下记录为历史。

> **当前 B3-4a（2026-09-13）：** 已实现共用 DirectTimeResponder，并在 BLE 完成 Method 2/设备 proof/实际 permissions 校验后安装；Hello bit 24 只表示能力，Observer 不回应。复用已有 DirectSecure 通道与业务 ACK，5 秒单调限流、无效 UTC 回关联 Error；不增加账户 MQTT/页面/后台轮询。BLE 发送最多 2 项，关闭立即 native cancel，迟到加密/接收不能写入。协议/BLE/LocalAccess/EdgeGateway **36 文件/411 项**与 app/spec 类型检查通过；未构建安装本批 APK或刷板，不冒称 BLE 真机授时已过。下一步匹配固件/手机短闭环，再接 LAN：必须由 LocalAccess 授权返回实际权限，不能从 UI 或 socket 推断 Control。LAN 当前尚未安装 responder/协商 bit 24。唯一合同、资源与后续顺序见[设备授时 §11](../../blinker-library/docs/DEVICE_V2_TIME_SYNC_IMPLEMENTATION_PLAN.md#11-b3-4a普通-ble-control-手机业务授时2026-09-13)。以下“当前/下一步”均为历史记录。

> **B3-3 真机补记：** 本批沿用已安装真实账户 App，验证 COM11 的 MQTT Property、14 个实时样本启停/恢复、重启后不恢复旧租约，以及恢复 QuickStart 后的 Action/State；COM3 TLS 状态变化通过。没有新 UI/账户 MQTT/安装包。设备 UTC 在设备观察打开前已有效，授时不依赖 App 页面租约。串口背压与受控离线边界仍按设备 §8 补证，随后再接 B3-4 App Control Direct/LAN 回应。

> **最新基础主线 B3-3（2026-09-13）：** 普通 WiFi 云授时已接设备可选 facade/Runtime 与 Broker 原物理 MQTT session，不依赖 App 打开设备页、不增加账户 MQTT。App 本批无生产代码或 APK 变化，协议回归 156/156 通过，原真实账户控制用于旁路回归。APP_FEATURES 仍不宣告 TimeSync；B3-4 才在已认证 Control Direct/LAN 会话响应新鲜请求，Observer 不得提供校时，手机时间不能接管安全授权时钟。软件、资源、本机 Broker 部署及 COM11 当前验证以[设备授时 §8](../../blinker-library/docs/DEVICE_V2_TIME_SYNC_IMPLEMENTATION_PLAN.md#8-b3-3普通-wifi-可选业务授时2026-09-13)为准；不因 codec 已有就提前开放普通 App Route 注入或新增页面。

> **最新基础主线 B3-2（2026-09-13）：** 原 App codec 已补 TimeRequest/TimeResponse，与设备/Broker 的共享 golden 一致；bit 24 只识别、不加到 APP_FEATURES，未安装 responder 或增加页面/轮询/账户 MQTT。协议 11 文件/156 项、app/spec 类型检查通过；默认路由拒绝把授时作为普通 App Route 注入。先 B3-3 普通 WiFi 云授时，之后 B3-4 在已有认证 Direct/LAN 的 Control 会话回应设备新鲜请求，Observer 不可校时，来源由接收端 runtime 决定；手机 UTC 不能用于安全授权时间。完整合同和资源/实现边界见[设备授时 §7](../../blinker-library/docs/DEVICE_V2_TIME_SYNC_IMPLEMENTATION_PLAN.md#7-b3-2-实施与验证2026-09-13)。没有构建/安装 APK 或操作手机；以下旧“当前/下一步”为历史。

> **当前基础主线 B3-0/1（2026-09-13）：** 混合生命周期主路径与默认普通 WiFi 真机已推进至设备仓 B2b-13/B1b-3，下面此前“混合云端未上线”为历史，当前以[设备基础路线](../../blinker-library/docs/DEVICE_V2_BASELINE_CLOSURE_ROADMAP.md)为准。本批已实现独立业务时钟核心，但没有 BBP TimeSync/公开 time API。后续 App 只在已授权 Direct/LAN 且具有 Control 权限的会话回应设备的新鲜时间请求，Observe 不可校时；不新增后台轮询/账户 MQTT/页面前置，不把手机 UTC 用作授权有效期。下一步 B3-2 三端 codec/golden 和请求关联，App responder 接线在后续 B3-4。详见[唯一授时合同](../../blinker-library/docs/DEVICE_V2_TIME_SYNC_IMPLEMENTATION_PLAN.md)。本批 App 仅文档更新，未改代码/安装或操作手机。

> **跨日续测（2026-09-13）：** 已修复 BLE-origin 原生 WiFi 被误判网关子设备：原目录投影显式返回有效拓扑 `gatewayRouted`，App 两处共用判断，离线缓存保留非秘密标记；不以 Key/类型/MAC 代替拓扑。App 223/223、PG 65/65 再次通过，匹配本机单模块 Gateway/APK 更新已完成。自动页面 BLE ready 3,638 ms、开关/按钮 334/350 ms、离页退出已验。混合固件 cloudReady=0/无 challenge-session 和最新 COM3 见证离线仍待定位；不重复 enable-cloud/038、不先换根。详见 [最新真机报告 §5](../../blinker-library/docs/DEVICE_V2_MIXED_LIFECYCLE_HARDWARE_REPORT.md#5-跨日补测自动-ble-页面及显式拓扑路由)。以下 116 项/8 模块等为此前部署阶段记录，不代替最新结果。

> **最新 B2b-11（2026-09-12，本机已部署）：** schema 37 实际备份完整恢复演练后升级 38，44 张原表数据保持、重复迁移零写；本机 Gateway 8 个关联模块/hash/healthy 已验，Broker/Auth 未重启。匹配 APK 保留数据安装，App 116/116、PG 65/65 本批重跑。COM11 真实 BLE→WiFi enable-cloud 一次、无 create/rotate，原 ID/type/页面/epoch 保留并自动进入原页；原根 Direct 控制与 COM3 MQTT 见证已过。云端实际控制、自动 BLE-first、后续 reset/PATCH/联合移除以 [混合真机报告](../../blinker-library/docs/DEVICE_V2_MIXED_LIFECYCLE_HARDWARE_REPORT.md) 的最新分项为准；首次分配窗口仍待补。未部署远端、未清授权；下文“本机未部署/未安装”为历史，不重复迁移或安装旧包。

> **最新 B2b-10（2026-09-12）：** App 已在原 WiFiProv 页面/协调器实现已有设备换根恢复：secure prepared→固定幂等 ID rotate→secure key-ready→原 PATCH/PUT→复查 GetInfo→Bootstrap/精确 ACK→active。没有新设备 wire、无 raw Key 持久副本；schema 6 隔离轮换 journal，普通 active 仍 schema 5。页面重建复用同操作，网络重试保留真实 epoch；App 十文件 116/116、类型及 local 构建通过。Service/MCU 本批未改，PG 65/65 为前批结果、未重跑；**尚未部署/安装/真机，首次 create→pending 分配窗口仍待补**。下一包先 037→038 存量升级演练/备份与关联部署，再专用混合真机；详见 [owner §18](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_IMPLEMENTATION_PLAN.md#18-b2b-10-key-轮换前安全检查点与页面恢复接线2026-09-12)。下文“页面仍阻断/检查点未接”为历史，不是当前源码状态。

> **最新 B2b-9（2026-09-12）：** 管理服务新增 `resetDirectAdminV2` 严格 PATCH 适配器，复用 PUT 的响应校验；显式列八字段，不展开含 secret 的 credential，不用 HTTP 响应激活本机根。Service 条件替换/旧授权退休/实例连续性 PG 65/65，App 95/95、类型及 local 构建通过。**页面仍保留“替换尚未开放”保护**，不新增半完成按钮。下一包先持久化 prepared/operation/rotate 幂等 ID/候选 Admin，再 rotate→PATCH→原 Bootstrap/ACK→active；补跨进程/切账号和分配窗口后才打开入口、部署真机。未安装 APK/未清授权。详见 [owner §17](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_IMPLEMENTATION_PLAN.md#17-b2b-9-新根条件替换实例连续性及旧授权隔离2026-09-12)，以下为历史。

> **最新软件入口（2026-09-12，B2b-8）：** WiFiProv 首次 Admin 已接入原 PUT；顺序为 secure pending→metadata→exact 101 B Bootstrap→active→WiFi。复用账号隔离 credential store，只增非秘密 cloudContext，不持久保存 DeviceKey；原 BLE recovery 不消费 WiFiProv pending。独立小协调器注入 API/transport/store，页面不持有 Admin secret；指纹与纯 BLE 共用。App 92/92、类型及 local 构建通过，未装 APK/真机。清根后已有服务端 Admin 会先阻断后续 Key 轮换；这是保护，不是新根替换完成。下一包按[owner §16](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_IMPLEMENTATION_PLAN.md#16-b2b-8-wifiprov-首次-admin-登记与检查点恢复2026-09-12)处理条件更新/分配检查点窗口，再混合真机。以下“WiFiProv 未调用 PUT”是前批事实，不再是当前状态。

> **最新接线审核（2026-09-12，B2b-7）：** Service 混合 owner DELETE 软件已支持，沿用原 200/202/`localAccess=not_confirmed`，App 不新增删除接口或把云端移除当本地擦除。本批源码核对发现 WiFiProv 新建已生成/Bootstrap/安全保存 Admin，但未调用既有 `PUT direct-access/admin`；纯 BLE `commit` 登记和 BLE→WiFi 保留原身份是另外的实际路径，不能混为一谈。**下一小包优先闭合首次登记、Bootstrap 失败恢复、保留根重配网和 reset 后新 Admin 的冲突处理，再混合真机。** 旧 API 只允许首次登记/精确重放，不可直接拿它覆盖旧根；不上传 raw Admin、不清其他账号缓存、不新增第二套 enrollment。细节与软件/真机边界见 [owner 移除 §15](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_IMPLEMENTATION_PLAN.md#15-b2b-7-混合身份联合退休软件收口2026-09-12)。本批 App 生产代码/安装包未修改。

> **最新实施/真机入口（2026-09-12，B2b-6）：** 普通 BLE 引导页已新增当前账号 pending 列表和明确“继续绑定”操作；用授权 PresenceKey 发现新 GATT link，和网关 relay 复用同一个 `resumeEnrollmentWithLink`→原 client.resume/commit，不新增 issue/协议。页面取消/切账号/晚到成功失败/finish 继任账号隔离、存储失败提示和中英文接线完成。52 项回归、TypeScript/local/debug 构建通过；真实 COM11 在第一次 commit HTTP 前受控失败，App 强停重启后由原页面按钮恢复 3,146 ms，同 ID/intent、0 issue/1 commit，Property/Action 250/267 ms，完成进入控制页；最终包重入 pending=[]。同一观察段 MQTT 保持，不声称跨安装/进程重启不重连。详见 [owner 移除 §13](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_IMPLEMENTATION_PLAN.md#13-b2b-6-普通-app-绑定恢复入口2026-09-12)。设备/Service 生产代码未改，普通恢复入口不再待实现；旧 active 孤立凭据、账号注销、另一账号转交/完整故障矩阵仍另列。以下入口为此前历史。

> **最新真机入口（2026-09-12，B2b-5）：** 原 BLE 引导页生产链路与设置页 DELETE 在 COM11 完成短闭环，修订静默测试固件 enrollment 7,911 ms、Property/Action 241/267 ms；云端移除不清本地，设备 reset 后新逻辑身份/epoch、新授权重启恢复，旧 Controller 获得真实 Method 2 Rejected。旧 issue/commit 410，COM3 24 次控制、原账户 MQTT 与 COM12 保留。详见 [owner 移除 §12](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_IMPLEMENTATION_PLAN.md#12-b2b-5-纯-ble-授权生命周期及串口对照真机2026-09-12)。前两次超时的 pending 使用原核心 client.resume 在真实 GATT/HTTP 下恢复；**这是私有测试驱动，不是普通 App 已有恢复入口**。下一步复用 credential store、授权 Presence matcher 与 resume/幂等 commit，为已安装但 pending 的 Direct 提供明确恢复操作并补账户隔离测试，不复制握手、不静默重发 enrollment、不清库。退休 active 凭据孤立缓存清理仍单列；同账号通过不代表另一账号转交、全部平台或带分享移除完成。本批未再次安装 APK，以下部署/未刷板说明均为此前历史。

> **最新部署入口（2026-09-12，B2b-4）：** migration 037/纯 BLE 释放代码已备份后部署本机；修订 debug App 已 `install -r` 保留数据更新，原 owner/15 项库存保留。实际设置页显示新移除按钮及本地未清除提示（只预览取消），COM3 原 WiFi Manifest/State、Property 156 ms、Action 184 ms 回归通过，测试段同一账户 MQTT。安装本身重启 App，不宣称跨安装 MQTT 不重连。仅生成制品保留本机 HTTPS/内部 LAN/debug CA，源码默认配置不变；未执行任何 BLE 移除或 Flash 清除。下一步确认 COM11 可否清原网关授权或提供空闲板，再专用 BLE 短闭环。详见 [owner 移除 §11](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_IMPLEMENTATION_PLAN.md#11-b2b-4-本机部署及非破坏真机准备2026-09-12)。以下为前批记录。

> **前批软件入口（2026-09-12，B2b-2/3）：** 按[基础主线](../../blinker-library/docs/DEVICE_V2_BASELINE_CLOSURE_ROADMAP.md)推进纯 BLE 移除/重新认领。原设置入口改为明确“移除设备/退出分享”；云端撤权不等于本地擦根，转交/重新添加前提示现场 reset，普通重启无效。Service 源码新增纯 BLE DELETE 和 409 `DEVICE_V2_BLE_RESET_REQUIRED`，App 用现有 i18n/`GatewayHttpError` 提示；不重试鉴权或重建 MQTT。新 Provisioning 仅在旧 pending 被服务器明确判为 410 DEVICE_RETIRED 且新 Hello epoch 不同时，删除这一条 pending 后继续；enroll/resume commit 失败、同 epoch、其他 403/410/网络错误仍保留记录并关闭 Direct，不擅自激活。五文件 75 项、生产/测试 TS 通过，未安装本批 APK，现场 Gateway 仍为 B2a。详见[owner 移除 §9～10](../../blinker-library/docs/DEVICE_V2_OWNER_REMOVAL_IMPLEMENTATION_PLAN.md#9-b2b-2-本批冻结先释放云端归属物理-reset-后另行认领)。下一步受控部署 migration 037/更新 debug App 后专用 BLE 短真机；既有 active 凭据孤立缓存清理与混合/网关解绑仍单列。以下入口仅为历史。

> **当前执行入口（2026-09-09，GATT§10.128）：** 已部署本机HTTPS/WSS、安装debug-only CA的LAN APK，修复local-access漏带Bearer；设备侧修复双栈socket地址误拒。真实mDNS→native WS已成功，但Challenge首包未到达，LAN业务未通过。COM12已恢复原固件/NVS；按[App LAN§7](APP_DEVICE_V2_LAN_ACCESS_IMPLEMENTATION_PLAN.md#7-可信调试apk与真实鉴权入口修复gatt10128)和设备LAN§28定位首包/MQTT重连，再做安全控制闭环。源码默认不开LAN，不声明无缝，不扩页面编辑器。下列入口说明按历史批次保留。

> **当前入口（2026-09-09，GATT§10.127）：** 可信self身份GET、LAN组合与原页面/账户/网络owner已接线。云端立即准备，LAN验证ready后才首选；未知结果命令不跨路重发，State/Event与verified Manifest复用原UI port/账户缓存。Service专项17与隔离PG/路由30项通过，App软件证据见[App LAN计划§6](APP_DEVICE_V2_LAN_ACCESS_IMPLEMENTATION_PLAN.md#6-页面owner与可信身份接线gatt10127)。App/公开签发默认关闭，下一步按[设备LAN§27](../../blinker-library/docs/DEVICE_V2_LAN_WEBSOCKET_DISCOVERY_IMPLEMENTATION_PLAN.md#27-原页面owner与可信self身份接线gatt10127)部署隔离backend/手机可信HTTPS，再普通WiFi隔离身份真机。未改页面UI/安装APK/部署/刷板，不声明无缝；网络为“带翅膀的蜗牛”，密码不入文档。

> **历史入口（2026-09-09，GATT§10.124）：** 设备已接ESP32实际SDK WS端口、独立mDNS和普通WiFi可选extension并交叉编译；尚未完成原生App/真实网络验收。按[设备LAN§24](../../blinker-library/docs/DEVICE_V2_LAN_WEBSOCKET_DISCOVERY_IMPLEMENTATION_PLAN.md#24-esp32实际监听器mdns与普通wifi扩展gatt-10124)接受限native binary WS、原HTTPS签发路由、原页面/账号/网络owner，再隔离身份真机。发现使用`_blinker-v2._tcp`的SRV端口和`/bbp2`；71 B TXT的随机locator不是MAC/设备身份，不可据此直接绑定设备。原生接收须在分配前限420 B、禁text和不受限重定向、按局域网目的地址准入；不打开全局cleartext/mixed-content。本批App仅同步文档，原账户MQTT与UI/源码不变。

> **历史入口（2026-09-09，GATT§10.123）：** 新增`core/device-v2/local-access/client.ts`单self会话：exact Challenge/Grant、LAN域NNpsk0、binary LocalSecureRecord、单发单收、取消/迟到清理/有限期限。复用原HTTPS与密码模块，没有新增账户MQTT或改页面UI。设备同批接原Runtime并修正Observe/Control上限；软件关联72测试、App/spec TS与新增文件lint通过。实际原生WS端口、mDNS、产品和公开签发仍待接入，按[设备LAN§23](../../blinker-library/docs/DEVICE_V2_LAN_WEBSOCKET_DISCOVERY_IMPLEMENTATION_PLAN.md#23-单self安全消息链路与runtime权限接入gatt-10123)。不能以mock端口或§22的真实控制ACK声称LAN/无缝完成；不开放全局cleartext/mixed-content、不重发不确定Action。原账户MQTT常驻，本地连接由页面/账户/网络代际owner按需持有。

> **2026-09-09 控制恢复进展（GATT§10.121，仅文档同步）：** 设备/Service/Broker已接新鲜Query/Status与后续投递耗尽恢复，软件/隔离PG通过；下一步真实MCU控制闭环。该Status仅内部控制进展，不是App设备在线、LAN Ready或业务授权；App不解析/转发此控制通道，不新增MQTT。生产LAN签发仍未开放；当前合同与证据见[设备LAN§21](../../blinker-library/docs/DEVICE_V2_LAN_WEBSOCKET_DISCOVERY_IMPLEMENTATION_PLAN.md)，App源码/UI未改。

> **当前执行顺序补正（2026-09-09，仅文档）：** 先收口设备控制/Hello/ACK/自动恢复和真机控制闭环，再接普通WiFi单caller/self的正式App安全LAN链路。mDNS只给候选，安全WS与授权/BBP会话共同验收；多目标/满槽续期在网关扩展与S4处理。统一边界见[设备LAN计划§19](../../blinker-library/docs/DEVICE_V2_LAN_WEBSOCKET_DISCOVERY_IMPLEMENTATION_PLAN.md#19-主线复核先收口控制闭环再做首条lan业务链路当前执行入口)。未开放App LAN签发，未修改UI或App源码。

> **2026-09-09 S3b-2b2b2接线批次（GATT§10.119，当前入口）：Service/Broker控制接线完成，App本批仅文档同步。**
> 0x36是物理WiFi/Hub云控制载体，不是App/child Route，仍共用原MQTT连接。内部控制HTTP已接源码，但App LAN签发尚未开放；传输accepted不能作为本地Ready。下一步设备产品队列/ACK、Hello与自动预算恢复/主动到期和真机门禁，见[Service计划§10](../../aily-blinker-services/docs/SERVICE_DEVICE_V2_LOCAL_ACCESS_IMPLEMENTATION_PLAN.md)。无App源码/UI/部署修改。

> **2026-09-09 S3b-2b2b2（GATT§10.118，历史入口）：Service有界投递/预算/清理核心完成，App本批仅文档同步。**
> 诊断retry_due/waiting_ack/exhausted不是设备在线/用户权限状态，也不能据此让App新建MQTT或要求用户重置。预算恢复应由库/服务重新取得云证明自动完成，真实接线尚未实施；生产LAN授权仍未开放。详见[Service计划§9](../../aily-blinker-services/docs/SERVICE_DEVICE_V2_LOCAL_ACCESS_IMPLEMENTATION_PLAN.md)。无App源码/UI/部署修改。

> **2026-09-09 S3b-2b2b1（GATT§10.117，历史入口）：持久命令/ACK恢复及签发ready门禁完成，App本批仅文档同步。**
> Service在同步/退休未恢复时拒绝新授权，不能用旧grant/另一MQTT绕过；这不代表B既有本地lease立即断开。Hello绑定当前云登录仅由设备与认证Broker上下文处理，App不指定proofSessionId。下一步worker/真实控制面接线后才开HTTP，见[Service计划§8](../../aily-blinker-services/docs/SERVICE_DEVICE_V2_LOCAL_ACCESS_IMPLEMENTATION_PLAN.md)。无App源码/UI或部署修改。

> **2026-09-09 S3b-2b2a（GATT§10.116，历史入口）：设备/Service认证控制协议与接收核心完成，App本批仅文档同步。**
> 精确撤A保留B已建立lease；其他尚在握手的目标需重新获取挑战，exact控制重传不重复打断握手。App后续消费必须区分“重取挑战”与“现有本地连接失效”，不能一律切换Cloud或建立第二条MQTT。
> Broker/产品控制入口、持久发送/ACK恢复、HTTP/WS/mDNS仍未开放；无App UI/生产代码/构建/部署变化。设备模块ABI和Host测试不是四端体验证据，下一步以[Service计划§7](../../aily-blinker-services/docs/SERVICE_DEVICE_V2_LOCAL_ACCESS_IMPLEMENTATION_PLAN.md)及设备LAN§15为准。

> **2026-09-09 S3b-2b1（GATT§10.115，历史）：Service持久签发/精确退休事实完成，App本批仅文档同步。**
> Service migration 027与真实PG repository已通过联合30项回归，权威来源为新鲜已验证session而非MAC/历史session；固定期限和请求幂等跨进程保留。HTTP仍未注册，不能让App提前调用或假装本地Ready。
> 下一批先认证authority revision同步、精确退休送达/ACK及在途旧grant阻断，再App安全socket/mDNS、单连接多目标及满槽续期；一账户MQTT不变。详见[Service LAN实施计划](../../aily-blinker-services/docs/SERVICE_DEVICE_V2_LOCAL_ACCESS_IMPLEMENTATION_PLAN.md)§3.2/6及设备LAN§14。本批未改App生产代码/UI、构建/安装APK或真机测试。

> **2026-09-09 S3b-2a（GATT§10.114，历史）：App有限LAN授权消费模块已实现，未接生产页面/socket。**
> 新增无UI的LocalAccess严格解码和HTTPS消费；账号/会话变化、取消、目标/挑战不匹配、无no-store或非HTTPS均拒绝。PSK仅临时内存，调用方负责clear。通用Base64URL从BLE抽出并保留旧导出，LAN不依赖BLE wire。19文件204项及生产/测试TS通过，未部署APK/真机。
> 下一批先Service持久authority/签发期限/精确撤权，再App安全socket/mDNS及单连接多目标；账户MQTT保持一条。详细合同见[Service LAN实施计划](../../aily-blinker-services/docs/SERVICE_DEVICE_V2_LOCAL_ACCESS_IMPLEMENTATION_PLAN.md)，设备LAN§13；不把API类已实现当成服务已开放或无缝已完成。

> **2026-09-09 设备S3a-1b（GATT§10.111，历史）：按通道访问绑定/协商/分派已实现，App本批仅文档同步。**
> App应逐通道消费Hello能力：普通Cloud MQTT不再声明BLE认证方法/ControllerControl/PresenceKeyControl，不能把另一条BLE连接支持的能力缓存成所有路径通用。设备逻辑Manifest/页面仍共享，不以transport创建第二个设备。没有新增App LAN端点/插件或UI。
> 设备Host/ASan53和四种ABI目标通过，非App/真机证据。下一批设备唯一child执行/需求，再S3b有限self/child授权与S3c发现/认证WebSocket；不得复用BLE凭据成为LAN权限，不增加账户MQTT。见设备GATT§10.111、LAN§10、共享方案6.10；未构建/部署App或暂存/提交/推送。

> **2026-09-09 设备S3a-1a（GATT§10.110，历史）：故障/会话清理/注册保护与容量基础已实现，App本批只同步文档。**
> Degraded是设备产品的路径错误诊断，不是LAN/BLE Ready，也不改变账户MQTT/BBP wire。Key/device/session撤销目前同映射AuthenticationRequired，设备仍按原安全边界关闭；不能把普通路径隔离理解为旧凭据可继续使用。
> 后续仍需按transport/session鉴权/control分派和共享child执行，S3b明确有限本地scope再做V2 discovery/认证WebSocket；当前不存在App生产LAN链路。设备Host/ASan53和32位容量测量通过，不冒充App回归或真机。完整证据见设备GATT§10.110、LAN方案§9、共享方案6.9。

> **2026-09-09 通用LAN修订（GATT§10.109，历史）：本批只完成方案分析，未修改App代码/UI/插件。**
> WebSocket是普通WiFi、WiFi+BLE、网关的共同局域网接入；一账户MQTT常驻，一Hub LAN会话可代理多child。mDNS只给候选，认证/协商Ready后才可控；同名/IP/MAC不合并身份，Hub被发现不能让全部child显示附近。
> 现有`capacitor-mdns`可作为接入基础，但Android为JmDNS而非NSD；补共享watch/网络代际、iOS精确服务类型和权限门禁。旧`device.service.ts`的`ws://IP:81` JSON接线经调用审计后移除，页面/编辑器/OTA工具保留。
> 正式Capacitor默认HTTPS WebView，本地`BLINKER_LOCAL_CLEARTEXT=1`测试包不能作为LAN发布证据；S3b需验证受限原生WS+应用安全或WSS在正式网络策略下可用，不通过全局降级解决。
> 本地权限统一为endpoint/self，网关扩展exact child，不消费Gateway secret。首次在线授权、已有会话有限离线继续；页面退出释放自身引用，最后使用者退出关闭LAN，账户MQTT不动。BLE附近不是Ready，切路不双发未知Action。
> 后续先ESP32普通WiFi self纵向，再同模块接WiFi+BLE/Hub及R4/Wio；具体以`blinker-library/docs/DEVICE_V2_LAN_WEBSOCKET_DISCOVERY_IMPLEMENTATION_PLAN.md`与共享方案6.8为准。S3c本地可用、S4无缝功能、S5体验门禁；本批无构建/安装/暂存/提交/推送。

> **2026-09-08 S2d（GATT§10.108，历史）：满槽permit Busy、A Direct物理让出/B继续、Hub MQTT换代恢复短测通过。**
> 同一账户MQTT不变，最终A/B计数6/6、scope=0，原设备身份/Key/Access保持；未改App生产代码/UI/APK。Direct测试仅申请物理Ready，未建立手机BLE ACL；不能写成完整直连测试通过。
> 下一批S3a共享执行/需求抽取；App后续S3b/c消费Hub＋child粒度有限本地授权及安全WebSocket，不新增每child MQTT或分发Gateway secret。S4新路径Ready后仅切后续请求，不自动重发未知Action。
> 原ControllerGrant是单设备凭据变更合同，不是网关子设备集授权；首次本地授权需在线，已认证会话有限离线继续，断网期间新撤权不能假装即时生效。具体边界和S3a～S5执行顺序以设备共享方案6.7为准。
> 无缝功能S4具备、S5真机体验确认；旧10s/6s周期仍在，MQTT故障恢复约9.6s不是无缝指标。41项硬件工具自测通过，App383项为前批证据，未重复标记。

> **2026-09-08 S2e（GATT§10.107，历史）：服务器多child路由及无Key身份补齐，A/B页面与双child短门禁通过。**
> Service已部署：B的cloudEnabled=true、credentialVersion仍null；Broker为有效网关子设备登记无登录凭据的元数据，修复未知Presence目标导致整个账户MQTT断开的缺口。
> 当前S1 APK无需UI/源码修改；普通A页面button2→3、B0→1，Manifest/State fresh及ACK、direct=false、离页scope=0；同一账户Cloud API并行A3→4/B1→2，两native连接已验。
> 释放A后，短窗口内B保持Secure并2→3/ACK；不是同时打开两个UI页，也不是第二条账户MQTT。原Access/绑定与页面配置保留，本批没有重新烧录或部署APK。
> 旧10s占用/6s让出仍会造成合法需求期间断连，未达到无缝/持续通信；先补S2d剩余容量/管理/换代门禁，再S3本地有限授权/WebSocket与S4去周期，100轮暂停。
> 本批硬件工具3项、Broker165及真实Redis/Service PG通过；App原383项来自§10.106，不冒充本批重跑。无暂存/提交/推送。

> **2026-09-08 S2d→S2e（GATT§10.106，历史）：S1 APK已部署，A普通页面通过，B正式绑定后暴露服务器单child假设。**
> A页面Cloud Manifest/State/button1→2/ACK、无Direct抢占和离页scope归零已验。COM3 B经真实permit/Hello/Noise/grant/receipt/Method2/proof达Active，保留原A。
> B没有DeviceKey是正常纯BLE设计；Service清单`cloudEnabled`需表示自身Cloud凭据或有效网关绑定，`credentialVersion/locator`仍null，Key入口仍检查真实Key上下文。
> owner/list/read/instance/share共用能力投影已补源码/PG测试，**尚未部署**。App不得本地伪造cloudEnabled、给子设备创建额外DeviceKey或从MAC推断网关关系。
> Service按Hub查路由仍拒绝多Active，Broker仍单context；现场日志确认，不是B认证失败或需要重置。B未通过数据面，先共享方案§6.5 S2e逐child route/authority，再配套部署并复测A/B。
> App42文件383项、Web和APK构建通过；两个发现列表测试改fake timer消除真实1ms抖动，生产deadline不变。本批仅App测试源码变更，APK来自现有S1；未改UI或暂存/提交/推送。

> **2026-09-08 设备S2c-3b/3c（GATT§10.105，历史）：实际Product两活动槽和空槽permit借还已接通。**
> App账户单MQTT/BBP/2保持，Cloud真实API经Broker→COM11 Hub→原A完成Manifest/State/button/ACK（计数0→1）；permit负测、幂等及关闭通过，没有重置A或创建B绑定。
> **部署差异：手机仍运行旧页面路由，在线时仍选Direct，缺当前S1的`isGatewayChild`分类。** 本批未构建/安装APK，不能把Cloud API结果记为S1普通页面已通过。
> 下一批先测试/构建/安装当前S1 APK，验证普通在线子设备页无Direct抢占、自己的Cloud owner在退出后释放；再用COM3新增B并完成1Hub+2child同账户并行门禁。
> 设备Host52/架构/347文件发布与ESP32两构建通过，单A短测ipc0最低剩余1104 B；双child/TLS重连资源待验。原Key/Access/绑定保留，本批测试owner和窗口已关闭。
> S3本地有限授权/WebSocket及S4取消默认周期仍未完成，100轮暂停。未改App UI/生产源码、未暂存/提交/推送；本地地址/TLS测试环境已更新。

> **2026-09-08 设备S2c-3a（GATT§10.104，历史）：子设备管理与Hub配对窗口已解耦。**
> child mux/回包归各自context；A的准入限制不再关闭整个Hub的新管理。Hub permit唯一，子reset不清它，原事务/结果/异步关闭屏障保留。
> Host/ASan52、架构/345文件发布和ESP32两构建通过。App账户单MQTT、原BBP/2和UI不变；本批未改App源码、构建/部署APK或操作ADB。
> 实际Product仍只有child0活动context；下一步设备3b空槽借用/目标child准入→3c双业务工作区→1Hub+2child。不得把原生GATT Ready/存储ACK标作B可控，也不要求重置A来添加B。
> 借B空槽不能绕过A的Direct承诺连接A；无缝切换还依赖S3本地有限授权/WebSocket与S4移除默认交替。100轮继续暂停，不新增第二条App MQTT或临时UI开关。

> **2026-09-08 设备S2c-2（GATT§10.103，历史）：原生双槽隔离的软件实现完成。**
> 同一Host可保持两个Port，只有扫描/发起串行；关闭/背压/SDK reset按连接隔离，容量受SDK上限约束。Central29场景＋SDK单槽目标、Host52及ESP32两构建通过。
> 实际Product/radio仍只接child0，B业务链路与1Hub+2child真机未验；App不得把GATT Ready/存储ACK冒充B可控，不新建MQTT或UI开关。
> 下一步设备按共享方案6.4收口管理/Hub permit范围、slot准入再接B；S3本地有限授权/WebSocket和S4取消默认交替仍待完成，100轮暂停。
> 本批App源码/APK、协议未变，未重跑App测试、操作ADB或部署。

> **2026-09-08 设备S2c-1（GATT§10.102，历史）：唯一Central Host及callback生命周期隔离已接入。**
> 设备登记容量2但原生活动仍1，B未接通完整route/control；App不将存储ACK/登记成功当成双child Ready，不要求新增MQTT或UI开关。
> 旧Port销毁/handle复用/Host restart回调由token拒绝；Port关闭不停止整个Host，SDK reset仍使其登记者明确失败。公开Sketch、BBP/2及App账户单MQTT合同不变。
> 设备18场景/Host51、架构/发布和ESP32两构建通过。下一步设备双原生槽→B纵向接线→1Hub+2child真机；本地有限授权/WebSocket、取消默认交替仍属S3/S4，100轮暂停。
> 本批App源码/APK未改、未运行App测试、操作ADB或部署，不声明真实并行通信/无缝切换已验。

> **2026-09-08 设备S2b-2b（GATT§10.101，历史）：双持久记录与轻量binding接入实际Product。**
> 设备绑定容量2、GATT活动容量仍1；存储ACK不等于B的proof/绑定/在线已完成，App不显示虚假Ready或引导用户重置A来接入B。
> 0号NVS记录原位保留，访问重置清全部记录后才清Hub Key；本批App源码/APK未变，未重新运行App测试或部署。
> 下一步唯一Central Host→双原生槽→B的纵向接线→1Hub+2child真机；账户仍单MQTT，本地授权/WebSocket和取消默认交替仍为S3/S4，100轮暂停。

> **2026-09-08 设备S2b-2a（GATT§10.100，历史）：目录管理分派与终态幂等的软件接线完成。**
> App源码/APK未变，继续S1账户单MQTT/在线Cloud代理；不能因设备源码分派已完成就声明多子设备、双BLE或无缝切换已可用。
> 设备按child/operation/epoch定位管理命令，terminal不挑空槽、不触碰新epoch凭据；损坏/关联renewal journal会阻断，不能提示用户重置A来接入B。
> 下一步设备S2b-2b多记录后端（保留原0号NVS）→共享Host/2-child原生池→1Hub+2child真机；App本地有限鉴权/WebSocket仍为S3，100轮继续暂停。

> **2026-09-08 设备S2b-1（GATT§10.99）：记录目录与凭据定向下发的软件接线完成。**
> App源码/APK未变，继续S1账户MQTT与在线Cloud默认路径；本批仅设备Host双记录隔离，不是双BLE真机或多子设备产品准入。
> 设备将墓碑、孤立轮换日志视为占槽，不能引导用户为接入B重置A。先完成控制命令分派和平台/原生池再核对新增B；本地WebSocket仍属S3。

> **2026-09-08 设备S2a（GATT§10.98）：共享MQTT＋独立child上下文的软件接线完成。**
> App继续S1在线默认Cloud，不增加每child MQTT/自动Direct抢占或UI开关；本批App源码/APK未变。
> 设备端仅两个软件上下文通过隔离回归，真实BLE和持久记录仍单槽；不能提前开放“多子设备已就绪”或无缝切换的产品声明。
> 下一步先设备目录/管理分派与共享Host连接池，再1Hub+2child真机；本地WebSocket鉴权仍属后续S3。

> **2026-09-08 §10.97 历史：普通网关子设备页面改为在线默认Cloud代理。**
> 主方案：设备库`docs/DEVICE_V2_GATEWAY_SHARED_CONNECTION_IMPLEMENTATION_PLAN.md`。账户MQTT不随页面重建；页面需求/本地连接与账户生命周期分开。
> 本批S1取消普通页面的自动Direct抢占，附近/凭据/Cloud错误不产生本地接管；只在明确离线且有当前凭据时保留原有限Direct。
> 后续S3本地WebSocket鉴权、S4页面路径连续性另行实施；未就绪前不宣称无缝。原在线Direct页面工具不再代表新默认行为，100轮暂停。
> 普通WiFi+BLE与无网关BLE行为保留；不新增UI开关，不能为通过历史工具保留自动抢占旁路。
> S1软件完成：在线/网络未知直接Cloud，离页只释放自身owner；离线凭据读取期间网络恢复则终止，未知Action不跨路重发。
> 清除旧自动接管接线与无调用的离线/在线跨界guard；协议Direct Ready及原有界离线能力保留。通信/页面385＋服务边界32项、本地Web构建通过。
> 尚未安装新APK或进行本批真机；Windows已确认COM3新增测试板，S2后用于1Hub+2child门禁，不能宣称当前已多连接/无缝。

> **2026-09-08 §10.96 历史：Direct Ready短物理承诺的自适应续租已实现并部署。**
> 同一owner在query发出时间＋实际剩余期一半处/原nextRenew两者较早处续租；兼容4/10/30 s，Cloud每10 s续租不变。
> 接受renew不延长旧物理deadline，新exact Ready才可延长；scope超时/取消/换号仍关闭，不隐式Action重试。
> 380项测试、本地Web/Android构建通过；APK `dc755c23b8c5eb5addb8b77145c98e2efb935555b5d7e5468fefff83eb06901d`原位安装，先于Broker 10 s候选。
> 旧App固定10 s续租不属于新10 s组合准入。单次/重复Hub MQTT换代已在原30 s请求内恢复；每页持有8 s的两轮及末尾取消、管理正反、完整10/30均通过。
> 30轮457.509 s通过，页面Ready3.983～4.510 s、每次单connect/close+OS释放+原Cloud恢复；末尾148 ms取消、165 ms回收，native0次。原下一阶段100已暂停，非发布结论。
> 持续页面保持同一native连接与同一owner，每轮两次renew都有新exact Yielded；未新增页面重连或隐藏重试。详见设备GATT§10.96/需求合同6.34。
> 最终首页账户ready，scope/link/session0且无opening/closing；临时观察已撤销，没有清数据或重置设备。
> 没有UI、Key、绑定或MCU SDK变更；原30 s失败测量全部保留，不改写为首次成功。

> **2026-09-08 §10.95 历史：普通Cloud owner的提前timer唤醒丢失续租已修正。**
> 旧实现回归：nextRenew前0.5 ms唤醒进入Direct-only query并返回，Cloud owner无timer却仍accepted；Broker到期回收。
> 修正仅在单调due之前重排同一timer，延迟向上取整；不提前renew/query、不加owner或重试/延长租约。Cloud/Direct均回归，376项通过。
> APK SHA256 `ee981b3e8e799c533bb54e6ccc0458c48c22971bf5573b3341d57a84be23a50b`已原位安装，不清数据或改UI/Key/绑定。
> 配套Hub只修旧投影隔离；短2/10通过，新30第5轮跨Hub MQTT换代时仍恢复超时，Cloud renew持续accepted。
> 旧Direct物理承诺不能因MQTT换代清空，当前整个30 s请求预算不足覆盖剩余承诺+重新获取/同步。
> 下一项先定向测量并冻结换代恢复消费/预算合同，不把首次timeout改算成功或静默Action重试；见设备GATT§10.95/需求合同6.33。
> 新版管理争用两项35.907 s通过：正向窗口关闭后才connect，取消152 ms、scope208 ms回收，观察约7.2 s无迟到连接。最终首页零scope/link/session。

> **2026-09-08 §10.94 历史：原APK管理争用与10次通过；30次第9轮Cloud恢复超时，已停止。**
> 复用标准页面唯一scope，管理窗口由独立原owner Open/Close；Direct先取消不关闭该窗口，窗口Close后仍观察约3.78 s，native连接0次。
> 10轮普通页面Ready4.011～4.193 s，逐轮一次连接/关闭、OS释放和原Cloud owner恢复；最后另一次Ready前取消也通过，counter0。
> 本批不改App源码/样式/APK，不清数据、Key或绑定；仍81ee0809已验证包。测试工具没有注入Ready/owner或绕过生产授权。
> 第9轮App Ready4178 ms且退出/OS释放正常，但独立生产账户caller在30 s内未恢复fresh；不据此认定是手机BLE或SDK故障。
> 工具补reachable/manifest/stateFresh/revision及白名单错误码，无业务payload；下一步联合Broker/Hub定位，不延长readiness预算。
> 完整证据/分阶段后续见设备GATT§10.94/需求合同6.32，不把本次扫描窗口负测扩大为所有enrollment传输故障场景通过。

> **2026-09-08 §10.93 历史：F4在线Direct两轮交替及Ready前取消真机通过。**
> 标准V2子页唯一拥有页面connection scope；删除外壳DevicePage额外的one-shot connect，共用组件名称解析，保留自定义页入口。
> viewActive同步setter立即取消，删除依赖ngOnChanges的旧触发；单独改setter不足以消除外壳保留的另一调用方，二者分别回归。
> 38文件374测试、本地Web/Android构建通过；APK SHA256 `81ee08092aea7f9764d928d042536fc09346d50e1dcc9d92fb6c3a6ceeea14c3`。
> 原位安装不清数据；Ready4.425/4.126 s；取消153 ms、导航154 ms、Ready拒绝157 ms、scope回收216 ms，native连接0次。
> 两轮Cloud恢复及取消后恢复均由同一独立owner验证，counter0、最终首页scope/link/session0；没有控制Action、Key刷新或重绑。
> 下一项真实management占用负测→10→30→100，完整时序及旧失败证据见设备GATT§10.93/需求合同6.31。
> 不修改页面样式，不将本轮单连接约15.6 s Cloud不可控成本说成低延迟/无中断；不开放其他产品的bit18。

> **2026-09-08 §10.92 历史：F3b原App/APK四端配对短门禁通过。**
> App业务源码/APK不变；Hub分阶段预算后，手机普通离线页Ready9988 ms、SDK关闭58 ms、OS确认后空档6048 ms，零残留。
> 同一真实Cloud owner完整可用窗口2270→7465 ms；首次不可控仍13837 ms。断电后RAM计数新基线0，未发Action、未清凭据或重绑。
> 现场网络已恢复mostfun2026；两网络开关/原reverse恢复，真实普通Cloud页fresh/可控/counter0，返回首页scope0。
> 下一批F4配套bit18准入及在线普通页单次Direct→Gateway→Direct，通过后10→30→100；本批bit18仍关闭，详见设备需求合同6.30。

> **2026-09-08 §10.91 历史：F3a真实离线手机与独立Cloud caller配对短测通过。**
> 手机不提供持续Cloud通路：两网络关闭且撤除USB云reverse，普通页Ready9.948 s、关闭50 ms、OS确认后空档6.060 s，零残留。
> 电脑caller复用App生产账户客户端和readiness、只持一个owner、不发Action。Cloud恢复13.759 s后仅2.270 s有用窗口，需先修Hub分阶段预算。
> 本批App业务源码/APK未改，仍6f146fe2已验证版本；工具112项与架构检查通过，不冒称重跑上批App357项。
> 下一项F3b见设备需求合同6.29；不开放bit18/10→30→100。USB接回后手机两网络开关/原reverse均已恢复，首页账户ready，scopes/links/sessions=0且无opening/closing。
> Hub已恢复§10.87正常固件；现场改mostfun2026后其旧WiFi配置尚未同步，不能把手机账户ready当作child Cloud恢复。下一批先做本机网络/TLS同步。

> **2026-09-08 §10.90 历史：F2b-C目录冷启动、Manifest authority隔离及独立离线普通页完成。**
> 目录模块只存非秘密投影，authority+auth.uuid/version1/256项/128 KiB；在线和恢复复用DataService模型转换，不造CurrentUser或协议响应。
> 完整在线列表替换并退休已移除设备scope；部分列表撤下旧缓存。账号切换/退出、SecureStorage迟到读取及旧HTTP列表/旧BLE回调不能回填继任者。
> Manifest改用相同authority+account前缀，旧来源不明缓存忽略；目录/role不授予权限、不标为在线，离线仍需当前Controller/授权Presence/Method2。
> 软件42文件357项通过；普通页两轮真机冷启动Ready3.318/3.025 s，到期SDK关闭53/55 ms、OS目标消失后6.039/6.049 s空档，零残留；恢复Cloud fresh/counter1。
> 手机已保留最终清理版新APK（SHA起始6f146fe2），账号/凭据/目录保留，原网络与USB云转发均恢复。
> **下一步F3配对：独立持续Cloud caller + 真正断网手机普通页。10/6只是候选、bit18仍关闭，不提前宣布四端公平或转10→30→100。**
> 首次立即OS列表查询失败原样保留；详见设备GATT§10.90/需求合同6.28。本批无UI布局/设备重置/凭据更改/Action或提交推送。以下为历史记录。

> **2026-09-08 §10.89 历史：F2a 真实关闭负测与重启恢复通过，F2b 有限离线接线完成但冷启动页面失败。**
> 实际SDK连接成功后取消交付、真实1 ms断开超时/失败隔离及进程重启恢复均已短验；不伪造SDK拒绝，不把逻辑关闭当物理释放。
> 原NetworkService空Cordova代码已替换为原生事实观测；MQTT重试/未知/WAN不可达不当离线证据，在线denied/pending不能转离线。
> 原group复用一个有限机会：16 s获取、首次native获取起10 s占用、真正SDK清理后6 s机会，旧admission不能清掉后继连接。
> App33文件262/262、类型/local/Android构建及工具106/106通过；真实无网冷启动auth保留，但目录为空，页面未挂载、SDK连接次数0。
> **按设备需求合同6.27先补 F2b-C：服务器+账号隔离的最小目录缓存、ManifestCache authority隔离及恢复/删除/损坏/迟到负测。**
> 目录只能来自服务器确认的显式产品类型/cloudEnabled，不从MAC或凭据推断普通BLE；缓存不能授予权限、标为在线或冒充State已同步。
> 完成后再测普通离线页面到期释放，随后F3持续Cloud owner配对公平；bit18仍关闭，10/6工程参数未冻结。
> 已恢复原手机网络、API/MQTT reverse、F2a APK和原Cloud fresh/counter1；设备/凭据/绑定不变，无新Action/暂存/提交/推送。
> 详细失败与恢复证据见设备GATT§10.89；以下为历史记录。

> **2026-09-08 §10.88 当前：F2a 修正真实关闭结果链，暂不开放离线受管 child 旁路。**
> record link → secure channel → session → service 不再把 native disconnect 拒绝转成成功；关闭失败保留隔离和原 closing 屏障。
> 取消 opening 等待原连接及晚到清理完成；逻辑 onClosed 立即退役业务，但不是物理释放回执，不能据此开始 Hub 机会计时。
> 30 文件 239/239、TypeScript 与前端构建通过；异常恢复尚需真实 SDK 验证，不能用 mock 宣称通过。
> Android debug 构建/覆盖安装成功，保留原 authority/账号/凭据；三轮独立 Direct Ready 2.820/3.789/3.598 s、关闭 Promise 133/120/130 ms。
> 每轮零 link/session，之后原 Cloud 页 fresh/counter1，离页零 scope/opening/closing；不是在线 Ready 或离线公平门禁。
> 设备 F1 同一 Cloud 页持续需求短测完成，但 10 s 占用/6 s 空档造成约 8.3～8.5 s 不可控期；工程参数未冻结，Hub 已恢复原正常固件。
> **正常关闭已真机确认，下一步补异常恢复边界，再实现原 scope 有限离线机会及双方公平；不新增第二套 owner/重试队列/UI 配置。**
> account retrying 不能区分网络、鉴权或配置错误；pending/ACL 拒绝/限流不得旁路。离线须有明确本机证据、当前本地凭据和新鲜授权候选。
> bit18 仍关闭；正常页面 Direct→Gateway→Direct 10→30→100 未通过。账号/Key/绑定未重置，无新 Action、暂存、提交或推送。
> 详细证据及后续顺序见设备 GATT §10.88、需求合同 6.26；以下为历史记录。

> **2026-09-07 §10.87 当前：App配合完成Hub真实断链→授权广播恢复测量，尚未开放离线受管child旁路。**
> 同一原APK/账号/绑定的三个有效样本：页面退出→广播1.024～1.156 s，Hub GAP事件→广播约37～106 ms。
> nonce/tag会轮换；测试层已删除固定广告字节匹配，复用本仓presence/wire生产纯函数验证当前账号PresenceKey，密钥不离开WebView。
> SDK扫描真实回调先于离页，HMAC完成不被当作广告到达时间；前两次错误工具失败保留，不以MAC/名称修补。
> 正常Hub固件已恢复，原Cloud页fresh/counter1，离页零scope/link/session；App生产源码、APK与UI本批未改。
> 下一批按设备需求合同6.25 F1～F3配套：离线是前台caller持有的有限本地机会，不伪造Broker Ready；
> pending/ACL拒绝/限流不得触发离线旁路，仍需当前本地凭据、新鲜授权候选及Method2；到期/后台/换账号须真实关闭并给Hub机会。
> 不能仅让Hub限时而让手机无限占用。10 s/6 s仅待测候选，不是已开放行为；双方公平通过后才bit18/正常页面四端循环。
> 工具100/100和架构通过；未重新执行全App回归，无新Action/重置/清Access/重绑/暂存/提交/推送。详见GATT§10.87，以下为历史记录。

> **2026-09-07 §10.86 当前：名称/QR查找取消及重启扫描预算已经真机验证。**
> PGEM10实测系统status6可能只打印日志而不回调。扫描预算改为独立Store+Android SharedPreferences，最多5个单调时间及冷却/boot标记；不包含账号、设备身份、Key。
> start前commit，失败明确BUDGET_STORAGE_FAILED、不调SDK；同boot重启不退款，已知新boot丢弃旧时间，损坏历史保守最多30s冷却。
> 原生5次扫描后立即杀进程重开仍约27.4s限额且未重新调用SDK；正常冷却后恢复，不新增隐藏重试或等待队列。
> `capacitor-wifiprov`候选≤64的检查/写入和快照读取同步，SDK/回调在缓存锁外；名称stop/QR clearState取消、重叠Busy及资源交接通过。
> 这不是完整Security1配网已重验。保留宿主扫描端口/原GATT/协议，不以两块已绑定板重置来制造配网夹具。
> App272、Android7、工具93项通过；最终APK安装，Direct三个批次10样本Ready2.771～3.744s，Cloud原页fresh计数1，离页无残留。
> 所有过频/前置Busy样本保留；不是连续10次无限启动扫描通过。受管child仍需真实Ready，bit18不启用，下一步见GATT§10.86/需求合同6.24。
> 没有新Action/重置/清凭据/重绑/暂存/提交/推送。以下为历史记录。

> **2026-09-07 §10.85 当前：共享扫描和Android原生端口已实现、安装并完成短门禁。**
> `core/bluetooth` 仅管理有界扫描；保留BleClient GATT及原认证；相同过滤器共用扫描、关闭/旧回调隔离、后台原生取消，8观察者/64候选上限。
> Android进程单调5/30s保守账本，不因账号/取消退款；明确THROTTLED/Busy/失败而不排队或延长预算。附近证据15s独立到期，扫描失败不续期/不立即判离线。
> debug/OTA已迁移。`capacitor-wifiprov`新增宿主注入BleDiscovery，MainActivity接入同一Android扫描资源，Security1/SSID/Key/GATT协议不变。
> 必须同步插件源码/file依赖锁文件再Capacitor update，不能直接修改node_modules或只更新App TS；独立插件仍保留SDK默认扫描端口，iOS原生行为本批未验收。
> App266/Android配额2/硬件工具86项通过；新APK原绑定Direct5次成功、第6次50ms限额、显式恢复2782ms、互斥/旧stop/Home后台回收与Cloud只读恢复通过。
> 不是10次连接全部成功。按名称/QR取消和完整WiFiProv配网、厂商原始scanFailed负测及四端公平仍待完成；bit18不启用，无新控制Action/设备重置。
> 后续顺序见设备需求合同6.23和GATT§10.85；不重写owner/协议/页面。以下为历史记录。

> **2026-09-07 §10.84 当前：新APK已ADB覆盖安装并配套新Broker/Hub；下一批优先App扫描资源修正。**
> 旧Broker不识别新App Hello的bit17/19导致channel closed；配套当前dist/协议后ready，未放宽协议校验或恢复Legacy JSON。
> 正常Cloud设备页已通过唤醒→唯一Button0→1→离页物理释放→再次fresh1→释放，保留原账号/凭据/绑定。
> 新App隔离Direct10轮仅前5轮成功，第6轮Android扫描过频，依赖未处理onScanFailed而误等5s扫描超时；不能宣称公平窗口/10轮完成。
> **下一批先落实设备需求合同6.22 S1/S2：合并scanFor/scanForAll物理资源、generation/关闭屏障、原生失败及前后台回收、系统配额/原预算。**
> BLE debug/OTA与capacitor-wifiprov的独立原生扫描也需受共用准入约束；发现层不耦合MQTT/UI/Controller权限，不复制整个GATT插件。
> 不直接编辑node_modules交付、不只在测试加sleep、不恢复cloudReachable=false旁路；Ready/Method2/禁止Action重试等合同不变。
> 本批只新增设备仓诊断工具（7项，硬件工具回归合计82项通过）/更新计划和本地部署，App业务源码未改；bit18仍关闭。详情见设备GATT§10.84/需求合同6.22。
> 以下为历史记录，不再沿用其中“本次没有部署”的现场结论。

> **2026-09-07 §10.83 配套进度：实际页面selector/Direct scope/native连接与关闭准入已接线。**
> 受管child（ble且cloudEnabled）有本地凭据时先reserveDirectPriority→hold/Ready→SDK connect→Method2/State，之后才选BLE。
> 原caller group共享一个物理scope，多页面/read互不抢占，最后退出才释放；纯BLE、普通WiFi/hybrid、Hub路径不变。
> cloudReachable=false/nearby/WiFiProv handoff均不是Hub已让位证明；未Ready不得直连，离线受管child的公平接入另待配套合同，不能恢复旧旁路。
> 新获取检查assertReady，续期空档既有流量仅允许到原承诺期限（assertActive）；每片/记录/通知即时检查，取消和Session退休不迁移原工作。
> 后台PresenceKey维护仅保存pending bundle，不隐式争抢受管child；commandConnected不重连、不将未知Action重发到Cloud。
> 原service opening保留至SDK工作结束；session/channel/link等待实际关闭，generation阻断旧回调；账号退出后的关闭不回写旧状态。
> App正式Angular44文件382项、Broker151项及完整回归、跨仓35项和Host50项通过；不是新APK/无线真机结果，bit18仍关闭。
> **下一步先量出离线手机/在线Hub持续需求的公平窗口与准入条件，然后配套激活并按原绑定做四端10→30→100交替。**
> 无本批APK/固件/镜像部署、reset/重绑或暂存/提交/推送；细则见设备GATT§10.83、需求合同6.21。以下为历史记录。

> **2026-09-07 §10.82 配套进度：Ready wire、Session owner和原connection scope软件消费已接线，实际页面selector尚未启用。**
> bit19/inner0x28→0x29查询当前owner/revision的物理Ready；accepted仍仅预留，bit17单独存在不能授权Direct。
> `DeviceV2DirectOwner.ready`只表示首次物理让位，实际获取前调用`assertReady()`，随后仍需BLE认证和Manifest/State。
> 原acquire起30 s首次等待不随renew延期；每revision须新Ready，期限取query发出时间+remaining并裁剪owner期限。
> 原owner共用timer/请求额度/取消/账号退休，原`DeviceUiConnectionScope.hold()`消费Ready；AccountClient/Service转交原AbortSignal。
> 新renew到新Ready之间不允许新建BLE；旧链路最多到原物理承诺期限，closed后由原Direct作用域断链，unknown Action不得重试。
> 正式Angular入口274项通过，Broker151项与跨仓35项通过；无APK/固件/镜像部署，Hub bit18仍关闭。
> **下一步在已有transport selector串联预留→scope.hold→最后校验→BLE，不是删掉gateway-child保护后直接ensureReady。**
> 本地公平（手机离线但Hub在线持续cloud owner）与同绑定四端交替仍未通过；详见GATT§10.82/需求合同6.20。以下为历史记录。

> **2026-09-07 §10.81 配套进度：设备唯一 GATT 策略、管理准入和重连/冷启动承诺屏障的软件门禁通过。**
> App 业务源码/UI 本批未改；accepted 仍不是 Ready，bit18 仍关闭，不能移除现有 gateway-child 保护后直接抢连。
> 下一批在原 owner/Direct 作用域内完成 Ready 回应/查询及消费：关联 request/revision/target 与原本地锚，拒绝迟到/旧绑定/旧版本回执。
> Hub MQTT 更换后旧 Ready 必须退休，即使设备保留旧物理退让到原到期；整机冷启动另有一次最长 30 s 获取保护，不是每次 BLE 建连延迟。
> priority release 不证明手机 ACL 关闭；继续由原 Direct 作用域断链，unknown Action 不重试，不新建平行 owner 队列。
> Host50/50、跨仓34/34 不是新 APK/真机证据。手机离线但 Hub 在线持续 demand 的本地公平仍待完成，见 GATT §10.81/需求合同6.19。以下为历史记录。

> **2026-09-07 §10.80 配套进度：Broker已接通生产owner→Hub控制及显式renew，本批App业务源码/UI不变。**
> `accepted`仍不是Ready；新revision确认后须取得新Yielded，pending renew保留旧版本原期限，不能拿旧回执续新版本。
> Broker只提供内部exact token Ready查询，App Ready回应/查询wire及页面作用域消费尚未实施；bit18仍关闭，设备物理策略未启用。
> 后续复用原Direct作用域、request/owner/revision/target关联和本地请求锚；priority release不是手机ACL已关闭，不能省略断链。
> Broker/协议165项与跨仓20项通过，不是新APK/四端真机证据；下一批先唯一设备物理决策，再App Ready消费，见GATT§10.80。以下为历史记录。

> **2026-09-07 §10.79 配套进度：Hub退让wire/receiver和Broker交换核心的软件门禁通过；本批App业务代码未变。**
> 新控制仅由Hub/Broker消费，App不复制南向kind5 codec；详见设备需求合同6.17、GATT§10.79。
> `reserveDirectPriority().accepted`仍只有预留语义。生产owner→Hub控制/显式renew、唯一物理决策和App Ready回应/查询尚未接线，bit18继续不启用。
> 后续App必须关联原request/owner/revision/target、保持原本地时间锚与取消作用域，再进行原Method2/Manifest/State。
> 不从收到TTL时重新计时、不把Hub让出当作手机已连接；release不证明手机ACL关闭，App仍负责自身断链。
> 本批跨仓20项包括实际App预留wire模块回归，但没有APK/真机页面更新；不得删除gateway-child保护后直接抢连。以下为历史记录。

> **2026-09-07 §10.78 当前：Direct预留Session wire接线完成；UI连接策略仍未激活。**
> 独立bit17、kind0x1e/0x1f（需求合同6.16）；`reserveDirectPriority()`复用owner allocator/renew/cancel，不新增连接作用域或队列。
> 返回accepted/closed/release，没有Ready；未协商不发包，Direct响应不能由cloud status满足，取消不误发cloud release。
> Broker真实权限要求主人已登记Direct Admin与当前Active Hub/epoch/能力；cloud分享尚无Controller同步证明，不自动拥有Direct优先权。
> 下一步收到真正Hub Yielded后才做原Method2/Manifest/State并接入页面；不可删除当前gateway-child连接选择保护后直接抢连。
> App66+44项、跨仓17项；详见设备GATT§10.78。未更新APK/真机连接策略，未暂存/提交/推送。以下为历史记录。

> **2026-09-07 §10.77 当前：Direct优先权核心复用与防误接线完成；页面尚未激活。**
> `DeviceV2DemandOwners`支持独立Direct用途，复用同一owner编号、到期/取消/容量机制；acquire/renew/release不丢purpose。
> 现有cloud-only codec明确拒绝Direct，而非丢弃用途后发成cloud；Session公开入口/页面选择/SDK/API均未改，APK未更新。
> **owner.accepted只等于预留受理，不是Hub让出或Direct已连接。** 后续须取得当前owner/revision/target对应的真实Yielded，
> 再用原Direct凭据做Method 2及Manifest/State。取消仅清自己的优先权，不清其他cloud需求；Busy不自动排队抢占。
> Hub/拓扑关联变更使原owner失效，不静默换Hub；scope/账号失效、后台或失败照常取消。旧回执/剩余TTL不得从接收时重新起算。
> App最终63项通过，包含生产Session误接线仍不发cloud包的负测；跨仓13项通过。
> 需求合同6.15和设备GATT§10.77记录具体边界及顺序；本批没有新的真机Direct交替结论。未暂存/提交/推送。

> **2026-09-07 §10.76 当前：新Hub共享连接机制通过现有App四端短门禁。**
> 本批App业务源码/UI/APK不变；普通relay、无效记录触发真实断链后的Rejected及新窗口恢复通过，均无links/sessions/checkpoints残留。
> 真实页面Button9→10且重传未重复执行，退出/后台/前台/账户Session更换/one-shot通过；最终revision11、scope0/owner0/Hub wanted0。
> 后台29.625 s观察owner0仍依赖原30 s期限；没有即时物理idle结论。测试结束App回列表、Inspector确认关闭，未重绑或重置child。
> **下一批先冻结Direct独立有界优先权：**当前ConnectionDemand仅表达云端连接需求，permit-join是配网/管理relay，二者都不能代替Direct退让。
> App必须按exact绑定和当前账户申请自己的可取消优先权，等待Hub实际释放后才连接；不能清其他owner需求、解除/重建拓扑或只删除Direct准入限制。
> Hub管理占用、离线公平与持续page renew同批配套；具体wire待冻结，当前不宣称Direct↔Gateway或按需唤醒feature已完成。
> 详见设备GATT§10.76、需求合同6.14；未暂存/提交/推送。以下为历史记录。

> **2026-09-07 §10.75 当前：复用现有App通过Hub permit-join异步交接及恢复短门禁。**
> App业务代码/UI/APK未变，继续用原operation等待pending_open/pending_close；设备内部WouldBlock不变成新API状态或Busy终局。
> Ready必须是radio实际取得并扫描，Close先停止relay再等原生资源归还；App不能把HTTP close请求已接收当作radio已关闭。
> 已登录Android用授权presence匹配exact逻辑child/instance，经真实网关relay完成鉴权与Manifest/State同步；不按MAC/名称/第一条候选连接。
> 普通窗口关闭、真实child退役ACL→Rejected、随后新窗口成功，共三个短场景；每次links/sessions/checkpoints归零，无重置/重新认领/凭据轮换。
> 原路由自动恢复后实际页面Button8→9，相同帧重传未重复执行；退出、后台/前台、账户Session更换及one-shot通过，最终scope0/owner0/wanted0。
> 后台29.898 s观察owner0、39.556 s含Hub取样，仍是原期限兜底，不是即时释放；当前revision10/计数9。Inspector已关闭。
> 版本和证据见设备GATT§10.75；下一批配套唯一物理编排和Direct在线/无云退让，**不能只解除Direct准入限制便宣称交替完成**。
> 没有物理idle或10→30→100长稳结论，暂未暂存/提交/推送。以下为历史记录。

> **2026-09-07 §10.74 当前：设备物理关闭边界修正，复用现有App做四端短复测。**
> App源码/UI/APK未变；Hub新应用延后资源释放通知到SDK确认关闭，修复CONNECT/cancel竞态及失败时假Idle。
> 真机普通BLE断链恢复、页面Action及scope回收结果见设备GATT §10.74；没有重新认领、刷新Key或重置子设备。
> 最终新Hub+原APK完整页面门禁Button 7→8、后台/恢复、账户Session更换及one-shot通过；最终scope0/owner0/Hub wanted0。
> 后台29.828 s观测owner0、39.632 s包含Hub取样，仍是原期限兜底，不是即时物理释放。计数基线已更新为8。
> **不代表App已可主动让Hub退让给Direct**；下一批必须配套唯一物理编排、permit-join等待交接、在线Direct和无云公平窗口。
> 仍不能仅解除Gateway child的Direct限制就认为完成。继续使用已有页面/Session owner和原30 s兜底，不新增后台常驻连接。
> 设备实施顺序已收口到需求合同6.12。以下为历史记录。

> **2026-09-07 §10.73 当前：普通设备页四端需求/有界回收短门禁通过。**
> 真实页面Button 5→6、离页、Android后台/恢复、旧账户Session退役/新Session恢复及one-shot只读通过。
> AppVisibility同时监听pause与appStateChange；初始化getState不能覆盖后来的生命周期事件，销毁释放listener。
> 释放是best-effort，后台JS冻结时由原30 s期限兜底；本次30.087 s观测Broker owner0、39.481 s包含Hub串口取样确认wanted0。
> **不能宣传立即释放，也不是BLE物理idle/Direct交替完成。** 最终还检查one-shot后的最后zero Decision，防止在途positive导致误判。
> 最终APK `447ff724c8c815e6e7a5cc226d1c4f29ae1b28cf3d305dbacd53a7c4eb849cb9` 已覆盖安装，账号/设备/凭据保留。
> 下一批和Hub唯一物理编排一起完成Direct主动/无云退让，不能仅取消当前Gateway child的Direct准入限制便认为解决。
> 无新增owner/codec/后台任务/原生MQTT/UI模板；本机ADB reverse在USB重连后须恢复7000→17001、8884→8884。
> 软件统计和真机边界见设备GATT §10.73、设备实施状态及需求合同6.11。以下为历史记录。

> **2026-09-07 §10.72 当前：页面/只读sync需求的生产消费者完成。**
> `openConnection()`用于页面存活期，`connect()`用于one-shot只读；复用exact Session owner，不新增协议或续租核心。
> 页面进入/隐藏/后台/销毁/设备切换与Session retirement均有作用域；canControl同步检查取消，避免迟到ready恢复控件。
> 仅Gateway child Cloud路径申请；列表/Presence/被动watchConnection不唤醒，普通WiFi/Hub/Direct不增加owner。
> Angular正式入口266项、跨仓21项通过；本地APK已覆盖安装，数据/账号保留。手机keyguard仍开启，前台四端门禁不能记通过。
> Hub/Broker已配套上线，后台零需求负测通过；下一步解锁后正常页面/单次Button/退出/后台/Session更换，再做Hub idle+Direct退让。
> 物理gate未激活；旧Direct/Gateway选择限制没有因本批自动消失。未修改页面模板/布局，也未暂存/提交/推送。细节见设备GATT §10.72。
> 以下为历史记录。

> **2026-09-07 §10.71 当前：Hub/Broker准入与首Hello恢复分预算软件完成，App生产源码/UI/APK未变。**
> authority已送达不等于BLE已连接/ready；零需求无Hello仍可保留授权，协商失败退役ready投影而不误删绑定。
> 下一批必须配套页面/只读sync的Session需求作用域、唯一物理调度与Direct退让；现有页面不自动申请需求，不能只打开Hub gate。
> 复用既有owner/Session API，不新增codec、隐藏设备MQTT登录或页面专用队列；accepted仍不得显示成ready。
> 跨仓18项含真实App模块通过；本批未改包/部署/重置设备。最后现场组合仍为§10.69，设备软件证据及下一步见GATT §10.71。以下为历史记录。

> **2026-09-07 §10.70 当前：设备管理会话占用软件子项完成，App生产代码/UI/APK未变。**
> Prepare/NonceReady后的连接依赖由Hub按命令截止时间和exact会话保持；nonce没有独立TTL，App不新增倒计时协议字段。
> 重发不续期，Expired不能解释为child一定未执行；续用既有receipt/持久恢复流程。不可用新控制缓存绕过session边界。
> 后续先完成Admission/首Hello预算与物理编排，再接页面/只读sync需求作用域和Direct退让；accepted仍不能显示成ready。
> 未部署新包/重置设备，实际四端基线仍为§10.69；设备软件范围与验证见GATT §10.70。以下为历史记录。

> **2026-09-07 §10.69 当前：新版APK与Hub/Broker的真实需求控制短门禁通过。**
> 使用真实Session API，两个owner/部分释放后的fresh租约/全部释放/ACK前abort/session-ended均通过；没有伪造Broker owner。
> 真机ADB force-stop且所有zero Decision丢失，Broker约1.7 s观测owner归零、Hub约30.2 s观测wanted自行归零；计数不变。
> 普通BLE断链恢复后真实App Action46→47，App重启后读回47且fresh/可达，临时Direct links/sessions=0。
> App生产源码/UI本批未扩展；local构建、APK安装、需求模块/Session26项通过。**页面/只读sync自动申请与物理idle/Direct仍未启用**。
> debug本机联调用既有`BLINKER_LOCAL_CLEARTEXT=1`和ADB reverse，生产HTTPS默认不变。账号/Direct凭据保留。
> 下一批先做0b3b2 Admission/首Hello分预算、管理NonceReady后的会话所有权，再接页面作用域；accepted不得当作ready显示。
> 版本基线、已通过范围、工具中断和资源详见设备GATT §10.69；未暂存/提交/推送。以下为历史记录。

> **2026-09-07 §10.68 当前：owner→Broker实际dispatch→Hub Bridge执行期限控制接线完成。**
> Broker composition已接owner变化通知，替换空回调；positive经fresh Active鉴权，取消中止慢HTTP，projection换代不抹掉执行绑定。
> 初始南向支持通过Hub首Challenge确认，不需要child Hello，也不在App增加Hub control codec；北向Session/owner API不变。
> **App源码/UI/APK本批未变；页面/只读sync自动申请、物理idle/Direct仍未激活。** 不能把accepted/executionWanted显示成ready。
> 原跨仓18项与协议/Broker118、Host47项等软件门禁通过，不冒充实际MQTT/Android/四端验收。
> 下一步0b3b2拆Admission送达/首Hello恢复预算和management有限占用，再配套物理调度与页面生命周期；持续renew不能永久占BLE。
> 先升级Broker再Hub/App；运行基线仍为§10.64。唯一规范见设备库连接需求合同6.7～7节。以下为历史记录。

> **2026-09-07 §10.67 当前：南向期限协议/40 B执行核心软件基础完成，App源码/UI/APK本批未变。**
> Hub本地challenge锚定，Broker回当前owner剩余时长；不采用收包TTL或新增SNTP依赖。App不实现此route控制codec。
> 北向Session/owner保持§10.66，新增Service→C++五项及原App/Broker十三项跨仓门禁通过；不是实际MQTT/四端wake证据。
> **页面/只读sync自动申请、Hub物理调度、idle/Direct尚未激活。** 下一步0b3b配套接线、保留management有界所有权，然后再接页面生命周期。
> bit16只说明北向owner支持；accepted不等于ready/在线。必须先更新Broker，Hub/Broker新南向也须配套，不单独安装App宣称完成。
> 当前运行仍为§10.64；完整合同/执行顺序见设备库`DEVICE_V2_GATEWAY_DEMAND_REACHABILITY_CONTRACT.md`6.6～7节。以下为历史记录。

> **2026-09-07 §10.66 当前：L2c-0b2 northbound软件接线完成，页面/AccountClient自动申请尚未激活。**
> owner模块及测试迁入`core/protocol/device-v2`，旧上层位置删除；`DeviceV2Session.acquireConnectionDemand()`固定当前session sender。
> bit16协商、Route内kind0x1c/flags0、Delivery内kind0x1d/IsResponse、四整数CBOR与Broker一致；回显requestId/peer/owner/revision。
> accepted只是记录成功，不是ready/wake；30 s保守租期、10 s renew、5 s请求预算。取消不换账号重发，不排队Action。
> Route取消清理监听器/计时器；从publish提交计时，底层未结束write持续占容量（普通16、含release最多32），不积累取消target索引。
> Angular标准CI 11套122项通过（含新增Session/wire13项），ESLint/TS通过；跨仓真实源码二进制帧级6项+DTO7项通过。
> **尚非实际MQTT/Android/四端证据。** UI/APK及运行版本未变；必须先升级Broker再装新App，旧Broker strict HELLO不接受新bit16。
> 下一步0b3 Hub execution/期限新鲜度与Direct退让；配套后才接页面进入/离开/后台/销毁与只读sync作用域，不能用持续renew永久占BLE。
> 唯一wire/容量/执行顺序见设备库连接需求合同6.5～7节；以下为历史记录。

> **2026-09-06 §10.64 当前：配套Hub/Broker可达租约真机短门禁通过，App源码/UI/APK本批未变。**
> loss-all下Broker撤下在线投影，真实Android `ensureReady`拒绝；不能以Active、附近或缓存State冒充可控制。
> 显式工程恢复后重新读取State，计数45不变；另一次正常断链恢复后真实Action只执行一次45→46。
> 共享ready等待2,399 ms，单调用者取消不影响另一调用者；收尾cloud ready/fresh，临时observer/Direct links为0。
> 此次没有验证idle/Direct交替或杀进程释放；工程recover也不是用户wake入口。
> **下一步L2c-0b：**主动同步先获取独立owner demand，再等待ready；离页/后台/账号切换释放自己的owner。
> Broker聚合与Hub执行需求、在线/无云Direct退让应配套实现后再启用idle；列表Presence和Action不隐式申请需求。
> 完整版本/失败修正/门禁证据见设备GATT §10.64，统一合同仍为设备库`docs/DEVICE_V2_GATEWAY_DEMAND_REACHABILITY_CONTRACT.md`。以下为历史记录。

> **2026-09-06 §10.63 当前接入合同修订：**设备/Broker增加只在两者间使用的可达租约，App不新增codec或UI。
> 本批App源码未变；不要把此前`waitUntilReady`当成wake，也不要用设备列表Presence订阅保持BLE连接。
> 下一批页面主动同步需持有独立owner demand，离页/后台/账号切换取消自己的owner，不能误取消同设备的其他消费者。
> Broker租期失效后现有Presence/控制门禁继续适用；“拓扑Active”“有缓存”“附近发现”均不等于可控制。
> Direct优先退让和无云时有界让出必须随idle一起验证，不提前启用永久页面租约。本批Hub/Broker真机尚待配套验证。
> 统一合同在设备库`docs/DEVICE_V2_GATEWAY_DEMAND_REACHABILITY_CONTRACT.md`；以下为历史记录。

> **2026-09-06 §10.62 当前：L2b-4c2已实施并通过软件与真实恢复/耗尽门禁。**
> 新增共享`waitUntilReady(logicalDeviceId, signal)`：同目标30 s绝对预算包括账户准备/Presence/只读同步，后加入不续期，最多16个目标。
> AccountClient负责当前Session代次与stop/reset取消；DeviceUiPort负责传输选择；页面负责进入/离开/后台/销毁。取消页面不关闭共享账户。
> 删除stop等待挂死旧HTTP的阻塞；旧登录/控制续体不能进入新账号。Presence订阅去重，保留ensureReady已知离线快速拒绝。
> 离线→在线缓存值可见但须重新读取State；连接失败禁用控制。get-only可以等待，混合get+set不能把Action排在连接等待后。
> 发布后的Internal/timeout/网络丢失/无效ACK显示`DEVICE_V2_COMMAND_OUTCOME_UNKNOWN`，不新建requestId重放；未提交的只读等待失败则明确未发控制。
> **真机修正：**主动StateRequest与服务器State推送会并发，不能覆盖同一分页槽。主动同步拥有槽，期间State/Patch只记录最高revision；必要时复用最多两轮StateConflict补读。
> 同revision并发、较新通知补读、持续变化退出均有回归；Event/Telemetry路径不合并。没有Action队列，Broker执行预算3750 ms不变。
> Angular正式31套件224/224、定向106/106、工具54/54、ESLint/编译/APK通过。最终APK SHA256 `648358dbae2f6973e119be4b74aac8d7c3afaaf02204e633921bfd0d3e1d09c3`。
> 真实Android共享等待2619/2521 ms，另一调用者取消不影响ready；两轮耗尽30006 ms超时、45 s无第三轮/无Action，控制43→45。
> 实际设备页云端在线且可控制、读到45；离页销毁后waits/connections=0且账户仍ready。挂起等待期间后台/销毁/unknown提示已软件验证，不冒称真实杀进程全门禁。
> **下一步L2c合同：**waitUntilReady只观察，不会唤醒已idle的网关；先定义受权限约束的连接需求、取消、代次及可达租约，再实现idle/Direct↔Gateway，勿以Command当唤醒队列。
> 设备/Broker生产版本本批不变。完整失败证据、收尾资源及剩余发布门禁见设备GATT §10.62；未暂存/提交/推送。以下为历史记录。

> **2026-09-06 §10.61 当前：**本批App源码/UI/APK未改。Hub/Broker独立link-loss closure通过四端门禁，App不实现该codec，继续消费现有Presence。
> 丢首个receipt仍exact重传，Broker在新Hello前退役旧ready；App实际观察离线并拒绝ensureReady，新连接恢复后Action41→42→43。
> 回放旧关闭通知/receipt不影响新ready；保留缓存、共享账户与Active绑定，App收尾无observer/links/sessions/recovery/permit残留。
> **下一步L2b-4c2：**独立`waitUntilReady(logicalDeviceId, signal)`，同一目标共享30 s绝对预算，覆盖账户准备/Presence/只读同步；
> 后加入者不续期，调用者独立取消，最后取消/超时/账户换代释放监听器和计时器，晚到响应不能替用户提交操作。
> AccountClient/Session负责共享等待与代次，DeviceUiPort负责页面进入/离开和传输选择；复用现有synchronizing，保留ensureReady快速失败。
> 只读等待失败不创建Action；已提交但未ACK的Command保留“执行未确认”，不因Error8重新生成requestId重放。命令预算仍3750 ms。
> 先共享/取消/超时/换账户/晚响应/unknown的软件矩阵，再页面接入与真实恢复/双轮耗尽门禁；当前这些等待和UX尚未实现。
> 完整合同、版本和后续L2c idle/loss-all租约边界见设备GATT §10.61；不把通知短门禁当作L2b/长稳关闭。未暂存/提交/推送。以下为历史记录。

> **2026-09-06 §10.60 当前：**App源码/UI/APK本批不变，真实账户客户端完成入口到期及双轮协商耗尽负测。
> Hub拒绝接受单Action并两次清过期槽，设备button40不变；App收到BBP Error8、无ACK，Broker ledger为outcome_unknown。
> 测试没有新建requestId补发。通用Internal尚未表达清晰的用户级“结果未知”，不得将它翻译为确定未发送/自动重试。
> 两轮协商各4次失败后45秒内无第三轮、无Action；App ensureReady明确拒绝，缓存和账户保留。
> 这是核心通信失败可见性，不等于页面提示/恢复等待UX已完成。下一批先配套exact失联通知，再共享有界ready等待/取消和unknown提示，最后idle/Direct交替。
> 设备静态RouteClient注入仅用于独立测试receiver，无App/公开设备API变更。完整证据与收尾见设备GATT §10.60；未暂存/提交/推送。
> 正常Hub已恢复，再冷恢复ready2451 ms、控制/回读3219 ms，40→41；旧unknown未重发，App无observer/links/sessions/recovery/permit残留。
> 以下为历史记录。

> **2026-09-06 §10.59 当前：**本批App源码/UI/APK不变，沿用§10.58 debug APK；真实账户客户端参与最终Hub/Broker四端复测。
> 三次普通冷恢复ready2513～2655 ms，控制/回读3194～3389 ms；首个ManifestRequest丢失3619/4333 ms。
> 每次实际离线ready拒绝，恢复后才提交Action；独立Broker证明sameMqtt及新protocol session，计数36→40。
> 运行期组合丢Patch/StateRequest/Command ACK后34→36，两个Action严格各执行一次；Broker重启但BLE不重连的首个Action33→34。
> 初次失败曾出现两条ACK却仅执行一次，根因为Hub错误复用child序号，已由设备修正并复测，不由App补发Action掩盖。
> Broker修复运行期只读同步的有界exact retry/响应归属；不修改App通信API，不增加离线指令队列或扩大命令期限。
> 下一步先真实1000 ms Hub入口到期负测，再L2b-4c失联通知/独立有界ready等待及两轮耗尽的错误可见性，最后idle/Direct交替。
> 本批验证核心账户通信，不等于完整恢复UX或发布验收；未清账户/credential/topology，未暂存/提交/推送。完整证据见设备GATT §10.59。
> 以下为历史记录。

> **2026-09-06 §10.58 当前：**Session统一ensureReady/refresh，刷新仅失效State，保留已确认Manifest及页面缓存；
> ManifestConflict/NegotiationRequired才至多重协商一次，StateRequest仍读取Broker当前投影，不承诺即时物理采样。
> 同一目标同步共享Promise，并先登记再通知Store，避免同步订阅重入造成分页竞争；新Command等待同步，离线不分配Action。
> 新增6项回归；8相关套件74/74、ESLint/类型/local构建/Android打包通过。最终debug APK保留数据安装：
> SHA256=`b495f081e756b8ac603e873e471c2ef2b1038d8fb68a43bfa50df17ccd4f0684`。
> 双XIAO三次App账户Presence冷恢复2272～2472 ms，控制/回读总计2955～3186 ms，21→24且离线ready均拒绝。
> 这是App观测，不是Broker新session独立审计；最终组合丢包/真实runtime State竞争仍待测，页面UI布局未改。
> 新固件ACK短样本改善不能代替warming/失联通知、失败可见性或Direct↔Gateway交替；后续顺序以设备GATT §10.58为准。
> 未清账户/credential/topology，测试会话已关闭，无残留workflow/links/recovery；未暂存/提交/推送。以下为历史记录。

> **2026-09-06 §10.57 当前：**L2b-4a 实测发现离线时Store缓存仍fresh/accepted，原ensureReady误将缓存等同可控制。
> 已由Session及UI适配层共用ready判断；Presence=false时拒绝新Command，本地错误DEVICE_V2_TARGET_UNREACHABLE，
> 不增加wire码/队列。组件和值仍可离线展示；null仅为Presence未知。同步后、Command分配ID前再次检查；
> 已发送指令不因随后离线重标为“未发送”，仍由ACK/ledger决定。单child后台补同步失败不重连共享账户。
> App8个套件66/66（本批新增8项），类型检查/local构建通过。修正前APK真实三次冷重连ready7.039～7.969秒、
> 控制回读9.065～9.968秒，首次ManifestRequest丢失8.117/10.170秒；新APK部署/复测详见设备GATT §10.57。
> 新debug APK已保留数据安装，真实离线ready检查拒绝、恢复控制15→16通过（8076 ms ready/9945 ms回读结束）。
> 包名iot.diandeng.tech.debug，非并存生产包；Inspector已关闭，App无残留连接/事务，root不变。
> 页面布局未改；完整warming/失败UX尚未验收，现有bool Presence不能表达恢复阶段，物理断连通知仍有盲区。
> 下一批先做GATT延迟归因与State/Command仲裁，再最小ready等待/失联通知，最后idle/同绑定Direct↔Gateway。
> 本批不清账户/凭据/拓扑，不自动重放unknown；未暂存/提交/推送。以下为历史记录。

> **2026-09-06 §10.56 当前：**Hub/Broker Admission V2已配套部署；真实Android account MQTT控制6→7、冷重连后7→8，
> 丢弃真实Action ACK后设备只执行8→9，Broker ledger为outcome_unknown，App收到失败；新投影旧Action回放不重复，
> 后续正常9→10；bootstrap耗尽自动恢复后再10→11。App源码/UI/APK未变，没有清凭据或重新认领。
> 最后phase=ready，busy/workflow=false、links/sessions/recoveries/permits均0；故障钩子/Inspector已清理。
> 这验证核心账户通信，不等于错误提示/冷连接UX验收。下一步L2b-4先分离建链/同步等待和Action提交：
> 显示未ready/恢复/失败的真实状态，不将15秒认证/30秒协商塞入3750 ms命令期限，不自动换requestId重放unknown。
> 准确全链路冷耗时、重复样本及失败可见性仍需完成，再进入idle/同绑定Direct↔Gateway；详见设备GATT §10.56。
> 未暂存/提交/推送，以下为历史记录。

> **2026-09-06 §10.55 当前：**Hub/Broker内部改用Admission V2恢复（必须配套部署）；App不解析该消息，
> 源码/UI/APK及account/direct协议不变，未操作手机/清凭据/重新认领，现场仍§10.53。
> 软件Broker30/30、协议18/18、Host46/46通过，不等于真实App/网关/子设备/服务器故障注入验收。
> 先按设备GATT §10.55.4完成真实恢复和完整ready测时，再确定App等待/失败提示；30秒协商不是Action的新timeout。
> 未ready不排队重放Action，unknown不更换requestId。idle/直连交替及运行期刷新仲裁仍待处理。以下为历史记录。

> **2026-09-06 §10.54 当前：**本批仅Broker首次协商重试与精确响应匹配，App源码/UI/APK及wire不变。
> Broker软件lifecycle **25/25**（Node22/隔离Node20）、协议 **18/18**通过，不代表本批真实手机验收。
> 没有部署、烧录、重置或重新认领，保持§10.53现场版本/现有绑定。首个Hello丢失、相同MQTT下context
> 退役恢复尚未闭环；下一批先完成该合同，再处理冷连接预算/idle/同绑定Direct↔Gateway。
> 30秒是Broker首次分页协商的总上限，**不是App Action的新timeout**。未ready不排队/重放未知Action；
> App不要换requestId掩盖unknown。设备GATT主线§10.54为当前入口，以下为历史记录。

> **2026-09-06 §10.53 当前：**App 源码/UI/APK不变，保留现有child/Hub/epoch494518246/Active绑定，
> 本轮不resetAccess、不重新认领。Hub/Broker内部correlation增加代际语义（形状仍16 B、Hello声明bit14），
> 不下沉到App或BLE子设备API。新Hello先撤销旧projection，完整State同步后才重新宣布reachable。
> App重试unknown Action必须保持原requestId，不用新ID伪装安全重试；冷连接边界不等于自动idle切换完成。
> 当前部署/真机结果以设备GATT **§10.53**为准；L4已有Direct attach/pending恢复UI仍待独立验收。
> 最终真实App account MQTT热控制 **4→5**，正常BLE断连/新协议session同步后 **5→6**、ACK/State正常；
> 后者ready997 ms/总计2823 ms（测试开始时已重连，不能当作冷连接预算）。App无任何待恢复/link/session/permit。
> 以下为历史记录。

> **2026-09-06 §10.52 当前：**App 源码/UI/APK 不变。按本轮授权仅 reset child access 一次；正常原生
> Direct enrollment→Method2→commit/active，epoch494518246，button **2→3**，17,037 ms。
> 同身份 attach（不再 enrollment）到 `45b92507779a943cc939cdac4a25323f`：安装/独立认证34,541 ms，
> 后续 cloud resume326 ms达 Active/version4；真实 account MQTT button **3→4**，2656 ms。
> App phase=ready、link/session/permit/recovery 均0。该轮通过正式服务/native API，不等于 L4 UI 入口验收。
> Broker 新 reservation 在超时/取消后释放自己的发送槽，但 exact unknown Action 不重新下发；App 不能
> 换 requestId 来冒充安全重试。普通 route 仍占 child ACL，Direct↔Gateway 冷恢复/交替仍未通过。
> 保留当前凭据及绑定，不再次 reset；先按设备 GATT **§10.52.4** 补冷 Hello/状态代际和结果未知合同。
> 本轮未复现此前 assertion，不宣称已修；以下为历史记录。

> **2026-09-06 §10.51 当前：**本批 App 源码/UI/APK 不变。子设备按新授权仅 reset 一次，原生 enrollment
> 在 Method2 超时后保留 pending；串口有 assertion/reboot，不能算稳定通过。无再次 reset/新 intent，
> 使用原 pending 凭据恢复 commit/active、button **0→1**，epoch213376463，logical identity 不变。
> 本机 recovery probe 将新 native link 的模式等待接到现有 discoverDirect(matcher)，继续使用正式
> Presence 鉴权匹配、client.resume、receipt/commit；不以 MAC 或首个扫描结果替代身份验证。
> 原 native waitForMode 仅适合同 link 已连接目标的切模，新 link 无 target 会报 DISCONNECT_REQUIRED。
> 后续 L4 应明确原生 pending 恢复的发现入口，不复制协议或修改凭据状态绕过恢复；本次服务/native
> 联调不等于完整 UI 验收。设备侧本批只收口有界 ingress，不启用 idle，不延长 App timeout。
> 当前部署/同身份 attach 结果以设备 GATT **§10.51** 为准，以下是历史记录。

本批最终经正式 create/resume（非完整 UI 点击入口）完成新
`9bf02e5a0a3ff936963b937782e408c2` Active/version4，epoch213376463。同一子设备原生 Direct **0→1**，
attach 后真实 account MQTT **1→2**、ACK14、2761 ms；phase=ready，links/sessions/permits/recoveries=0。
Gateway proof 后连接释放，Active route 又占用 child ACL，不能宣称手机/Gateway 自动切换通过。
首次原生认领的 Method2 超时和 assertion/reboot 保留未解决，恢复成功不抵销首次失败。

> **2026-09-06 §10.50 当前：**本批 App 源码/UI/APK 不变。按用户新授权 reset child 一次后，原生
> Direct 重新认领仍复用同 logical identity，epoch3032216448，button **2→3**，无 link/session/permit/
> recovery 残留。设备侧先收口 L1 proof 资源生命周期；**不等于普通 route 空闲释放或手机/Gateway 交替已完成**。
> 后续仍复用已有 create/resume 正常绑定，不通过重复 reset、泛化 retry、删 checkpoint 来通过门禁。
> 新 Hub 上 Admin install/receipt、独立 Gateway 认证及 Hub proof 正常分阶段完成；新 topology
> `4f84ebee1d286b51020dd659b2947521` Active/version4，真实 account MQTT button **3→4**。
> 之后手机 Direct 仍15,038 ms扫描超时：proof 已释放，但 Active route 重新长期占用 child ACL，不能延长
> App 扫描超时来掩盖。结束无 link/session/permit/recovery，保留绑定；本轮未复现旧间歇安装失败，不宣称修复。
> 部署和完整四端结果以设备 GATT **§10.50** 为准；以下为历史记录。

> **2026-09-06 §10.49 当前入口：**同一 V2 BLE child 原生 Direct 认领/控制 **0→1**，再给已有设备
> create/resume attach 至新 Active/version4；真实 account MQTT Gateway 控制 **1→2**。attach 不需要
> reset/enrollment/换固件，保留同 logical identity/页面，Admin 与 Gateway 凭据独立。
> **尚不能宣称自动双路切换：Hub 持续占用 child 唯一 BLE ACL，绑定后 Direct 扫描超时。** 优先配合设备
> GATT §10.49.5 的授权/链路租用解耦及冷恢复，不用延长扫描、清凭据、复制设备或临时开 permit 来规避。
> App secure-channel 已先红后绿修正首个异常被 disconnect 引发的并发 receive 覆盖；相关 **47 tests**、
> ESLint、local/Android build 通过。首次安装真实失败的底层原因仍未确认，保留 checkpoint 正常恢复成功
> 不等于已修；没有新增泛化重试/跳过 receipt。App 当前无 link/session/permit/recovery 残留。
> 本机 APK 使用既有 `BLINKER_LOCAL_CLEARTEXT=1` 以验证本机 account ws；生产 HTTPS/WSS guard 不变，
> Hub 仍 MQTTS。当前 APK SHA256=`e716dcce7b6c9d8c45aea142045fd09f9764a92a029b5474a3b567b78149c5ca`。
> **App 后续入口：**现页面只提供未认领设备发现/认领；本轮“已有 Direct attach”经正式服务 API + 原生
> BLE 实测，尚非完整 UI 点击门禁。后续在 owner 合格设备选择中复用 create/resume/checkpoint，处理已绑定、
> 退役等待和恢复态；不复制协议/认领实现。topology Active 不直接等价于实时 ACL/online。
> 当前 operation=`8cb2bcdda4da10afaff0ed1e36e8bf2d`，epoch2145337234；不要再次 reset child。
> 完整时间线、部署及 L1～L4 顺序以设备 GATT **§10.49** 为准，以下为历史记录。

> **2026-09-06 §10.48 最新：**本轮 App 生产/UI/APK 不变。授权 child reset 后，正式 enrollment 返回
> 精确 retirementPending，保留同 checkpoint；原操作继续完成 Admin 安装、独立 Gateway Method2 和 proof，
> 新 topology `5ee0a95343dee821ad8ff3ddaa0481ee` Active/version4，recovery/link/session/permit 全部清理。
> 后续正常连接/同步/关闭 **10/10**，真实 button ACK/State **3→4**。无本轮 force-stop/replay 注入。
> 设备仓库重连 observer 已区分 authenticate 和 connectUsing 自带的初次同步，避免错误归因；工具自测 **31/31**。
> §10.47 的两次间歇失败未复现但尚未定位，不能据此加泛化重试、跳过同步或判定 N4 全过。
> 下一批保留当前绑定，先收口观测/失败边界；详见设备 GATT **§10.48**，以下均为历史记录。

> **2026-09-06 §10.47 最新：**App 编排层仅把 **HTTP409 + EDGE_GATEWAY_RETIREMENT_PENDING** 转为
> `{logicalDeviceId, retirementPending:true}`，不捏造 topology；保留原 checkpoint、复用“继续确认”，不自动重试。
> 首次与恢复复用 completeAttachment/advanceCloud，移除重复 create；普通冲突/错误状态/账户切换仍拒绝。
> 9 files/**58 tests**、ESLint、local/Android 构建通过，新 APK `8a1a7967...` 已保留数据安装。
> 真实 child reset→认领后页面显示“等待旧绑定退役”；force-stop/重启保留原操作，最终 Active/清理 checkpoint。
> 后续独立正常连接/同步/关闭 **3/3**，真实 button ACK/State **2→3**，App 无 link/session/permit/recovery 残留。
> 中间两次连接失败单列，**不算首次稳定通过、N4 全过**。目前已绑定，不再重置；先定位普通连接/Method2 间歇失败。
> 详见设备 GATT **§10.47**；下方同日较早状态为历史记录，不代替当前恢复点。

> **2026-09-06 §10.46 最新：**App 生产/UI/APK 未改；设备管理 mux 新 busy() 任务合同修复 Supersede
> 抢占 live permit，实际 commit 后同步 5.522 s 成功。不要先给 enroll/resume 加 skipSync、retry 或延长超时。
> 后续 attach-create 因旧 topology 仍在退役返回 CONFLICT，原 checkpoint 重用后到 PendingAccessDelivery。
> 手机离开 ADB，`attachment:f3yur32mn6LegQvFoXxtwg` / finish_attachment 仍待正常恢复，不能再 reset child。
> 下一步先恢复 `7f7caeaf7da69fa2de810bc5a17c6dc2`，再明确“旧 epoch 正在合法退役”与真实绑定冲突的
> Service/App 合同：仅精确上下文的 retirement-pending 使用原等待入口；不吞任意 409、不伪造 Active/
> topology，也不新增泛化重试。此时 credential active 只证明 ownership 已完成，不能显示 Gateway 已可达。
> 设备与跨端时序、冻结及未通过范围见设备 GATT **§10.46**。

> **2026-09-06 §10.45 最新：**本批不改 App 生产代码/UI/APK。用户授权 reset 当前 child 后，同 instance
> 重认领仍复用 logicalDeviceId；真实 Enrollment requestId exact replay/changed content 拒绝通过，注入后保留
> pending，正常 Method 2→commit→attach/proof 恢复至 Active。工具 Windows/Linux **28/28**；终态抢先于
> 最后 ACK 时必须 Close 前通过 account-bound GET 验证 exact operation/Hub/adapter 的 Rejected，不能只凭
> RELAY_NOT_READY 算拒绝，也不修改 App 的正式校验。
> **待修交接：**三次重认领 commit 已成功、credential 已 active，但 `BleDirectClient.enroll/resume` 的随后
> synchronize 断连，checkpoint 转 finish_attachment 后可以继续。本批未把多步恢复记作一次成功；应先捕获
> commit/supersession/permit/session 的同边界时序，区分 ownership 完成与页面数据同步，再做最小职责修订。
> 普通连接另有一次 Open/Close 超时，原 checkpoint 已由 recoverPermitJoinWindows 正常清理，不能吞超时或
> 直接删凭据。设备真实修正、NVS 写次数与冻结版本及后续顺序见设备 GATT **§10.45**。
> 正常 child 固件恢复后独立认证/同步/关闭 1/1；另经 Hub relay 正式 `command('button', null)` 返回 ACK，
> State 确认 buttonPresses 0→1，App 无残留。并未修改设备页布局或 account MQTT 数据面。

> **2026-09-06 §10.44 最新：**App 生产实现/UI/APK 不变。设备仓库 enrollment 注入工具新增
> `request-replay` 并共享 CDP helper；原 pending receipt 由正式客户端计算，重放使用新 AEAD counter，
> 注入后禁止 Method 2/commit，保留 installed pending credential/checkpoint 走正式 finish_enrollment。
> 自测 Windows/Linux **20/20**，不代表真机负测通过。现有 Active 双板正常认证/同步/清理 **1/1**，
> 无残留、绑定/child 凭据未变；本批不重置现有 child。重认领对页面身份、旧 topology 和恢复流程的影响
> 已列入设备 GATT **§10.44.3**；不得通过删除 pending/改 DB 或新增 App 重试 API 绕过前置条件。

> **2026-09-06 §10.43 最新：**本批不改 App 生产实现/UI/APK。N3 已补独立 ESP32 实际 AES-GCM/NVS
> envelope 门禁；诊断结束恢复原 Hub 固件，现有 App 真实认证/同步/清理 **2/2**，无残留，原 topology/
> child 凭据未变。此证据不替代 App enrollment requestId 的设备级 exact/changed-request replay。
> 该项下一批先确定 pending checkpoint 或正常 reset/re-enrollment 的绑定影响与恢复路径，不直接清
> Active child 的 access 或改 DB；完整范围与后续顺序见设备 GATT **§10.43**。

> **2026-09-06 §10.42 最新：**仅 Broker 修正离线有界接受语义；App 保持 §10.41 的公开流程、
> strict sequence/relaySession 与原 timeout/retry，无生产代码或 UI 改动。session/permit link **30 tests**
> 复测通过。原 APK 经真实 Hub MQTT socket 中断仍完成同 operation 认证/同步，fresh 再同步，共 **2/2**，
> 全部 Closed、links/sessions/checkpoints=0。随后自然 SessionCredential 换代在途同步、独立正常
> **10/10** 也分别通过，App 无残留。Broker restart 仍更换 relaySessionId 并使旧 link fail-closed，
> 不能将上述结果算作跨 Broker restart 耐久恢复。下一步回 N3/N4/N5，完整证据见设备 GATT **§10.42**。

> **2026-09-06 §10.41 最新：**真机确定性时序证明 ManifestAccept/sequence 5 被重试，首个 ACK 后 App 已等
> State/sequence 6，迟到的另一个 ACK 被错误判为 response mismatch。`BleDirectSession` 现仅记最近一次已
> 合法确认的 canonical Ack（acknowledgedSequence + stateRevision），对非当前 pending sequence 的同内容
> ACK 幂等；不忽略错 flags/变化 revision/更早或未来 ACK，不关闭校验或延长超时，Error 仍独立处理。
> 新回归旧实现 RED，新 App **2 files / 30 tests**、ESLint/local build/Gradle 通过；新 APK
> `786dfb77424aa9bc98915c5700a9d1c626ca9b8068d3d4e181dba072173f24cb` 已保留数据覆盖安装，正常 **3/3**。
> 独立 `delayed-ack` 真机门禁延迟首 ACK 处理，真实设备的重试回复产生 1 个迟到 ACK，仍正常同步/Closed，
> App 无残留；不伪造响应，不将其算作 MQTT 掉线连续性通过。
> 本批只改通信层，不改 UI。Hub 另完成 MQTT 间隙保留窗口进度，但实测 Up ACK 遇 Broker HubOffline/503
> 仍按原合同关闭并清理，没有四端透明续传。下一批先明确 Broker “已接受/已排队”与“已送达”的有界语义，
> 不直接吞 503 或增加 App 泛化重试。完整失败、冻结与执行顺序见设备 GATT **§10.41**。

> **2026-09-06 §10.40 清理竞态已修（优先于历史待办）：**同 APK/双板固件复现 disconnect 的
> `EDGE_GATEWAY_PERMIT_JOIN_CONFLICT`：Service 仍 Ready、Broker 已 Rejected。Broker 现对 exact window
> Close 幂等返回原终态，不覆写记录/重下发；Service 和 App 复用原投影更新及终态清理，无 App 生产改动。
> Angular permit link + Direct session **25 tests** 通过；原 APK 真机 Rejected 清理→fresh 认证/Closed
> **2/2**，links/sessions/checkpoints=0，NVS/topology 不变。旧失败保留独立证据并经正常 recovery 清理。
> Hub 自然 credential refresh 出现约 570 ms management 间隙；设备 relay 的云连接换代/序号边界仍待修，
> 不先在 App 叠加重试、吞 HubOffline 或删 checkpoint。下一批先修设备生命周期，再验证在途操作的安全
> 恢复/明确终态；本批成功不算 active permit 跨刷新通过。冻结与执行顺序见设备 GATT **§10.40**。

> **2026-09-06 §10.39 child 回收边界：**设备端修复单 peer indication 错误误升 Host fatal 与 native handle
> 交接丢 disconnect，App 生产代码/APK/API 未改。新 child 的独立正常认证/同步/关闭 **10/10**，每轮 App
> links/sessions/permit checkpoints=0；topology/凭据不变。一次真实 selected-acl 拒绝已确认 Rejected，但自动
> disconnect 请求失败导致 checkpoint 留 1；既有 `recoverPermitJoinWindows()` 正常确认/清理到 0，不直接删
> 本地状态，不把恢复算首次成功。硬件测试已补 disconnect 的白名单错误码观测；尚需捕获原失败原因后判断
> 是否需要生产修正，不凭猜测新增重试/清缓存/UI。修改前还观察到独立 Hub offline，详见设备 GATT **§10.39**。
> 同组合无 reset 补充 selected-acl 两轮，Rejected 清理→fresh 认证/同步/Closed **2/2**，App 无残留；之前的
> 关闭请求失败未重现，并不证明其根因已解决。本批不改 App 生产代码。

> **2026-09-06 §10.38 ACK 幂等对齐：**Broker 接受当前 operation 的 lastUpAck exact 重试（例如第一次
> ACK 成功但 HTTP 响应丢失），仅重投 ACK/返回最新 view，不推进或消费下一 batch；Hub 对最近已确认 ACK
> 的相同序号/状态幂等。App 继续复用现有 serialized request 和 duplicate upstream 重 ACK，无生产 API/UI 改动。
> permit link + Direct session **25 tests** 通过；原 APK 两轮各强制重复 20 个 ACK，随后正常循环 **10/10**。
> 每轮连接/会话/permit checkpoint=0，topology/credential 未变。独立空广播经 child 运行态复位恢复但根因
> 尚未定位，不能计入稳定性完成；冻结与失败边界见设备 GATT 主线 **§10.38**。

> **2026-09-05 终态清理真机收口：**§10.36 的 App 已重新构建并安装（保留登录态），真实 exact Hub relay
> 认证后 child 拒绝无效应用 record 并断开 ACL，Service 确认 Rejected；App 清理后 links/sessions/permit
> checkpoints=0，下一 fresh operation 正常认证/同步/Closed。原 Active topology 不变，未重新认领或重置 access。
> App Angular **8 files / 48 tests** 通过。循环中的 `managementError=7` 实为 Broker 异步发送引用被请求
> scratch 提前清零，已在 Broker Buffer 所有权交界修正；App 不新增重试、SDK 配置或消息协议。
> 冻结 APK、Hub、Broker 与后续证据见设备 GATT 主线 **§10.37**；下方“尚待安装”为上一批历史状态。
> 后续正常十轮短循环为 **9/10**，末轮 Connected 后同步前失败、清理成功；不能把 Closed 当作接入成功。
> 测试已补受控静态错误/numeric wire/HTTP status 归类，下一批与 Broker/Hub 对照 ACK/序号，不扩散 App UI。

> **2026-09-05 permit window 终态清理：**Hub selected ACL 失败现在关闭既有窗口，不在内部重连后继续传 opaque
> 分片。App `disconnect()` 接受 exact window 的 Closed/Expired/Rejected/Busy/Unsupported 终态并清理 permit
> checkpoint；open/connect/认证的失败仍失败，不改变 enrollment/attachment checkpoint 和 topology 判定。
> 网络错误、未确认终态仍保留恢复。源码 Angular **8 files / 48 tests**、ESLint 通过；本批手机仍使用 §10.33
> APK，新增清理逻辑尚待安装后进行真实断连门禁。Hub/child 连接时序和未关闭条件统一见设备 GATT 主线 §10.36。
> Hub 新鲜候选排序的无 trace 固件已完成 **10/10** 真实连接/认证/同步/关闭；App 不以 MAC 为身份、不改授权
> matcher，最后 links/sessions/permit checkpoints=0。这不替代新 APK 的真实拒绝终态清理验证。

> **2026-09-05 Gateway 回执/设备 replay 真机更新：**沿用 §10.33 APK，真实 child 已安装后 proof 单 bit 篡改被
> `EDGE_GATEWAY_RECEIPT_CONTEXT_MISMATCH` 拒绝，0 Gateway Method 2/正常 commit，checkpoint 保留；单独向
> Service 发送同一错误 receipt 返回 409，权威状态不变。相同 BBP/2 请求用 fresh DirectSecure counter 重传得到
> 同 receipt，改 secret 为 AuthenticationRequired。原 operation 正常恢复后 Active、连接/检查点清空。
> 证据及一次前置 CONNECT_TIMEOUT 见设备主线 §10.34；该超时不能计为安全负测通过。测试脚本必须读取既有
> `GatewayHttpError.code/httpStatus`，不修改生产错误模型迁就脚本。本轮 App 生产源码/APK 未改；§10.35
> 架构复核保留 cloud-only 与 exact Hub session 分离，未扩展 UI 或新管理协议。

> **2026-09-05 enrollment→attach 正式交接修订：**认领 session 在首次 attach cloud mutation 前关闭；
> 初次与 active/checkpoint recovery 共用 `beginAttachment/resumeAttachment`。cloud-only `advanceCloud` 对
> delivery/proof 各至多推进一次，只有 PendingChildInstall 才经 exact Hub 打开新 session；删去重复
> `connectAndAttach`、多余 GET 和可能转入手机 Direct 的 generic resume 回退。保持 account/epoch 与秘密清零边界。
> **7 files / 62 tests**、ESLint、local/Android build 通过；新 APK 真机首轮完整 enrollment→Active 用时 89.43 s，
> 无 failed/retry、末尾 links/sessions/recoveries 为 0。APK 与持久化证据见设备 GATT 主线 §10.33。
> 本条替代下方生命周期待办；不把单次成功扩张为全部 N3、force-stop/restart 或发布长稳通过。

> **2026-09-05 N3 真机更新：**新 APK 已安装并保留登录态。真实 Hub relay 上发现 connect() 后忽略
> SelectResult/Disconnected；`GatewayPermitJoinRecordLink` 已在统一收发 view 入口消费断开，核对选定 token 与
> packet size，不新增 wire。相关 4 files / 29 tests、ESLint、local build/Android assemble 通过。签名与请求 tag
> 篡改时不进入 Method 2/commit；真实 AEAD 解密后 receipt proof 篡改被拦截且保留 pending recovery。
> 原凭据正常恢复后 topology Active、检查点清空；exact commit replay 零更新，变化回执重放被拒。
> 证据/冻结 APK hash 见设备 GATT 主线 §10.32。**首次 enrollment→attach 出现一次 SESSION_CLOSED，重试成功
> 不等于首次交接稳定**；下一批先统一初次 attach 与 resume 的 cloud-first/session 生命周期，并补针对性真机验证。
> Gateway receipt/envelope 其余 N3、N4/N5 等仍未关闭；下方“APK 未更新”是前一批历史记录。

> **2026-09-05 N3 enrollment/attach 校验收口：**Gateway receipt 除 HMAC/operation/identity/version 外，必须
> 核对 `secretDigest == SHA256(gatewaySecret)`；失败在 Method 2/Service commit 前停止，并清理临时密钥与摘要。
> Admin receipt 仍由 App 验证完整 bytes/HMAC，Service 不知道 Admin secret。已落盘 pending credential 的恢复须先
> 通过 Method 2，再提交原 intent/commitId/receipt；不能仅因 grant 到期删除恢复材料，也不能仅凭预计算 receipt
> 提前 commit。本批 **3 files / 20 tests** 与 targeted ESLint 通过，手机 APK 未更新；详见设备 GATT 主线 §10.31，
> 软件测试不替代冻结 APK 的四端故障注入。

> **2026-09-05 G2B-4 最新收口：**真实 Android A→B→A 已证明旧 GATT 关闭、B 不可见 A credential/checkpoint、
> A 可恢复 Direct；child reset/re-enrollment 的旧 Gateway access 已由 supersession 四端门禁退役。N3 的
> permit-join 选择负测随后完成 4 轮：真实 Hub 候选 token 篡改为 NotFound，exact Select 重放保持同一结果，
> 变更候选返回 409，窗口最终 Closed，未创建 enrollment/topology。详情以设备 GATT 主线 §10.29～10.30 为准。
> App `PermitJoinRelayLink` 已遵守 Open→operation GET Ready→relay，不增加第二套 ready 推进逻辑。
> 过期/不可用窗口显示重新扫描提示，未知 Gateway 错误不再原样显示内部英文错误。相关 link/page 单测
> **2 files / 13 tests** 通过；新错误文案尚未安装 APK 验证，不把源码回归计为新 APK 真机门禁。N2 双 Hub、
> N3 enrollment/attach、N4 force-stop 与 N5 其余 pending restart 继续阻断发布；后续不扩展页面编辑器。

> **2026-09-05 Direct/Gateway 账户隔离修订：**ControllerCredential、permit-join、enrollment workflow 和
> attach checkpoint 必须按 `(API authority, accountId)` 分区，所有进行中的扫描、HTTP、GATT 与恢复事务绑定
> `sessionEpoch`。账号切换立即关闭 Direct session、清空 snapshot，并拒绝旧账号稍后返回的响应；grant、PresenceKey、
> Gateway secret 与 relay byte buffer 在抛错前清零。同账号 token refresh 不推进 epoch。没有账号字段的测试期旧记录
> 不做推测迁移，升级后需重新 enrollment/attach。此项已通过 App 全量 92 files / 706 tests 和 local build，真实
> 双账号等后续真机状态见上方最新收口，不以本条历史软件测试记录替代其余负测。

> **2026-09-01 Gateway 四端状态同步修订：**真实 Android account MQTT -> Edge Hub -> BLE child 已完成
> Action/ACK/Patch。App 现在接受 Broker 主动发送的分页 StatePage；完整 StatePage 是设备运行会话的权威状态代际，
> 可以从低于旧缓存的 revision（包括 0）重新开始。Patch 仍只在当前代际内单调。该修订不新增 wire epoch 字段，
> 也不要求设备重启时强制重连 App MQTT。

> **2026-08-21 PageLayout 执行修订：**账号私有 PageLayout V1 云端核心已经完成，不再是“仅本地”候选。
> Gateway 按 `(accountUserId, logicalDeviceId)` 保存，提供 GET/PUT/DELETE、乐观 revision，并在保存前用
> Broker 当前 Manifest 校验 fingerprint 与 endpoint compatibility。App 无记录时保存确定性默认页；Manifest
> 变化时只展示保留兼容 widget 的 migration preview，用户确认后才提交。手动拖拽、模板与 Agent 后续统一调用
> `DeviceV2PageLayoutService.saveCandidate()`；它们不能产生或执行任意 JS/CSS。旧章节中的 `PageSchema` 是上位
> 概念，当前落地格式统一命名为 `PageLayout` V1。

> **2026-08-18 鉴权/选择性分享修订：**权威合同为
> `D:\codes\blinker-library\docs\DEVICE_V2_AUTHORIZATION_AND_SHARING_DECISION.md`。服务器 ACL 固定为
> `(userId, logicalDeviceId, role)`；Direct secret 是每设备 Admin/Shared，不是 household master，也不再每
> App 一槽。只分享一台设备时只交付该设备 Shared secret。删除成员后 cloud 权限立即撤销，但 Direct 必须等
> 该设备 Shared 轮换完成；此前 UI 显示 `DirectRevocationPending`。所有 Direct secret 只进 OS 安全存储。

> **2026-08-18 设备实现输入：**P6 已冻结 `blinker-config/2`：GetInfo 为 2 B request/24 B response；flags
> 分别表示 hasDeviceKey、supportsAccessBootstrap、hasAccessState，末尾为 `accessEpoch u32be`。WiFi-only P3
> 使用 45 B Install；P6 首次必须发送 101 B Bootstrap（DeviceKey、accessEpoch、Admin groupId/version/secret），
> 设备通过单个 176 B atomic store 提交。Ticket/用户 JWT 只在 App/Service 外层授权，绝不能塞进设备 endpoint。
> P6 已有 access state 后 Install 只刷新 DeviceKey并保留 Admin/Shared；App production codec 仍未实现。

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

> 2026-08-19 DeviceKey 修订：短期 EnrollmentKey/RecoveryKey 双码 UX 与 `ManualDeviceKey/bdk_` 已撤回。
> App 为设备长期显示一个 43 字符、无前缀 DeviceKey；同一 Key 用于首次烧录和全擦恢复。刷新必须强吊销
> 旧 Key、旧 challenge、旧 SessionCredential 和在线连接。权威合同为
> `DEVICE_V2_DEVICE_KEY_CONTRACT.md` 与 `DEVICE_V2_DEVICE_RECOVERY_CONTRACT.md`，不能用旧 authKey 临时代替。

> 2026-08-19 数据面输入：服务器已提供 owner 范围的 Manifest/State 读取；Broker 只在完整 State snapshot
> 后设置 `stateFresh/protocolReady`。App production reducer/PageSchema 尚未实现，不能把 HTTP API 已存在
> 写成 App 页面已完成。

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
都是不包装的 exact bytes。它与 WiFi-only 设备的 `/api/v2/device-auth/challenges`、`/api/v2/device-sessions`
DeviceKey challenge-HMAC 明确分开；App 只通过受保护本地配网安装 raw Key，不能把用户 JWT 或 DeviceKey
直接当 MQTT password。

每个来源保留自己的 `(sessionEpoch, manifestFingerprint, stateRevision)` lane。设备重启后 revision 可从零
开始，Direct 与 cloud 的 revision 也没有跨 session 可比性；不得简单取较大 revision。Direct 在线时 UI
优先显示已完整验证的 Direct snapshot，否则显示 cloud snapshot；任一 lane 只有完整 snapshot staging 后
才能变为 fresh。

### 0.2.1 PageSchema 统一编辑与 Manifest 更新

手动拖拽、确定性模板和 Agent 都只能调用同一个 PageSchema reducer，使用受控 WidgetRegistry，并产生
同一种声明式 schema/patch。Agent 不拥有独立页面格式，也不能返回直接执行的 JS/CSS；输出必须经过组件
白名单、binding type/access、schema size 和权限校验，再进入用户预览。

PageSchema 至少保存：

~~~text
pageRevision
sourceManifestFingerprint
sourceCapabilitySummary
lastPromptedManifestFingerprint
widgets/layout/styleTokens/declarativeRules/bindings
~~~

App 取得新 Manifest 时先比较 fingerprint。相同则直接渲染；不同则对 capability summary 做 diff，页面进入
`stale-compatible` 或 `stale-breaking`，并按新 fingerprint 只提示一次“控制页面需要更新”。新增 endpoint
进入“可添加组件”，删除 endpoint 保留组件位置但禁用 binding，type/access/constraints 改变标记
`needsReview`；其他 binding 继续工作。用户确认时创建新的 PageSchema revision 后才切换 source fingerprint，
选择“稍后”不得清空页面或每次打开重复弹窗。

页面不存在时必须允许用户选择空白手动拖拽、确定性通用页或 Agent 草稿。三条路径保存同一 PageSchema。
State 只有在其 `manifestFingerprint` 等于当前 Manifest 时才可原子提交到 UI store；页面 stale 不阻止设备
完成协议上线，但旧 fingerprint 的状态不能套用到新 binding。

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

`State revision` 不是跨固件重启持久保存的设备世代号。App 对 Patch 执行严格连续 revision 校验；但来自当前已授权
Broker session、匹配已接受 Manifest 的完整 StatePage 是权威代际边界。主动 StatePage Delivery 不带 requestId，
使用 IdMode；收到 cursor 0 时必须清空旧 staging，全部分页完成后再原子替换旧快照。它可以把旧 revision 5 切换为
新 revision 0，之后 Patch 只能从 0 连续推进。分页不完整、fingerprint 不匹配或 ACL 已失效时不得改动可见状态。

### 0.4 App 端四条正式上线流程

1. **WiFi-only 手动模式**：App 创建 logical device并长期显示无前缀 DeviceKey；设备用 DeviceKey
   challenge-HMAC 换短期 SessionCredential。正常重启自动登录；全擦后重新安装当前 Key回到同一 logical device。
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
| R5-A5 | Manifest/State reducer、PageSchema/WidgetRegistry | 缺页/乱序/版本冲突不污染 UI；拖拽/模板/Agent 同构；新 fingerprint 只提示一次且不覆盖布局 |
| R5-A6 | fake Gateway/device E2E 后再接真机 | 四 profile、日志脱敏、断线/长稳门禁通过 |

R5-A1 直接消费已经冻结的 DeviceKey/BBP2 shared golden，不再等待或实现 ManualDeviceKey parser。不得自行
猜测数字 key、错误码或 DTO。R5-A2 在选择 production crypto/OS secret bridge 以及补齐 BLE link-security 可观测性前
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

### 11.1 S3a-1c 网关 child executor 对 App 的边界（2026-09-09）

设备端已把每个child的南向连接、BBP/2序号与单在途exchange收口为唯一executor；这不增加App wire或页面入口。
App仍只维护自身账户MQTT或未来LAN会话的requestId/sequence/Ready状态，不推测或持久化Hub→child sequence，
也不因Cloud重连要求child重新鉴权。未来LAN adapter忙时必须把Busy/WouldBlock明确返回当前caller，不能在App层
无界排队或把未知Action换路径重发。Manifest/State多上游事实合并仍属S3b/S3c后续，本批未改App生产代码。
