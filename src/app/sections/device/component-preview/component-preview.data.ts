import type { DeviceUiEndpoint, DeviceUiValue } from '../../../core/device-v2/device-ui.port';
import type { HistoryPoint } from '../../../core/device-v2/endpoint-history';
import { PageLayoutWidget, reflowPageWidgets } from '../../../core/device-v2/page-layout';
import type { PageWidgetOptions, PageWidgetType } from '../../../core/device-v2/page-widget';
import type { PanelCard } from '../../../device/v2/panel/page-layout-panel';

// Demo catalogue for the component library page: one card per variant, with
// endpoints shaped like real devices. Nothing here talks to a device.

interface Demo {
  type: PageWidgetType;
  variant: string;
  title: string;
  span: number;
  rows: number;
  field: Partial<DeviceUiEndpoint>;
  value: DeviceUiValue;
  options?: PageWidgetOptions;
  // Readings that drift every tick and keep a synthetic history.
  live?: { base: number; swing: number };
}

export interface DemoSection {
  id: string;
  title: string;
  english: string;
  cards: PanelCard[];
}

const MODES = ['制冷', '制热', '除湿', '送风', '自动'];
const MODE_ICONS = '制冷:snow,制热:flame,除湿:drop,送风:wind,自动:auto';

const SECTIONS: { id: string; title: string; english: string; demos: Demo[] }[] = [
  {
    id: 'switch', title: '开关', english: 'Switch', demos: [
      { type: 'switch', variant: 'tile', title: '客厅主灯', span: 2, rows: 2, field: {}, value: true, options: { icon: 'bulb', tone: 'orange' } },
      { type: 'switch', variant: 'tile', title: '加湿器', span: 2, rows: 2, field: {}, value: true, options: { icon: 'drop', tone: 'teal', activeStyle: 'tint', corner: 'chevron' } },
      { type: 'switch', variant: 'power', title: '空调', span: 2, rows: 2, field: {}, value: false, options: { tone: 'blue' } },
      { type: 'switch', variant: 'lock', title: '入户门锁', span: 2, rows: 2, field: {}, value: true, options: { tone: 'green', confirm: true } },
      { type: 'switch', variant: 'toggle', title: '夜灯模式', span: 4, rows: 1, field: {}, value: true, options: { icon: 'moon', tone: 'purple', caption: '22:00 后自动降低亮度' } },
      { type: 'switch', variant: 'entity', title: '会议模式', span: 4, rows: 1, field: {}, value: true, options: { icon: 'tv', tone: 'orange' } },
      { type: 'switch', variant: 'segment', title: '童锁', span: 4, rows: 1, field: {}, value: false, options: { icon: 'lock' } },
      { type: 'switch', variant: 'check', title: '离家自动关闭', span: 4, rows: 1, field: {}, value: true },
      { type: 'switch', variant: 'chip', title: '新风', span: 2, rows: 1, field: {}, value: true, options: { icon: 'wind', tone: 'teal' } },
      { type: 'switch', variant: 'slide', title: '车库门', span: 6, rows: 1, field: {}, value: false, options: { icon: 'door', onText: '已打开', offText: '已关闭' } },
    ],
  },
  {
    id: 'button', title: '按钮', english: 'Button', demos: [
      { type: 'button', variant: 'scene', title: '回家', span: 2, rows: 2, field: {}, value: null, options: { icon: 'home', tone: 'teal', caption: '灯光 · 空调 · 窗帘' } },
      { type: 'button', variant: 'scene', title: '离家', span: 2, rows: 2, field: {}, value: null, options: { icon: 'door', tone: 'blue' } },
      { type: 'button', variant: 'tile', title: '一键关灯', span: 2, rows: 2, field: {}, value: null, options: { icon: 'bulb', tone: 'orange', showCount: true } },
      { type: 'button', variant: 'hold', title: '恢复出厂', span: 2, rows: 2, field: {}, value: null, options: { tone: 'red', holdMs: 1500, doneText: '已重置' } },
      { type: 'button', variant: 'pill', title: '寻找设备', span: 4, rows: 1, field: {}, value: null, options: { icon: 'speaker', actionText: '响铃', confirm: true } },
      { type: 'button', variant: 'icon', title: '播放', span: 2, rows: 2, field: {}, value: null, options: { icon: 'play', tone: 'purple' } },
      { type: 'button', variant: 'keycap', title: '开门', span: 2, rows: 2, field: {}, value: null, options: { icon: 'door', actionText: 'OPEN' } },
    ],
  },
  {
    id: 'slider', title: '调节', english: 'Adjust', demos: [
      { type: 'slider', variant: 'fill', title: '亮度', span: 2, rows: 3, field: { minimum: 1, maximum: 100, unit: '%' }, value: 62, options: { icon: 'sun', tone: 'orange', orientation: 'vertical' } },
      { type: 'slider', variant: 'dial', title: '目标温度', span: 4, rows: 4, field: { valueType: 'number', minimum: 16, maximum: 30, step: 0.5, unit: '℃' }, value: 24.5, options: { icon: 'snow', tone: 'blue', caption: '制冷 · 自动风', ticks: 15 } },
      { type: 'slider', variant: 'knob', title: '音量', span: 2, rows: 3, field: { minimum: 0, maximum: 100 }, value: 40, options: { tone: 'purple' } },
      { type: 'slider', variant: 'fill', title: '灯带亮度', span: 4, rows: 1, field: { minimum: 0, maximum: 100, unit: '%' }, value: 48, options: { icon: 'bulb', fill: 'gradient', ticks: 5 } },
      { type: 'slider', variant: 'entity', title: '射灯', span: 4, rows: 2, field: { minimum: 0, maximum: 100, unit: '%' }, value: 49, options: { icon: 'bulb', tone: 'orange' } },
      { type: 'slider', variant: 'gradient', title: '色温', span: 4, rows: 2, field: { minimum: 2700, maximum: 6500, step: 100, unit: 'K' }, value: 4000, options: { icon: 'sun', ticks: 3 } },
      { type: 'slider', variant: 'bar', title: '灵敏度', span: 4, rows: 1, field: { minimum: 0, maximum: 10 }, value: 6, options: { ticks: 11 } },
      { type: 'slider', variant: 'steps', title: '风速', span: 4, rows: 2, field: { minimum: 0, maximum: 4 }, value: 2, options: { icon: 'fan', tone: 'teal', labels: '关,静音,低,中,强劲', allowOff: true } },
      { type: 'slider', variant: 'stepper', title: '目标湿度', span: 4, rows: 2, field: { minimum: 30, maximum: 80, step: 5, unit: '%' }, value: 55, options: { icon: 'drop', layout: 'inline', longPress: true, showRange: true } },
      { type: 'slider', variant: 'curtain', title: '客厅窗帘', span: 4, rows: 3, field: { minimum: 0, maximum: 100, unit: '%' }, value: 65, options: { icon: 'curtain', tone: 'purple' } },
      { type: 'slider', variant: 'ruler', title: '桌面高度', span: 4, rows: 2, field: { minimum: 60, maximum: 120, unit: 'cm' }, value: 72, options: { icon: 'gauge' } },
      { type: 'slider', variant: 'timer', title: '定时关闭', span: 4, rows: 2, field: { minimum: 0, maximum: 7200, step: 60 }, value: 0, options: { presets: '15,30,60,120', tone: 'purple' } },
    ],
  },
  {
    id: 'select', title: '选择', english: 'Select', demos: [
      { type: 'select', variant: 'tiles', title: '空调模式', span: 4, rows: 2, field: { valueType: 'text', choices: MODES }, value: '制冷', options: { icon: 'snow', choiceIcons: MODE_ICONS } },
      { type: 'select', variant: 'segment', title: '风向', span: 4, rows: 2, field: { valueType: 'text', choices: ['上下', '左右', '固定'] }, value: '上下', options: { icon: 'wind' } },
      { type: 'select', variant: 'pills', title: '场景', span: 4, rows: 2, field: { valueType: 'text', choices: ['阅读', '观影', '休息', '派对'] }, value: '观影', options: { tone: 'purple' } },
      { type: 'select', variant: 'list', title: '睡眠曲线', span: 4, rows: 3, field: { valueType: 'text', choices: ['标准', '舒适', '节能'] }, value: '舒适' },
      { type: 'select', variant: 'wheel', title: '音效', span: 4, rows: 3, field: { valueType: 'text', choices: ['流行', '摇滚', '古典', '爵士', '人声', '低音'] }, value: '古典' },
      { type: 'select', variant: 'menu', title: '工作模式', span: 4, rows: 1, field: { valueType: 'text', choices: MODES }, value: '自动', options: { icon: 'auto' } },
    ],
  },
  {
    id: 'input', title: '输入', english: 'Input', demos: [
      { type: 'input', variant: 'field', title: '屏幕文字', span: 4, rows: 2, field: { valueType: 'text', maxLength: 24 }, value: 'HELLO 480', options: { icon: 'tv', placeholder: '输入要显示的文字', showCounter: true } },
      { type: 'input', variant: 'note', title: '留言', span: 4, rows: 3, field: { valueType: 'text', maxLength: 80 }, value: '', options: { placeholder: '给家人留一句话' } },
      { type: 'input', variant: 'keypad', title: '门锁临时密码', span: 4, rows: 5, field: { valueType: 'integer', minimum: 0, maximum: 999999 }, value: 2468, options: { icon: 'lock', actionText: '下发' } },
    ],
  },
  {
    id: 'value', title: '显示', english: 'Display', demos: [
      { type: 'value', variant: 'metric', title: '室内温度', span: 2, rows: 2, field: { valueType: 'number', unit: '℃' }, value: 24.6, options: { icon: 'thermo', tone: 'orange', decimals: 1, caption: '客厅 · 实时', showDelta: true, warnAbove: 30 }, live: { base: 24.6, swing: 0.4 } },
      { type: 'value', variant: 'ring', title: '滤芯寿命', span: 2, rows: 2, field: { minimum: 0, maximum: 100, unit: '%' }, value: 76, options: { icon: 'filter', tone: 'green', warnBelow: 20 } },
      { type: 'value', variant: 'gauge', title: 'CPU', span: 2, rows: 2, field: { minimum: 0, maximum: 100, unit: '%' }, value: 42, options: { ticks: 11, warnAbove: 85 }, live: { base: 42, swing: 18 } },
      { type: 'value', variant: 'matrix', title: '功率', span: 2, rows: 2, field: { unit: 'W' }, value: 480, options: { tone: 'red' }, live: { base: 480, swing: 40 } },
      { type: 'value', variant: 'trend', title: '湿度', span: 4, rows: 2, field: { valueType: 'number', unit: '%' }, value: 57, options: { icon: 'drop', tone: 'teal', smooth: true, showRange: true }, live: { base: 57, swing: 6 } },
      { type: 'value', variant: 'bars', title: '用电', span: 4, rows: 2, field: { valueType: 'number', unit: 'kWh' }, value: 1.8, options: { icon: 'bolt', decimals: 1, showAxis: true }, live: { base: 1.6, swing: 0.9 } },
      { type: 'value', variant: 'status', title: '网关连接', span: 4, rows: 1, field: { valueType: 'text' }, value: '在线', options: { icon: 'wifi', statusStyle: 'pill', states: '在线:ok,离线:off,告警:warn', pulse: true, caption: '2 分钟前更新' } },
      { type: 'value', variant: 'entity', title: '光照', span: 4, rows: 1, field: { valueType: 'integer', unit: 'lx' }, value: 555, options: { icon: 'sun', tone: 'orange' }, live: { base: 555, swing: 60 } },
      { type: 'value', variant: 'chip', title: '温度', span: 2, rows: 1, field: { valueType: 'number', unit: '℃' }, value: 10.5, options: { icon: 'thermo', tone: 'red' } },
      { type: 'value', variant: 'chip', title: '湿度', span: 2, rows: 1, field: { valueType: 'number', unit: '%' }, value: 70.4, options: { icon: 'drop', tone: 'blue' } },
      { type: 'value', variant: 'text', title: '电压', span: 4, rows: 1, field: { valueType: 'number', unit: 'V' }, value: 232.19, options: { icon: 'bolt', tone: 'orange' }, live: { base: 232, swing: 1.5 } },
      { type: 'value', variant: 'battery', title: '门锁电量', span: 4, rows: 1, field: { minimum: 0, maximum: 100, unit: '%' }, value: 78, options: { warnBelow: 20 } },
      { type: 'value', variant: 'signal', title: 'Wi-Fi 信号', span: 4, rows: 1, field: { minimum: -100, maximum: -40, unit: 'dBm' }, value: -62, options: { ticks: 5 } },
      { type: 'value', variant: 'level', title: '水箱', span: 4, rows: 1, field: { minimum: 0, maximum: 100, unit: '%' }, value: 45, options: { icon: 'drop', ticks: 10, warnBelow: 15 } },
      { type: 'value', variant: 'countdown', title: '烘干剩余', span: 4, rows: 2, field: { minimum: 0, maximum: 3600 }, value: 1754, options: { icon: 'timer', timerStyle: 'ring' } },
      { type: 'value', variant: 'compass', title: '风向', span: 2, rows: 3, field: { valueType: 'integer' }, value: 225, live: { base: 225, swing: 30 } },
      { type: 'value', variant: 'thermo', title: '水温', span: 2, rows: 3, field: { minimum: 0, maximum: 100, unit: '℃' }, value: 46, options: { warnAbove: 80 } },
      { type: 'value', variant: 'line', title: '室外温度', span: 8, rows: 3, field: { valueType: 'number', unit: '℃' }, value: 10.2, options: { icon: 'thermo', decimals: 1 }, live: { base: 10.2, swing: 1.6 } },
      { type: 'value', variant: 'wave', title: '环境噪声', span: 4, rows: 2, field: { valueType: 'number', unit: 'dB' }, value: 42, options: { icon: 'speaker', points: 48 }, live: { base: 42, swing: 14 } },
      { type: 'value', variant: 'stat', title: 'PM2.5', span: 4, rows: 2, field: { valueType: 'integer', unit: 'μg/m³' }, value: 12, options: { icon: 'leaf', tone: 'green' }, live: { base: 14, swing: 6 } },
      { type: 'value', variant: 'timeline', title: '人体感应', span: 4, rows: 2, field: { valueType: 'boolean' }, value: false, options: { onText: '有人', offText: '无人' } },
      { type: 'value', variant: 'log', title: '门磁记录', span: 4, rows: 3, field: { valueType: 'text' }, value: '已关闭' },
    ],
  },
  {
    id: 'color', title: '颜色', english: 'Color', demos: [
      { type: 'color', variant: 'wheel', title: '灯带颜色', span: 4, rows: 4, field: { valueType: 'integer', minimum: 0, maximum: 0xffffff }, value: 0xff7a2e, options: { palette: '#FF5A4E,#FF9A1F,#FFD43B,#2DBE7E,#15B8C2,#3482FF,#8467F5' } },
      { type: 'color', variant: 'swatches', title: '氛围灯', span: 4, rows: 2, field: { valueType: 'integer', minimum: 0, maximum: 0xffffff }, value: 0x2f9bff },
      { type: 'color', variant: 'spectrum', title: '背光', span: 4, rows: 2, field: { valueType: 'integer', minimum: 0, maximum: 0xffffff }, value: 0xb05cff },
    ],
  },
];

