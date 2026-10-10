# Device 主题与组件回归

本目录的测试配置只包含设备主题与本次组件回归，避免现有 BLE spec 的缺失导出阻断定向验证。

```sh
npx ng test --watch=false --ts-config=tools/device-theme-check/tsconfig.spec.json --include='src/app/device/device-theme.spec.ts' --include='src/app/device/device.page.spec.ts' --include='src/app/device/layouter2/widgets/widget-input/widget-input.spec.ts' --include='src/app/device/layouter2/widgets/widget-range/widget-range.spec.ts' --include='src/app/device/layouter2/widgets/widget-tab/widget-tab.component.spec.ts' --include='src/app/device/layouter2/layouter2-save.spec.ts' --include='src/app/core/charts/line-chart-area/line-chart-area.component.spec.ts'
npx ng build --configuration local --progress=false
```

2026-09-29：24 项测试通过，本地构建通过。定向 ESLint 仍报告既有的 `line-chart-area` / `widget-input` 选择器缺少 app 前缀（未更改这些公共选择器），以及图表生命周期接口警告。全量测试配置仍有已有的 `BleDirectFrameChannel` / `BleDirectProtocolError` 导入错误。

浏览器使用项目现有 Interface Studio 隔离入口的临时副本（4302），复用正式 DevicePage、Layouter2 与组件，注入模拟设备。检查了 320/390 px 对齐、三套主题、刷新恢复、清空主题偏好、输入与发送按钮、滑块上限、选项状态、编辑/保存入口。也验证了已保存 technical 风格的面板可由个人主题覆盖，并可恢复原风格。主题按设备保存在当前浏览器，不修改全局主题或已保存的设备布局。

目标 localhost:4201 的实际设备页返回登录界面，未获得已登录会话，因此本次没有对该账号的实际布局或硬件指令完成验收；模拟入口不能替代这些验证。
