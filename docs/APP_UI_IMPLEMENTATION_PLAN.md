# App UI 统一实施计划

更新：2026-10-24。主线：按照最新图稿统一现有页面，保留组件模板与 Agent 编排、现有执行链和用户数据。规范入口：[App UI 设计规范](APP_UI_DESIGN_SYSTEM.md)。当前剩余顺序见[覆盖修复计划§34.1](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)，下方各节保留当批历史边界，不据旧“未部署”重复已完成项。

## 1. 范围与冻结项

本计划替代零散“按原型逐页重做”的执行方式，不替代设备接入、任务、自动化等业务合同。只做视觉、信息层级、已明确的交互修正和必要回归，不扩功能、任务槽、协议、部署开关，不升级 SDK，不自动提交推送或部署。

必须保留：账号与授权、请求 journal/UNKNOWN、设备目录/别名、已保存布局/排序/grid/绑定/选项、组件目录和三种主题、Agent 文档及安全桥、CAS、连接作用域与后台回收。

工作区已有组件尺寸及地图/位置/活动记录等未提交修改，属于既有工作；不回滚、不混称为本批新增成果。设备设置内“活动记录”的真实来源文案也保留。

## 2. 顺序与完成条件

| 批次 | 最小范围 | 验收出口 | 状态 |
|---|---|---|---|
| UI0 规范冻结 | 合并页面、组件比例、属性和显示模式约束；建立源码文档入口 | 设计与业务合同可区分，旧布局与 iframe 边界明确 | 已整理 |
| UI1 设置样板 | opt-in 共享设置样式；设备设置分组/同级图标/热区；左右显示模式选择及确认 | owner/shared/缺文档/失败/取消/换 scope 单测，编译及浏览器响应式检查 | 源码／软件及UI7 Android代表短验完成；非全权限原生矩阵 |
| UI2 我的与应用设置 | 身份权益、设备管理、服务支持分组；应用设置/账号/自建服务器同级行一致 | 真实字段、部署门控、密钥遮蔽、返回路径不变 | 源码／软件及UI7 Android代表短验完成；低频路由另列 |
| UI3 设备控制壳与组件 | 先审阅既有尺寸修改；按同族统一比例/对齐/热区/预览 | 所有类型与三主题、旧布局保存/取消/绑定回归，不重排 | 软件及几何／当页编辑Android代表完成，详见修复计划§5～§12；非全模板原生矩阵 |
| UI4 部件属性 | 常用/高级分组；完整参数保留；invalid 上送、标题 UTF-8 合同修正 | 无效输入禁存、0/默认三态、整体保存/失败回滚、旧参数不丢 | 软件与Android代表完成，见本计划§8及修复计划§8～§10；异常呈现继续按§13收口 |
| UI5 自动化/任务/数据 | 规则和任务卡、表单与状态；实时/历史/趋势/活动来源分开 | 现有确认先于刷新、CAS、Start/启用/UNKNOWN 及后台回收不变 | 软件及UI7代表消费者短验完成；非全业务／故障矩阵 |
| UI6 配网/分享/工具 | 复用设置行/表单/反馈，按家族迁移剩余入口 | 真实权限、失败、空态、危险确认与返回不丢 | 最小入口及软件／UI7代表短验完成；工具内页等未逐路由关单 |
| UI7 原生短验与收口 | 备份后部署匹配 App，按变更做小屏/横屏/大字/生命周期差异验收 | 按平台留证，必要控制仅走原链；未测项明确保留 | 云端Android代表短验及必要修正完成，见§11；不等于iOS或全业务验收 |

不按 74 个原型页面顺序逐页复制；每批以共享能力和实际源码消费者为单位。已通过首页编辑/拖动/卡片数据的业务行为保留，但不豁免新版视觉迁移。UI0～UI7不是全页面完成证明；后续覆盖及几何修正以[页面覆盖与组件几何修复计划](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)为准。没有新影响不重复 BLE 循环、设备断电或服务部署。

## 3. UI1 实施设计

### 3.1 样式复用

- `src/theme/_settings-surface.scss` 只提供显式引入的 scoped mixin，映射现有语义色。不得改全局按钮、widget 字体或 Agent 文档。
- `app-menu-list` 增加可选 settings 外观，默认消费者不变；设备设置显式使用统一图标列、可换行说明、焦点与触控目标。
- 设备设置保留所有原入口、权限、Key 确认和别名 CAS。低频详情渐进呈现，错误与风险仍就地可见。

### 3.2 显示模式职责

- 新 selector 仅持有临时选择，输入 currentMode/hasCustomPanel/shared/busy/error，输出确认/取消；不直接调用保存服务、命令或存储。
- 父设置页沿现有 `setPanelMode`：owner 保存配置，shared 保存既有本机偏好，无文档 owner 进入既有创建页。两份内容均不重建。
- 确认前重核设备/账号/会话作用域；保存成功才关窗，失败保留草稿和可见错误。离页/换作用域废弃草稿，不宣称撤销已提交的服务请求。
- 使用 Ionic 弹层管理焦点/返回/安全区，不在动画结束前强拆 overlay。结构缩略图明确标“布局示意”，不截图真实 HTML、不挂载 live 面板。

### 3.3 有限回归

1. 共享菜单默认外观不变，settings 显式生效；设备原入口、部署门控和活动记录文案回归。
2. 选择不保存、取消不保存、busy 防重复；owner 成功/失败、shared 不写 owner、缺自定义文档两权限分支。
3. scope 变化/离页后旧选择无效，迟到结果不影响新选择器；布局/绑定/custom 文档原样保留。
4. TypeScript/Angular 模板构建；320/375/430/横屏，浅深色和放大文字的无横向溢出/热区/换行检查。
5. 不因本批 UI 测试刷固件、清授权、切服务或调用真实设备；原生生命周期与持久化列为后续短验，不能用浏览器结果代替。

## 4. 本批记录

### 4.1 UI0/UI1 已实施

- 统一源码规范，串联页面、组件比例、部件属性、显示模式四份设计输入；原型文档保留历史记录并指向源码实施入口。
- 新增 opt-in `settings-surface`，设备设置及设置型菜单采用分组卡、同级图标和锚点、48px 目标及可放大文字。旧菜单默认外观不变；删除无引用的 `settingList` 和旧模式 popover 样式/导入，未删业务入口。
- 名称与显示同组；功能名称按需展开，保留原 Manifest/别名/CAS 保存。Key 依然遮蔽、确认和沿原权限读取/轮换。
- 显示模式左右结构示意、草稿/当前使用区分、确认/取消；owner、shared、无文档、失败、busy 和作用域变化走各自真实合同。预览没有设备连接、命令或 iframe。
- 发现并修复长 key 在320/375px、150%文字时撑出别名编辑区域的问题：收紧 grid 最小宽并允许标签换行。
- 新稿文字/交互/危险颜色只在 opt-in scope 内映射既有语义名，不改全局主题或 `--ui-*`。通过现有 `color-scheme` 的 `light-dark()` 取浅深色；不支持它的旧引擎保留原配色，该兼容分支未声明对比度达标。

### 4.2 软件验证

| 检查 | 结果 | 证据范围 |
|---|---|---|
| 设置页/原业务回归、模式父页、selector、菜单 | 5文件90项通过 | owner/shared、取消、失败/重试、scope、CAS/Key/原入口等；mock服务，不是真实写入 |
| 样式基础与既有布局有限回归 | Node 9项通过 | 显式启用、主题边界、尺寸及既有面板几何合同 |
| 浏览器 CSS | 64项通过 | 320/375/430/844px × 浅深 × 100/150% rem；长文本、热区、键盘单选/焦点、减少动态效果；实际 SCSS + 标注静态夹具 |
| TypeScript | `tsc --noEmit -p tsconfig.app.json` 通过 | App类型检查 |
| Web完整构建 | development通过 | 编译/模板/样式；不含安装部署或生产环境承诺 |

复现：

```text
node --test tools/settings-surface.test.mjs tools/panel-layout.test.mjs
node node_modules/@angular/cli/bin/ng.js test app --watch=false --progress=false --include=src/app/core/components/menu-list/menu-list.spec.ts --include=src/app/sections/device/device-settings/device-settings.spec.ts --include=src/app/sections/device/device-settings/device-settings-truthfulness.spec.ts --include=src/app/sections/device/device-settings/device-settings-panel-mode.spec.ts --include=src/app/sections/device/device-settings/panel-mode-selector/panel-mode-selector.component.spec.ts
node tools/settings-ui.browser.mjs
node node_modules/@angular/cli/bin/ng.js build app --configuration development
```

浏览器脚本使用现有 Playwright；不在项目中新增依赖。非标准工具目录可用 `SETTINGS_BROWSER_DRIVER`/`SETTINGS_BROWSER_EXECUTABLE` 指定绝对路径。四张 CSS 复核图写入 Git 忽略的 `tmp/settings-ui/`，不是用户真实面板或原生截图。另用无登录浏览器确认完整 bundle 可加载登录页且无页面异常，外部网络全部拦截；没有伪造账号进入受保护页。

### 4.3 未覆盖与下一步

- UI1 尚未做原生 Ionic 弹层返回/焦点/安全区、硬件返回、大字、旧引擎配色和真实模式持久化短验；浏览器夹具没有 Angular/Ionic 生命周期，不能代替它们。
- 未安装 App、变更服务、刷设备、读取/重置账号授权或发送控制；未提交推送。既有本地修改保留。
- UI1 后续顺序为 UI2；其实际进度见下节。组件/属性按 UI3/UI4 单独保护草稿和布局。真机部署留到明确短验批次，不在首批全局换肤。

## 5. UI2 我的／应用设置／账号／自建服务器

