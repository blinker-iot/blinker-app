# Device V2 本机定时页面接线

更新：2026-09-28，第四十五批最小设备源码独立重建/安装编译通过；第四十七批A1-1纯规则/判定软件已完成，当前下一步为设备主线§6第20项Broker有界观察。云规则页面边界另见[scene说明](../../scene/README.md)，不修改本机任务journal或把本页当云执行器。本批App只同步文档，没有新APK/ADB；未知根恢复、已分享operator实物和T2正式准入仍未完成。

## 当前状态与职责

- 原设置→任务列表→编辑路由、HeroCard/主题保留；TimerService换成页面状态/取消适配器，根级TASK_CLIENT唯一持有HttpTaskApi及账号隔离的原意图存储。没有新增MQTT连接、后台调度器或定时服务。
- 列表读取设备认证目标目录→任务metadata→同revision记录，使用稳定taskId，不再将数组下标当任务身份。刷新失败不会显示“空表成功”。编辑器新建/替换/删除经设备回执确认后直接返回，由列表执行唯一的新鲜查询；留在本页的启停/Start/原ID恢复仍在本页确认后查询。不乐观改device.data，不把旧表标ready；未知写不能导航假报成功。
- 创建/替换定义不Start；enable不恢复倒计时。列表单独确认“开始新倒计时”，已运行/Claimed状态不再显示可直接重开。倒计时、一次日期和固定UTC偏移的星期任务只赋值一个固件明确允许的标量Property；周一为bit0，手机时区的一次日期转UTC；固定偏移不自动跟随夏令时。
- 首次进入只读，不自动Initialize；明确SCOPE_REQUIRED/AUTHORITY_REQUIRED才可新建同步，已有未确认同步只恢复其原ID。正确读取原拦截器的GatewayHttpError.code；未知失败不被当作未初始化。服务端owner/白名单/profile仍权威，页面不扩大权限；服务默认关闭。
- 删除旧JSON timing/loop/countdown发送、160ms先开始再暂停、900ms假刷新结束、默认switch/toggle动作、20条/数组索引假设及不再使用的样式/模型。旧loop和演示任务不伪装为V2支持，旧timing-0等链接拒绝并引导返回新列表。
- 设置页移除基于旧data.timer的“已启用”徽标；目录/表才是V2依据，预览、分享、BLE与网关任务不冒充当前普通WiFi owner试点。

## 能力、持久化和生命周期

TaskPropertyTarget的真实目录是调度目标的唯一来源。普通Manifest可写不代表调度许可；App使用现有账号隔离Manifest缓存的同key/type范围/单位作**提示**，不把过期缓存当当前约束或授权。MCU始终按当前实际字段约束验收/执行；本批未建立新的Manifest会话或保证已缓存的范围仍最新。页面没有缓存时仍可按真实目录输入值，设备验收为准。通用日期/标量边界复用原taskDefinition校验，输入错误留在编辑页，不先产生未决请求。

统一的`IndexedDbIntentStorage`使用WebView原生IndexedDB，不新增插件/凭据库；原requestId＋完整typed意图的`durability: strict`事务 **oncomplete后才允许HTTP**，不是request.onsuccess。第六十批将原`IndexedDbTaskJournal`原样抽为共享存储适配器，任务仍使用原`blinker-device-tasks`数据库、intents表及键，不迁移或丢弃历史；自动化使用独立数据库，业务意图及恢复逻辑不混用。真实Android force-stop证明localStorage.setItem返回不能当作此持久屏障，已删除该适配器，不保留静默回退。存储端口为异步、按API authority/account/device隔离，每设备最多一个未决业务意图及一个显式授权同步，同一键原子保存且仍限2048字符，不存Key/Grant。写入或清理无法确认都显示日志错误；旧WebView不支持strict、容量满或损坏时拒绝新写，5秒有界失败，不以另一个requestId补发。

根级客户端在首次异步存储前取得设备锁，协调Ionic保留的列表/编辑页；跨await重新核对账号/取消及完整原意图，清理也等待事务提交。页面各自拥有AbortController，离开、销毁和账号sessionEpoch变化取消查询并清旧显示；普通token续期不误判换账号。TimerService只用一个signal状态和现有访问器驱动列表及状态子组件，不依赖手工detectChanges/假等待；旧响应/旧确认弹窗不得操作新页面/账号。

