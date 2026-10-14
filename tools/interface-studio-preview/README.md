# 界面工作室交互验收

运行 `node tools/interface-studio-preview/serve.mjs`，打开 http://127.0.0.1:4301/device-manager/studio-fixture/uic 。

该独立入口复用正式工作室、设备页面和经典编辑器，在临时 Angular 工作目录中运行；不修改已有 4200 开发服务，不绕过正式应用登录。页脚标明模拟设备 / AI；设备和保存使用内存夹具，生成经正式 HttpClient、鉴权拦截器和 Gateway 处理器的本地 HTTP 链路，模型 SSE 响应及 Gateway 身份为测试夹具。切换主题按钮仅用于验收，正式应用不包含它。

可检查：自动适配三种密度 → 应用 → 实际 DeviceV2 布局；AI 输入 → 生成中 → 预览 → 应用；经典编辑器 → 添加 / 拖动 / 修改组件 → 保存。刷新页面重置夹具。手机断点 320/390 px，桌面断点 1024 px。

服务端模型调用、生产账号和实际硬件不属于该夹具的验证范围。服务端接口配置见相邻服务仓库 `docs/interface-studio.md`。

另可显式开启真实模型模式：`STUDIO_QA_LIVE_MODEL=1 STUDIO_QA_PORT=4303 node tools/interface-studio-preview/serve.mjs`。只由本地 Node Gateway 读取相邻服务仓库根目录 `.env`，密钥不会打包到前端；页脚改为“模拟设备 / 真实 deepseek-flash”，并隐藏模拟模型场景选择。设备、身份与保存仍使用测试夹具，真实模型模式不能代表生产账号/数据库/硬件验收。

## 定向回归

```sh
npx ng test --watch=false --ts-config=tools/interface-studio-preview/tsconfig.spec.json --include='src/app/sections/device/device-uic/*.spec.ts' --include='src/app/core/services/device-bbp2-state-bridge.spec.ts' --include='src/app/device/device.page.spec.ts' --include='src/app/core/device-v2/page-layout.spec.ts' --include='src/app/device/layouter2/layouter2-save.spec.ts'
npx ng build --configuration local --progress=false
```

2026-09-21：上述 38 项前端测试、相邻 Gateway 仓库 10 项接口测试（包含 PostgreSQL 迁移与持久化）及构建通过。浏览器使用本夹具完成自动适配/AI 预览与应用、经典组件新增/实际拖拽/保存退出编辑、320/390/1024 px 和深浅主题检查。

这是定向验证。默认全量测试编译仍受已有 BLE 测试导入问题阻塞：`ble-direct/session.spec.ts` 引用了未导出的 `BleDirectFrameChannel` 和 `BleDirectProtocolError`。

## 2026-09-29 风格选择

AI 生成入口新增清新简约、深色科技、温暖家居三种风格示意，点击切换本地预览和默认密度。需求可留空，生成服务会接收对应风格与默认提示词；用户可追加需求或调整密度。切换风格会清除上一风格的生成结果。

正式 AI 技能在相邻服务仓库 `services/gateway/src/skills/device-interface/SKILL.md`。Gateway 构建会复制运行时技能资源；前后端需一起升级。BBP/2 布局通过可选 `style` 字段持久化，经典布局使用 `config.interfaceStyle`，未选择风格的旧布局保持原样。

本次验证：27 项前端定向测试、11 项 Gateway 测试、PageLayout 服务检查、前后端构建及技能校验通过。PostgreSQL 集成测试因未提供专用测试数据库而跳过。浏览器夹具验证了三种风格切换、空需求生成、生成期间禁用选择、切换后旧结果失效、家居风格应用到正式 DeviceV2 组件，并检查 320/390px 手机和 1280px 桌面、深浅主题。布局序列化及能力迁移保留风格由测试覆盖，夹具刷新仍重置模拟设备。

扩展运行 `device-v2.page.spec.ts` 有 10 项失败和 7 个异步异常；旧测试桩缺少现有运行逻辑要求的 `openConnection` 等连接接口。本次未修改该测试文件或连接逻辑，不能把定向通过视为全量回归通过。

目标 4201 页面在当前浏览器会话中需要登录；现有本地 Gateway 未配置 AI URL/model/key，且容器尚未部署本次构建。真实账号、模型调用、数据库持久化与硬件指令未做验收。夹具生成仅用于 UI 流程验证。

## 2026-09-29 流式生成与实时画布