### 5.1 最小范围与不变合同

本批仅迁移上述四个页面，复用 `settings-surface`、`app-menu-list appearance="settings"` 和原服务。第三方服务入口保留，其内部页面及其他支持页面尚未迁移；不把 UI2 宣称为全 App 统一完成。

| 页面 | 本批改动 | 保留边界 |
|---|---|---|
| 我的 | 身份/权益一张卡，刷新独立于资料入口；设备、连接服务分组；反馈/关于低强调，退出独立；右上设置直达 | 消息与自动化部署门控、全部原路由；套餐/额度来自服务，0、未知、无限与接收共享不同义；刷新仍防重复并按会话核对 |
| 应用设置 | 语言、外观、服务地区按需展开；原生单选及有效分组标签；忙碌指示/就地失败提示/真实选择恢复 | 仅已有语言、浅深主题及三个既有地区；选择仍沿原服务即时应用，不新增“跟随系统”；切区仍退出登录、保留提示，从登录进入仍返回登录 |
| 账号 | 只读身份卡、昵称/邮箱资料行；删除无依据的“已保护”状态 | 不增加资料编辑、头像修改或安全保证；保留解除绑定前置、专用注销验证码、限流、过期、未确认和全部原确认链 |
| 自建服务器 | 统一表单、48px 热区和可访问密钥按钮；离页遮蔽不丢草稿；本机保存/清除失败保留内容并提示 | 仅保存独立本机配置，不检测连接、不替换内置 API/账号后端；沿原协议验证、精确 Key、存储键及清除确认 |

账号权益继续集中在“我的”，本批不为账号详情另起权益请求或重复卡片。语言列表移除装饰国旗，不删语言；主题缩略图固定表达浅/深两种外观，不表示切换控制组件或 Agent 文档主题。

### 5.2 必要修正与清理

- 区域数 `0` 不再被 `|| 2` 覆盖；未知版本显示 `—`，不伪装成固定旧版本。权益没有按 Free/Pro 推导新额度。
- 语言/地区原单选换为原生 radio，修复悬空的 `aria-labelledby`。用局部 signal 持有待处理选择，失败恢复实际选择；错误不泄露原始异常。无效/重复选择不写入。
- 语言和服务地区仍各走原调用，不触碰账号迁移、设备目录、执行请求或 UNKNOWN。浏览器上下文测试不使用真实账号。
- 自建配置存储失败不显示保存/清除成功，保留精确草稿和已有状态，正常重试；不更换存储服务或 Key 处理规则。
- 删除未引用的 Profile `FormsModule`、空 `checkCodePush`、设置页国旗代理方法、只读菜单转换后的过时代码/样式；不清理无关模块或用户布局。
- 11 种现有语言只增加两个分组标题和两个设置失败提示；原字段、警告和服务可用性不变。
- 编译页发现旧 `_light/_dark` 底色与静态组件主题夹具不同，已在共享 opt-in mixin 中补齐新稿页面/表面/文字及本地 Ionic chrome 映射；设备显示模式弹层也显式启用，避免 portal 继承旧底色。不改全局主题或 `--ui-*`。

### 5.3 验证记录

| 检查 | 结果 | 证据范围 |
|---|---|---|
| Angular/Vitest联合回归 | 11文件92项通过 | Profile/权益/菜单/消息门控、设置异步恢复、只读资料/原注销链、自建配置/失败重试、既有主题 |
| Node有限回归 | 10项通过 | 11语言字典、共享样式边界及既有面板几何 |
| UI2浏览器CSS | 96项通过 | 四页六状态，320/375/430/844px × 浅深 × 100/150% rem；无溢出/重叠，48px目标、键盘/焦点、减少动态效果、采样文字对比度 |
| UI1共享样式消费者 | 64项再次通过 | 本批扩充 opt-in 表面映射后的设备设置/显示模式；不重复设备或原生控制测试 |
| 真实编译页公开短验 | 通过 | 隔离浏览器登录→设置→返回；原主题/语言服务、故障字典读取的错误/单选恢复、浅深底色与表面、320/844px；无账号、外部请求或页面异常 |
| TypeScript / Web完整构建 | 通过 | `tsc --noEmit -p tsconfig.app.json`、development；不含APK安装/原生持久化/生产发布 |

CSS夹具使用真实SCSS和合成文案，不是原生截图或真实账号/保存证据。公开短验使用实际Angular/Ionic bundle，只改变一次性浏览器上下文中的偏好，并使一笔新的公开语言字典读取失败；不拦截、重放或提交设备/账号请求，结束关闭上下文和临时静态服务。

复现入口：

```text
node --test tools/ui-settings-copy.test.mjs tools/settings-surface.test.mjs tools/panel-layout.test.mjs
node node_modules/@angular/cli/bin/ng.js test app --watch=false --progress=false --include=src/app/home/components/tab-profile/*.spec.ts --include=src/app/sections/settings/settings.page.spec.ts --include=src/app/sections/user/user.page.spec.ts --include=src/app/sections/self-hosted-server/self-hosted-server.page.spec.ts --include=src/app/core/services/self-hosted-server.service.spec.ts --include=src/app/core/components/menu-list/menu-list.spec.ts --include=src/app/sections/message/message.page.spec.ts --include=src/app/core/theme/theme.spec.ts
node tools/profile-settings-ui.browser.mjs
node tools/app-settings.smoke.mjs <绝对路径：已编译App的browser目录>
```

浏览器运行路径约定同 UI1。图在 Git 忽略的 `tmp/profile-settings-ui/`，均标注静态检查夹具。原生安全区/键盘/硬件返回、语言和主题重启保留、登录返回、真实账号刷新、注销流程及自建配置原生存储仍留 UI7 短验；本批不执行真实注销、清授权、刷板或服务部署。

### 5.4 后续边界

下一批按 UI3 审阅既有组件尺寸修改，再做控制壳与同族组件比例/触控/预览对齐；保留48预置、三主题、旧 grid/顺序/绑定及 Agent iframe。UI4 属性 invalid 与标题 UTF-8 合同单独实施，不借 UI2 扩大组件保存范围。当前所有无关本地修改保留，暂不提交推送。

## 6. UI3 控制壳、同族触控及编辑预览（首批）

### 6.1 审阅与冻结

本批先运行现有尺寸基线：4文件78项通过。既有 Stepper／Slide／Number／Toggle 溢出修复、共享新建规格、历史布局尺寸豁免、反馈正常流、容器断点与已保存坐标口径均保留；不是本批重做的模板。新建默认规格只影响新建，打开／渲染／取消不迁移布局。

明确保留7类型、23外观、48预置，自然／暗夜／电子及专用字体；原 widgets 数组顺序、widgetId、endpointKey、extraKeys、grid、options（含0和false）和主题不变。连接、租约、权限、ACK／State／UNKNOWN及Agent文档、安全桥和iframe滚动边界不改。

### 6.2 本批最小实施

| 范围 | 实施 | 不变合同 |
|---|---|---|
| 控制页及两个编辑页页头 | geometry-only `control-page-chrome`；56px工具栏／48px目标；标题占按钮之外的空间，不用固定108px覆盖；页级重算内容偏移；焦点与减少动画 | 原按钮、返回／路由、状态来源及三主题token；不套设置页palette |
| 控制内容与主题选择 | 错误／过期提示可换行，重试48px；字号层级、圆角、安全区统一；主题关闭键小视觉／大热区，装饰图标不重复朗读 | 不新建外卡包住整个面板；Agent自有留白／滚动／主题不受覆盖 |
| 显式面板主题 | 删除额外12px面板外卡padding，避免具名容器与实际网格内容宽相差24px | theme Input仍覆盖token；不改grid／断点／排序／绑定 |
| Gradient | 48px操作带，6／14／32px视觉轨道；单行局部预算 | 原横向坐标、指针／键盘事件、范围与发送合同 |
| Text | 输入及发送48px，发送保留32px视觉，单行输入16px | 草稿与显式发送分开；原只读／disabled／多行选项 |
| Mode | 三外观保留，单行标题／操作分区；密集选项局部滚动且全可达 | 不删选项、不缩热区、不改旧尺寸或选择动作 |
| 主编辑器／属性预览 | 48px工具、主题、输入、移除；窄屏换行而不压按钮；安全区／焦点；显式控制预览增加真实下发提示 | 编辑／布局／属性／库预览不发命令；主显式预览沿原真实控制。属性仍由原context保存整页，失败留草稿 |

实际Ionic检查发现页头高度从44变56时，只改host高度变量不会重算从`:root`继承的content-top；已在共享chrome同一host重申计算，补0／20px安全区断言。没有改全局44px页头或其他页面，不引入第二个ion-content、连接或iframe。

### 6.3 有限验证

| 检查 | 结果 | 证据边界 |
|---|---|---|
| Angular联合回归 | 12文件176项通过 | 核心尺寸／目录、三主题历史文档完整往返、排序副本、组件事件／只读／disabled、属性草稿／取消／失败／作用域、原导航与唯一连接 |
| Node网格合同 | 6项通过 | 普通／编辑／属性／Agent共享断点、保存坐标、正常流反馈 |
| 原尺寸浏览器矩阵 | 336项通过 | 保留既有四族及各渲染壳实际SCSS；临界断点／长错误／窄命令局部回退 |
| 新组件浏览器矩阵 | 480项通过 | 三主题×320／375／593／844px×20状态×100／150%计算字号；Gradient视觉宽高不变、密集Mode全部可达、Text热区 |
| 编辑工具浏览器矩阵 | 120项通过 | 三主题、四宽度、100／150%文字，edit／layout／显式预览／库／属性五状态；无页面横向溢出／目标重叠，保留画布 |
| 页头与主题／反馈浏览器 | 162项通过 | 实际已安装Ionic Web Components＋实际SCSS，iOS／MD、三主题、四宽度、两文字尺度、三个chrome消费者；48px、标题不盖按钮、0／20px安全区和内容偏移、减少动画；另显式／继承theme临界网格一致 |
| TypeScript／完整构建 | 通过 | App `tsc --noEmit`、development完整构建、Agent运行时独立构建；输出仅临时目录，不覆盖原生／发布内容 |

