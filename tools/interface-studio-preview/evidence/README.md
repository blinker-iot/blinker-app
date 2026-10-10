# 流式 AI 界面验证 · 2026-09-29

入口：`http://127.0.0.1:4303/device-manager/studio-fixture/uic`。同源码正式页面、正式生成服务/拦截器/Gateway，使用模拟设备、模型响应、身份与内存保存。不是生产模型或硬件验收。

- `streaming-desktop.png`：1280×720，模型尚未完成，已预览 1 个组件，应用禁用。
- `streaming-desktop-next.png`：同次生成，组件增至 3 个，科技风格保持一致。
- `applied-desktop.png`：完成后应用到正式 DeviceV2 页，全部 5 种控件类型保留。
- `streaming-mobile-390.png`：390×844，家居风格，自定义需求温度置顶，首个组件已显示。
- `recovered-mobile-390.png`：390×844，浅色主题，断流后恢复完整草稿（滑块/输入预览细节最终复核见下一张）。
- `streaming-mobile-320.png`：320×740，最终代码浅色主题，生成期间即时画布。
- `completed-mobile-320.png`：同次生成完成，6 个组件、输入当前值正常；DOM 断言滑块填充为真实 65%，应用启用。
- `frontend-tests.txt` / `gateway-tests.txt`：65 / 17 项通过，数据库集成 1 项因缺少 TEST_DATABASE_URL 跳过。

原 4301 副本与新版应用设备页时均出现已有 Ionic readDimensions 的 offsetHeight 异常；生成页最终运行日志无新增错误。以上为配置真实模型之前的验证记录。

## OpenCode Go / DeepSeek 真实模型

使用 `deepseek-flash`、正式 Gateway 生成处理器、正式页面与 HTTP 生成服务。身份、设备和保存仍使用模拟数据；API key 只由本地 Node 服务从相邻服务仓库的 `.env` 读取。

- `deepseek-completed.png`：清新简约真实生成成功，自定义需求温度置顶、全部六个组件保留。
- `deepseek-technical-streaming.png`：深色科技真实生成中，首个温度组件已渲染。
- `deepseek-technical-completed.png`：同次生成完成，六个组件全部显示。
- `deepseek-technical-timeline.json`：浏览器实际 DOM 时间序列，点击后 5.615 秒显示 1 个组件，随后观测到 2 / 3 / 4 / 5 个，6.250 秒完成全部 6 个。期间应用按钮禁用，完成才启用。
- `deepseek-browser-timeline.json`：首次清新简约生成只捕获初始和最终 DOM，不能作为中途帧证据。
- `deepseek-cancelled.png`：对已完成结果点击重新生成，再取消，上一次完整布局及可应用状态恢复。
- `deepseek-applied.png`：将真实结果应用到正式 DeviceV2 渲染组件，温湿度、开关、按钮、滑块、文本输入完整保留。

实测修复了推理/SSE 封装超出原体积上限，以及响应偶尔附带 `type: json_object` 被最终结构校验拒绝的问题。生产账号登录、实际设备数据库保存/重进恢复和硬件操作仍不在上述夹具证据范围内。

实际运行的 Docker Gateway 已重建并配置模型请求代理，健康状态 healthy；容器中以真实环境变量调用其编译后处理器也通过：HTTP 200，首个预览 13.641 秒，六个预览事件，14.208 秒完成。Gateway 最终 22 项定向回归通过，数据库项 1 项因未配置专用测试数据库跳过。

## 生成按钮 0 项问题

用户反馈“生成按钮灰色，可用组件 0 项”。旧按钮在 0 项时被直接禁用；V2 页面进入时还会等待设备连接完成，导致已有已接受能力的设备在连接等待期间也无法生成。当前按钮在 0 项时可点击，旁边说明真实前提并提供“重新读取”；经典设备可打开编辑器配置组件。没有已接受能力时不会伪造设备控件或向模型发送空列表。

`generation-zero-capabilities.png` 是最终 0 项页面点击按钮后的截图：按钮可点击，原因就地可见。浏览器另以从不完成的设备连接模拟等待：已有 6 项能力时按钮可立即点击、进入生成并取消。单元测试覆盖等待连接、布局读取与生成并行、从 0 项恢复后的应用状态和缺少能力的提示。最终 22 项页面工作流测试通过，前端本地构建通过。正式 4201 页面当前需要登录，未在实际账号/设备上取得能力恢复或保存后读证据。