这不是卸载、清应用数据、操作系统存储驱逐、磁盘损坏或多窗口并发的保证；未发布试点的旧localStorage记录不自动迁移。事务语义参考[IndexedDB durability](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction)，真实证据仅覆盖本次Android/WebView。读取新鲜表不能替代未知Start原意图，恢复必须用户明确确认。

Pending/Unknown的显式入口：

1. “恢复原请求”：仅非held时可用；确认后精确使用原ID/正文，不自动刷新CAS、换ID、Start或切路。历史确认与fresh状态分开展示。
2. “启用/同步本机任务授权”：有原意图时先保存`task-recovery/1`的pending＋authority，原意图held且跨重启禁重提。同步失败只恢复其原ID；成功只清authority，旧意图仍保留。Read不自动清任一项，页面不因同步成功就解除旧业务阻塞。
3. “已核对，停止追踪原请求”：只有本页新鲜完整表成功后可选，再次确认并比较两项完整状态；只删除本地追踪，**不取消远端请求/授权同步，不移除设备任务，也不证明原操作没执行**。不能核对时保持记录、禁止新业务写；损坏记录不提供静默清除。

新的操作由用户另行明确提交。客户端没有后台自动重试；既有认证拦截器仅在401刷新登录后重放**相同**HTTP请求，沿原ID，不生成新任务意图。

## 有界请求节流

现有Broker按物理连接最多4次任务交换/秒，每个管理调用通常含Prepare和Commit两次。HttpTaskApi在上一HTTP结束后至下一请求开始保留550ms可取消间隔，使本App的顺序分页不以突发请求消耗该预算；不是延时后猜成功，也不放宽Broker。其他消费者竞争、未知延迟和总体账本额度仍可能拒绝，展示错误后由用户处理。

目录最多32目标、任务表最多10项，每页独立认证查询；没有无限扫描/自动回收客户端记录。大目录的完整加载需要多次往返，短期重复刷新仍可能用尽64条服务账本直到只读TTL回收，页面明确报告额度而非重连绕过。尚未优化目录缓存命中或宣称32目标连续快速编辑已真机通过；T2c先使用COM3实际小目录，不能据此宣称最大规模长期可用。

## 第二十九批软件证据（历史）

- 完整 `tsconfig.spec.json` TypeScript检查通过。
- Angular正式runner相关90/90：task客户端16、页面服务9、页面/模型9、管理9、拦截器31、设置16；无skip。覆盖分页混表/重复taskId/历史结果拒绝、真实规范化错误形状、显式初始化、原意图跨页面恢复、写前存储、账号/离开取消、弹窗迟到、CAS不静默更新、无自动Start、本地停止追踪及节流中止。
- `ng build --configuration=testing --aot=true --output-path=build/task-pages-20260923`成功，真实lazy页面/模板均编译；不是生产APK或视觉/ADB验收。测试使用模拟HTTP/存储或页面逻辑替身，尚无真实WebView进程重启持久化证据。
- 本批仅App生产代码及三端进度文档；设备/Service生产代码、wire、数据库schema和默认开关不变。前批Service79/79及设备69/69为历史证据，本批不重新累计。
- 未部署任务服务、迁移业务库、改网络、烧录/清授权、暂存/提交/推送。

## 第三十批真实闭环与修正