新增5项布局合同、7项组件行为、11项属性context回归。所有浏览器页面为合成文案夹具，不加载真实账号、设备或保存布局，不发送控制；三主题CSS视觉复核图同样不是App／原生截图。页头夹具使用真实Ionic组件，但不是完整Angular受保护设备页；不宣称覆盖独立非embedded V2的旧全局样式分支。生产V2仍沿embedded单一所有权。

复现（浏览器沿用 `WIDGET_BROWSER_DRIVER`／`WIDGET_BROWSER_EXECUTABLE` 现有绝对路径约定，不加依赖）：

```text
node --test tools/panel-layout.test.mjs
node tools/widget-sizing.browser.mjs
node tools/ui3-widget-presentation.browser.mjs
node tools/panel-editor-ui.browser.mjs
node tools/ui3-control-shell.browser.mjs
node node_modules/@angular/cli/bin/ng.js test app --watch=false --progress=false --include=src/app/core/device-v2/page-layout.spec.ts --include=src/app/core/device-v2/widget-presets.spec.ts --include=src/app/core/device-v2/ui3-layout-contract.spec.ts --include=src/app/sections/device/widget-inspector/widget-inspector.spec.ts --include=src/app/sections/device/panel-editor/panel-widget-editor.page.spec.ts --include=src/app/device/v2/widgets/widget-sizing.spec.ts --include=src/app/device/v2/widgets/widget-presentation.spec.ts --include=src/app/device/device.page.spec.ts --include=src/app/device/device-theme.spec.ts --include=src/app/device/device-navigation.render.spec.ts --include=src/app/device/v2/device-v2.page.spec.ts --include=src/app/device/v2/device-v2.render.spec.ts
```

### 6.4 剩余与下一批

1. 首批列出的 Keys、Levels、Picker、Dial 小热区，已由后续§7限定补齐；共享 `.rbtn` 未改。首批和后续证据分开保留，不把“保留全目录”写成“全目录触控或无障碍认证达标”。
2. UI4属性分组、invalid上送及标题UTF-8合同由后续§8单独处理；不混称为此次几何修复。
3. UI7再明确备份／部署范围后做原生小屏／横屏／系统实际大字、焦点／硬件返回／键盘／安全区及真实保存／取消差异短验。150%计算字号不是系统Dynamic Type；本批不承诺全目录对比度或无障碍认证。
4. 本批不操作手机／设备／服务、不改账号授权或请求记录，不部署、不提交推送；无关本地修改保留。旧尺寸计划中已中止的原生验收仍未通过，不以本次软件检查替代。

## 7. UI3 四族触控补齐与软件收口

### 7.1 最小范围及保留合同

按§6.4仅补 Keys／Levels／Picker／Dial 的实际触控区域，不换模板、调色源或执行链。默认目标为48×48 CSS px，可见图形可以更小；焦点在卡内完整可见，按压效果只作用于视觉，不缩小实际目标。

| 家族 | 本批修正 | 保留内容 |
|---|---|---|
| Keys | 每键最小48px；密集组合仅键区有界滚动；完整名称可读取；焦点内收与减少动画 | 原分行计算、choices顺序、图标／色调、单次select事件与发送闪烁 |
| Levels | 点／段／柱及加减键均48px；30px点与40px加减视觉分离；柱图仍按原28～100%高度；仅档位行滚动；单行使用呈现class | 三种外观、十二档上限、原范围／step／allowOff与nudge；不写回grid或改业务TS |
| Picker | 色块48px，保留26／36px视觉；both下方色板单行横滚，独立色板有界纵滚；色盘不低于48px；禁用语义与减少动画 | wheel／swatches／both、palette顺序、色相圆心及键盘步进、拖动仅预览／释放单发 |
| Dial | 加减键48px，保留40px视觉；旋转区最小尺寸遵循原viewBox比例；禁用语义、焦点与减少动画 | sweep／ticks／thickness、转动圆心、范围／step、按住重复及松手单次提交 |

不改变共享 `_card.scss`／`.rbtn`、RangeWidgetBase、布局解析／目录／默认规格、排序、绑定、选项或主题。Levels仅新增`rows===1`呈现class；其余生产TS和动作处理不变。Agent文档、运行时接线及sandbox／CSP／channel边界均不改，运行时直接复用同一组组件。

浏览器检查捕获并作了两项局部修正：段式长标签的min-content曾撑宽单目标，现保持完整可访问名称并限制局部宽度；电子主题共享加减边框曾侵占40px视觉面圈，现仅在两个消费者内显式消除外层边框。没有放大全局按钮或牵连已通过的其他家族。

### 7.2 有限验证记录

| 检查 | 结果 | 范围与限制 |
|---|---|---|
| Angular联合回归 | 9文件126项通过，其中新增28项 | Keys／Levels9、Picker／Dial15、共享只读预览4；另保留目录7／23／48、三主题历史文档往返、排序副本、原尺寸及属性context回归 |
| Node网格合同 | 6项通过 | 共用容器断点、编辑／预览保存坐标、正常流反馈及Agent几何 |
| 新浏览器矩阵 | 1056／1056通过 | 44种代表情况×三主题×320／375／593／844px×100／150%计算字号；覆盖全部25个声明尺寸组合、密集选择、十二色、disabled、加减显示及原最窄尺寸 |
| 几何与视觉断言 | 通过 | 实际目标48px、局部滚动后每项全可达、无目标重叠／下一行覆盖，30px点／26和36px色块／40px加减视觉不变，轮盘映射比例保持；有界焦点／减少动画 |
| TypeScript与完整构建 | 通过 | App `tsc --noEmit`、development App与独立Agent运行时构建；输出到本机临时目录，不打包安装或覆盖发布内容 |
| 受保护源码终核 | 10个文件本批前后摘要一致 | 共享card／base／range、布局／目录／默认规格、PageWidget及Agent目录／桥接／运行时入口；不是与Git HEAD或此前未提交修改做回滚 |

新增测试保留原card及其grid／绑定／options，不直接调用设备或服务。Picker两个尺寸的色相坐标、Dial三组sweep×两个缩放、无关pointer隔离、按住400ms／90ms与释放提交均由原处理链回归；没有另造动作实现。只读预览维持inert与输出门控，显式interactive才沿原链输出。

浏览器为实际SCSS／本地字体和合成DOM夹具，不是Angular真实控制页、原生截图或真实ACK／State。150%计算字号不等于系统Dynamic Type；最窄对照指原已声明规格，不承诺任意非声明历史尺寸都可容纳任意配置。三主题代表图仅供本机视觉复核，不作为账号、布局保存、生命周期或硬件验收证据。

复现（沿用已安装工具，不增加依赖）：

```text
node --test tools/panel-layout.test.mjs
node tools/ui3-remaining-touch.browser.mjs
node node_modules/@angular/cli/bin/ng.js test app --watch=false --progress=false --include=src/app/device/v2/widgets/keys-levels-touch.spec.ts --include=src/app/device/v2/widgets/picker-dial-touch.spec.ts --include=src/app/device/v2/widgets/widget-touch-boundary.spec.ts --include=src/app/core/device-v2/ui3-layout-contract.spec.ts --include=src/app/core/device-v2/page-layout.spec.ts --include=src/app/core/device-v2/widget-presets.spec.ts --include=src/app/device/v2/widgets/widget-presentation.spec.ts --include=src/app/device/v2/widgets/widget-sizing.spec.ts --include=src/app/sections/device/panel-editor/panel-widget-editor.page.spec.ts
```

浏览器入口仍用`WIDGET_BROWSER_DRIVER`／`WIDGET_BROWSER_EXECUTABLE`绝对路径；可选`UI3_TOUCH_SCREENSHOT_DIR`仅生成标注“合成CSS夹具”的三主题图，不读取账号、请求或已有用户布局。

### 7.3 收口与下一步

UI3已列源码缺口的软件实施收口；后续UI4进度见§8，保留既有整页保存／失败草稿边界。原生小屏／横屏／实际系统大字、键盘／硬件返回、真实布局保存／取消及控制验证留UI7明确部署批次，不将浏览器矩阵替代原生验收。

本批没有新功能、协议、槽位、SDK或依赖变更；未部署App／服务、刷板、清授权、读取或改动账号／journal，未提交推送。已有无关本地修改原样保留；不重复BLE或断电循环。

## 8. UI4 部件属性分组、校验及保存保护

### 8.1 最小实施与完整目录

复用单一 Inspector、原 `COMMON_WIDGET_OPTIONS`／`VARIANT_WIDGET_OPTIONS`／校验规则，不新增属性 schema、存储或执行链。保留7类型、23外观、48预置及自然／暗夜／电子主题；不改 Agent 文档、iframe、安全桥或运行时编排。

| 分组 | 内容 | 默认呈现 |
|---|---|---|
| 常用 | 标题、说明、显示标题三态；只读字段及角色摘要 | 展开 |
| 外观与尺寸 | 原完整兼容外观、图标、色调及宽高目录 | 折叠 |
| 当前外观参数 | 原当前外观的常用选项及附属读数／总内存字段 | 展开 |
| 高级 | 原映射、标签、预置、色板、倍率和告警等低频参数；只读布局片段再折叠 | 折叠 |

