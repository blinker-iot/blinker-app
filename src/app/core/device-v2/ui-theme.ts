export const UI_THEME_IDS = ['natural', 'electronic', 'dark'] as const;
export type UiTheme = typeof UI_THEME_IDS[number];

export const UI_THEMES: readonly {
  id: UiTheme; name: string; caption: string; description: string;
  density: 'balanced' | 'compact' | 'focus'; prompt: string;
}[] = [
  { id: 'natural', name: '自然', caption: '米家浅色 · 圆润磁贴',
    description: '白色卡片与大圆角，常用控制做成磁贴，激活即点亮。', density: 'balanced',
    prompt: '设计一个自然清爽的控制中心，常用开关做成磁贴置顶，数据成对排列，保留所有可用组件。' },
  { id: 'electronic', name: '电子', caption: 'OLED 点阵 · 数据优先',
    description: '纯黑屏幕上的点阵数字与红色信号，像一块精密的仪表。', density: 'compact',
    prompt: '设计一个 OLED 点阵风格的仪表面板，关键数据用仪表和大数字展示，控制集中在后，保留所有可用组件。' },
  { id: 'dark', name: '暗夜', caption: '米家深色 · 低光舒适',
    description: '深色卡片与柔和对比，夜间使用不刺眼，大块操作清晰可及。', density: 'focus',
    prompt: '设计一个深色低光的控制中心，常用控制放大并置顶，其次环境数据与调节，保留所有可用组件。' },
];

// Older layouts, layouter configs and local preferences stored retired theme ids.
const LEGACY_THEMES: Readonly<Record<string, UiTheme>> = {
  minimal: 'natural', warm: 'natural', technical: 'electronic',
  clear: 'natural', sand: 'natural', graphite: 'dark',
};

export function normalizeUiTheme(value: unknown): UiTheme | undefined {
  if (typeof value !== 'string') return undefined;
  return (UI_THEME_IDS as readonly string[]).includes(value) ? value as UiTheme : LEGACY_THEMES[value];
}
