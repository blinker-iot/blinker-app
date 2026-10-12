import type { DeviceUiEndpoint, DeviceUiValue } from '../../../core/device-v2/device-ui.port';
import type { HistoryPoint } from '../../../core/device-v2/endpoint-history';
import { PageLayoutWidget, reflowPageWidgets } from '../../../core/device-v2/page-layout';
import type { PageWidgetOptions, PageWidgetType, PageWidgetVariant } from '../../../core/device-v2/page-widget';
import type { PanelCard } from '../../../device/v2/panel/page-layout-panel';

// Demo catalogue for the component library page: every variant, bound to
// endpoints shaped like a real dev board. Nothing here talks to a device.

interface Demo {
  type: PageWidgetType;
  variant: PageWidgetVariant;
  title: string;
  span: number;
  rows: number;
  field: Partial<DeviceUiEndpoint>;
  value: DeviceUiValue;
  options?: PageWidgetOptions;
  // 附属读数, by the titles of other demos.
  extras?: string[];
  // Readings that drift every tick and keep a synthetic history.
  live?: { base: number; swing: number };
}

export interface DemoSection {
  id: string;
  title: string;
  english: string;
  cards: PanelCard[];
}

const MODE_ICONS = '自动:auto,省电:moon,性能:bolt,调试:terminal';
const EVENTS = ['BOOT 按下', 'BOOT 松开', '检测到运动', 'WiFi 重连', 'BOOT 按下', 'BOOT 松开'];