分组只影响信息层级，不重新初始化参数；空数值、显式0、false和默认保持各自语义。打开、展开、取消和点击已选外观不适配旧grid。明确切换外观才沿原规则适配规格及清理不支持的参数；同名枚举还按目标外观原有子集过滤，避免输出不兼容的style值。

表单沿用既有主题、局部响应式与48px目标；标签／错误关联使用组件实例唯一ID。低频区错误可由“查看错误”打开并定位，不在每次输入时抢焦点。JSON只读、局部滚动，不引入JSON写入或第二套绑定编辑。

### 8.2 校验与整页保存合同

1. Inspector显式输出 `invalidChange`。主属性页及旧组件配置中心的按钮和保存方法均禁存；不把“未输出非法widget”误当作整个表单有效。
2. 非法标题／数值／文本及浏览器 `badInput` 保留原始草稿；编辑其他合法项、同widget引用回显不会丢掉错误输入。IME组合期间禁存，结束后再校验；新widget或明确新编辑会话才重置局部草稿。
3. 标题和解析器共用64 UTF-8字节上限，不再用32字符限制或截断。编辑标题沿原trim／留空回退语义，中文与emoji按实际字节计数；解析器不顺带迁移已保存标题。
4. 复用原选项规则、min/max配对和总内存正数校验。显式换外观清除不适用的错误时，先在同一用户事件更新有效性，再输出部件；实际父模板回归捕获并修正了Input回显阶段才通知导致的NG0100，不用异步Emitter延迟保护。
5. 主属性页仍通过原context保存整个当前面板，包含父页其他草稿；失败保留属性输入并恢复父客户端文档／绑定／undo／dirty／保存基线。若布局已被服务端提交，保留新record revision，不宣称服务端回滚。
6. 旧组件配置中心原先保存样式会全量reflow，现复用现有 `placeWidget`，保持数组顺序及其他部件坐标；只有明确调整尺寸产生冲突时安置当前部件。原saveCandidate、作用域校验、CAS和错误重试不变。
7. busy时禁用表单、取消／移除及重复提交；无效输入不妨碍明确移除整个部件。属性预览仍只读，不增加连接、租约或设备命令。

### 8.3 有限验证

| 检查 | 结果 | 证据范围 |
|---|---|---|
| Angular联合回归 | 10文件169项通过 | Inspector原3项及新增49项、标题/完整参数合同15项、真实属性父模板3项、属性页15项、整页保存5项、旧保存消费者5项；并保留布局20、预置49、三主题往返5 |
| 真实模板交互 | 通过 | 实际Angular Inspector及父页：input即时禁存、非法原文、其他合法编辑、64字节修正、失败草稿、同ID重进、换外观有效性同步、错误定位及busy；服务与导航为mock，无真实持久化 |
| Node网格合同 | 6项通过 | 普通／编辑／属性／Agent共享几何、保存坐标及正常流反馈 |
| 属性浏览器矩阵 | 432／432通过 | 23外观＋错误状态，三主题×320／375／844px×100／150%计算字号；原参数完整、48px目标、无横溢／触区重叠、焦点／details键盘开合、错误关联与JSON局部滚动 |
| 类型与完整构建 | 通过 | App `tsc --noEmit`、development完整构建、Agent运行时既有配置独立构建；仅临时输出，不覆盖发布或原生内容 |

浏览器工具使用真实SCSS、字体及源目录／分组getter，但页面为合成静态夹具，不执行Angular编辑或保存处理器；三主题代表图仅供本机视觉复核。150%计算字号不等于系统Dynamic Type，不作为原生键盘、生命周期、真实账号／设备写入或无障碍认证证据。

复现（沿用已安装工具和浏览器路径约定，不加依赖）：

```text
node --test tools/panel-layout.test.mjs
node tools/ui4-properties.browser.mjs
node node_modules/@angular/cli/bin/ng.js test app --watch=false --progress=false --include=src/app/sections/device/widget-inspector/*.spec.ts --include=src/app/sections/device/panel-editor/panel-widget-editor.page.spec.ts --include=src/app/sections/device/panel-editor/panel-widget-editor.validation.render.spec.ts --include=src/app/sections/device/panel-editor/panel-editor.properties.spec.ts --include=src/app/sections/device/device-components/device-components.properties.spec.ts --include=src/app/core/device-v2/ui4-property-contract.spec.ts --include=src/app/core/device-v2/page-layout.spec.ts --include=src/app/core/device-v2/widget-presets.spec.ts --include=src/app/core/device-v2/ui3-layout-contract.spec.ts
```

浏览器沿用`WIDGET_BROWSER_DRIVER`／`WIDGET_BROWSER_EXECUTABLE`绝对路径；可选`UI4_SCREENSHOT_DIR`只输出标注静态夹具的三主题图，不读取账号、请求或用户布局。

### 8.4 收口与下一步

UI4本批软件实施收口；下一源码批次为UI5现有自动化／任务／数据页面的分组与状态统一，继续保护确认先于刷新、CAS、Start／UNKNOWN及后台回收，不扩业务。UI7再按明确部署范围覆盖真实保存／取消、失败草稿、键盘／硬件返回、安全区和系统大字；本次软件回归不替代原生验收。

本批未部署App／服务、刷板、操作账号／授权／journal或提交推送；未扩槽、升级SDK、修改依赖、重造执行链或重复BLE循环。无关本地修改保留。

## 9. UI5 自动化、任务及数据页面

### 9.1 本批最小范围与冻结合同

先审阅真实模板、状态与既有回归，再按实体和任务分组；不照搬原型示例数据或扩展业务。共享外壳只显式引入 `workflow-surface`，复用既有 `settings-surface` 的语义token、卡片、字段和按钮；不修改旧feature mixin或全局样式。

| 页面 | 本批范围 | 不变边界 |
|---|---|---|
| 自动化列表／编辑／详情 | 一规则一卡，名称／条件／动作分组；确认、刷新、刷新失败、未确认请求分别展示；最近执行独立 | 保存确认先于刷新，旧revision禁写、pending查询／显式原请求恢复、能力引导往返草稿及后台关闭 |
| 任务列表／定时编辑／共享状态 | 一任务一卡，何时执行／执行动作／定义状态分组；容量来源、设备确认、技术耗时、UNKNOWN分层；操作正常流不遮大字字段 | 保存／启用定义／Start／到期执行不同义；CAS、原请求号与人工恢复、时间源未知、真实容量／准入及后台回收 |
| 状态历史 | 查询卡、真实结果及就地读取状态；来源与限制按需展开 | 真实状态变化与基线、服务器确认时间、不补本地变化、200显示上限、分页和只读权限 |
| 在线趋势 | 记录设置、时间窗口／筛选、曲线及归档样本分组 | 60秒选样不是固定上传、UTC接收时间、原窗口／点数边界、owner/shared与未确认写入只读恢复 |
| 云端活动记录 | 保留投递专属摘要、每条结果与来源说明，统一卡片／状态层级 | 投递／ACK不当作State或实物执行；UNKNOWN不自动重发，权限与回收不变 |

实时来源、实际频率、新鲜度与有界曲线仍由UI3已覆盖的控制页及原租约负责，不迁移入口、不新增实时连接。字段绑定、事件、disabled与确认方法逐项保留；优先仅HTML／SCSS，TaskStatus只改内联模板／样式。服务、请求、轮询、SDK、协议、自动化或任务容量均不改。

有限验证计划：原确认／CAS／UNKNOWN／后台回收回归＋新增生产模板分组与门控；共享样式边界与无新业务TS；320／375／844px浅深及100／150%计算字号、48px目标、长字段换行／焦点和安全区；App类型及完整构建。实际原生、账号持久化、真实ACK／任务执行不在本批，以UI7单列，不部署或提交推送。

### 9.2 实施与必要修正

- 新增显式opt-in `workflow.page`／`workflow.content`。前者仅负责页壳、正常流内容、共享卡片／表单／状态及局部56px页头／48px目标；后者供嵌入TaskStatus继承主题，不新建页壳、滚动或请求所有权。沿用原设置token和透明页头spacer，不改变全局、旧feature或组件／Agent主题。
- 自动化拆为逐规则卡与名称／条件／动作编辑卡；确认notice、refreshing、refreshError及pending独立，原能力引导、草稿往返、技术信息和执行说明保留。所有原60项事件／输入／双向绑定多重集保持；不改AutomationService或Client。
- 任务列表每条完整卡，不再用9～11px截断字号或整卡降透明度替代状态文字。编辑按何时执行／执行动作／定义状态分组，所有原定时字段和Start门控保留；保存／删除由固定底栏改为main正常流，防止遮挡长表单。TaskStatus只改模板和样式引用，原initialize／retry／forget／confirm方法不变，UNKNOWN核对及人工恢复动作不藏入技术details。
- 历史／趋势增加真实来源摘要，将长来源及限制按需展开而不删原文；历史保留200条上限／分页／基线，趋势保留UTC已应用窗口、输入未应用状态、owner/shared／未知写入门控和有界曲线。活动仍仅云端投递，不新增实时入口或归档能力。
- 历史值与长名称换行，日期输入使用可收缩字段，趋势复选框保留20px视觉和48px整行点击区。错误与窗口输入关联；请求确认、只读恢复及后台清理仍沿原TS。
- 浏览器捕获旧透明页头`:is/:has`图标按钮规则将刷新目标压回32px，已在局部workflow内匹配其优先级覆盖为48px，未放大其他页面。活动UNKNOWN正常文字改为可读主文字，警示色只作辅助细线；保留“结果未知”文本，不增加独立palette。

### 9.3 有限验证记录

