import type { DeviceUiEndpoint, DeviceUiValue } from '../../../core/device-v2/device-ui.port';
import type { HistoryPoint } from '../../../core/device-v2/endpoint-history';
import { PageLayoutWidget, reflowPageWidgets } from '../../../core/device-v2/page-layout';
import type { PageWidgetOptions, PageWidgetType } from '../../../core/device-v2/page-widget';
import { WIDGET_PRESETS, type WidgetPresetId } from '../../../core/device-v2/widget-presets';
import type { PanelCard } from '../../../device/v2/panel/page-layout-panel';

// Demo catalogue for the component library page: every variant, bound to
// endpoints shaped like a real dev board. Nothing here talks to a device.

interface Demo {
  preset: WidgetPresetId;
  title: string;
  field: Partial<DeviceUiEndpoint>;
  value: DeviceUiValue;
  options?: PageWidgetOptions;

  // 附属读数, by the titles of other demos.
  extras?: string[];

  // Readings that drift every tick and keep a synthetic history.
  live?: { base: number; swing: number };

  // An event demo: payloads it fires now and then (null for a bare event).
  fires?: readonly DeviceUiValue[];
}

export interface DemoSection {
  id: string;
  title: string;
  english: string;

  cards: PanelCard[];
}

// A device-sent occurrence: nothing to read back, only notified.
const EVENT: Partial<DeviceUiEndpoint> = { role: 'event', valueType: 'null', readable: false, notifies: true };
const MODE_ICONS = '自动:auto,省电:moon,性能:bolt,调试:terminal';
const EVENTS = ['BOOT 按下', 'BOOT 松开', '检测到运动', 'WiFi 重连', 'BOOT 按下', 'BOOT 松开'];