// One ESP32 dev board, laid out in the four sections of the design draft.
// Each row of a section adds up to the 8 grid columns.
const SECTIONS: { id: string; title: string; english: string; demos: Demo[] }[] = [
  {
    id: 'control', title: '开关与按钮', english: 'Switch & Button', demos: [
      { type: 'switch', variant: 'tile', title: '板载 LED', span: 2, rows: 2, field: {}, value: true, options: { icon: 'bulb', tone: 'orange', caption: 'GPIO2' } },
      { type: 'switch', variant: 'tile', title: '继电器 1', span: 2, rows: 2, field: {}, value: false, options: { icon: 'plug', activeStyle: 'tint', corner: 'chevron', caption: 'GPIO26' } },
      { type: 'button', variant: 'action', title: '重启', span: 2, rows: 2, field: {}, value: null, options: { icon: 'restart', tone: 'red', hold: true, doneText: '已重启' } },
      { type: 'button', variant: 'action', title: '校准', span: 2, rows: 2, field: {}, value: null, options: { icon: 'gauge', tone: 'teal', shape: 'card', showCount: true } },

      { type: 'switch', variant: 'tile', title: '蜂鸣器', span: 4, rows: 1, field: {}, value: true, options: { icon: 'speaker', tone: 'purple' } },
      { type: 'button', variant: 'action', title: '立即上报', span: 4, rows: 1, field: {}, value: null, options: { icon: 'send', shape: 'card', doneText: '已上报' } },

      { type: 'switch', variant: 'toggle', title: '低功耗模式', span: 4, rows: 1, field: {}, value: false, options: { icon: 'moon', tone: 'purple', caption: '深度睡眠 · 每 60 秒唤醒' } },
      { type: 'switch', variant: 'toggle', title: '调试输出', span: 4, rows: 1, field: {}, value: true, options: { icon: 'terminal', tone: 'teal', caption: '串口 115200' } },

      { type: 'switch', variant: 'slide', title: '水泵', span: 8, rows: 1, field: {}, value: false, options: { icon: 'drop', onText: '运行中', offText: '已停止' } },
    ],
  },
  {
    id: 'adjust', title: '调节', english: 'Adjust', demos: [
      { type: 'slider', variant: 'dial', title: '舵机角度', span: 4, rows: 4, field: { minimum: 0, maximum: 180, unit: '°' }, value: 90, options: { icon: 'servo', caption: 'GPIO18 · SG90', showButtons: true } },
      { type: 'color', variant: 'picker', title: 'RGB 灯环', span: 4, rows: 4, field: { minimum: 0, maximum: 0xffffff }, value: 0xff7a2e, options: { icon: 'palette', showHex: true } },

      { type: 'slider', variant: 'level', title: 'PWM 占空比', span: 2, rows: 3, field: { minimum: 0, maximum: 100, unit: '%' }, value: 62, options: { icon: 'bolt', tone: 'orange' } },
      { type: 'slider', variant: 'level', title: '风扇', span: 2, rows: 3, field: { minimum: 0, maximum: 100, unit: '%' }, value: 35, options: { icon: 'fan', tone: 'teal', fill: 'gradient' } },
      { type: 'slider', variant: 'levels', title: '电机档位', span: 4, rows: 3, field: { minimum: 0, maximum: 4 }, value: 2, options: { icon: 'fan', labels: '停,低,中,高,满', allowOff: true } },

      { type: 'slider', variant: 'gradient', title: 'WS2812 色相', span: 4, rows: 2, field: { minimum: 0, maximum: 360, unit: '°' }, value: 210, options: { icon: 'palette', track: 'hue' } },
      { type: 'slider', variant: 'gradient', title: '色温', span: 4, rows: 2, field: { minimum: 2700, maximum: 6500, step: 100, unit: 'K' }, value: 4000, options: { icon: 'sun', track: 'cct', showTicks: true } },

      { type: 'slider', variant: 'stepper', title: '采样间隔', span: 4, rows: 2, field: { minimum: 100, maximum: 5000, step: 100, unit: 'ms' }, value: 1000, options: { icon: 'timer', longPress: true, showRange: true } },
      { type: 'slider', variant: 'timer', title: '定时关闭', span: 4, rows: 2, field: { minimum: 0, maximum: 7200, step: 60 }, value: 0, options: { icon: 'timer', presets: '5,15,30,60', tone: 'purple' } },

      { type: 'slider', variant: 'level', title: '屏幕背光', span: 4, rows: 1, field: { minimum: 0, maximum: 255 }, value: 180, options: { icon: 'sun' } },
      { type: 'slider', variant: 'stepper', title: '上报周期', span: 4, rows: 1, field: { minimum: 1, maximum: 60, unit: 's' }, value: 10, options: { icon: 'wifi' } },
    ],
  },
  {
    id: 'display', title: '显示', english: 'Display', demos: [
      { type: 'value', variant: 'number', title: '芯片温度', span: 2, rows: 2, field: { unit: '℃' }, value: 46.2, options: { icon: 'chip', tone: 'orange', decimals: 1, showDelta: true, warnAbove: 70 }, live: { base: 46.2, swing: 0.8 } },
      { type: 'value', variant: 'number', title: 'ADC 电压', span: 2, rows: 2, field: { unit: 'V' }, value: 1.65, options: { icon: 'bolt', decimals: 2, caption: 'GPIO34' }, live: { base: 1.65, swing: 0.2 } },
      { type: 'value', variant: 'number', title: '空闲内存', span: 2, rows: 2, field: { valueType: 'integer' }, value: 182_340, options: { icon: 'chip', tone: 'green', format: 'bytes' }, live: { base: 182_340, swing: 4_000 } },
      { type: 'value', variant: 'number', title: 'RSSI', span: 2, rows: 2, field: { valueType: 'integer', unit: 'dBm' }, value: -62, options: { icon: 'wifi', warnBelow: -80 }, live: { base: -62, swing: 5 } },

      { type: 'value', variant: 'trend', title: 'DHT22 温度', span: 4, rows: 2, field: { unit: '℃' }, value: 24.6, options: { icon: 'thermo', tone: 'orange', chart: 'area', smooth: true, showRange: true, decimals: 1 }, live: { base: 24.6, swing: 0.6 } },
      { type: 'value', variant: 'trend', title: '光照', span: 4, rows: 2, field: { valueType: 'integer', unit: 'lx' }, value: 555, options: { icon: 'sun', tone: 'teal', chart: 'bars', points: 24 }, live: { base: 555, swing: 120 } },

      { type: 'value', variant: 'ring', title: '电池', span: 2, rows: 2, field: { minimum: 0, maximum: 100, unit: '%' }, value: 78, options: { icon: 'battery', tone: 'green', warnBelow: 20, caption: '约 9 小时' } },
      { type: 'value', variant: 'ring', title: 'CPU', span: 2, rows: 2, field: { minimum: 0, maximum: 100, unit: '%' }, value: 42, options: { icon: 'chip', shape: 'half', warnAbove: 85, caption: '240 MHz · 双核' }, live: { base: 42, swing: 18 } },
      { type: 'value', variant: 'ring', title: 'Flash', span: 2, rows: 2, field: { minimum: 0, maximum: 4, unit: 'MB' }, value: 2.6, options: { icon: 'storage', shape: 'segments', tone: 'purple', decimals: 1, caption: '共 4 MB' } },
      { type: 'value', variant: 'status', title: 'WiFi', span: 2, rows: 2, field: { valueType: 'text' }, value: '已连接', options: { icon: 'wifi', states: '已连接:ok,连接中:info,断开:off', caption: 'aily-lab' }, extras: ['RSSI'] },

      { type: 'value', variant: 'status', title: 'GPIO0 电平', span: 4, rows: 1, field: { valueType: 'boolean' }, value: true, options: { icon: 'pulse', style: 'pill', onText: '高', offText: '低', pulse: false } },
      { type: 'value', variant: 'status', title: '运行状态', span: 4, rows: 1, field: { valueType: 'text' }, value: '过温', options: { style: 'banner', states: '正常:ok,过温:warn' } },

      { type: 'value', variant: 'trend', title: 'ADC 波形', span: 4, rows: 3, field: { valueType: 'integer' }, value: 2048, options: { icon: 'pulse', chart: 'line', points: 60, showAxis: true }, live: { base: 2048, swing: 900 } },
      { type: 'value', variant: 'log', title: '事件', span: 4, rows: 3, field: { valueType: 'text' }, value: 'BOOT 松开', options: { icon: 'eye' } },
    ],
  },
  {
    id: 'input', title: '输入', english: 'Input', demos: [
      { type: 'input', variant: 'text', title: 'OLED 文字', span: 4, rows: 2, field: { valueType: 'text', maxLength: 21 }, value: 'HELLO ESP32', options: { icon: 'tv', placeholder: '128×64 · 单行 21 字符', showCounter: true } },
      { type: 'select', variant: 'mode', title: '工作模式', span: 4, rows: 2, field: { choices: ['自动', '省电', '性能', '调试'] }, value: '自动', options: { choiceIcons: MODE_ICONS } },

      { type: 'select', variant: 'mode', title: 'ADC 精度', span: 4, rows: 2, field: { choices: ['9 bit', '10 bit', '11 bit', '12 bit'] }, value: '12 bit', options: { icon: 'gauge', style: 'segmented' } },
      { type: 'select', variant: 'mode', title: '日志级别', span: 4, rows: 2, field: { choices: ['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'] }, value: 'INFO', options: { icon: 'filter', style: 'segmented', choiceTones: 'ERROR:red,WARN:orange,INFO:blue,DEBUG:teal,VERBOSE:purple' } },

      { type: 'input', variant: 'text', title: '串口发送', span: 8, rows: 2, field: { valueType: 'text', maxLength: 120 }, value: '', options: { icon: 'terminal', placeholder: 'AT+GMR', actionText: '发送', multiline: true } },
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
  const keyOf = new Map(SECTIONS.flatMap(section => section.demos).map((demo, index) => [demo.title, `demo-${index + 1}`]));
  let id = 0;
  return SECTIONS.map(section => {
    const cards = section.demos.map(demo => {
      id += 1;
      const key = `demo-${id}`;
      const field = { id, key, notifies: false, ...BASE[demo.type], ...demo.field, value: demo.value } as DeviceUiEndpoint;
      const widget: PageLayoutWidget = {
        widgetId: key, type: demo.type, endpointKey: key, title: demo.title,
        ...(demo.extras ? { extraKeys: demo.extras.map(title => keyOf.get(title)!) } : {}),
        variant: demo.variant,
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

// A drifting reading around base ± swing, rounded at the decade of the swing.
export function nextReading(previous: number, live: { base: number; swing: number }): number {
  const target = live.base + (Math.random() * 2 - 1) * live.swing;
  const value = previous + (target - previous) * 0.45;
  const digits = Math.max(0, -Math.floor(Math.log10(live.swing)));
  return Number(value.toFixed(digits));
}

function demoHistory(demo: Demo, now: number): HistoryPoint[] {
  if (demo.variant === 'log') {
    return EVENTS.map((value, index) => ({ at: now - (EVENTS.length - index) * 7 * 60_000, value }));
  }
  if (!demo.live) return [];
  let value = demo.live.base;
  return Array.from({ length: 48 }, (_, index) => {
    value = nextReading(value, demo.live!);
    return { at: now - (48 - index) * 60_000, value: index === 47 ? demo.value : value };
  });
}
