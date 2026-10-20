# V2 自动化页面：最小接线边界

当前部署（2026-10-16）：[任务体验方案§11.36](../../../../../blinker-library/docs/DEVICE_V2_TASK_AND_SKETCH_TIMER_EXECUTION_PLAN.md#1136-匹配app部署与自动化确认刷新短验)的匹配APK已安装并读回校验，真实Android界面完成确认先于列表、受控GET失败后保留确认、只读恢复及刷新期／失败后禁写。现有停用规则按用户批准保留测试名称，两笔正常新CAS保存为8→9→10；没有重放、启用或设备命令。账号／epoch、5条任务意图、自动化0及完整日志保留，服务镜像／配置未变。314 ms仅为第二次保存的DOM确认观察，不是设备动作或精确paint时延；详情见该节，第一次取证工具失败也保留。本段仅验收后文档同步，不重建已验APK；未提交推送。

前一软件批（2026-10-16）：[任务体验方案§11.35](../../../../../blinker-library/docs/DEVICE_V2_TASK_AND_SKETCH_TIMER_EXECUTION_PLAN.md#1135-自动化确认与列表刷新解耦)完成保存确认与后续只读刷新解耦。仍以原client验证服务端配置并完成持久意图结算为确认点；立即显示返回详情和“配置已保存”，不等待列表／pending重读。刷新独立显示状态和错误，失败保留确认、禁写并提供“重新读取列表”，不重放操作。新鲜列表与本地请求读取完成后才恢复写入口，CAS、授权和UNKNOWN不变。最终有限覆盖98个不同测试，模板／类型与完整spec类型检查通过；该软件批当时未构建或安装新版APK、未部署服务或真机验收，不把软件结果当手机时延证明。匹配部署及短验现取上文§11.36。

历史实物：2026-10-10第86批M5完成。第85软件59项、类型／模板构建与第84历史结果保留；当批APK及Gateway050在本机匹配安装／部署，用真实Android生产DOM完成命名、停用／启用编辑、两设备触发、App退出后执行、查询、停用及删除。两逻辑执行ACK、目标回调0→1→2；首条尝试2、第二1，不宣称单次发送或实物exactly-once。见[产品方案§8](../../../../docs/APP_DEVICE_V2_MINIMAL_AUTOMATION_PRODUCT_PLAN.md#8-m5本机新版本验收)及[主线§8.86](../../../../../blinker-library/docs/DEVICE_V2_NEXT_EXECUTION_PLAN.md#886-第八十六批m5本机新版app与两设备产品验收2026-10-10)。该实物不代替本轮刷新解耦的新APK验收；不扩Action／多步骤或替换执行器，历史数据只读保留。

## 现有页面不是云执行器

原`scene.service.ts`曾向SAVE_CONFIG保存userConf.sceneList，不代表V2云规则已启用。第85批将`scene-manager`重定向到`automation-manager`；旧配置仅从明确的只读`scene-archive`历史入口查询，不自动转换多动作／延时场景。旧编辑器、选择器和失用的SceneService已删除；旧数据仍由DataService读取供归档展示。

## A1首轮范围

- 两台同owner/tenant/shard普通WiFi设备；只读/控制分享不包含规则管理权。源boolean Property的false→true变化，设置目标boolean Property固定值；不是按钮Action或本机日期任务。
- 规则保存/显式启用、停用、最近结果由Gateway维护；App仍用原用户HTTP会话，没有第二MQTT连接，不借设备Key登录。不在页面定时轮询触发动作；页面退出/杀进程后云规则继续。
- 第85批在原管理链路补列表／创建和已有规则编辑／详情分层，不重构Layouter或通用场景编辑器；编辑保留源／目标端点，沿原ID／CAS修改名称、条件、目标布尔值。设备列表／Manifest只供展示，服务实时权限及目标校验才是准入，不能从旧缓存推断支持。
- UI明确区分已保存但停用、待基线、观察中、暂停和执行结果未知。创建不默认启用；写入固定ruleId/原正文/expectedRevision，网络未知先GET同ID，不能生成新ID猜成功或自动提高revision覆盖。
- 初次源值已为true、恢复快照、设备重新连接均只建基线，不补发历史动作。规则停用阻止后续新准入，但不能召回此前已发包；不能显示“所有设备动作立即取消”。
- unknown执行不自动重试、改规则绕过或清记录；普通手动控制仍独立可用。ACK/State/物理动作是不同证据，页面不乐观标记全部完成。

## 第62批历史实施顺序

A1-1～6限定软件/本机部署/真实App/两S3实物已过。原503创建在两端在线后用同ID恢复、清除已确认日志，CAS启停正常；不以第二个规则绕过未决请求。下一步S2固定依赖/同源候选/支持范围，再差异验收与交接。源码默认仍关闭，本机只为Gateway/Broker1开启试点；App不持服务间用途密钥，不直调内部worker，不把旧场景自动迁移成规则。

## 本批模块与恢复

- `core/device-v2/automation/contract.ts`负责严格公开模型；`client.ts`负责原ID/CAS持久意图和恢复，`http.ts`只适配原账号HTTP。页面`automation.service.ts`管理显示/账号/取消，模板只负责选择和确认，不拼设备wire或持有Key。
- 复用`core/device-v2/intent-storage.ts`的strict IndexedDB提交屏障；原任务数据库v1及键不变，自动化独立数据库。每账号最多16条未决、只允许一条未决新建；同规则不覆盖，其他已有规则仍可停用/退役。没有后台自动重试、第二MQTT连接或localStorage回退。
- 超时/离页/切账号保留原账号记录，重新进入只读恢复；查询按钮绝不发送PUT。显式恢复先GET，再根据原CAS重提。较新版本需用户确认才能停止本机跟踪，不能藉此撤销云规则/释放未知执行预约。离页后的确认框和响应不再驱动写入/显示。
- 首次submit明确的提交前拒绝（限定状态码与业务码）清该次意图，避免无效配置永久卡住；403/404/503及未知错误仍保留。历史未知后的retry即使明确拒绝也不能证明原请求没提交，不允许泛化“4xx即可清日志”。具体分类取Service§25.2。
- 缺Manifest缓存时先进入设备控制页获取能力，不为规则页主动连接全部设备。ACK标注协议确认而非实物动作，退役提示不能召回已发包；只读查看不会催发云执行。

## 本批验证

第六十批相关Vitest **117/117、0skip**，仅软件；第六十一批仅同步服务装配文档。第六十二批真实HTTP发现automation路径未进入`isGatewayUrl`，请求缺Bearer而401；在原拦截器的精确URL识别中补接，不放宽全部V2/外域地址。实际HTTP客户端、401单次刷新及外域拒绝测试先复现2项失败，修正后相关集合**120/120、0失败/skip**（账号HTTP36、自动化19、共享存储6、任务59），TypeScript、local完整构建及Android debug构建/安装摘要校验通过。

本机旧TLS leaf和CA均已过期；仅更新测试代理证书及debug CA overlay，保留证书验证，不改正式信任配置。真实ME200、自动化列表200/`private,no-store`、页面ready通过。上线前两端离线创建503；Android force-stop重启后同一原ID/CAS/正文仍在，GET404只读恢复保留原请求且不重发，该时点规则/执行均0。这一阶段只是原生持久性/安全恢复证据；后来两端在线后显式恢复同一请求、确认清日志，再完成下述实物闭环，没有换ID猜成功。

## 已冻结的管理接线

- `GET /api/v2/automations`：默认非退役规则，固定16条及`nextAfter`；可选`after`、`retired=true`查退役历史。`GET /api/v2/automations/:ruleId`返回`rule`与最近16条`recentExecutions`，不是发送命令。
- `PUT /api/v2/automations/:ruleId`：V1只传原四字段`expectedRevision,enabled,source,target`，boolean源/目标、固定false→true；V2只在其上加`policyVersion:2,condition`，源valueType是`boolean/int32/uint32/float32/float64`之一，目标仍boolean＋value。condition为严格boolean-edge或numeric-threshold，类型须对应；新建expectedRevision=0、enabled=false。用户/租户/片号不得由页面自报，路径/header/用户HTTP会话不变。
- `POST /api/v2/automations/:ruleId/retire`：只传expectedRevision。软退役使revision+1且禁用，保留历史/未知目标预约；没有硬删除或撤回已发命令的承诺。retired不支持重新启用。
- 状态使用服务返回的disabled/waiting-baseline/observing/paused/execution-unknown/retired；observing只是近期观察提示，`targetOutcomeUnknown`独立表示未知目标预约。最近执行仅ID/revision/state/时间，不能把ACK显示为已确认实物动作。
- 初始请求在App发送前保留同ID/正文/revision；失败后只读核对，首次创建重试可返回后来编辑或退役的当前版本，不回退。409刷新后由用户确认，不能自动换ID/提高revision；账号切换/离页停止本页请求，不操作云worker。
- A1活动定义4/tenant、封闭pilot16；包含退役的保留记录64/tenant、pilot256。STORAGE_CAPACITY只拒绝新建，不删除历史解锁。unknown执行只能等待可信结果恢复，不能借新规则绕过。

这些是精确HTTP合同；自动化启用仍由原试点composition控制，配对新版runtime支持A1/A2，第82批只在本机匹配候选部署/有限实测，未正式发布。未显式组装的repository/service仍只接A1；未知版本fail-closed，不向旧服务降级重发。沿用原用户HTTP认证，不新增MQTT连接。替换实际scene消费者后才删除其旧保存逻辑，不做旧多动作场景自动转换。

区分“配置启用”“正在观察/执行”：prepared不是已发送，dispatching及准入次数不是设备ACK；原派发窗口内可能正在等准入/ACK，页面查询不能催促重发。not_sent是原账本可证未publish，不冒充设备rejected，missing不证明未发送，unknown不自动重试。认领响应丢失后仅恢复查询；历史结果能在撤权/停用后按原execution收敛，但不能因此新准入。迟到missing/inflight不能覆盖终态或擦除发布证据。恢复权限须新fence/基线，不能补旧边沿；删除账号不能撤回物理动作。能力收据是短期快照，App缓存只作展示，内部端口不是App入口。旧scene页面仍有消费者，待最小V2管理替换后再清旧保存逻辑，不新增Legacy通信双栈。

本批A1-6在实际owner和两台普通S3 WiFi上完成四条ACK及独立State/回调验证；App force-stop后继续，Gateway/Broker分别重启、源单独复位恢复新基线、冷却结束后的停用及初始true不触发均通过。最后同一规则revision5/disabled、pending0，保留四条历史，释放观察后回首页activeLinks=0。串口早期控制线关闭引起额外复位已修正，后续三次回调累计0→1→2→3，不将计数伪称4或证明GPIO动作。详见Service§27.4；有限实物不等于长稳/全平台/正式发布。App原账号MQTT保持唯一，不增加规则后台执行器。

## 第81批A2软件收口

- Manifest缓存仅用于选择，五种scalar Property源需read+notify，目标仍可写boolean；服务器逐次核真实能力/权限/连接，页面不采样/运行规则。数值界面使用现有Ionic数值转换，再按严格validator核有限阈值、正回差和可区分的重新布防边界；不自动舍入样本或增加epsilon。
- 基线/重连不触发；到阈值一次进入触发区才动作，回到回差边界才再布防；30秒冷却内触发消费且不补发，页面不承诺每个瞬态或连续执行。新建显式A2六字段；原A1启停保持四字段，A2启停携原完整condition，退役请求不变。
- 原`automation-v1:` journal不迁移；首次HTTP成功及retry返回都必须匹配原ruleId/revision/policy/condition/端点type/目标value，否则保留pending，不强行confirmed。查询/用户确认重提用原ID/正文/CAS，不能从表单或当前规则重组。明确首次提交前拒绝可清新记录，先前未知后的拒绝不证明未提交；1→2升级后的旧create回读当前配置不等于证明原intent已确认。
- 最终三文件40项App测试、App/app-spec TypeScript和Angular严格模板检查通过；两侧真实validator 59项对照通过。未构建/安装Android APK、未真机点击，不继承原A1手机实物证据。一次文案修订后旧文字断言失败已修正/重跑，日志保留；Service与隔离PG结果取§28.12。
- 下一步只A2-4匹配App/Gateway/Broker差异候选及同owner/片两普通WiFi短闭环；不再扩原场景编辑器、多动作、设备/网关执行器或账户MQTT。正式profile/信任、独立接收与生产门禁继续独立。

## 第82批A2-4限定实物与兼容性收尾

- 新目录冻结1,646项来源，五插件/原锁/固定工具链构建；普通P1/LAN=false、原HTTPS origin与公开debug CA，APK79,959,579 B、SHA `66b47aaa416085561759be7fdd0358f8dcd775cd10b4a5a5899fa8c101c42e5d`实际安装并手机读回。原APK/私有数据先备份，未清数据或切换账号；439个Android构建任务不是439项测试。
- 同owner/tenant/shard两XIAO S3普通WiFi重新协商Manifest/fresh State，真实App页面组件新建下降沿与启停；改为sensor:uint32/above/10/回差2沿原公开客户端同ID精确CAS，**非手工触屏或已有条件编辑UI验收**。原账号HTTP管理规则，App不采样或后台执行规则，也不另开账户MQTT。
- 实际force-stop App后下降沿、数值阈值及源板重启后的新边沿仍执行；初值触发区/新会话仅建基线，重复/停用不执行。第一次拟测冷却错过截止产生合法第3次，保留历史；一次有限补测证明窗口内消费不执行、截止后不补发。共4条PG/Broker ACK和连续目标回调0→4，实际fresh State独立读取，不等于GPIO或物理exactly-once。
- 原ruleId最终revision8/disabled/pending0、4条历史ACK；两板原固件/授权已设备端校验恢复、临时入口移除。收尾再核原账号HTTP200/账户ready/公开详情与空journal，返回首页、释放State interests、停止App进程并移除本批ADB转发；原板恢复后的缓存不是新的fresh fixture证据。
- 实际原APK `05071e…7606`模块仅接受policy1/boolean，停用A2行仍无法解析；真实ZIP decoder内存对照拒绝，而新包接受（不是旧包真机运行）。故保留匹配A2 App/Gateway/Broker作为本机候选，**不恢复不兼容的旧APK/服务、不删规则或覆盖数据库凑回退**。原备份保留；正式升级须匹配全链。
- 证据取设备主线§8.82/Service§28.13及本地忽略目录`blinker-library/build/automation-a2-live-20261010`。只测下降沿/一种uint32上阈值回差边界；其他类型、below、全ACL、完整编辑器、iOS/Wio、长稳和生产发布不外推。本批无App生产代码/依赖变更、无Git暂存/提交/推送。

## 第84批真实App最小使用流程与验收

普通用户操作顺序：

1. 使用原账号登录；两台所属账号的普通WiFi设备已上线。没有能力选择时先进入对应设备页获取Manifest；规则页不主动连接全部设备，缓存只供选择，服务保存/执行仍验实时权限和能力。
2. “Me → Automation → 设备自动化（V2试点）”，选择源属性和条件、目标属性与固定布尔值。数值源还需有限阈值/正回差。点击“保存为停用规则”不会执行。
3. 显式“启用”。初始/重连只建立基线，后续源边沿或重新布防后的阈值进入才触发；关闭App不停止服务器规则，不需要页面循环采样或额外MQTT连接。
4. “详情与结果”查询协议执行结果；ACK不等于物理执行。页面的近期观察状态不是启用开关：超过5秒无新样本或worker租约失效都可能显示“已启用 · 等待观察恢复”，不能仅凭它认定离线/停用；30秒是动作冷却，不能混作样本新鲜度。
5. “停用”阻止新执行，不能召回已发命令；“退役”需确认，不可重新启用，历史仍可查询。网络未知时先“查询原请求”，必要时确认“恢复同一请求”，不重新创建来猜成功。

本轮按该路径使用生产WebView DOM控件，Ionic选择框单选/OK、原生数值input/change及按钮触发原生产链；未调用页面save、client/API或业务SQL写入替代UI，是ADB/CDP程序化真实界面，不是人手触屏/键盘验收。两规则均默认disabled后显式启用，分别实际下降沿→power=true与uint32 below10/回差2→power=false，各1ACK及串口回调0→1→2；数值基线0无动作，保持触发区8无第二动作，停用后再次变化均不执行。

布尔触发前原工具序列force-stop+空PID，执行/ACK后文件化PID仍为空，重新从菜单进入能查ACK；不能用后置PID JSON冒充前置采样。一次网关重建使新建结果未知，经真实页面查询/确认恢复原ID才保存，无重复规则。真实数值控件零回差/空阈值禁保存，修正后才可保存。两新规则最后revision4退役，退役列表只有详情，无启用按钮；重进表单清空且无未确认请求，原两规则/旧历史不变。

新增`automation.dom.spec.ts`只提供维护回归：生产模板/Forms/Ionic/service/client保留，API/cache/storage显式替身；四方向管理流程及无效/清空/切源共5项。与原page/client/http同一次联合 **4文件45项通过**，最终App spec TypeScript检查通过；不与历史40累加，也不冒充手机/设备证据。无产品运行时、插件、依赖变更或新APK构建。

匹配A2 APK/服务保留，原板app/NVS范围已验证恢复，不清Key/数据；临时网络及ADB入口撤除。两规则软退役、2新ACK和原8执行历史留存；不支持按钮Action、多步骤、BLE-only/网关、跨账号/片或已有条件编辑器。本机最小用户目标已通过，线上profile、签名、接收/生产准入仍独立后续，不再作为功能继续推进的前置。