const BASE: Record<PageWidgetType, Partial<DeviceUiEndpoint>> = {
  switch: { role: 'property', valueType: 'boolean', readable: true, writable: true },
  button: { role: 'action', valueType: 'null', readable: false, writable: true },
  slider: { role: 'property', valueType: 'integer', readable: true, writable: true },
  select: { role: 'property', valueType: 'text', readable: true, writable: true },
  input: { role: 'property', readable: true, writable: true },
  value: { role: 'property', valueType: 'number', readable: true, writable: false },
  color: { role: 'property', valueType: 'integer', readable: true, writable: true },
};

export function createDemoSections(now = Date.now()): DemoSection[] {
  let id = 0;
  return SECTIONS.map(section => {
    const cards = section.demos.map(demo => {
      id += 1;
      const key = `demo-${id}`;
      const field = { id, key, notifies: false, ...BASE[demo.type], ...demo.field, value: demo.value } as DeviceUiEndpoint;
      const widget: PageLayoutWidget = {
        widgetId: key, type: demo.type, endpointKey: key, title: demo.title,
        ...(demo.variant !== undefined ? { variant: demo.variant as PageLayoutWidget['variant'] } : {}),
        ...(demo.options ? { options: demo.options } : {}),
        grid: { x: 0, y: id, width: demo.span, height: demo.rows },
      };
      return {
        widget, field, value: demo.value, history: demoHistory(demo, now),
        display: String(demo.value), draft: demo.value === null ? '' : String(demo.value), error: '', disabled: false,
      } satisfies PanelCard;
    });
    const widgets = reflowPageWidgets(cards.map(card => card.widget));
    return {
      id: section.id, title: section.title, english: section.english,
      cards: cards.map((card, index) => ({ ...card, widget: widgets[index] })),
    };
  });
}

export function liveDemo(key: string): { base: number; swing: number } | undefined {
  const index = Number(key.replace('demo-', '')) - 1;
  return SECTIONS.flatMap(section => section.demos)[index]?.live;
}

// A drifting reading around base ± swing.
export function nextReading(previous: number, live: { base: number; swing: number }): number {
  const target = live.base + (Math.random() * 2 - 1) * live.swing;
  const value = previous + (target - previous) * 0.45;
  return Math.abs(live.base) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
}

function demoHistory(demo: Demo, now: number): HistoryPoint[] {
  if (demo.variant === 'timeline') {
    return [0, 6, 9, 21, 26, 38, 44].map((minutes, index) => ({ at: now - (48 - minutes) * 60_000, value: index % 2 === 0 }));
  }
  if (demo.variant === 'log') {
    return ['已打开', '已关闭', '已打开', '已关闭', '已打开', '已关闭'].map((value, index) => ({ at: now - (6 - index) * 7 * 60_000, value }));
  }
  if (!demo.live) return [];
  let value = demo.live.base;
  return Array.from({ length: 48 }, (_, index) => {
    value = nextReading(value, demo.live!);
    return { at: now - (48 - index) * 60_000, value: index === 47 ? demo.value : value };
  });
}
