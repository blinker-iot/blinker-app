# V2 自动化页面：最小接线边界

更新：2026-10-09，第81批同步。**A2公开联合合同、条件选择和原意图恢复软件完成，未部署/安装；下一步匹配差异候选＋两设备有限实物。** 新建支持布尔双方向、数值上下阈值/正回差；原A1仍兼容。当前UI提供新建/启停/退役/恢复，不含已有条件编辑器。优先级见[设备主线§8.81](../../../../../blinker-library/docs/DEVICE_V2_NEXT_EXECUTION_PLAN.md#881-第八十一批a2公开合同app与原意图恢复软件收口2026-10-09)，最新合同取[Service§28.12](../../../../../aily-blinker-services/docs/SERVICE_DEVICE_V2_AUTOMATION_IMPLEMENTATION_PLAN.md#2812-第81批a2公开合同app与最终软件验收)。以下第62批A1实物/旧默认配置是历史限定证据，不可继承给新A2。原SceneService仍有消费者，不扩编辑器。

## 现有页面不是云执行器

原`scene.service.ts`向SAVE_CONFIG保存userConf.sceneList；scene editor仍有真实消费者和编辑退出保存行为。当前scene管理页增加“设备自动化（V2试点）”入口，旧区域明确标为“原场景配置”。保存旧场景不等于V2服务器已启用规则，不转换旧多动作/延时场景，也不删除仍使用的页面。新路由`automation-manager`独立，避免把旧场景名称当保留路径。

## A1首轮范围

- 两台同owner/tenant/shard普通WiFi设备；只读/控制分享不包含规则管理权。源boolean Property的false→true变化，设置目标boolean Property固定值；不是按钮Action或本机日期任务。
- 规则保存/显式启用、停用、最近结果由Gateway维护；App仍用原用户HTTP会话，没有第二MQTT连接，不借设备Key登录。不在页面定时轮询触发动作；页面退出/杀进程后云规则继续。
- 已接最小列表/创建/启停/退役/最近结果，不重构Layouter/通用场景编辑器；同设备端点编辑API虽支持，当前UI不包含完整编辑器。设备列表/Manifest可作展示，服务实时权限及目标校验才是准入，不能从旧缓存推断支持。
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

这些是精确HTTP合同；自动化启用仍由原试点composition控制，配对新版runtime源码支持A1/A2，未部署/正式发布。未显式组装的repository/service仍只接A1；未知版本fail-closed，不向旧服务降级重发。沿用原用户HTTP认证，不新增MQTT连接。替换实际scene消费者后才删除其旧保存逻辑，不做旧多动作场景自动转换。

区分“配置启用”“正在观察/执行”：prepared不是已发送，dispatching及准入次数不是设备ACK；原派发窗口内可能正在等准入/ACK，页面查询不能催促重发。not_sent是原账本可证未publish，不冒充设备rejected，missing不证明未发送，unknown不自动重试。认领响应丢失后仅恢复查询；历史结果能在撤权/停用后按原execution收敛，但不能因此新准入。迟到missing/inflight不能覆盖终态或擦除发布证据。恢复权限须新fence/基线，不能补旧边沿；删除账号不能撤回物理动作。能力收据是短期快照，App缓存只作展示，内部端口不是App入口。旧scene页面仍有消费者，待最小V2管理替换后再清旧保存逻辑，不新增Legacy通信双栈。

本批A1-6在实际owner和两台普通S3 WiFi上完成四条ACK及独立State/回调验证；App force-stop后继续，Gateway/Broker分别重启、源单独复位恢复新基线、冷却结束后的停用及初始true不触发均通过。最后同一规则revision5/disabled、pending0，保留四条历史，释放观察后回首页activeLinks=0。串口早期控制线关闭引起额外复位已修正，后续三次回调累计0→1→2→3，不将计数伪称4或证明GPIO动作。详见Service§27.4；有限实物不等于长稳/全平台/正式发布。App原账号MQTT保持唯一，不增加规则后台执行器。

## 第81批A2软件收口

- Manifest缓存仅用于选择，五种scalar Property源需read+notify，目标仍可写boolean；服务器逐次核真实能力/权限/连接，页面不采样/运行规则。数值界面使用现有Ionic数值转换，再按严格validator核有限阈值、正回差和可区分的重新布防边界；不自动舍入样本或增加epsilon。
- 基线/重连不触发；到阈值一次进入触发区才动作，回到回差边界才再布防；30秒冷却内触发消费且不补发，页面不承诺每个瞬态或连续执行。新建显式A2六字段；原A1启停保持四字段，A2启停携原完整condition，退役请求不变。
- 原`automation-v1:` journal不迁移；首次HTTP成功及retry返回都必须匹配原ruleId/revision/policy/condition/端点type/目标value，否则保留pending，不强行confirmed。查询/用户确认重提用原ID/正文/CAS，不能从表单或当前规则重组。明确首次提交前拒绝可清新记录，先前未知后的拒绝不证明未提交；1→2升级后的旧create回读当前配置不等于证明原intent已确认。
- 最终三文件40项App测试、App/app-spec TypeScript和Angular严格模板检查通过；两侧真实validator 59项对照通过。未构建/安装Android APK、未真机点击，不继承原A1手机实物证据。一次文案修订后旧文字断言失败已修正/重跑，日志保留；Service与隔离PG结果取§28.12。
- 下一步只A2-4匹配App/Gateway/Broker差异候选及同owner/片两普通WiFi短闭环；不再扩原场景编辑器、多动作、设备/网关执行器或账户MQTT。正式profile/信任、独立接收与生产门禁继续独立。
