# App Android：源码闭包与隔离重建

第86批最小自动化M1～M5已按限定范围完成，当前本机匹配新APK／Gateway050、来源与安装实物结果取[产品方案§8](APP_DEVICE_V2_MINIMAL_AUTOMATION_PRODUCT_PLAN.md#8-m5本机新版本验收)及本页§9。以下第82～84冻结源／制品仅代表当批历史，不包含命名／编辑／入口改动，不直接作为新版本交付物。正式签名／profile及独立接收方验收仍分别准入。

更新：2026-10-10，第83批候选索引与升级/回退合同核对。**当前普通A2 App来源、实物与保留状态取§8；P1实验来源取§6～7，普通P1/LAN仍关闭。** 第82批匹配A2 Android debug App已安装且两普通WiFi限定自动化闭环通过；保留匹配App/服务及停用历史，不再将旧`05071e…7606`称为当前可恢复包。原S4/P1的来源与当批恢复记录保持历史，不改其manifest。组件唯一选择取[候选清单§3.1](../../blinker-library/docs/DEVICE_V2_CANDIDATE_SOURCE_AND_SUPPORT.md#31-当前匹配组件索引第83批收口)，升级/暂停/回退取[候选清单§7.5](../../blinker-library/docs/DEVICE_V2_CANDIDATE_SOURCE_AND_SUPPORT.md#75-匹配候选升级暂停与回退)，优先级取[设备主线](../../blinker-library/docs/DEVICE_V2_NEXT_EXECUTION_PLAN.md)。本批只核对现有来源及说明，不重建、安装、部署或创建新交付包；独立接收、iOS、正式签名/profile仍待准入。

第84批用户将本机真实App最小自动化设为主线，已复用当前匹配APK完成真实界面新建/启停/退出后执行/结果查询/退役及两设备各一次联动；新5项DOM维护回归与原相关集合共45项通过。详见[主线§8.84](../../blinker-library/docs/DEVICE_V2_NEXT_EXECUTION_PLAN.md#884-第八十四批本机真实app最小自动化用户闭环2026-10-10)及[App最小使用流程](../src/app/sections/scene/README.md#第84批真实app最小使用流程与验收)。生产运行时代码/依赖和冻结制品不变，没有因交接重复构建；正式profile/签名或独立接收不是本机功能验收前置。以下历史“下一步”不重新成为当前任务。

第71批（2026-10-09）只推进R4最小兼容性准备：1,646项P1输入摘要零差异，没有修改App/插件运行时、依赖、origin或冻结交接物。短暂安装原P1开启测试包后恢复原`05071e…7606`并读回，原账号/授权/Manifest缓存及零连接保留。USB测试映射恢复、App重启后账户MQTT ready；WiFi见证设备离线，因此不算Cloud设备控制或健康同会话BLE并行通过。R4隔离编译通过、上传握手失败，BLE用例未开始；16项工具检查不是App业务回归。下一步仍主线第32项，见[共同方案§7.7](../../blinker-library/docs/DEVICE_V2_SCHEDULING_AUTOMATION_AND_BLE_PLAN.md#77-第71批r4兼容性准备及烧录阻断2026-10-09)。

第72批（2026-10-09）R4有限实物已补认领/缓存/一次控制/认证取消及只读重进；不改App/插件生产运行时或原P1窗口。认领初次失败查出设备打包fixture的验签公钥笔误，通过隔离匹配profile＋原client上下文cancel→issue→commit恢复，而非清数据库/伪造授权。一次GATT失败未到认证的取消前提保留，工具补cancelFailed负例；17项工具/30项release检查不冒充App业务回归。健康账户MQTT在实际BLE窗口内保持同一session；Cloud设备控制、iOS实物仍未补齐。原App `05071e…7606`实际恢复读回，账号/手机新授权/缓存保留、旧pending正常退休、零连接/观测、CDP转发移除；COM4核对身份后，R4原应用245,760 B也已恢复/读回匹配，未刷bootloader/桥接或主动清授权。1,646项当前App/插件输入与冻结快照仍匹配，六仓源码和S4交接物不覆盖；最终恢复证据取`continuation-audit.json`，详见[共同方案§7.8](../../blinker-library/docs/DEVICE_V2_SCHEDULING_AUTOMATION_AND_BLE_PLAN.md#78-第72批r4有限实物公钥纠正及验收边界2026-10-09)。

第73批（2026-10-09）：健康Cloud/BLE有限并行读链已补齐。实际P1开启APK、同一个原账户MQTT，在COM11 BLE连接前/保持中/退出后对COM3普通WiFi分别收到新StateRequest→StatePage，三个序号不同、往返各60ms；不是只看账号ready/缓存，也不是同一设备无缝切换或Cloud控制重测。BLE只读ready3393ms、退出213ms归零，原生优先级两次请求均结算、零观测丢失，本批未测空口参数/未新增策略。1,646项App/插件输入仍零差异，原217项业务证据不重复累计；21项测量工具测试不冒充App业务回归。手机原`05071e…7606`恢复读回，原账号/授权/Manifest缓存及账户ready保留，零连接/测量/CDP。临时Gateway网络配置回滚有一项例外：旧未实际生效且当前无法bind的明文端口映射移除；原镜像/环境/卷及TLS账户代理保留、服务健康，临时device HTTP代理已删。修正公钥的是独立设备组件交接，不修改原App/S4冻结物、不等于独立接收或生产准入；详见[共同方案§7.9](../../blinker-library/docs/DEVICE_V2_SCHEDULING_AUTOMATION_AND_BLE_PLAN.md#79-第73批健康cloudble只读短链及恢复2026-10-09)。下一步主线第33项边界收口，普通P1默认关闭，iOS/Wio实物待办保留，不扩P2/100轮/新架构。

## 1. 保留现有布局，不增加运行时架构

App及五插件保留六个相邻目录：blinker-app、capacitor-android-shortcuts、capacitor-mdns、capacitor-ntfy、capacitor-wechat、capacitor-wifiprov。仅把file依赖改成Git URL，或复制旧dist/生成的capacitor.settings.gradle，都不能证明接收方从源码构建成功。

`tools/source-handoff.mjs`只导出、校验和新目录重建，不进入App运行时。SHA清单是完整性检查，不是发布者数字签名；只执行可信维护者提供的脚本。

## 2. 输入与外部依赖

- 白名单选择App TS/资源、Android源码/Gradle配置、device-template、构建/测试配置，以及五插件TS/Android源码、许可证、锁文件与构建配置。必要未提交源码参与字节摘要；HEAD只标来源，不冒充已提交工作树。
- App/模板使用一份pnpm-lock和明确的workspace，保留实际已测pnpm11.19.0版本；补device-template importer及此前漏报的直接导入依赖，不更新既有版本。五独立插件保留各自npm锁。顺序为插件npm ci --ignore-scripts→明确build，再App pnpm install --frozen-lockfile --ignore-scripts→模板→类型→Web→Capacitor sync→可选Android debug。无需原node_modules/dist；不能在App执行npm install/ci。
- 排除.git、node_modules、www/dist、现场build、签名库、.env、google-services.json、local.properties、生成的原生路径/资源。选中树内出现私密扩展名或目录链接则拒绝；分发前仍应人工检查源码中的误写凭据，白名单不是通用秘密扫描器。
- 当前记录Node22.22.3、pnpm11.19.0、插件npm10.9.8、JDK21、Android SDK36、Gradle8.14.3、AGP8.13.0。Node/npm/pnpm重建时严格核对。JDK/SDK及Maven/Gradle传递依赖不是完整离线锁定，不宣称任意版本/无网络都能重建。
- 不包含iOS工程/构建。过期App npm锁已备份到仓外并移除；不触碰既有node_modules或插件锁。pnpm安装不执行第三方install hooks，原占位allowBuilds改为明确false；平台二进制可用性由完整构建验证，不全局放开脚本。
- 新manifest schema=2；旧schema=1诊断包/工具保持原样，不把其APK重新标为匹配候选。导出校验版本声明/插件npm锁及本地依赖边界，pnpm包/模板与锁的语义一致性由重建时的frozen install强制检查；不自行实现YAML解析器、不静默生成新锁。安装前后四份依赖输入字节须一致，rebuild.json记录实际直接版本。
- 首次pnpm隔离构建在tsc发现@ionic/core未声明；原工作区直接导入使用8.8.17，而@ionic/angular8.8.19内部使用core8.8.19。此次显式声明core8.8.17及原Buffer类型包6.0.3，保留已测组合，不借机统一升级Ionic或开启shamefully-hoist。旧pnpm图的既有条目保持不变，只补core8.8.17条目和必要importer；这与“整个锁文件零变化”不同。版本统一升级应另做评审/验收。
- 公开授时golden镜像`tests/fixtures/time_sync_golden_vectors.properties`纳入白名单；它不是运行时凭据。扩大回归曾因漏带此文件导致一套件加载失败，修正导出范围，不改断言或让测试越过包边界读原仓库。此包不宣称全部App/LAN预览测试的跨仓fixture闭包已完成。

## 3. 操作

在App根目录导出；输出必须不存在且位于六仓外：

当前第75批工具固定接受`production`、`local,local-device`及显式`local,ble-priority-test`，共享同一准入清单；原S4/第69～74批冻结工具仍只有前两项。开启实验必须显式传第三项，不允许裸开关/生产混合或任意组合。下面仍展示普通关闭配置；新P1结果见§6，不能执行旧冻结工具却期待新增入口。

```powershell
node tools/source-handoff.mjs export --out D:\handoff\app-source --git <git.exe路径>
node D:\handoff\app-source\source\blinker-app\tools\source-handoff.mjs verify --bundle D:\handoff\app-source

$env:JAVA_HOME = '<JDK21目录>'
$env:ANDROID_HOME = '<AndroidSDK目录>'
$env:GRADLE_USER_HOME = '<维护者缓存目录>'
$env:npm_config_cache = '<维护者npm缓存目录>'
node D:\handoff\app-source\source\blinker-app\tools\source-handoff.mjs rebuild `
  --bundle D:\handoff\app-source --work D:\handoff\app-rebuilt `
  --pnpm-cli '<pnpm安装目录>\bin\pnpm.mjs' `
  --configuration local,local-device --android true
```

本机USB配置固定HTTPS 127.0.0.1:17000，WebView保持默认HTTPS origin；LAN仍关闭。重建清除继承的BLINKER_*及NODE_OPTIONS，**不自动继承私有debug CA overlay，也不自动设置BLINKER_LOCAL_CLEARTEXT**。APK不自动安装；连接私有测试HTTPS还需单独审阅/传入公开测试CA并重建，不能关闭证书验证或打包CA私钥。App本地账户MQTT须提供匹配wss测试端点；设备侧普通MQTT默认明文的合同不变。

第65批S3发现：此前工具按local配置自动开启HTTP WebView，与第62批实测包HTTPS origin不同。Native账号/凭据仍在，但Manifest localStorage及任务IndexedDB按origin隔离；不能把新origin下的pending=0当作原意图不存在。移除该自动切换，只修构建工具，不改Capacitor运行时配置/协议、不复制或删除旧journal。HTTP测试包及其有限结果保留为诊断；匹配HTTPS候选需另封存及复测，具体结果取候选清单§5.2。

production配置使用原生产Web端点，但此工具Android仍只生成debug，**不是release签名或生产发布**。省略--android true只做Web/sync；不透传任意构建命令。

本机明确测试CA的变体采用两个步骤，避免覆盖已有普通APK及其rebuild.json：先在新work目录运行上述rebuild并省略`--android true`，核对生成的Capacitor配置为HTTPS/cleartext=false；再在该work的`source/blinker-app/android`设置经过审阅的`BLINKER_DEBUG_NETWORK_CONFIG_DIR`并执行`gradlew.bat :app:assembleDebug`。原生入口已有此debug-only参数，交接工具仍不继承它。单独记录源码manifest、overlay各文件/公证书fingerprint、端点、APK与更新签名摘要及安装结果；不能只有一个环境变量或旧报告。现场overlay只允许公开CA，不接受私钥、全域信任或关闭验证；没有现成测试CA时先准备测试服务，不启用HTTP origin绕过。

日志/rebuild.json写新工作目录；冻结bundle不变。失败保留日志、不覆盖旧目录重试。构建可下载依赖，插件docgen可修改工作副本README；不是原件篡改。

## 4. 验收分层

本节第64～74批为历史来源/实物记录，失败不覆写；当前工具和独立构建结果取§6。

10项自测覆盖环境隔离/默认HTTPS origin、插件锁/第五插件/本地依赖、App唯一锁和管理器、篡改/缺失/多余文件、私密输入、链接和越界/覆盖拒绝。新目录完整构建只证明指定源码可用，不要求debug APK字节重现，也不能冒充上一批手机已测包。不自动安装、清数据或换授权。

具体制品和结果统一记候选清单。必要S3差异回归后再替换测试候选；本机bundle不是“干净远端CI通过”，最小测试/工具远端同步仍需单独确认。

第63批完整新目录Android及61项相关测试已过，但其npm锁与实际已测pnpm工作区20项直接版本不同；**该历史产物只作诊断，不准入、不安装。** 第64批按上述合同收敛；新产物、版本逐项核对及必要S3结果统一记候选清单。不得使用force/legacy-peer-deps掩盖冲突，也不因新构建成功直接宣称真机/生产通过。

第64批最终1,642输入快照：16步完整Android构建、9项工具自测、2项真实frozen锁失配拒绝对照及31文件391项相关回归通过、0skip；69项直接版本与已测工作区相同。五插件JS/type/map及Android main/build.gradle一致，旧ntfy安装只缺docs.json元数据。具体摘要/失败记录见候选清单§5.1；仍未安装/未含现场CA。下一包先明确测试信任配置再做S3有限真机验收，不自动接受CA或重复刷无变化MCU。

第65批最新事实取候选清单§5.2：仅维护工具/测试两输入改变，10项工具回归及新目录15步Web/sync＋显式CA原生debug构建通过，最终HTTPS APK已安装校验，旧缓存/账号/授权保留；命中/无缓存控制及退出有限真机通过。SCSS构建路径引发的chunk/hash/debug-map差异经精确核对，不称全字节复现。普通设备Cloud离线、控制ACK/State尚未通过；当前只补该门禁，不重新做配网/清授权，不将391项历史回归冒称本轮重跑。

第66批当前结果取[候选清单§5.3](../../blinker-library/docs/DEVICE_V2_CANDIDATE_SOURCE_AND_SUPPORT.md#53-第66批s3普通cloud控制重启恢复与收尾)：保持同一已装HTTPS APK，设备读回摘要一致，不重建/重装App；标准普通WiFi候选实际Cloud Property/Action ACK与State、一次普通复位后Property/State通过。整个过程一个原账户MQTT，观察已释放、原账号/原停用规则保持；第65批BLE不重测。复位后新状态约38.6秒才到，旧缓存不当新启动证据，恢复延迟尚未优化。S3本机限定差异包收口，S4[最小安装/重置/诊断说明](../../blinker-library/docs/DEVICE_V2_CANDIDATE_SOURCE_AND_SUPPORT.md#7-s4最小交接操作说明)已整理；接收方独立验收/生产签名与profile仍未通过，不改App业务源码或把本轮写为正式发布。

第67批将同一1,642输入快照完整复制进[干净交接目录](../../local-maintenance/core-candidate-handoff-20261008/README.md)的`sources/android`，原manifest SHA仍为`f486e00ab1c4be87a7ef7da88a004ed34b254651359bc2cad8efd3c105ee019b`，复制后包内原verify独立路径校验通过。匹配HTTPS debug APK与三文件公开overlay另列在artifacts/public-debug-overlay，不混入源码或自动继承。未改App/插件运行时、依赖锁或origin，未重新构建/安装APK，不重跑原391项业务测试。总清单、只读校验/拒绝对照和空白接收表取[候选清单§5.4/§7.4](../../blinker-library/docs/DEVICE_V2_CANDIDATE_SOURCE_AND_SUPPORT.md#54-第67批s4干净交接目录与离线验收)；当前mostfun2026不代表冻结实验地址可达，接收方独立安装/短链验收仍待记录。

第68批用户允许S4保持待接收、先回到既有P1。只改库侧debug WebView测量/测试，在同一已装APK验证提示拒绝注入、控制、无缓存、途中取消/重进及HIGH→BALANCED实际参数，详见[共同方案§7.4](../../blinker-library/docs/DEVICE_V2_SCHEDULING_AUTOMATION_AND_BLE_PLAN.md#74-第68批p1控制兼容取消与短窗口实物2026-10-08)。没有改App/插件运行时、安装APK、重建快照或变更上述摘要；14项工具测试不是391项App业务回归。正式优化候选仍待原生命周期内有界实现及匹配APK差异验收，实验wrapper不得成为运行时模块。

第69批独立P1候选已实现并完成有限验收，详见[共同方案§7.5](../../blinker-library/docs/DEVICE_V2_SCHEDULING_AUTOMATION_AND_BLE_PLAN.md#75-第69批p1有界运行时候选与匹配apk有限门禁2026-10-08)。原BLE link持有可选窗口，原client同步结束；HIGH/恢复请求不进入BleClient的GATT队列。普通development/production/local/local-device开关全部false，只有维护者显式`ng build --configuration local,ble-priority-test`开启；它仍为USB HTTPS测试端点、LAN关闭，不是新增生产配置。现有source-handoff rebuild仅支持原两种配置，**本批未扩展其接口或宣称此变体已完成新目录依赖重建**。

本批217项相关回归/类型/新模块lint通过；独立导出1,646输入manifest摘要`1add06089151e5a7bd33cabfa80631464d2eb35e2ff85a63fbda849a9ab2e7df`，在原工作区Web→sync→显式原公开CA Gradle debug构建后核对输入未变。测试APK摘要`1a5b6457fa7e3791bc3e030dd7fbb3cdbfa99fe556a8bbb1070680e67ae4861c`，同更新签名/HTTPS origin，Android原生库字节与DEX内容集合不变；DEX条目顺序/打包对齐及Web产物差异不声称字节复现。真实缓存命中/无缓存控制、认证中取消/重进和资源回收通过，Cloud仍retrying、R4/Wio/iOS/健康Cloud并行未实物覆盖。本批ready仍约3秒，稳定提速未证明，普通配置不启用。测试后手机已恢复原`05071e…7606`匹配APK并核对授权/缓存/零连接；旧1,642输入/S4摘要不改，不把新包混入原交接目录。

第70批继续复用同1,646输入，生成关闭包（`local,local-device`，SHA256 `2dba09450cda1bfd0bd960d524a11af0585d30f6d1944c41bd1f4d2a93eca988`），与上述开启包有限配对；没有把旧1,642输入原APK当关闭对照。两包更新签名/HTTPS origin/公开CA、DEX内容集合及非Web运行时字节一致，构建/实测后逐项输入摘要核对。六有效样本GATT后配对减少272/271/216ms，中位配对271ms（16.3%）；整页中位2733→2631ms，不能承诺秒开。两次预热中断、额外只读诊断及最后四次安装新增35秒冷却均留记录，不称严格连续实验通过；11项纯分析测试不是新的App业务回归。完整限定见[共同方案§7.6](../../blinker-library/docs/DEVICE_V2_SCHEDULING_AUTOMATION_AND_BLE_PLAN.md#76-第70批p1同源码有限配对收益及决策2026-10-08)。

第70批历史决策为保留现有小型有界候选、普通配置继续false，当时下一步为最小兼容性；后续R4/Cloud补证及当前收口取§5，不重复启动该队列。手机已恢复原APK并读回摘要、授权/缓存/零连接保留；两次真正Action总计各一次、按钮11→12→13，其余只读。旧S4交付物和接收待办不变，当批没有生产源码/插件/依赖/MCU/服务或Git变更，也不把开启包视为默认发布配置。

## 5. 第74批P1开关与交接收口

运行时生命周期/平台支持的唯一合同取[共同方案§3.4](../../blinker-library/docs/DEVICE_V2_SCHEDULING_AUTOMATION_AND_BLE_PLAN.md#34-p1候选冻结与使用边界2026-10-09)，不另复制一份策略。现有link/client内接线足够，无新协调层、原生插件修改、第二条账户MQTT或用户组件API。首次认领/配网不启用P1，普通已绑定连接才读取构建开关；SDK拒绝提示不作为认证失败。

- 普通development/production/local/local-device均false；显式实验使用`ng build --configuration local,ble-priority-test`，同输入关闭对照用`local,local-device`。这里的build只生成Web，不表示APK已生成/安装；Android sync/明确公开CA/Gradle debug及制品摘要仍须分别记录。
- 原S4是1,642项App/五插件输入及`05071e…7606` APK，**不含P1**。P1是另一个1,646项输入、`1add06…e7df` manifest及上列开启/关闭APK；不能把混用组件标成原S4完整包、同字节或已接收。
- 本批八项既有制品/manifest摘要核对、两个App快照verify及当前1,646项输入核对均通过；相对原S4新增4项/修改9项/删除0项，五插件与依赖锁未变。只读报告为`D:/codes/blinker-library/build/p1-candidate-closeout-20261009/audit.json`，不改变冻结manifest。
- 原`source-handoff rebuild`支持的仍只有`production`及`local,local-device`。本批实际检查`ble-priority-test`、`local,ble-priority-test`、`production,ble-priority-test`均在安装/创建work之前拒绝；这是交接工具的准入，不声称Angular自身禁止任意组合。**P1曾在原工作区构建/实测，但没有该变体的新目录依赖重建证据。**
- 41项P1配置/窗口/transport/client相关回归和10项交接工具测试通过、0skip；不累计历史217/391项为本批测试。iOS实物/Wio preview及真实接收仍待办；普通配置保持关闭，不自动改默认、生成合成包或部署。

pnpm11.19.0属于维护者外部工具，需先按团队工具链安装；传入其实际JS入口（可能为pnpm.cjs或pnpm.mjs），工具使用所记录Node执行并核对版本，不猜测本机Codex路径。workspace必须显式包含device-template，package.json的workspaces仅保留给既有npm run --workspace任务使用；[pnpm官方说明](https://pnpm.io/settings)确认两者不是同一个安装声明。

## 6. 第75批显式P1新目录构建

只改`tools/source-handoff.mjs`及其自测：统一固定配置白名单并增加已测`local,ble-priority-test`，在rebuild.json记录实验标记；12项工具测试通过，仍拒绝隐式/裸开关/production混合及任意组合，私有CA/HTTP origin不会自动继承。普通开关、App/五插件运行时、通信API及锁文件不改。

- 独立[源码包](../../local-maintenance/core-app-source-p1-clean-20261009/manifest.json)仍1,646输入，manifest SHA `2918f27d044404dda2726f052c99737edc0f2e122fb937723c22e63e5433dd5c`；相对第69批快照仅上述工具/测试两项不同。原包/原八项制品摘要仍匹配，不倒改旧清单。
- 包内入口在新`core-app-rebuilt-p1-clean-20261009`工作目录完成五插件各npm ci/build、App/模板pnpm frozen install/build、类型/Web/sync/Android debug共16步。原依赖版本、四份App锁输入和五插件package/锁字节一致；安装后的dist/声明TS/Android main/Gradle与本目录生成内容相同。没有借原node_modules/dist；正常外部依赖缓存不等于原工作区产物。
- 在该隔离工作目录运行四文件41项P1配置/窗口/transport/client回归全部通过、0skip；不累计历史217/391项。Android3分26秒、439项构建任务不是测试。Node22.22.3/npm10.9.8/pnpm11.19.0、JDK21.0.12.1/SDK36沿声明基线，Gradle/Maven工具仍外置，不称完整离线工具链。
- 新[APK](../../local-maintenance/core-app-rebuilt-p1-clean-20261009/source/blinker-app/android/app/build/outputs/apk/debug/app-debug.apk)79,949,462 B，SHA `f54b7881d08c3d4eaa1dbe7656d5ac74e159f1c1b55f6cd9126ff35410b34209`。APK内HTTPS/Capacitor cleartext=false、实际导出的P1=true覆盖已检查，已知本机测试CA资源0；**没有测试CA、未安装/实物验收，不替代旧已测P1 APK**。需要进入现场差异短链时，先审阅匹配公开CA/端点，在新变体目录记录来源/摘要；不关闭验签或切换origin。
- 本地诊断的false基础值、flag引用chunk及未发布测试/raw TS误报已按导出配置/既有npm files修正，未改构建输入或业务测试迁就检查；错误与修正保留在`build/p1-clean-rebuild-20261009/diagnostic-corrections.json`。最终审计、依赖/源码/制品摘要在同目录`audit.json`及新work `rebuild.json`；不修改runtime，也不把辅助检查问题算产品缺陷。

第34项构建缺口已关闭，独立接收/iOS/Wio与T2/A1/生产限制保持。当前没有新手机/板卡操作、服务部署、Git暂存/提交/推送；下一步是实际交接或匹配新制品的有限差异验收，不扩P2/更长循环。

## 7. 第76批匹配公开CA变体的有限实物

第35项已完成。复用§6隔离work的源/依赖/Web/sync，只显式加入现有三文件公开debug CA，并用局部Gradle init将App build输出到新目录；普通P1/生产配置和原无CAAPK不动。这是同源的现场测试变体，不是第二次全依赖冷构建、原S4替换或真实同事接收。

- [变体APK](../../local-maintenance/core-app-p1-test-ca-20261009/app-build/outputs/apk/debug/app-debug.apk)79,951,127 B，SHA `cebd57ecc8f497a7df1bc77c3d5a4b31d4ece3866832fc6d6dba4df090c22b85`；源manifest仍`2918f2…dd5c`。原更新签名、HTTPS origin/cleartext=false、明确CA/服务实连验证通过；不含私钥，不关闭验证或复制origin数据。
- 与无CA原包1,580项assets、16项native lib、22个App Java class字节一致；两个新增资源使生成R所在项目DEX改变，17份其他合并DEX不变。保留安装前DEX全同误报和按资源生成边界纠正的检查，**不声称整个DEX/APK同字节**。
- Android/XIAO原已绑定目标：缓存命中ready2,756ms、Property/Action ACK309/323ms、正常退出222ms；认证阶段取消18ms导航、6.4秒终点零资源，没有迟发BALANCED。只读重进2,590ms、按钮仍1不重放，退出220ms。只是一条有限受影响链，不证明秒开/稳定提速、Cloud设备控制或同设备无缝切换。
- 本批17项测量工具测试0skip，不累计旧41/217/391项。前后1,646项输入及原八项制品摘要一致；无App/五插件运行时代码、依赖/SDK、MCU、服务器或Git变动。私有App备份只在本机，不进入源码交接/公开CA目录。
- 原手机APK `05071e…7606`已实际恢复读回；原账号/授权/Manifest缓存、3条任务intent及空自动化journal摘要保持，账户ready、零连接/观测，测量CDP移除，既有USB reverse保留。详细原始证据取[主线§8.76](../../blinker-library/docs/DEVICE_V2_NEXT_EXECUTION_PLAN.md#876-第七十六批新目录p1公开ca变体与有限实物闭合2026-10-09)。

第34/35项构建来源与有限实物差异链已闭合，不继续重测相同输入。独立接收/iOS/Wio和原T2/A1/生产边界仍待相应环境/准入；新的合成交付、默认启用、生产端点、推送/部署须明确范围与必要差异验收，不能自动扩大。

## 8. 第82～83批普通A2来源与匹配交付

本节更新当前选择，不重写前面S4/P1的当批事实。第82批真实安装、两设备有限闭环与恢复边界取[主线§8.82](../../blinker-library/docs/DEVICE_V2_NEXT_EXECUTION_PLAN.md#882-第八十二批a2-4匹配候选两设备有限实物与安全收尾2026-10-10)及[Service§28.13](../../aily-blinker-services/docs/SERVICE_DEVICE_V2_AUTOMATION_IMPLEMENTATION_PLAN.md#2813-第82批a2-4匹配候选两设备有限实物与收尾)。第83批只核现有匹配索引和操作说明，不重复这些构建/测试，也不把发送方验证称为接收方验收。

| 材料 | 精确来源/范围 |
| --- | --- |
| 普通A2源码快照 | [core-app-source-a2-20261010](../../local-maintenance/core-app-source-a2-20261010/manifest.json)，1,646个输入；manifest SHA-256 `9fa45279444874820350083a81cc2953d06753179476684752c73be66c73140c`；App来源HEAD `e9e1880726c24476a1b84a9cb1ed9bc531a85136`，五插件来源与逐文件摘要随manifest固定 |
| 独立重建 | `core-app-rebuilt-a2-20261010`新目录；五插件各原npm锁构建、App/模板原pnpm frozen install、类型/Web/sync完成，再明确加入公开debug CA独立完成Android构建；未借旧dist或升级依赖 |
| 实际安装APK | [app-debug.apk](../../local-maintenance/core-app-rebuilt-a2-20261010/source/blinker-app/android/app/build/outputs/apk/debug/app-debug.apk)，79,959,579 B；SHA-256 `66b47aaa416085561759be7fdd0358f8dcd775cd10b4a5a5899fa8c101c42e5d`；applicationId=`iot.diandeng.tech.debug`，安装后手机读回一致 |
| 配置与信任 | `local,local-device`、P1=false、LAN=false；原默认HTTPS WebView origin、Gateway `https://127.0.0.1:17000`和匹配账户WSS；明确公开测试CA，cleartext=false，不包含私钥，不是release签名或生产信任配置 |
| 实物范围 | 匹配本机A2 Gateway/Broker shard 1、同owner/tenant/shard两普通WiFi XIAO S3；下降沿及一种uint32阈值/回差、退出/停用/源重启恢复通过，4条真实ACK/回调；不是全条件、BLE/P1、跨账号/片或生产验收 |

五相邻插件布局、原锁和运行时不因本次交接改变。包内原`tools/source-handoff.mjs verify`可只读校验该冻结来源；它只证明输入完整性，不证明当前服务可达、typed历史兼容或接收方运行成功。原S4工具/manifest仍使用其当时合同，不把新工具或新APK覆盖进原包。普通用户不运行这些维护工具；Android SDK/JDK/Gradle/Maven仍外置，iOS没有新构建或实物结论。

### 8.1 暂停不等于降级

- 现环境保留policy2定义和执行历史，即使规则disabled，旧A1 `05071e…7606` APK的实际decoder仍拒绝该规则；匹配新APK接受。旧A1服务也不能安全处理non-retired A2 graph。因此测试结束保留匹配A2 App/Gateway/Broker，试点revision8/disabled、pending=0、4条历史保留，不能删typed行或覆盖业务库/手机数据来伪装无感回退。
- 原S4及旧P1 App来自A1来源链。P1参数实验证据不证明A2读取兼容；不能把旧P1 APK安装覆盖当前A2 App后仍宣称typed规则可用。当前普通A2 App中P1关闭不等于移除其模块；若未来需要A2＋P1合成候选，应明确选源/profile并做有限差异准入，不由本索引自动生成或启用。
- 升级必须同时核对App union解析、Gateway仓储/管理/worker及参与链路的Broker typed观察/投递合同、用途配对配置和当前schema；不能只凭相同schema49、Git HEAD或SHA完整性判断可混版本。暂停先沿公开CAS停用并核对pending/未决执行；回退须先验证目标组合对保留定义/历史的读取与原意图恢复，不可无条件恢复旧APK或旧数据库备份。详细唯一操作顺序取候选清单§7.5，本页不复制第二套脚本。
- 保持原HTTPS origin及账号隔离的持久意图；新origin下的空journal不证明原请求不存在。新制品重新确认摘要/更新签名/CA期限及精确端点；debug包、公开CA与ADB reverse仅是有限本机测试配置，不是生产部署许可。

### 8.2 白名单交付与未完成项

维护者可提供上述独立源码快照，并按制品摘要**逐项**挑选已审阅APK和公开debug overlay；APK不是源码包内容，overlay不会被原工具自动继承。现场`build/automation-a2-live-20261010`以及旧实物目录包含Flash/应用数据/业务库备份、DeviceKey和网络参数，**禁止整体复制、上传或打包交付**。只允许经审阅的公开CA/限定域配置，不提供私钥、全域信任或关闭证书验证。

当前来源与有限发送方实物链已闭合；独立接收须另记录接收人、实际profile/端点、安装与短链结果，不能把历史模板空白或本页核对算接收通过。正式服务profile、release签名/信任根、完整外部工具链离线闭包、iOS及原缺环境项仍待办。未给定正式profile不自动创建生产包，未发生源码/配置差异不重复巨大bundle、全量构建或刷板；既有现场临时入口与ADB测试转发已清理，恢复测试连接另需明确匹配网络配置。

用户已确认先保留内部候选并交接验收，执行取[候选§7.6](../../blinker-library/docs/DEVICE_V2_CANDIDATE_SOURCE_AND_SUPPORT.md#76-内部候选交接验收用户已确认)。继续使用本节匹配普通A2来源，不新建生产APK或恢复旧P1包；来源/安装与有匹配环境条件下的联网验收分开记录，缺环境记未测。此确认不代表App已发送给同事、其已安装或第28项接收通过。

## 9. 第86批M5命名与编辑的当前本机候选

新工作树冻结源1,641项，manifest SHA256 `8a36e0576faa6d88333dd4a0dcff3137d39b756469764e3edde489c94ecce934`；在新目录按固定pnpm锁及5个相邻插件闭包完成依赖、类型、Web／Android构建，不覆盖第82来源或制品。实际APK内新生产模板与编译Web字节一致，AppID／原debug签名／公开CA／HTTPS WebView origin保留，P1／LAN=false。

- 当前本机APK：79,913,838 B，SHA256 `7284b0673517a52eb8b76d4ec5ce1581ff772748ebe89495659c0e1f37ed514c`；实际安装并设备读回一致，原APK及完整私有数据先备份，无清数据／切origin／切账号。
- 必须匹配Gateway管理代码及schema50，新镜像`468e06bb4e898193238ebac7d11fb9e35ace7a903da53ebe7690edbf59608a41`；Broker沿第82镜像／执行链未改。名称进入管理响应，旧APK不保证读取新命名历史，不能把停用／删除当兼容降级依据。
- 生产DOM经统一入口完成命名／停用编辑／启用／已启用编辑、两设备触发、App退出后执行、重开查询、停用／删除；两ACK、目标回调0→1→2。首命令原帧重试2次尝试、第二1次，如实记录；不是手动软键盘或物理负载验收。
- 测试网络／ADB入口已撤，保留匹配新App／Gateway50和命名历史；不恢复旧APK或业务库。正式release签名、可公开服务profile、iOS／其他平台及接收人独立验收不由本机成功代签。

公开进度取[主线§8.86](../../blinker-library/docs/DEVICE_V2_NEXT_EXECUTION_PLAN.md#886-第八十六批m5本机新版app与两设备产品验收2026-10-10)。本地`build/automation-product-m5-live-20261010`保存source／APK审计、真实UI、数据库及Flash私有备份；不得整体上传或交付。第83交接目录／镜像索引仍为当批历史，不能冒充本次产品候选。没有Git暂存／提交／推送或正式发布。
