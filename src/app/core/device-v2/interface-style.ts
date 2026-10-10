export const INTERFACE_STYLE_IDS = ['minimal', 'technical', 'warm'] as const;
export type InterfaceStyle = typeof INTERFACE_STYLE_IDS[number];

export const INTERFACE_STYLES: readonly {
  id: InterfaceStyle; name: string; caption: string; description: string;
  density: 'balanced' | 'compact' | 'focus'; prompt: string;
}[] = [
  { id: 'minimal', name: '清新简约', caption: '轻盈留白 · 主次分明',
    description: '主要控制在上，数据成对排列，让每一次操作都清晰。', density: 'balanced',
    prompt: '设计一个清新简约的日常控制面板，主控制置顶，监测数据成对排列，保留所有可用组件。' },
  { id: 'technical', name: '深色科技', caption: '数据优先 · 紧凑有序',
    description: '先看关键数据，再集中控制，适合设备监测与调试。', density: 'compact',
    prompt: '设计一个深色科技监测面板，数据优先展示，同类控制集中排列，保留所有可用组件。' },
  { id: 'warm', name: '温暖家居', caption: '柔和暖色 · 大块操作',
    description: '常用操作更醒目，大卡片纵向排列，家人也能轻松使用。', density: 'focus',
    prompt: '设计一个温暖家居控制面板，常用开关置顶并突出，大卡片纵向排列，保留所有可用组件。' },
];