| 检查 | 结果 | 范围与限制 |
|---|---|---|
| Angular联合回归 | 18文件363项通过，其中新增22项 | 原自动化确认先于刷新／失败保留确认、CAS／旧revision、任务查询／Start／UNKNOWN、数据范围／权限及后台清理；新增自动化8、任务6、数据8项实际生产模板分组／门控回归 |
| 共享样式／网格Node合同 | 14项通过 | 新workflow5项，原settings3、面板几何6；显式启用、复用token、无第二滚动所有权、safe-area／页头、48px、UNKNOWN不靠颜色及六页Sass编译 |
| UI5浏览器矩阵 | 216／216通过 | 9代表状态×iOS／MD×浅深×320／375／844px×100／150%计算字号；真实SCSS、已安装Ionic及原全局header：无横溢／互不重叠、日期／长字段、48px、56px页头与0／20px安全区、标题避让、底部留白、details键盘与焦点 |
| TypeScript／App完整构建 | 通过 | `tsc --noEmit -p tsconfig.app.json`及development App定向临时输出；不覆盖发布或原生内容，不打APK、不执行sync |
| 冻结源码终核 | 17项摘要一致 | 业务页TS、Automation／Timer／数据服务与模型、实时控制页TS、Agent入口、原settings和device-feature样式；保留既有dirty内容，不与Git HEAD做回滚。TaskStatus另核原类方法未改 |

回归使用真实Angular模板和原服务／Client逻辑的本地double，不访问真实账号或设备，不生成真实任务／自动化写入。浏览器用真实Ionic组件与CSS，但页面为明确标注的静态夹具，不执行Angular业务handler，也不是原生、真实ACK／State或持久化验收。150%计算字号不等于系统Dynamic Type；代表图只是视觉复核，不宣称全目录无障碍认证。

复现（不新增依赖；浏览器路径沿现有绝对路径约定）：

```text
node --test tools/workflow-surface.test.mjs tools/settings-surface.test.mjs tools/panel-layout.test.mjs
node tools/ui5-workflow.browser.mjs
node node_modules/@angular/cli/bin/ng.js test app --watch=false --progress=false --include=src/app/sections/scene/automation/*.spec.ts --include=src/app/sections/device/device-timer/*.spec.ts --include=src/app/sections/device/device-storage/*.spec.ts --include=src/app/sections/device/device-trends/*.spec.ts --include=src/app/sections/device/device-log/*.spec.ts --include=src/app/sections/device/ui5-data.render.spec.ts --include=src/app/core/services/device-v2-history.service.spec.ts --include=src/app/core/services/device-v2-periodic-history.service.spec.ts --include=src/app/core/services/device-v2-activity.service.spec.ts
```

浏览器仍通过`WIDGET_BROWSER_DRIVER`／`WIDGET_BROWSER_EXECUTABLE`指定本机已安装工具；可选`UI5_SCREENSHOT_DIR`只生成标注静态夹具的六张浅深代表图。检查服务仅临时提供已安装Ionic运行时，外部请求被拦截，结束关闭，不部署到任何实际App或服务。

### 9.4 收口与下一步

UI5已列最小范围的软件实施收口。下一源码批次按UI6审阅现有配网／分享／工具入口，继续保持部署门控与原执行链；不在UI5扩展规则、槽位、周期历史或实时协议。UI7明确部署批次后，再按差异补原生键盘／硬件返回／大字／安全区、真实保存与后台恢复等短验，不重复已通过BLE或断电循环。

本批未部署App／服务、安装APK、刷板、修改账号／授权／UNKNOWN或请求记录，未扩槽、升级SDK、改依赖、提交或推送；无关本地修改保留。

## 10. UI6 添加／配网、分享及工具入口

### 10.1 本批最小范围与冻结合同

只迁移现有入口与工作流呈现，不借本批扩展功能或部署开关。延续UI5的`workflow.page`／`workflow.content`及UI1的settings／菜单外观，不新建平行页面框架、配色或执行链。

| 家族 | 本批范围 | 必须保留 |
|---|---|---|
| 添加／配网 | guide入口、WiFi准备、BLE认领、Key创建／揭示及ESP32 BLE／SoftAP配网，共5页 | 原directAccess门控、native／安全session／canProvision条件、精确Key／密码、重新配网原身份核对及凭据失效提醒、原失败重试与离页回收 |
| 分享 | 全局管理、当前设备分享、邀请预览／接受／拒绝，共3页及原3个权限／链接弹层 | owner/shared、定向／非定向邀请、公开只读链接≠账号分享、consoleLinks／云接入门控、确认及撤权、busy／失败草稿／原token和复制流程 |
| 工具入口 | 原4分组、12项的工具首页与纯呈现图标／箭头 | 原5个可导航route与7个无route提示、muted／badge／翻译、64px主tab页头及底部tab安全区、不启用规划中功能 |

公开只读`shared-console`及Agent／组件渲染所有权冻结，不把其iframe或面板再套工作流外卡。BLE／LAN调试、OTA等工具内部不在本批改造；网关接入与其他低频业务页面亦不扩入此次范围。恒空的旧迁移组可按真实items长度隐藏空标题，不删除已有能力或开放新入口。

分组与状态改动优先仅HTML／SCSS。工具目录仅增加icon／showChevron等纯呈现metadata，不更改原route、badge、muted或分组顺序。错误、权限不足、未确认结果及重新配网后果不折叠；技术说明可按需展开。配网会话就绪、收到WiFi结果、设备云上线及最终接入成功不得合并成同一状态。

有限验证范围：实际生产模板的门控／状态／原事件、新增入口与分组回归，原配网及分享Service测试、工具路由与toast；浅深、320／375／844px、100／150%计算字号、48px热区、长链接与密钥、弹层安全区／键盘可达；类型及App完整构建。真实配网、分享写入、原生权限／键盘／系统返回留UI7，不读取账号、不部署、不刷板或提交推送。

### 10.2 实施与保留边界

- 五个添加／配网页面复用workflow页壳和设置型菜单、卡片／表单。WiFi与BLE准备步骤共享原connection-method样式；仅按真实migrationItems长度隐藏空的旧迁移分组，不改变methodItems或directAccess门控。
- BLE恢复请求、候选选择、busy、失败及ready身份分别展示。Key创建、揭示失败、RecentAuth／step-up／blocked阶段沿原处理，唯一Key可完整换行且仍默认遮蔽；示例代码只读折叠并局部滚动。输入首尾空格等精确草稿不在UI层trim或重编码。
- ESP32 BLE／SoftAP保留原两步流程、安全session与canProvision门控；设备／网络长名换行，操作目标48px。原生不可用、原设备重新配网后果和失败恢复不藏入技术说明；仅增加现有选择的aria状态与忙碌／结果呈现，不修改bootstrap、Key或WiFiProv协议。
- 分享三页统一分类、摘要、成员／邀请行和状态；收到的账号设备与公开收藏分组，接受成功但目录或权限尚待更新不被改成“接受失败”或自动再接受。公开链接风险和原owner／Console部署条件保留；完整链接可换行／选择／复制。
- 原三个权限／链接弹层显式复用token、内容样式和安全区，控制权与Console编辑权仍独立；isOpen／didDismiss／busy及确认链不变。邀请详情原本即时保存的开关仍即时保存，确认型权限弹层仍显式确认，不把两种行为混成新自动提交。
- 工具首页使用`appearance="settings"`、同级线性图标与标题关联，原4分组／12项顺序不变。5个route及7个原toast项全部保留；规划中项只隐藏导航箭头，不禁用原解释提示或开放功能。64px主tab页头、滚动mask及底部88px＋safe-area预算保留。
- 删除本批页面已替换的重复小字号、34／44px目标、单行唯一值截断及逐页旧外壳规则，不删除业务入口、参数或用户数据。复用现有共享样式，不增加UI6专属平行样式系统或依赖。

### 10.3 有限验证记录

| 检查 | 结果 | 范围与限制 |
|---|---|---|
| Angular联合回归 | 17文件199项通过，其中新增39项 | 新配网11、分享14、工具14项真实模板；原Key／BLE／ESP32恢复、分享权限／待确认／迟到结果、邀请Service／入口、菜单及工具导航合同 |
| 新测试接线核对 | 通过 | 直接变更测试字段后标记真实Angular视图，不关闭校验；ToastController按生产入口注入同一token并确认mock，图标按类集合断言，不为夹具修改生产逻辑 |
| Node有限合同 | 20项通过 | 新入口6项＋原workflow5、settings3、网格6；5路由／7规划项、已安装线性图标、七份工作流SCSS编译、工具tab几何、只读控制台／Agent边界 |
| UI6浏览器矩阵 | 240／240通过 | 10代表状态×iOS／MD×浅深×320／375／844px×100／150%计算字号；实际SCSS／本地图标字体／Ionic／全局header、48px、无横溢与互不重叠、0／20px安全区、56px普通页头与64px主tab、details键盘／焦点及静态Ionic弹层portal |
| TypeScript／App完整构建 | 通过 | `tsc --noEmit -p tsconfig.app.json`及development App定向临时输出；不安装APK、不sync、不覆盖发布目录 |
| 业务与渲染终核 | 24个冻结文件摘要一致 | 业务页TS、配网／邀请Service、路由、工具导航、既有共享样式／菜单及shared-console／Agent入口；工具metadata剔除新增icon／showChevron后与本批前完全相同。九模板原125项业务事件／输入多重集保持 |

实际模板测试使用本地double，不访问真实账号、网络或设备；原模板和原Service／Client回归仍独立保留。分享modal模板由原TemplateRef实例化，不伪称覆盖Angular＋原生Overlay生命周期。浏览器使用真实Ionic弹层present／portal与源样式，但没有App业务handler；不替代实际配网、系统权限、原生键盘／硬件返回或真实分享写入。

