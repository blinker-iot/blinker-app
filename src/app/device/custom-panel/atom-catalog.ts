import { PAGE_WIDGET_VARIANTS, VARIANT_SIZES, VARIANT_WIDGET_OPTIONS, VARIANT_OPTION_VALUES, COMMON_WIDGET_OPTIONS, PAGE_WIDGET_OPTION_RULES, EXTRA_READING_VARIANTS, MAX_EXTRA_KEYS } from '../../core/device-v2/page-widget';
import { DEFAULT_WIDGET_PRESETS, WIDGET_PRESETS } from '../../core/device-v2/widget-presets';
import { UI_ICONS } from '../v2/widgets/icon/ui-icons';

// The AI and HTML runtime use the same vocabulary as the component editor.
export const ATOM_CATALOG = Object.entries(PAGE_WIDGET_VARIANTS).flatMap(([type, variants]) =>
  variants.map(variant => ({ tag: `blinker-${variant}`, type, variant,
    defaultPreset: DEFAULT_WIDGET_PRESETS[variant],
    extraKeys: variant === 'memory' ? 1 : EXTRA_READING_VARIANTS.includes(variant) ? MAX_EXTRA_KEYS : 0,
    sizes: VARIANT_SIZES[variant], options: [...COMMON_WIDGET_OPTIONS, ...VARIANT_WIDGET_OPTIONS[variant]],
    values: VARIANT_OPTION_VALUES[variant],
    presets: Object.entries(WIDGET_PRESETS).filter(([, preset]) => preset.variant === variant)
      .map(([id, preset]) => ({ id, ...preset })),
  })),
);

export const ATOM_GUIDE = {
  version: 1,
  atoms: ATOM_CATALOG,
  icons: Object.keys(UI_ICONS),
  optionRules: PAGE_WIDGET_OPTION_RULES,
  attributes: {
    field: '设备真实字段 key，必须来自 fields。', label: '可选显示标题。',
    preset: '按字段用途选择该原子下合适的库预置 id，其宽高和 options 即默认配置。无更合适预置时可省略并使用 defaultPreset。',
    options: '可选 JSON 对象，仅写用户明确要求修改的差异项，遵守 options/values。没有差异时省略，继承预置配置。',
    span: '可选 Grid 跨列数。默认省略以继承预置宽度，仅用户明确要求改变尺寸时设置。',
    rows: '可选 Grid 行数。默认省略以继承预置高度，仅用户明确要求改变尺寸时设置。',
    'extra-keys': '可选 JSON 字符串数组，附属读数的真实字段 key。数量遵守原子的 extraKeys 上限，为0时不支持。',
  },
  layout: 'main.panel 是 8 栏 CSS Grid。窄屏宽2占半行，宽4或8占整行；高度沿用预置。普通标题与分组默认跨整行。优先将同高半宽卡片成对排列，整宽内容单独成行；不要把高低卡并排后直接接整宽块留下明显空洞。需要紧凑布局时选择符合字段用途的紧凑库预置，或调整顺序/分组，不拉伸默认组件。运行时提供根面板边距与窄屏适配，不重复设置或改写网格列数。',
  readings: {
    uptime: '主字段是以秒计的运行时长，显示时/分/秒；毫秒数据可通过用户指定的 options.scale 换算。',
    memory: '主字段是空闲内存字节。extra-keys 最多一个，绑定同一区域的总内存字节字段；也可由用户明确设置 options.max 总字节数。没有总量则显示空闲值与总量未配置，不猜测容量。',
  },
  api: '脚本必须在 window.addEventListener("blinker-ready", () => { ... }) 内使用接口。window.blinker.subscribe(state => ...) 返回退订函数，并立即回调；state 是字段 key 到当前值的映射。blinker.setValue(key, boolean|number|string) 修改可写字段；blinker.invoke(key) 执行动作。blinker.fields 提供字段元数据。预览中不会发送指令。可监听 blinker-error 事件读取 detail.key/detail.message。',
  media: [
    { tag: 'blinker-video', attributes: 'label, src (https URL), format (mjpg|hls), autoplay (true|false), span, rows' },
    { tag: 'blinker-weather', attributes: 'label, snapshot (JSON WeatherSnapshot), forecast (JSON array), alerts (JSON array), span, rows；数据由自定义脚本提供，不含天气服务密钥。' },
  ],
};