// One ESP32 dev board, laid out in the four sections of the design draft.
// Each row of a section adds up to the 8 grid columns.
const SECTIONS: { id: string; title: string; english: string; demos: Demo[] }[] = [
  {
    id: 'control', title: '开关与按钮', english: 'Switch & Button', demos: [
      { preset: 'led-tile', title: '板载 LED', field: {}, value: true, options: { caption: 'GPIO2' } },
      { preset: 'relay-tile', title: '继电器 1', field: {}, value: false, options: { caption: 'GPIO26' } },
      { preset: 'restart-action', title: '重启', field: {}, value: null, options: { doneText: '已重启' } },
      { preset: 'calibration-action', title: '校准', field: {}, value: null },
      { preset: 'buzzer-tile', title: '蜂鸣器', field: {}, value: true },
      { preset: 'report-action', title: '立即上报', field: {}, value: null, options: { doneText: '已上报' } },
      { preset: 'sleep-toggle', title: '低功耗模式', field: {}, value: false, options: { caption: '深度睡眠 · 每 60 秒唤醒' } },
      { preset: 'debug-toggle', title: '调试输出', field: {}, value: true, options: { caption: '串口 115200' } },
      { preset: 'pump-slide', title: '水泵', field: {}, value: false, options: { onText: '运行中', offText: '已停止' } },
      { preset: 'motor-hold', title: '电机点动', field: {}, value: false, options: { onText: '转动中', offText: '按住转动' } },
      { preset: 'buzzer-keys', title: '蜂鸣曲目', field: { valueType: 'text', choices: ['开机', '提示', '告警'] }, value: null, options: { choiceTones: '告警:red' } },
      { preset: 'remote-keys', title: '红外遥控', field: { valueType: 'text', choices: ['电源', '模式', '风速', '定时', '静音', '睡眠'] }, value: null, options: { choiceIcons: '电源:power,睡眠:moon', choiceTones: '电源:red' } },
      { preset: 'direction-pad', title: '小车方向', field: { valueType: 'text', choices: ['前进', '后退', '左转', '右转', '停止'] }, value: null },
    ],
  },
  {
    id: 'adjust', title: '调节', english: 'Adjust', demos: [
      { preset: 'servo-dial', title: '舵机角度', field: { minimum: 0, maximum: 180, unit: '°' }, value: 90, options: { caption: 'GPIO18 · SG90' } },
      { preset: 'rgb-picker', title: 'RGB 灯环', field: { minimum: 0, maximum: 0xffffff }, value: 0xff7a2e },
      { preset: 'pwm-level', title: 'PWM 占空比', field: { minimum: 0, maximum: 100, unit: '%' }, value: 62 },
      { preset: 'fan-level', title: '风扇', field: { minimum: 0, maximum: 100, unit: '%' }, value: 35 },
      { preset: 'motor-levels', title: '电机档位', field: { minimum: 0, maximum: 4 }, value: 2, options: { labels: '停,低,中,高,满' } },
      { preset: 'hue-gradient', title: 'WS2812 色相', field: { minimum: 0, maximum: 360, unit: '°' }, value: 210 },
      { preset: 'temperature-gradient', title: '色温', field: { minimum: 2700, maximum: 6500, step: 100, unit: 'K' }, value: 4000 },
      { preset: 'sampling-stepper', title: '采样间隔', field: { minimum: 100, maximum: 5000, step: 100, unit: 'ms' }, value: 1000 },
      { preset: 'shutdown-timer', title: '定时关闭', field: { minimum: 0, maximum: 7200, step: 60 }, value: 0, options: { presets: '5,15,30,60' } },
      { preset: 'backlight-level', title: '屏幕背光', field: { minimum: 0, maximum: 255 }, value: 180 },
      { preset: 'report-stepper', title: '上报周期', field: { minimum: 1, maximum: 60, unit: 's' }, value: 10 },
      { preset: 'servo-stepper', title: '舵机转到', field: { role: 'action', readable: false, minimum: 0, maximum: 180, step: 15, unit: '°' }, value: null },
    ],
  },
  {
    id: 'display', title: '显示', english: 'Display', demos: [
      { preset: 'motion-status', title: '人体感应', field: EVENT, value: null, options: { caption: 'PIR · GPIO27' }, fires: [null] },
      { preset: 'button-status', title: 'BOOT 按键', field: { ...EVENT, valueType: 'text' }, value: null, fires: ['单击', '双击', '长按'] },
      { preset: 'temperature-number', title: '芯片温度', field: { unit: '℃' }, value: 46.2, options: { decimals: 1, warnAbove: 70 }, live: { base: 46.2, swing: 0.8 } },
      { preset: 'voltage-number', title: 'ADC 电压', field: { unit: 'V' }, value: 1.65, options: { decimals: 2, caption: 'GPIO34' }, live: { base: 1.65, swing: 0.2 } },
      { preset: 'memory-number', title: '空闲内存', field: { valueType: 'integer' }, value: 182_340, options: { format: 'bytes' }, live: { base: 182_340, swing: 4_000 } },
      { preset: 'signal-number', title: 'RSSI', field: { valueType: 'integer', unit: 'dBm' }, value: -62, options: { warnBelow: -80 }, live: { base: -62, swing: 5 } },
      { preset: 'temperature-trend', title: 'DHT22 温度', field: { unit: '℃' }, value: 24.6, options: { decimals: 1 }, live: { base: 24.6, swing: 0.6 } },
      { preset: 'light-trend', title: '光照', field: { valueType: 'integer', unit: 'lx' }, value: 555, live: { base: 555, swing: 120 } },
      { preset: 'battery-ring', title: '电池', field: { minimum: 0, maximum: 100, unit: '%' }, value: 78, options: { warnBelow: 20, caption: '约 9 小时' } },
      { preset: 'cpu-ring', title: 'CPU', field: { minimum: 0, maximum: 100, unit: '%' }, value: 42, options: { warnAbove: 85, caption: '240 MHz · 双核' }, live: { base: 42, swing: 18 } },
      { preset: 'storage-ring', title: 'Flash', field: { minimum: 0, maximum: 4, unit: 'MB' }, value: 2.6, options: { decimals: 1, caption: '共 4 MB' } },
      { preset: 'wifi-status', title: 'WiFi', field: { valueType: 'text' }, value: '已连接', options: { states: '已连接:ok,连接中:info,断开:off', caption: 'aily-lab' }, extras: ['RSSI'] },
      { preset: 'gpio-status', title: 'GPIO0 电平', field: { valueType: 'boolean' }, value: true, options: { onText: '高', offText: '低' } },
      { preset: 'runtime-status', title: '运行状态', field: { valueType: 'text' }, value: '过温', options: { states: '正常:ok,过温:warn' } },
      { preset: 'adc-trend', title: 'ADC 波形', field: { valueType: 'integer' }, value: 2048, live: { base: 2048, swing: 900 } },
      { preset: 'event-log', title: '事件', field: { valueType: 'text' }, value: 'BOOT 松开' },
    ],
  },
  {
    id: 'input', title: '输入', english: 'Input', demos: [
      { preset: 'display-text', title: 'OLED 文字', field: { valueType: 'text', maxLength: 21 }, value: 'HELLO ESP32', options: { placeholder: '128×64 · 单行 21 字符' } },
      { preset: 'operating-mode', title: '工作模式', field: { choices: ['自动', '省电', '性能', '调试'] }, value: '自动', options: { choiceIcons: MODE_ICONS } },
      { preset: 'adc-mode', title: 'ADC 精度', field: { choices: ['9 bit', '10 bit', '11 bit', '12 bit'] }, value: '12 bit' },
      { preset: 'log-mode', title: '日志级别', field: { choices: ['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'] }, value: 'INFO', options: { choiceTones: 'ERROR:red,WARN:orange,INFO:blue,DEBUG:teal,VERBOSE:purple' } },
      { preset: 'serial-text', title: '串口发送', field: { valueType: 'text', maxLength: 120 }, value: '', options: { placeholder: 'AT+GMR' } },
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
      const preset = WIDGET_PRESETS[demo.preset];
      const field = { id, key, notifies: false, ...BASE[preset.type], ...demo.field, value: demo.value } as DeviceUiEndpoint;

      const widget: PageLayoutWidget = {
        widgetId: key, type: preset.type, endpointKey: key, title: demo.title,
        ...(demo.extras ? { extraKeys: demo.extras.map(title => keyOf.get(title)!) } : {}),
        variant: preset.variant,
        options: { ...preset.options, ...demo.options },
        grid: { x: 0, y: id, width: preset.width, height: preset.height },
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
  return demoOf(key)?.live;
}

// The payloads an event demo fires; absent for any other demo.
export function demoFires(key: string): readonly DeviceUiValue[] | undefined {
  return demoOf(key)?.fires;
}

function demoOf(key: string): Demo | undefined {
  const index = Number(key.replace('demo-', '')) - 1;

  return SECTIONS.flatMap(section => section.demos)[index];
}

// A drifting reading around base ± swing, rounded at the decade of the swing.
export function nextReading(previous: number, live: { base: number; swing: number }): number {
  const target = live.base + (Math.random() * 2 - 1) * live.swing;
  const value = previous + (target - previous) * 0.45;
  const digits = Math.max(0, -Math.floor(Math.log10(live.swing)));

  return Number(value.toFixed(digits));
}

function demoHistory(demo: Demo, now: number): HistoryPoint[] {
  if (WIDGET_PRESETS[demo.preset].variant === 'log') {
    return EVENTS.map((value, index) => ({ at: now - (EVENTS.length - index) * 7 * 60_000, value }));
  }

  if (demo.fires) {
    return demo.fires.map((value, index) => ({ at: now - (demo.fires!.length - index) * 23 * 60_000, value }));
  }

  if (!demo.live) return [];

  let value = demo.live.base;

  return Array.from({ length: 48 }, (_, index) => {
    value = nextReading(value, demo.live!);

    return { at: now - (48 - index) * 60_000, value: index === 47 ? demo.value : value };
  });
}