150%计算字号不等于系统Dynamic Type，240组与代表图也不构成全目录无障碍认证。截图均明确标注静态夹具，合成设备／网络／链接只用于布局，不读取真实Key或已保存账号。

复现（沿用已安装工具，无新增依赖）：

```text
node --test tools/ui6-entry.test.mjs tools/workflow-surface.test.mjs tools/settings-surface.test.mjs tools/panel-layout.test.mjs
node tools/ui6-entry.browser.mjs
node node_modules/@angular/cli/bin/ng.js test app --watch=false --progress=false --include=src/app/sections/guide/**/*.spec.ts --include=src/app/tools/esp32-provision/*.spec.ts --include=src/app/sections/device/share-manager/*.spec.ts --include=src/app/sections/device/device-share/*.spec.ts --include=src/app/sections/device/share-invitation/*.spec.ts --include=src/app/sections/device/ui6-sharing.render.spec.ts --include=src/app/core/services/device-v2-share-invitation.service.spec.ts --include=src/app/core/services/share-invitation-entry.spec.ts --include=src/app/home/components/tab-tools/*.spec.ts --include=src/app/core/components/menu-list/menu-list.spec.ts --include=src/app/core/device-v2/provisioning/esp32-wifiprov.spec.ts --include=src/app/core/device-v2/provisioning/capacitor-esp32-wifiprov.transport.spec.ts
```

浏览器沿`WIDGET_BROWSER_DRIVER`／`WIDGET_BROWSER_EXECUTABLE`绝对路径约定，可选`UI6_SCREENSHOT_DIR`输出三组浅深代表图。检查仅临时提供允许范围内的Ionic及本地图标资源，外部请求拦截，结束关闭；不是部署测试服务。

### 10.4 收口与下一步

UI6本批九页／入口的最小软件实施收口，不将其写成“整个App所有低频页面已完成统一”。工具内页、网关接入及公开控制台渲染保持§10.1边界；原行为／权限／部署开关不扩展。下一步进入UI7前，先按已变更页面形成原生短验清单并明确备份和部署范围，验证真实键盘／大字／系统返回／弹层、账号／草稿保留及必要恢复，不重复已通过BLE或设备断电循环。

本批未部署App或服务、安装APK、刷板、读取或更改账号／授权／UNKNOWN及请求记录，未扩槽、升级SDK、修改依赖或提交推送；所有无关本地修改保留。

## 11. UI7 云端 Android 原生短验

### 11.1 范围、备份与部署

本批以用户确认的现有云端服务为准，不将本机 Gateway、旧局域网地址或设备刷写作为 UI 验收前置。手机原有云端内测包使用 `iot.diandeng.tech.beta`／HTTPS；沿用同一包名、服务 authority、签名及既有账号原位更新，不清除数据，不改云端权限或部署开关。原普通 debug 包未安装本轮候选。

安装前已停止并完整归档手机三个现有 App 包的 CE 数据及原 APK，校验 tar 目录与 SHA-256；其中包含原账号存储、WebView／已保存布局缓存及完整持久请求记录。另通过原 App 的正常读取保留云端设备目录、UI 配置及控制台布局响应。私有归档、完整请求／响应与原生截图只放在工作区忽略的本批证据目录，不进入源码或文档。

使用现有 `production,cloud-beta`、`cap copy android` 和 `:app:assembleBeta --offline`；不 sync、不更换原生插件接线。既有内测配置只开放其原有任务／自动化入口，Direct、定向邀请、公开控制台链接等门控保持原值。三个 Gradle 接线文件与插件注册表摘要保持一致，依赖清单及锁文件不变。

### 11.2 真机发现与最小修正

| 发现 | 修正与保护边界 |
|---|---|
| 全局返回优先级9999抢在 Ionic 弹层之前 | 改为导航级1，低于当前 overlay100／menu99、高于默认导航0；保留原 pop／最小化分支，不调用下一 handler 造成二次返回 |
| 自动化页头有放弃确认，路由返回没有对应保护 | 原路由增加 canDeactivate，与页头复用单一在途确认；取消保留草稿，迟到结果仍核 generation，合法能力引导往返继续按账号 scope 保留草稿 |
| 自动化 Input／Select／Progress 仅有 Angular 代理，原生 WebView 未注册对应元素 | 将该页旧 IonicModule 换为模板实际使用的11个 standalone 组件；保留原 AlertController token、表单、权限、CAS和执行服务，不在启动入口全量注册组件 |
| 自建服务器表单的键盘自动滚动可把焦点移入透明页头下方 | 仅该页的真实滚动 viewport 下移至既有 header＋safe-area，移除重复 spacer；不改全局滚动、不增加键盘监听或设备协议 |
| 拖动禁用被标为整卡 aria-disabled，连带子编辑／预览操作被辅助技术判为禁用 | 非 layout 不挂 Sortable，进入 layout 才注册，退出释放并精确恢复库实际占用的7个可访问属性；不改排序、grid、绑定、SDK或其他 host 属性 |

### 11.3 有限验证与证据口径

- Android 真机实际320×704 CSS px，横屏704×320；系统字号从1.0调至1.5，根字号实测16→24px。工具、我的、表单、分享等代表页面的竖／横屏检查无横向溢出，顶部状态区与现有底部导航保留；长内容可滚动，不把初始屏下的内容当成丢失。
- 原生 IME 实际显示（`mInputShown=true`），视口704→430px；返回先隐藏键盘并保留精确输入。自建配置非法地址未保存，输入不清空；最终源码重装后确认焦点完整位于页头下、键盘上，不将临时CSS试验当成完成。
- 真实分享链接 alert 的非法输入保留；系统返回关闭弹层、不退底页。显示模式点选后返回，重开仍为原模式；共享权限草稿中的控制／编辑可独立选择，取消不创建邀请，重开恢复初值。深色设置及真实 portal 弹层另有原生截图，结束恢复浅色。
- 自动化真实输入／选择控件已可用：系统返回显示放弃确认、取消保留草稿，选择弹层返回只关层，确认框上再次返回只取消确认，再确认才退出；不保存或启用规则。
- 最终候选可正常进入部件属性；66字节标题原文保留、保存禁用，返回后原父布局／标题不变。layout→edit往返后真实DOM的拖动ARIA恢复原值、子编辑按钮可操作，cell位置／顺序恢复原几何，不落盘。自动化输入草稿经实际Home／返回仍保留，再通过原确认正常丢弃。
- 对一次全新的自动化只读 GET 进行客户端传输失败注入，不伪造服务响应、不改服务器；原失败／待核对提示仍可见，原刷新入口读取恢复。所有原 UNKNOWN 保留，不用新写操作制造或替换未知请求。
- 经正常设备设置入口查看任务，当前云端设备离线，显示未确认容量、离线原因及手动查询，不执行 Start、不伪称已验在线容量或任务执行。历史及已有名称按原真实读取展示；不为本轮刷板或调整准入。

| 软件检查 | 结果与范围 |
|---|---|
| 返回／自动化／属性及部署门控 | 9文件130项通过；含原确认先于刷新、草稿、能力往返、CAS、UNKNOWN合同及新增自注册验证 |
| 自建配置 | 原9项通过；原失败保留、精确Key和确认合同不变 |
| 拖动生命周期 | 新5项通过；非layout零注册、索引、释放、再次进入和原属性精确恢复；mock不冒充原生DOM证据 |
| 样式／入口／旧网格合同 | Node21项通过，新增该表单真实viewport与不重复spacer检查 |
| 匹配生产与APK构建 | production,cloud-beta及原SDK Beta链接通过，未放宽预算；已有尺寸预算／旧路径提示仍保留，不以此批扩大构建治理 |

### 11.4 收尾与未覆盖边界

最终APK已同签名原位安装，安装文件与构建文件SHA-256一致（`f402bc0abd38dd2e84b4f8e5dc6d1a190264fb4aa182a9d7c6b00b1cb2c77de3`）。正常App重新读取核对：原账号不变、已有3台设备保留；选定已保存控制台revision2的两部件layout、顺序、grid、绑定和uiConfig与安装前精确一致。17项Android权限记录不变，原账号／请求持久数据没有清除；结束再完整归档并校验内测包数据。

本批采集并私有保留301条网络请求，终核无设备／面板／任务／规则／分享的变更写入；唯一任务POST是原`catalog`只读查询，返回503离线，不算Start或任务写入。网络证据不是全手机抓包，不能替代原持久journal／UNKNOWN；二者均保留。系统font_scale=1.0、自动旋转=1、user_rotation=0已恢复原值，浅色外观恢复，临时ADB转发已移除。

本轮有限回归共144项Angular（分为130＋9＋5，新增20项）及21项Node通过；最后打包后只做上述受影响点的真机差异，不重跑已通过矩阵。最终候选保留在手机；备份、请求内容和截图未纳入Git。

iOS／其他Android机型、最大系统字号与横屏IME极小视口、真实共享账号权限矩阵、业务写入失败及全量组件目录不在这轮代表短验内。云端关闭的 Direct／定向邀请／公开链接不临时开放；本轮不做新的任务执行、设备控制ACK或BLE／断电循环。源码与有限软件／原生证据分别记录，不宣称全业务或无障碍认证已通过。未提交、推送或部署服务；无关本地修改保留。

## 12. 默认页与尺寸反馈后的修复

用户复核指出默认设备页未完整迁移、2×2规格不方正。UI0～UI7的分批最小完成记录不能代表全App视觉完成；旧规范将固定行预算当作尺寸合同也已纠正。当前覆盖矩阵、共享几何、默认首页／控制页及触控差异修复和软件证据集中在[UI页面覆盖与组件几何修复计划](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)，避免继续追加零散“全通过”记录。

