# App核心软件优化：独立会话交接执行计划

**归属及进度纠正（2026-11-06）**：尚未实际交接，主要开发仍由原主会话负责。S1原活动页冷恢复等有限结果取[核心稳定方案§12](../../blinker-library/docs/DEVICE_V2_CORE_DELIVERY_AND_STABILITY_EXECUTION_PLAN.md#12-ds-3账号冷恢复与控制忙碌反馈的最小修正2026-11-06)，不是所有子页／外部深链结论。DS-5分享重复读及H2草稿两处修正现已按[§18](../../blinker-library/docs/DEVICE_V2_CORE_DELIVERY_AND_STABILITY_EXECUTION_PLAN.md#18-ds-5一次匹配app交付及两页只读差异2026-11-06)一次匹配构建、安装并通过必要只读真机差异；不代签S3自然分享差异。消息S2及自然到期／撤权仍未开始，不擅开关闭profile或造样本。以下“双会话归属／向另一会话交接”是历史预案，不表示已分派。

原方案日期：2026-11-02。以下未开始状态及当时未操作说明保留为历史；当前S1有限结果以上方入口为准，S2／S3仍 **NOT_STARTED**，不因S1收口自动启用。

**最新接续**：H2修正的原页面／模板64项证据沿§17；§18手机只改本地草稿、未保存策略，查询保留／离页清除通过，当前APK `ae5d7736…176c2f`。分享成功页无通用刷新按钮，本次实际为原菜单暖入／重入各一轮读取，不冒充错误重试。未改变本文件S2／S3范围、未造自然样本；下一批转DS-6必要交付清单，不追加软件审计。

## 1. 现行依据与目标

依据[主计划§66](../../blinker-library/docs/DEVICE_V2_TEST_REPORT_RECONCILIATION_AND_CORE_PLAN.md#66-html截图观感离线核对与下一批建议2026-11-02)及当前源码，软件侧优先顺序为：**S1子页冷启动登录保持 → S2消息中心基础闭环 → S3自然分享差异**。一次只激活一项，后项不自动串行开始。

§65匹配beta为`846a6126…056b5e7`，组件／HTML生成采用、Cloud Console CAS、固定设备任务、最小自动化及已验配网均已有有限结论，不重新排队。HTML截图偏扁已按§66判定`NO_CONFIRMED_PRODUCT_DEFECT`，用户手机显示正常，不开启渲染或模型修复。以上是已有记录，不是本交接新鲜读取的运行证据。

软件侧不等于“只改App”：必要时可以分析Gateway／Auth实际消费者，但只能在明确模块、协议、数据和权限范围后提出最小修正；本文件不自动授权服务器变更、迁移、部署或正式环境操作。

## 2. 双会话归属与共同约束

| 范围 | 归属与边界 |
| --- | --- |
| 本独立软件会话 | 本文S1～S3；定位已复现的软件缺陷，保持现有执行链与模块边界 |
| 原主会话专属 | 设备接入、BLE／SoftAP／WiFiProv、nearby／扫描、设备身份归属、硬件候选及设备库；不接管、不改其文件、不重复验收 |
| 可能交叉的公共文件 | `app.component.ts`、`app.routes.ts`、Data／Auth／User／Device服务、API／deployment配置、共享协议及Gateway／Auth消费者；**改前先向主会话报告具体文件和影响，确认归属或冻结窗口后再编辑** |

禁止两个会话并发修改交叉文件；没有明确协调结果时只读，不以“只是小改”绕开。发现必须涉及接入、nearby或身份时停止该分支并交主会话处理，不顺手扩展。

开工先读取各仓当前`AGENTS.md`并检查App／Service／设备库工作树。三端现有dirty均须保留；不得默认fetch、merge、切分支、重置、清理或把HEAD当作完整匹配源码。只整理本项必要差异，不自动提交／推送。

账号、授权、TaskStore、云scope、CAS、UNKNOWN及完整请求日志保持；不复制旧scope、不重放、不伪造样本。禁止真实验证码、真实AI／模型请求、自动重试、SDK／依赖升级及自动部署／安装。真实服务或手机短验若确有必要，先另行明确范围、版本、操作次数和执行归属。

当前手机记录沿Development测试会话；China／Global和正式Auth不切换，不跨环境使用token。不得读取或输出密码、token、DeviceKey、PoP等；证据仅放忽略的私有目录，文档只记安全指标。

## 3. S1：子页面冷启动登录保持

状态：**有限收口，见核心稳定方案§12**。根组件原先已等待恢复，未复现根误跳；实际原活动页会在恢复前判未登录且不再继续，已修正并同账号只读短验通过，存储失败／切号／真正空会话由离线反例覆盖。其它子页与直接Android外部深链未新测，不扩大结论。以下保留原最小范围，不重新排队；不是重测配网冷owner、近期认证或重新登录取Key。

实际源码入口：

- [AppComponent](../src/app/app.component.ts)：`initApp → initService → await DataService.init → checkLoginStatus`；启动链接及后续用户／设备数据恢复也在这条链上。
- [DataService](../src/app/core/services/data.service.ts)：`init → loadAuthData`，异步安全存储、`sessionEpoch`及失效标记共同约束恢复。
- [路由](../src/app/app.routes.ts)未将[AuthGuard](../src/app/core/guard/auth.guard.ts)作为此登录入口；现Guard本身直接返回true。**不能按旧类名盲修Guard或新增另一套鉴权。**

最小执行：先选一个现有只读子页，以原启动消费者、延迟安全存储／账号恢复的离线替身复现；分别区分恢复中、有效、真正失效、存储失败及网络失败。核对原路由是否丢失、初始化顺序和唯一导航，不用手工赋登录成功状态跳过前置。

只有稳定复现才做最小修正；保持同账号／跨账号代次围栏，不放宽服务鉴权、权限或DeviceKey近期认证。若未复现，记录`NOT_REPRODUCED`及覆盖条件，不制造缺陷或继续无限采样。

有限退出门槛：

1. 离线用例证明等待恢复期间不误跳，有效会话保留目标只读路由；真正失效不进入受保护内容。
2. 网络失败不直接冒充未登录，取消／换账号后的迟到响应不能恢复旧账号或旧路由；不自动重试。
3. 修正仅覆盖实际消费者，受影响模板／类型检查通过；若仍需真机，再单独安排一次匹配App与现有会话的只读深链，不登录／发码或操作设备。

## 4. S2：消息中心基础闭环

状态：**NOT_STARTED**，不是S1完成后自动启用的功能。

先读[消息模块说明](../src/app/sections/message/readme.md)、[MessageService](../src/app/sections/message/message.service.ts)、[deployment能力](../src/environments/deployment.ts)与[cloud-beta覆盖](../src/environments/environment.cloud-beta.ts)。当前beta继承`messages=false`、`notifications=false`；`/message`还有deployment门槛。必须先核权威源、服务支持和profile，不把关闭当Bug，不擅自开开关或发送推送。

第一批只明确并离线验证：列表／详情、空态、读取失败后的手动恢复、opaque cursor分页／去重、同账号归属及切号／后台后的旧响应隔离。未知消息类型使用通用展示；提醒不是消息事实源，更不是授权。当前关闭profile应不发后台消息／通知请求。

消息详情的现有行为包含回源及“标记已读”POST，**不能称整个详情操作只读**。真实已读／删除／全部已读或启用服务必须另有明确范围；无自然消息不造记录，默认不执行这些写入。息屏、进程死亡、iOS和完整推送链后置，不在这一批铺平台矩阵。

退出门槛：支持／关闭边界写清；有限离线用例通过；未开启profile时零业务调用。需要Gateway／Auth修正时先列准确合同与交叉文件，协调后再实施，不以放宽鉴权或迁移业务数据解围。

## 5. S3：自然分享显示与到期／撤权差异

状态：**NOT_STARTED**。已修并验证的“收到分享数为0、失败不显示假0、显式恢复”不重测；已过双账号控制／撤权链不重跑。

入口先读[收到数投影](../src/app/home/components/tab-profile/profile-sharing.ts)、[分享服务](../src/app/core/services/device-v2-sharing.service.ts)及实际分享页面。区分收到设备数、发出分享数与消息／邀请数，不能从懒加载owner列表推算发出总数，也不增加N+1请求凑总数。

只有自然存在非零分享、到期或撤权时，选一条现有记录做显示／只读权限差异：服务端仍是`canRead／canCommand`及撤权的权威，客户端不沿用旧授权展示成功。精确位置仍owner-only，不复制owner Admin给成员，不触发设备控制。

无自然条件则记`NOT_RUN_NO_NATURAL_SAMPLE`；不新邀请、创建账号、改变套餐／额度或修改数据库造样本。离线fixture可以验证去重、未知状态、到期／撤权失败收敛及旧响应隔离，但不得冒充真机或自然样本通过。

## 6. 共同有限验收与交付门槛

- 每项保留“实际消费者／预期／复现／最小修正／有限用例／未覆盖边界”；先失败再修正，保留首停，不反复跑已通过矩阵。
- 默认仅离线回归；依赖已安装工具链，不安装或升级SDK／锁。构建队列只有一条，不与主会话重复构建或占用手机／服务。
- 读请求、已读写入、Console配置、设备Command、真实ACK／State分开记；模板、夹具和历史运行结果不能互相代签。
- 当前阶段没有条件时明确停止，不回到设备配网／任务／自动化／AI模型／CAS循环；Wio、OTA、Bulk、复杂规则及发行CI不在本文范围。
- 收尾报告本项精确文件、用例结果与剩余门槛；保留无关修改和私有完整日志，不自动部署、提交或推送。需要改变范围时先报告，不隐式开始下一项。

## 7. 历史另一会话开工提示（S1不再重复派发）

> 根据 `blinker-app/docs/APP_CORE_SOFTWARE_OPTIMIZATION_HANDOFF_PLAN.md` 开始S1。先读相关仓AGENTS和当前dirty，按实际AppComponent→DataService恢复→checkLoginStatus入口离线复现一个只读子页的冷启动登录保持，区分恢复中／有效／真正失效／网络失败。AuthGuard未作为该入口生效，不盲新增Guard。只修确认缺陷并补有限回归，保持模块化简洁；公共交叉文件改前向原主会话报告并确认归属。设备接入、nearby和身份归属由原主会话负责，不接管。保留账号、授权、TaskStore、scope、CAS、UNKNOWN和完整日志，不发验证码、不调用模型、不自动重试、不升级SDK，不fetch／merge、不自动部署／安装或提交推送。S2／S3仍NOT_STARTED，不自动串行启动。