- `tasks:execute`补入原鉴权拦截器的精确管理URL范围；不放行外域/相似路径。401续期仍保留原ID/完整body，不创建另一请求。真实owner令牌由App原登录/拦截器使用，未提取或伪造。
- 真实App创建专用WiFi设备，使用页面组件动作及真实确认弹窗，COM3实际返回容量4、调度目标仅power(bool)。20秒倒计时安装不Start，单独Start后退出首页并force-stop，MCU执行一次；重进认证查询为Done。
- localStorage版本在真实force-stop后丢失原意图，记为失败证据而非通过。改IndexedDB后，在一次Start认证响应已经进入App、尚未交给客户端结算的位置有意阻断，立即force-stop。重启后完整原意图仍在；用户确认原ID恢复得到historical，修订/Start序号不变，服务器attempts仍1、MCU回调只增加1。是受控响应阻断＋真实杀进程，不冒充射频丢包或断电测试。
- 再次Start后软件重启COM3；45秒后已超过20秒期限，设备回调为0，认证查询为Aborted，未自行续跑。没有把软件重启写成物理断电。
- 最终75/75、0 skip：客户端18、日志5、页面服务10、页面/模型9、拦截器33；完整spec TypeScript、local/local-device AOT、Capacitor/Android APK构建通过。新增真实Angular父/子模板测试，异步更新不靠手动触发检测。该75项与历史90项范围不同，不相加。
- 最终APK SHA-256 `50afbadf156218339832067da77a139e3d4f66d97a3e5ae55a5cb34b9c0eeb33`，已核对手机安装文件。收尾时用户将网络切到“带翅膀的蜗牛”：最终版实际页面正确显示TASK_UNAVAILABLE，未假报空表成功；**最终版有任务的成功列表视觉尚待同网复核**。原请求恢复/重启中止由前一IDB版真机完成，最终版增加signal显示修正，没有重复宣称全链路重跑。
- 专用测试记录已由原owner正常删除，返回202：cloudAuthorization=revoked，brokerCleanupPending=true，localTasks=not_confirmed。离线删除不等于设备退休已证明。App列表不再含该记录，activeDeviceLinks=0；COM3原固件恢复详情见执行器§10.29。未改生产设备/Service源码或wire，未暂存/提交/推送。

## 第三十一批：日历真机与重复查询修正

- 实际成功列表、日期/星期及完成进度均已截图核对。手机当前UTC-7，不擅改手机时区：一次日期转UTC后与MCU的consumedUtcMillis完全一致；星期为周三bit2、固定偏移-420，MCU在对应UTC分钟执行。配置跨软件重启保留；捕获timeValid=0→1且在到期前恢复，两任务各回调一次。完成后再重启，进度/消费水位保留且回调0，不补放。不是来源失效跨到期或物理断电门禁。
- 同一账号MQTT下普通按钮ACK约107ms、属性ACK约299ms，State和设备计数相符；未新增App/设备MQTT连接。成功表只表达最近一次认证查询，不自动轮询或将结果字段等同于GPIO物理效果。
- 初始版本连续创建触发TASK_RATE_LIMITED。定位为编辑器保存后完整查询，再返回列表又完整查询；管理接口还复用账号/IP鉴权预算。只删除前一次重复读，不改Gateway/Broker预算，不引入缓存或跳过认证。`TimerService.write(intent, refreshAfter)`默认继续查询；编辑器明确false并在认证确认后导航，未决/取消/换账号保持原保护。
- 新APK实测两任务表的replace→列表共6调用（原路径需11），删除后剩一任务为5调用（原路径需9）；这些数字不含进入编辑页的查询。预算窗口恢复后连续创建两项通过，新taskId为3/4而非复用1/2，Start序号均0、无自动执行。未把有限小目录结果当作最大规模/无限频率准入，30次/分钟鉴权及64条账本仍可能拒绝。
- 最终相关 **78/78、0 skip**：客户端18、日志5、页面服务12、页面/模型10、拦截器33；完整spec TypeScript、AOT、Android构建通过。新增不重复读、未知写保留、一次日期/固定偏移编辑往返及删除后由列表读取测试。仅修改TimerService/TimingEdit两个生产文件和两个测试，无新协议/SDK。
- APK SHA-256 `afe10f7d1ebbb51ba6ece4781ba6429cfb86bca60535bca702830c97b0ccfdf3`，手机安装文件一致，最终成功列表已复测。此批与前批测试数不相加。
- 专用设备owner删除得到202、cloudAuthorization=revoked、localTasks=retired_verified；brokerCleanupPending=true仍未确认。App返回首页、清单移除、activeDeviceLinks=0，COM3恢复与服务现场清单见执行器§10.30。没有Git暂存/提交/推送。

## 第三十二批：失时、满表、Start及准确提示

