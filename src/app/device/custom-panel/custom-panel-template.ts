export const CUSTOM_PANEL_TEMPLATE = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>自定义控制面板</title>
  <!-- 根面板的边距和最大宽度由运行时统一提供，可自由添加内部布局与普通 HTML 样式。 -->
</head>
<body>
  <main class="panel" aria-label="设备控制面板">
    <!-- 在这里放置原子组件；field 使用设备提供的真实字段 key。 -->
    <!-- 省略 preset/options/span/rows 即继承组件库默认配置。 -->
    <!-- <blinker-number field="字段key" label="名称"></blinker-number> -->
  </main>
</body>
</html>`;