首批源码与有限软件验证后，现已完成备份、匹配App更新及受影响点原生短验；详见修复计划§8。包括默认首页／控制页、合法行数、真实2×2、保存／取消、紧凑滚动及上线后的只读实时回收；并最小修复配置中心漏接Console接口。用户新增的详情当页编辑方案列于该计划§7，软件证据见§9；后续已按§10备份并更新匹配内测App，完成Android横／纵向触控拖动、轻点属性、三主题草稿应用／取消、真实整页保存／可逆属性持久化及后台返回的代表短验。账号、授权、原布局／绑定及完整journal保留，主题已恢复，未改服务或设备固件、未提交推送。低频页面、全目录真实内容、故障状态及iOS等未覆盖项继续明确保留，不宣称全App完成。

在线控制补验已按修复计划§12完成，§11保留初次离线记录。用户后续批准网络恢复后，先完整备份COM11，仅复用既有匹配WiFi候选且保留原身份／授权；同一新版App完成编辑态零命令、退出编辑后的两笔Command／ACK／新鲜State及MCU回调、后台StateInterest／实时租约释放和返回恢复。原power、三个Cloud Console内容及revision、账号、授权和完整journal保留，不把离线缓存／合成协议记录代替真机通过；不外推其他平台或全模板。

修复计划§13已补当页编辑作用域失效的可见说明、失效目录禁用及内嵌无效重读CTA，再统一组件配置中心的局部外壳／48px热区／反馈。5文件75项定向Angular、96项SCSS＋Ionic呈现检查及最终生产编译通过；未部署、提交或推送。当批列出的属性非显式关闭保护及房间两页继续结果见§14，不再作为待实施项；其余未覆盖原生／低频范围仍不能标完成。

上述未应用属性保护与房间两页现已按修复计划§14完成最小源码实施：复用Ionic关闭守卫／原确认和保存链，局部统一房间外壳、触控／焦点／状态；保留草稿、原布局绑定及Agent文档。5文件96项定向Angular、160项实际SCSS＋Ionic合成展示与最终生产编译通过；未部署或推送，不冒充原生返回／真实保存验收。后续先安排本次变化的匹配App短差异，其余低频路由及iOS／权限故障矩阵仍保留待核。

匹配App现已按修复计划§15完成新鲜备份、同签名原位更新及Android代表短验。属性系统返回／遮罩／确认自身返回、合法及66字节非法输入保留、显式×／应用、整页取消和可逆保存恢复均通过；三个Console完整布局、排序、绑定及uiConfig保留，选定Console仅revision13→14→15正常推进。配置中心及房间两页实际系统字号150%（根16→24px）、安全区和滚动可达通过；临时区域经正常UI删除，原空内容恢复、revision0→1→2。一次客户端传输失败保留名称／选择草稿，正常首页菜单进入读取200；调试冷路由早于账号恢复的观测保留为限制，不扩大启动改造。账号、权限、完整journal及偏好终核保留，系统设置恢复、私有证据归档，不操作服务或开发板、不提交推送。上述为指定变化的短差异，不重做已验控制／拖动或宣称全App完成。

冷启动限制的后续最小修正见修复计划§16：两房间页复用局部一次性身份恢复监听，仍由原身份守卫和RoomService读取；防漏事件、重复通知、迟到回调、离页和session切换，不自动重载已接受的草稿，不改变原CAS。新增41项恢复状态机、15项实际读取链回归及原13项模板共69项通过，App类型与生产编译通过；本批只改源码／测试／文档，未部署或提交推送。§15的原生结果保留，当前手机尚不包含§16修正；后续只验冷恢复差异，不重跑已通过矩阵。

§16匹配App现已按修复计划§17完成新鲜备份、同签名更新及Android短差异：真实安全存储返回被有限延迟后，两房间页自动恢复读取；等待期间离页的旧reader不追加重试；已加载名称／选择草稿在受控重走真实恢复入口后保留、不自动保存或重读。三台Console完整不变，临时区域正常删除、原空内容恢复，权限、偏好及完整journal终核保留；探针清理、无服务／固件变化、不提交推送。新增四主页面标题与发现卡片反馈另列修复计划§18：显式四主tab共用标题，保留并打磨“双列灵感＋横向产品”，修正本地分类／搜索、字号与无效入口，同步v4原型／设计文档，并纳入本批新增的底部导航透明外角反馈。§18只进行源码、图稿与有限软件验证，不混入§17已验包，不表示手机已更新；不部署或提交推送。

用户对§18图稿的产品图框、灵感比例和完整内容入口再复核后，最小发现页设计修订另见修复计划§19。仅原型重整80px方图／等距留白、2∶3与1∶2候选、单列／大字重排和真实本地“查看全部”合集，更新图库及设计规范；不改App功能源码、不部署。下一步先确认视觉候选与合集去向，再决定最小App差异，不能用§18软件通过替代用户视觉确认或把本地6条示例当成真实内容服务。

用户明确项目广场定位后，最新图稿／规则以修复计划§20为准：常规双列约1∶2，保证标题、信息性简介和独立浏览／收藏统计区域；推荐混排保留单个案例／教程标签，仅对应分类去除重复。原型示例统计与未知“—”都有明确说明，不扩统计或收藏服务；§19轻内容2∶3保留为历史。仍先确认设计与内容去向，暂不改App源码或部署。

按用户要求另补修复计划§21横向卡片对照：沿用§20完全相同的项目内容、字号、标签和示例统计，比较双列竖卡与左封面／右正文的单列横卡。仅本地图稿及规范更新，两种都保留，确认方向前不接入App。

§22响应用户对灵感合集排布的反馈：将合集从首页卡片样式中解耦，比较“首项开篇＋后续图文目录”和“全部等权目录”，保留相同6条、顺序、完整简介与只读示例统计；收敛页头和内部分类，简介恢复整行宽。首页与既有App功能源码不变，先确认合集方案及真实内容来源再实施，不扩文章详情、统计／收藏或内容服务，不部署或提交推送。

§23用户已选B纯目录、首页保留双列灵感＋横向产品条：同步默认原型与规范，历史候选不再冒充live。最小App接入抽取现有只读内容模块，增加独立lazy合集页与有效“查看全部”，复用原翻译／首页搜索及Ionic返回；目录三分类、不扩搜索／文章详情／收藏。App现有两条与原型六条明确区分，不导入虚假统计。先完成定向真实模板／路由与布局回归，不部署、不提交推送；本批范围与证据集中记录在修复计划§23，不重开全量UI或设备测试。

**§24纠正／覆盖上条导航方向：**查看全部应该切同页智能灵感分类，不是进入独立广场；卡片标签对应四个发现分类，而非案例／教程。推荐以用户新截图的横卡为准，B只保留为分类列表外观。§23独立路由仍是未部署本地修改，不能继续据其旧技术回归宣布产品收口；本批先完成原型和交互合同，下一批再定向撤去独立入口／冗余三分类，复用当前TabCommunity的五分类与搜索、共享内容及原路由，补同页切换／批次／返回状态回归。不新增内容接口、不为真实App仅两条数据硬造分页；无下一批不显示加载按钮。详见修复计划§24。

**§25进一步纠正长列表合同：**同类目录每项去掉重复分类名，推荐角标保留；有界分页替代§24追加式加载，避免将几十／上百页记录一直留在DOM及内存。复用原五分类／搜索，改变查询条件重置页码；正常分类往返恢复成功页码和位置，加载中禁止重复，失败保留旧页、原位重试目标页，成功才替换并回顶。真实接入建议12项／页、最多3页缓存；总页数／任意跳页必须有接口总量、稳定排序及随机访问能力，cursor-only只按服务能力前后翻页，不先造后端或虚假页数。

本轮只修正本地原型与规范，以真实4条示例2项／页演示两页，另显式提供百页导航布局演示；不是App或服务分页已实现。下一批App仍先撤§23错误独立入口，再接同页目录；真实两条本地内容无需硬加分页。详见修复计划§25，不部署、不提交推送。

**§26按用户授权开始App接入：**已撤独立合集入口／页面，推荐按真实类别分组，查看全部改同页切换，分类目录不重复类型；原2条内容＋1产品、翻译搜索、Ionic内容owner保留。只针对完整本地源做12项切页，多于一页才出现前后页；当前内容不足不画分页，不导入原型样例或声称远程分页已接。同步撤下当前图库中过时设计入口，另留归档及原图可恢复；定向回归和最终边界集中见修复计划§26。本批不部署、不提交推送，无关本地修改保留。

**§27原生验收状态更新：**§26“未部署”是当时阶段；现已新鲜备份账号／完整请求记录／三台已知设备布局，并同签名原位安装匹配云端新版App。Android普通、系统150%及横屏完成指定同页查看全部、去重复分类、搜索及真实非零浏览恢复；原2＋1内容和无虚假分页保持。真机另发现搜索被页头blur覆盖及横屏键盘遮挡，均以发现页局部CSS最小修正，7项Node合同及最终匹配包三条件搜索差异通过。账号、权限、原Console／ui-config、journal及系统设置终核保留，未操作服务或固件，未提交推送；云端设备列表安装前已有502单列待排，不宣称完整清单／远程分页验收。详见[修复计划§27](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)。