- 专用COM3重启后缺少真实服务时间，跨过日期到期再恢复，没有补执行；原定义progress=0不等于将来必执行。模型改为日历“尚无执行记录”、倒计时“等待手动开始”，不根据手机时间猜MCU结果。
- 4条相同UTC任务均完成，满表第5条没有写入；运行中第二项Start被30秒全局冷却挡住。设备失败目前没有可验证的具体原因，HTTP返回TASK_OUTCOME_UNKNOWN，原请求保留；不能仅从这个响应证明未执行或自动新发请求。
- 实际同一Start原ID在冷却结束后重提会首次执行，因此恢复弹窗明确“原操作尚未执行时，这次可能执行；仅查看请查询”。取消仍保留原意图且不发送恢复请求。测试覆盖新提示与状态映射；不改已有journal/HTTP/CAS/验证策略。
- 最终相关79/79、0 skip，完整spec TypeScript与AOT/Android通过；最终安装APK SHA-256 `4e7f3d743cd4db65458ea02a938cbc2e01ffee6a7984de5a32063c81f11451b3`。真机/清理范围集中见设备执行器§10.31，不累计前批测试。

## 第三十三批：连接归因与Key同步入口

- 原认证HTTP链区分无连接、Hello/订阅未就绪、状态变化和多连接；特别是软件重启后的旧socket尚未退出时不等于WiFi离线。提示只要求稍后手动查询，既有原ID仍保留，连接错误不能证明历史请求没执行。
- 在原设置页刷新专用设备Key后，旧连接失效；新Key固件上线但目录读取旧任务根会返回未知，原UI没有同步入口。Service先检查已确认根与当前根，返回已有`TASK_AUTHORITY_REQUIRED`，原TaskStatus即显示显式同步。此处不是App猜测错误码或自动Initialize。已签发Rebind丢回执时仍可Read核对；只prepared不授予这条恢复路径。
- 真机正常同步保留taskId1、revision2、定义/startSequence1/Done；再重启约5/13秒得到连接不唯一，约23秒Read可用后Start未写入；窗口后原ID恢复只执行一次，最终revision3/startSequence2/Done。完整矩阵和限制见执行器§10.32。
- 最终82/82、0skip：客户端19、日志5、页面服务13、页面模型12、拦截器33；APK `8d48276fa0cb1637f58a771e8413fbae6ffac63b48aa21a1cdbe4a0b53356ede`已安装并核对SHA，成功列表显示完成。没有新增页面/连接/后台任务。

## 第三十五批：双记录恢复真机与确认语义

- 原owner实际页面创建20秒倒计时，真实Start认证响应到达HttpTaskApi后、client结算前受控阻断，ADB force-stop后原ID/正文恢复。Service已verified，App未决，不冒充射频丢包或Service结果未知。
- 原设置页刷新Key后新Key固件上线，旧Start保留，目录提示需显式同步。同步确认也在同一边界被阻断，再次force-stop后原Start与独立同步均恢复；实际页面显示恢复同步入口，旧Start held、不能新写/重提。恢复同步原ID只清authority，仍需新鲜查询后明确停止旧追踪。
- 发现通用成功提示可能将“授权同步的historical”误读成“原Start已确认”，仅在TimerService现有write/mutate分支明确区分，不加状态机或队列；fresh/historical提示均回归。最终相关92/92、0skip，spec类型检查、AOT/Capacitor/Android通过。
- 完整双故障链在前一候选通过；最终仅提示修订后的APK SHA-256 `526c131bacc0d9d1c76b6d5ca32bad0f5c8aa3332491c68bdb0c2b510082f804`，已核对实际安装包。最终包重启仍保留held；明确停止本地追踪后另行Start，MCU只执行一次、startSequence1→2。真实账本Create/旧Start/新Start各1attempt，没有旧Start重放。
- 实际切换已有第二测试账号，catalog/initialize/start均403 TASK_FORBIDDEN。正常operator邀请accept为409 CROSS_SHARD_SHARE_UNSUPPORTED，不能据此声称已分享用户门禁通过。邀请已撤销，手机恢复原owner及通知安装；没有伪造JWT/改账号数据库/清App数据。
- 测试记录由owner正常删除并取得任务退休证明，Broker清理仍待确认；COM3整8MB/NVS已独立验证恢复，COM11/COM12不动。证据统一见执行器§10.34及私有`build/task-key-pending-live-20260923/verified-evidence.json`，无Git暂存/提交/推送。