正式生成支持逐组件流式预览：收到完整且通过校验的组件后立即更新画布，完成前不能应用。开始生成会定位到预览；可以取消生成，取消/超时/断流/无效响应会恢复上一次完整结果。离页、销毁、切换设备或能力失效会终止请求，迟到结果不会覆盖当前界面。生成中和生成后均保持实时状态数值更新，滑块位置按实际能力上下限计算，输入组件显示当前值。

测试入口依赖相邻 `aily-blinker-services` 源码，不需要模型密钥。页脚“模拟模型场景”可选择正常流式、中途断流、服务未配置。不会改变正式鉴权入口。`STUDIO_QA_PORT=4303 node tools/interface-studio-preview/serve.mjs` 可避开已有 4301 服务；此工具复制源码到临时目录，后续源文件修改需同步副本或重新启动验收入口。模型只模拟编排，不代表真实 AI 理解质量。

本轮命令：

```sh
npx ng test --watch=false --ts-config=tools/interface-studio-preview/tsconfig.spec.json --include='src/app/sections/device/device-uic/*.spec.ts' --include='src/app/core/injectable/server.interceptor.spec.ts' --include='src/app/core/device-v2/page-layout.spec.ts'
npx ng build --configuration local --progress=false
# 相邻 aily-blinker-services 仓库
npm run test:interface-studio --workspace=services/gateway
npm run build --workspace=services/gateway
```

结果：65 项前端定向测试、17 项 Gateway 测试及前后端构建通过。覆盖分片/UTF-8/转义字符、未知或重复组件、上游截断、取消清理并发、认证错误分片、55 秒总超时、旧 JSON 响应兼容、能力失效、实时值更新及保存流程。PostgreSQL 集成测试 1 项未提供专用测试数据库而跳过，本次流式协议不涉及数据库变更。

浏览器：6 个能力包含全部 5 种支持类型（开关/按钮/滑块/输入/数值）。实测生成完成之前画布先显示 1 个、再显示 3 个组件，期间应用禁用；完成后应用成功，正式 DeviceV2 页显示保存的顺序与风格。验证了三种风格、默认/自定义需求、首次取消、重新生成时取消、断流恢复、未配置提示，及 1280/390/320 px、深浅主题、手机无横向溢出。截图见 [evidence](./evidence/)。

验收边界：4201 正式入口需要登录，本地服务 `.env` 未配置三个模型变量，真实模型、生产账号、数据库重进恢复及硬件指令尚未验收。设备页应用后有既有 Ionic `readDimensions / offsetHeight` 异常；已在原 4301 副本“自动适配 → 应用”复现同样错误，画布和设备页仍可渲染。它不是本次生成引入的问题，本记录不表示全量运行零异常。

## 2026-09-29 DeepSeek 真实模型补充验收

用户配置密钥后，OpenCode Go `deepseek-flash` 的真实生成与浏览器实时画布验证通过。正式 Gateway 已修复实测遇到的推理流体积、JSON-mode 顶层元数据和容器代理问题，并完成本地 Docker 重建更新及容器内真实调用，HTTP 200，六次组件预览，14.208 秒完整结束，健康检查正常。

真实模型页面验证复用模拟设备，完成简约/科技两种风格、中文标题及温度置顶；科技风格从 1 至 6 个组件递增（首个 5.615 秒、完成 6.250 秒），生成期间应用禁用，取消恢复旧结果，完成后可应用到正式 DeviceV2 渲染组件。截图和原始 DOM 时间序列见 [evidence/README.md](./evidence/README.md)。相邻 Gateway 最终 22 项测试通过、1 项数据库项跳过；本轮未修改正式前端组件，前述 65 项前端回归仍是对应实现的测试记录。

页面身份、设备和保存为内存夹具，不能证明真实设备数据库持久化。正式 4201 页面仍停留在登录页，真实账号保存/重进恢复与硬件指令待登录后验收。

## 2026-09-29 生成按钮灰色且组件为 0 项

0 项时旧按钮会被直接禁用；进入 BBP/2 页面后还会等待设备连接完成，导致已识别的组件也可能一直不能生成。现在按钮在 0 项时可点击并就地说明缺少设备能力，支持重新读取；经典设备提供打开编辑器的入口。连接未就绪但已识别组件时可以生成；能力从 0 项恢复后会重新读取布局版本，再允许应用。生成仍仅使用设备实际已识别的组件。

本地 4303 夹具复现并实际点击了 0 项状态，按钮已启用、原因可见；模拟连接永不就绪时，6 项组件仍可发起并取消生成。证据见 [generation-zero-capabilities.png](./evidence/generation-zero-capabilities.png)。最终 69 项前端定向测试与本地构建通过。正式 4201 页面需要登录，具体设备为何上报 0 项仍需按设备 ID 排查。
