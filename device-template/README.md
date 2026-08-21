# device-template

可嵌入 Blinker 设备页的独立 Vite + TypeScript 界面模板。项目通过 Penpal `WindowMessenger` 与宿主 `Customizer` 通信，不直接访问宿主窗口或设备服务。

## 开发与构建

从仓库根目录执行：

```bash
npm run device-template:dev
npm run device-template:build
npm run device-template:test
```

主应用的 `prestart`、`prebuild`、`prewatch` 和 `pretest` 会自动构建该项目。构建产物位于 `device-template/dist`，Angular 会把它复制到 `www/device-template`。

`device-template:test` 会执行生成后的 JavaScript，并用真实 Penpal 双向方法完成嵌入握手测试。开发模式还可以直接访问 `/device/preview-air-quality`，该预览设备固定使用 `Customizer` 加载此模板。

## Penpal 协议

通道名为 `blinker-device-ui-v1`。模板向宿主暴露：

- `setHostContext(context)`：接收完整设备上下文。
- `updateDevice(update)`：接收实时设备数据。
- `updateViewport(viewport)`：接收设备页可视区域信息。
- `ping()`：连接探测。

宿主向模板暴露：

- `getHostContext()`：读取最新设备快照。
- `childReady(payload)` / `childError(payload)`：上报 UI 状态。
- `sendDeviceCommand(command)`：发送 JSON 设备指令。
- `getHistory(request)`：读取指定数据键的历史数据。

设备快照仅包含界面所需的白名单字段，不包含 broker、authKey、storage、RxJS Subject 或历史缓存。

## 安全边界

仓库内置模板与宿主同源，并被视为受信任代码。若后续要直接运行 AI 生成或其他不受信任的界面代码，应把它部署到独立 HTTPS 源，再通过 `Customizer?<url>` 加载；不要把不受信任代码写入当前同源模板目录。