## 第三十六批：认证拒绝保留原意图

- 新HTTP响应`state:"rejected", evidence:"fresh"`仅接受`result.kind:"rejection"`、原device/requestId/expectedRevision、合法count与两个原因。`start-cooldown`只匹配start，`write-budget`只匹配mutation；其他字段/历史拒绝/错误关联均失败关闭，不误报成功。
- `taskResponse`在原客户端清journal之前抛出有限`TASK_ATTEMPT_WRITE_BUDGET`/`TASK_ATTEMPT_START_COOLDOWN`，TimerService复用现有错误显示。仅证明本次attempt未写入，不证明之前attempt未执行；原记录继续占用写槽。没有第二套pending类型、定时自动恢复或cooldown倒计时承诺。
- 回归覆盖前次未知→两类拒绝→手动读取仍保留→明确原ID恢复后才清理，以及错误原因/CAS/历史标记/多余字段拒绝。App相关95/95、0skip，完整spec类型检查和testing AOT通过；没有APK构建/安装、ADB或MCU验收。
- Service必须匹配schema043/新解码器；旧固件普通Failure仍unknown。认证边界与77 B预算集中维护在执行器§8.13，不在页面重新实现HMAC。

## 第三十七批：冷却认证拒绝真机

- 真实owner页面启用/创建5秒倒计时，首次Start完成后在30秒冷却内再次Start。实际页面显示`TASK_ATTEMPT_START_COOLDOWN`，保留requestId/CAS/正文、禁止新业务写。Service request仍pending，attempt rejected带58 B认证证明；设备快照5→5、回调仍1。
- ADB force-stop、重开真实App，新鲜查询Done但原意图仍在，服务无新attempt、设备未再执行。明确点击“恢复原请求”及确认弹窗后，同ID才增加一次成功attempt，设备序号1→2且只多执行一次；客户端成功后才清journal。没有伪造响应、自动计时重提或设备断电测试。
- 同账号MQTT普通button和power的ACK/State/计数通过，观察退出释放；这是实际协议控制而非控制页面布局验收。本批无需改动生产代码，未新增错误缓存或恢复状态机。
- 最终APK SHA-256 `7f2d61662ff3ff324f4fa174d7b66148b41b0753f3276cda1110f9f8a6b3e965`已与手机安装文件一致。专用设备正常删除并认证任务退休，App回首页、活动连接0；COM3原8MB/授权恢复。详细计数、现场和备份见执行器§10.36，未将前批95项测试再次累计。

## 第三十八批：首次未确认根变化的明确限制

- Service候选新增409 `TASK_AUTHORITY_RECOVERY_UNSUPPORTED`。原TimerService基于现有错误状态停用初始化/同步及重试入口，原DeviceTaskClient/IndexedDB journal不变；保留原请求与最多一个同步记录，不自动清理或产生新ID。错误文案说明当前试点无法恢复，不诱导擦除Flash或继续使用泄漏Key。
- 新增回归覆盖单原请求、原请求＋未确认同步两种日志，关闭/重开页面、读取失败后仍精确保留ID/正文；点击不产生新操作。相关App96/96、0skip，完整spec类型检查及testing AOT通过。本批没有构建/安装APK或ADB真机复测；实际手机仍为第三十七批候选。
- 准入集中见执行器§8.14：普通WiFi owner四槽单目标封闭试点，不是全平台正式任务功能。新增前置拒绝不代表首次未知根已能恢复，更不覆盖已确认根后连续未知换根。

## 第三十九批：连续未确认换Key沿原日志停止