**§28只读定位／视觉纠偏待实施：**列表真实响应缩小到Aily身份依赖；既有Auth域名公开证书已于北京时间10月23日23:29:50到期，正常TLS校验可复现失败，与当前源码502映射一致。尚无运维登录，未取得实际Gateway逐请求cause，先核运行配置／日志再修该域名原证书管理／续期，不关闭TLS或放宽身份快照。用户指出的推荐横卡没有被取消，320px被`18.75rem`响应式回退过早改成上图下文；需局部恢复紧凑侧图，不能将§27无溢出等交互通过当视觉完全符合。分类B及真实内容不改，不造统计；本轮仅记录分析、未改生产源码／部署或推送，详情见[修复计划§28](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)。

**§28.4运行证据补齐：**已按用户授权沿原记录恢复Paramiko直接SSH，不依赖Tabby或用户手动登录。运行Gateway的实际China目标／UTC／WARN／5分钟缓存＋1小时fresh＋24小时grace已核；容器内保持TLS的目标读取明确`CERT_HAS_EXPIRED`，Nginx访问日志匹配三次真实列表502，四项服务healthy。故障已定位到上游Auth证书过期，不需要改App／列表逻辑、关闭TLS或放宽缓存。会话正常关闭，无证书／服务／数据库写操作；下一步仅确认原证书管理并备份后修复、补只读恢复，不把诊断完成写成服务已恢复。原账号、授权、布局及日志保留，不提交推送。

**§29证书故障已修复：**实际Auth主机磁盘已有有效新证，但入口仍用旧证；发现原acme.sh reload命令在sudo后含换行，先完整备份并校验，再仅规范为单行原命令、通过原管理器安装已有证书并重载必要Nginx入口。公网严格TLS、原运行Gateway及原合法账号Auth均恢复，设备列表200并保留原三台；完整账号、三份Console和ui-config精确不变，业务容器无重建。现证有效至北京时间2026年12月23日23:29:53；原每日cron、下次续期、实际reload及HTTP-01单nonce路径已核，未强制重签或冒称未来CA续期已演练。完整私有备份／请求日志保留，无App／固件／数据库写入，不提交推送。详情及有限边界见[修复计划§29](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)；§28.3推荐横卡仍待局部视觉修正。

**§30推荐横卡与产品预览源码纠偏完成：**移除两处小屏／大字容器回退，推荐始终左侧有界图／标签、右侧正文自然增长；产品保留80px方图，12px内边距／间距，完整右文不再跨到图片下方。分类B、原2篇＋1产品、翻译搜索、同页切换和位置owner保留；13项Node、38项实际Angular交互、7环境25个真实模板浏览器呈现状态及生产编译通过，并目视浅深色／小屏／大字／横屏差异。截图不是原生部署，现有手机／云端／8637原型未更新；账号、授权、布局及日志未触碰，未提交推送。有限证据和后续只做原生短差异的范围见[修复计划§30](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)。

**§31匹配App真机短验完成：**先新鲜归档原APK／完整应用数据、账号、三台设备Console／ui-config及两套journal，再冻结1762份源码并新鲜构建，1153个Web资源复制和APK全量匹配、同签名原位更新成功。320px实际系统普通／150%两组完成推荐横卡、产品完整可达、分类B、搜索和真实非零滚动恢复，12条有限记录及原生目视通过；大字按本机实测侧栏88px／标签自然换行记录，不机械套桌面模拟值。账号／权限／布局／绑定／完整journal精确保留，22条捕获HTTP均GET200，系统设置恢复、私有备份及日志保留。新版留在手机，云端及固件不动，不提交推送；旧有大字键盘态标题左缘裁切另留限制，不宣称全App视觉完成。详情见[修复计划§31](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)。

**§32搜索标题裁切已修复并真机通过：**原按钮-10px右边距让Ionic隐藏溢出工具栏在聚焦时横滚9.78px，标题随之左移，非字体或视口偏移；原生单属性A/B确认后，仅在发现页取消结束负边距，不改全局标题或接JS补偿。14项Node、7环境25状态真实Ionic焦点呈现及生产／Android完整构建通过；匹配正式包普通／系统150%搜索IME与关闭后均横滚0、标题左缘18px，目视笔画完整。横卡／产品／分类B／搜索／物理位置恢复及账号、三份布局、两套journal保持，22条请求均GET200，系统设置恢复；§31该指定遗留项收口，未提交推送，不外推其他页头或平台。详情见[修复计划§32](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)。

**§33其他三页页头有限核查已收口：**设备／我的普通动作区确认同源-10px结束边距和按钮外溢，仅在两页局部置0，保留设备编辑态44px及工具无动作标题。原包本轮普通focus未重现标题横移，不能将风险说成已复现故障。15项源码合同、24项实际模板测试、84组真实模板／Emulated／Ionic呈现通过；SCSS备份负控仅48组设备／我的普通／消息分支外溢，其余对照正常。同签名匹配包真机普通／系统150%共6状态16帧通过，标题完整、按钮完整且不横滚。账号、授权、三份布局和两套完整journal精确保留，22条请求均GET200，系统设置恢复；只变两份生产SCSS，不改业务／服务／固件，不提交推送。有限边界与证据见[修复计划§33](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)。

**§34当前剩余覆盖已重排并实施第一批：**确定剩余源码按“第三方服务＋关于 → 反馈／消息 → 工具内页／网关专项”小批收口；已过的核心页、发现、编辑／控制及页头不再重复。第一批两页复用原settings／control chrome，48px、相对字号、自然文字和分组统一，删除旧重复样式，修主保存按压低对比；原TS／服务／保存验证与协议Modal链不变。19项Angular、4项新合同、60个真实模板浏览器状态及生产编译通过，1762旧输入仅四份呈现文件变化、1153份既有部署资源不变。**未部署，手机仍§33包**；不读取或写真实账号／Key／布局／日志，不提交推送。下一部署只做两页匹配包的键盘／大字／返回短差异，准确范围见[修复计划§34](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)。

**§35两页匹配App已部署并完成Android短验：**先新鲜备份账号、三份布局、第三方原始配置、两套完整journal及完整App数据，再同签名原位更新。普通／实际系统150%完成两页显示、真实IME焦点、空值遮蔽／离页重置、返回及两份协议弹层；修本页16px焦点滚动余量及About专属协议48px关闭热区，不改保存／验证／清除或其他Doc消费者。19项Angular、5项Node及原SDK完整构建通过，最终正式包30条操作记录＋4条稳定协议读数通过。原两组Key配置均不存在，不冒称真实非空Key已验；安全键盘黑屏未绕过。账号／权限、布局、配置和完整journal精确保留，32条捕获HTTP均GET200，系统设置恢复，私有备份／日志保留，不提交推送。下一批仅按原范围处理反馈／消息，部署门控不变，详情及限制见[修复计划§35](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)。

**§36反馈／消息源码与有限软件收口：**仅两页HTML／SCSS复用已有设置表面、56px页头与48px操作，统一相对字号、分组和状态。反馈计数回正常流，窄屏类型可单列，原草稿／字段／校验／partial接收语义不变；消息时间独立下一行、标题换行、摘要两行、删除独立48px列，原部署门控／权限／cursor／会话隔离不改。新增16项实际模板、原五文件43项、5项Node及144个浏览器呈现状态通过，类型检查和生产Web编译通过；多行框按真实光标行判断，未保留固定高度或JS滚动补偿。全部行为使用本地double，无真实反馈、已读或删除操作；不触碰账号／授权／布局／完整日志。**未部署，手机仍§35包**，不提交推送；工具家族及消息深链既有loading边界另批处理，准确范围见[修复计划§36](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)。

**§37反馈页匹配App已部署并完成Android短验：**先新鲜备份账号、三份布局、原始反馈草稿、完整App数据及两套journal，原草稿键不存在；冻结1764份输入、1153份APK资源核对后同签名原位更新。普通／实际150%共24条指定记录，三字段真实IME焦点、返回、重进和进程重启后的临时本机草稿恢复通过，结束销毁反馈实例后精确还原原键缺失。大字镜像二次缩放仅修测试器并核排版等价，不为误判改生产；App源码无新增修正。账号／授权／布局／完整journal／第三方配置和系统设置均保留，22条捕获HTTP均GET200，反馈／消息接口0；消息门控保持关闭。新版留在手机，不提交推送，准确边界见[修复计划§37](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)。

**§38工具／网关有限软件收口：**本批只处理LAN发现、BLE OTA、WiFi OTA和网关接入四页，复用既有设置表面／control chrome；统一分组、48px热区、相对字号、完整状态与浅深色。两OTA共用局部mixin，删除被替代的全局旧段；原业务TS、权限、门控、忙时禁入、取消及恢复链不动。新增33项实际模板、原16项、Node5项及132个浏览器状态通过，类型检查及production＋cloud-beta完整Web编译通过；构建预算warning包括本批4页局部样式，不放宽预算或升级依赖。所有扫描／认领／OTA／协议交互仅本地桩，真实操作0，源前1960份输入终核保留无关修改。BLE调试、共享控制台、设备更新继续独立限定，不将4页代表验证称为整个工具家族完成。**未部署，手机仍§37包**，未提交推送，准确边界与后续见[修复计划§38](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)。

**§39 App Git发布整理：**按用户新授权仅整理当前i3w-dev-v2的272项必要源码／测试／四份UI文档，46项地图／定位／本机配置等修改保留本地，混合API只提交ACTIVITY必要接线；依赖闭包在隔离树验证。925项Angular、56项Node、132个呈现状态、类型检查、模板／Agent及production＋cloud-beta完整构建通过，未升级依赖或部署。仅修UI6陈旧class合同，不改生产；账号、授权、布局、UNKNOWN及完整日志不触碰，私有备份与产物不纳入Git。Git发布不改变§38的原生验收边界；远端成功以实际提交核对为准，范围详见[修复计划§39](APP_UI_GEOMETRY_AND_COVERAGE_REPAIR_PLAN.md)。