- 原错误`TASK_AUTHORITY_RECOVERY_UNSUPPORTED`同时覆盖首次初始化及同步未确认后再次换Key；只修正文案，不新增HTTP字段、journal、重试计时器或UI状态机。服务通过持久化授权边界判定，页面不猜当前设备根。
- 新增真实DeviceTaskClient＋存储替身回归：旧create未决→显式同步也未决→再次换Key受限，原业务意图与同步记录保持held；refresh/关闭重开、重试/同步按钮和放弃追踪均不能改写它们。已有正常恢复用例仍通过；这不是ADB杀进程/实际MCU门禁。
- 本批App97/97、0skip，完整spec类型检查和testing AOT通过；无APK安装。当前现场仍是第三十七批候选，下一步差异真机必须匹配新Service/文案，不能把只丢App确认当成Service根未确认。

## 唯一下一步：T2剩余有限门禁

1. 本轮网络“带翅膀的蜗牛”；下轮仍先重读网络/COM身份、真实owner及最小服务映射。需要硬件写入时先核对COM3备份，结束恢复，COM11/COM12不动。
2. 已过失时/容量/同刻执行、运行中与冷启动Start、正常Key刷新同步，不重复列为未完成；首6秒云通道没有可用窗口，仅保留原核心额度覆盖，不新增测试旁路。
3. 首次/连续未知根拒绝、原日志/按钮保护及两种窗口跨根MCU退休已有有限实物，不等于恢复功能。第四十三至四十五批已补Arduino入口/profile、安装/实物和最小设备源码交接；不重写编辑器/日志或重复普通组合。已分享operator仍等待受支持同片环境；不清日志掩盖限制，不把云删除等同全部设备清理，写额度真机/最大目录等未准入。
4. A1-1纯规则/判定软件已于第四十七批完成，下一步仅主线§6第20项Broker有界观察；owner封闭试点可交接不等于T2正式整体关闭。云规则独立于页面存在，不把本页变成后台执行器，不增加BLE/混合/网关任务或通用编辑器。

## 第四十批：真正Service未知根的App保护

- 真实设备同步B成功但Result在Service验收前被一次性截断，App收到TASK_OUTCOME_UNKNOWN、保留原initialize ID。随后通过原设置页刷新C，实际杀进程/重开；C固件上线后首次进入与手动再次查询均TASK_AUTHORITY_RECOVERY_UNSUPPORTED。日志与原ID完全一致，初始化/重试/新写均不可用，实际页面提示已核对；没有自动补请求或清日志。
- 同一账号MQTT仍能控制普通button/power，ACK224/242ms、fresh State/MCU计数一致。错误任务状态不应阻塞普通设备控制，不新增账号连接或路由旁路。
- owner正常删除202并从清单消失；**本轮localTasks=not_confirmed**，原因是MCU跨根退休尚未实现，不是页面可以靠“删除成功”消除的状态。App没有伪造设备已清理；下一步沿设备执行器修终止路径，不新增页面恢复器。
- 本批无App生产源码修订；local/local-device AOT、Android构建及实际APK SHA-256 `e47ba4caa5f8e91ffb27b145e966d4886f8ff9acfe9b2e9b234a58a1f1e91225`核对通过。现场/证据/限制统一见执行器§10.39，未把前批软件测试数累计成新结果。

## 第四十一批：跨根删除取得设备终止证明

- 复用同一已安装APK（SHA见上），不修改App生产代码或重建另一套页面恢复器。真实A确认→B结果在Service验收前丢失→设置页刷新C→force-stop/重开；首次和再次查询仍明确拒绝，原Initialize ID/journal完全保留，初始化/重试/新写均关闭。
- 原账号MQTT的button/power ACK170/204ms、fresh State与实际设备计数一致；没有第二条账号连接、自动重发Action或任务恢复。退出观察后资源已释放。
- 本轮正常owner删除返回202、cloudAuthorization=revoked、**localTasks=retired_verified**，列表消失、activeDeviceLinks0。该差异来自设备Session修复与74 B认证终止回执，不是页面将not_confirmed强改成功；brokerCleanupPending=true和localAccess=not_confirmed仍按原字段保留。
- 软件、实物和恢复边界见设备执行器§8.15/§10.40。当前根可终止旧任务表，不表示旧任务可恢复继续执行；首次未确认Initialize、已分享operator以及其他平台任务仍不外推为已验收。下一步只按主线§6第14项，不重开已过进程恢复或扩大编辑器。

## 第四十二批：首次Initialize未被Service确认的差异实物

- 真实App创建专用COM3设备、显式启用；MCU初始化结果在Service验收前被一次性截断，App得到TASK_OUTCOME_UNKNOWN并保存原ID。随后原设置页刷新Key，真实force-stop/重开与新Key固件上线后，两次查询均RECOVERY_UNSUPPORTED；IndexedDB原journal完全不变，初始化/重试/新写均关闭，没有后台自动操作。
- 原账号MQTT按钮ACK224ms、属性ACK251ms，fresh State与真实MCU计数一致；观察退出资源释放，不另开账号连接或重放Action。随后owner正常删除得到retired_verified，专用记录从列表移除、activeDeviceLinks=0；Broker/localAccess未知状态仍保留。
- 实际安装APK SHA与第四十、四十一批一致，未构建新APK/修改生产代码。COM3原固件和授权已恢复，临时钩子/代理已撤除；完整密码学、账本和恢复关联见执行器§10.41，不重复累计历史软件测试数。
- 已分享operator尚无受支持同片实物条件，不能由非共享账号403代替。用户入口/profile是设备侧剩余交付缺口，下一步不扩页面、任务权限或新的恢复器。

## 第四十三批：设备入口变化不改变App管理合同

- 设备`enableTasks(power, ...)`只配置固件白名单与时钟，不在查询时偷偷启用owner authority，也不创建/Start任务。原页面继续以认证目录/任务表和Service返回为准，普通Manifest可写仍不等于调度许可。
- 本轮App没有生产改动、构建/安装或ADB操作；沿用现有原意图存储、显式初始化/Start/删除合同，不为新API增加页面分支、连接或协议版本。
- 下一步用维护者4槽候选和公开入口做最小安装/实物闭环，证据范围见执行器§8.17/§10.42；不把前批实物提前算作新入口通过，不扩大编辑器/已分享用户权限。

## 第四十四批：公开入口候选真实App验收

- 沿用同一已安装APK并核对摘要，真实owner从原页面创建设备，首次任务页仍SCOPE_REQUIRED；明确初始化才得到4槽/单power目录，没有自动启用或创建任务。
- 20秒倒计时安装后等待手动Start，实际MCU回调0；明确Start后退出页面、activeDeviceLinks0、真实force-stop App。App尚未重开时设备已执行一次；重进得到同taskId、startSequence1/progress3，日志无未决项，没有自动再Start。
- 同一账号MQTT按钮/属性ACK192/92ms，设备presses1/callbacks2；属性为同值请求，不伪称发生新状态改变。原观察资源关闭，正常owner删除后设备列表移除；localTasks=retired_verified，Broker/LocalAccess未确认项仍按真实字段保留。
- 无页面重写、新连接/后台定时器、新APK或App生产代码。12条认证结果、完整安装/恢复证据见设备执行器§10.43及私有`build/task-public-entry-live-20260924/verified-evidence.json`；新[Arduino交接说明](../../../../../../blinker-library/docs/DEVICE_V2_TASK_PILOT_HANDOFF.md)区分固件白名单与owner授权。
- 下一步仅主线§6第17项交接闭包；已分享operator需受支持同片条件，不能拿本次owner成功代替拒绝门禁，不扩编辑器/权限或重复已有进程恢复矩阵。

## 第四十五批：源码交接完成，App保持原合同

- 设备433项源码清单在独立目录重建出与上一批实物完全一致的单库ZIP，公开任务入口隔离安装/编译通过；不需要App新接口、MQTT连接或页面改动。详情见设备执行器§10.44和交接说明§5～6。
- 本批没有新APK、ADB、App回归或部署，不重复累计旧测试结果；任务页仍取认证目录与当前owner授权。两既有测试账号仍分属不同shard，已分享operator实物继续待测。
- 下一批只评审A1状态触发/持久执行及最小配置职责，不将当前任务列表扩成通用自动化编辑器，也不由手机定时触发设备任务。T2生产发布/其他平台任务/未知根恢复不因交接而自动完成。
