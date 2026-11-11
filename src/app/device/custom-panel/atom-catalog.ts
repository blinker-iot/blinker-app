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
    rows: '可选 Grid 行数。默认省略以继承预置；宽高使用相同网格单元，2栏2行为正方形，同规格原子外框等高。空间不足时内容在卡内滚动，不改字段绑定。仅用户明确要求改变尺寸时设置。',
    'extra-keys': '可选 JSON 字符串数组，附属读数的真实字段 key。数量遵守原子的 extraKeys 上限，为0时不支持。',
  },
  layout: 'main.panel 保存8栏跨度；内容宽不超过660px时，宽2占半行，宽4或8均占整行；更宽时按8栏显示，与组件编辑预览使用同一断点。横纵使用同一网格单元，2栏2行为正方形，原子外框高度由行数决定；普通HTML自定义卡仍由内容决定高度。普通标题与分组默认跨整行。优先将同高半宽卡片成对排列，整宽内容单独成行；不要把高低卡并排后直接接整宽块留下明显空洞。需要紧凑布局时选择符合字段用途的紧凑库预置，或调整顺序/分组，不拉伸默认组件。运行时提供最大720px、单侧16px的页面边距及窄屏适配，不重复设置或改写网格列数。',
  design: {
    principle: '普通 HTML 自定义组件与 blinker-* 原子属于同一设计系统，必须匹配所选主题。自定义的是信息组织、图表与交互，不是另一套背景、字体或卡片风格。',
    card: '独立的普通 HTML 数据或控制卡片使用 custom-card 类，运行时与内置组件共用背景、边框、圆角、阴影、字体、14px 16px 内边距和10px内容间距。不要重写这些基础样式，不在卡片内嵌套 blinker-* 或另一层卡片。main.panel 的直接子卡片默认跨整行，高度由内容决定，不加固定高度、min-height、空白占位、margin-top:auto 或纵向 space-between 来填满卡片。',
    composition: '先按信息量选结构：只有一个读数时用 custom-title + bn md，保持紧凑；读数配辅助可视化时用 custom-title + custom-body，custom-body 只有两个直接子项，左侧 bn md 内聚合读数/单位/说明，右侧 custom-visual 内放真实图形，两侧垂直居中、间距16px。不要将微小图形单独放在读数下方居中。只有需要横向空间的趋势/分布图才用整宽 custom-chart；没有历史数据不编造趋势。没有图形就省略图形容器与 custom-body，不保留空列。',
    graphics: 'custom-visual 随卡片内容宽度占24%，限制48–80px见方；custom-chart 占满内容宽度，高度随宽度变化并限制80–144px。图形 SVG/canvas 必须利用容器尺寸，SVG viewBox 紧贴绘图区，避免大画布包着一个极小图标。辅助图形不能比单位还小，也不能压过主读数。装饰图标只放标题行并保持20px，不为装饰单独开一行。图形内部可自由设计，不能覆盖卡片高度和上述布局尺寸。',
    typography: 'custom-title 为14px中等字重标题；bn md + bn-num num 为34px主题数字；bn-u 为14px弱化单位；bn-sub 为12px辅助说明。lg/xl 数字仅在明确需要突出主要指标且空间足够时使用。不要把整张卡片文字统一加粗、放大或染成强调色。',
    colors: '背景 var(--ui-card)，正文 var(--ui-ink)，辅助文字/单位 var(--ui-muted)，强调 var(--ui-accent)，进度轨道 var(--ui-track)，次级控件底色 var(--ui-well)，状态 var(--ui-ok)/var(--ui-alert)。颜色只通过这些主题变量引用，不写死色值，不另造渐变、有色整卡底色、装饰描边或阴影。强调色用于图标、图表或进度等局部数据表达。',
    theme: '宿主负责 data-ui-theme 和背景；html/body/main.panel 保持透明，不设置独立背景，不覆盖 --ui-*。普通文本用 var(--ui-font)，数字用 var(--ui-font-num) 和 var(--ui-num-weight)，圆角用 var(--ui-radius)/var(--ui-radius-sm)。自然、暗夜、电子主题切换时均跟随这些变量，不另建配色表或加载字体。',
    example: '<section class="custom-card" aria-label="指标名称"><h2 class="custom-title">指标名称</h2><div class="bn md"><div class="bn-num num"><span data-reading>—</span><span class="bn-u base">单位</span></div><p class="bn-sub">辅助说明</p></div></section>。这是纯读数结构；添加辅助图形时，将整个 bn md 与 custom-visual 一起放进同一个 custom-body，不能把图形追加到卡片底部。标签/单位来自真实字段，读数通过 blinker.subscribe 更新，缺数据保留 —，不照抄占位内容。',
    review: '输出前对比自定义卡片与相邻原子：卡片表面、标题/数字/单位层级、字体字重、间距和网格边缘应协调。检查读数和图形是否形成一个完整信息组、图形是否充分利用绘图区、是否存在空列或无意义空行。在360px窄屏与三种主题下仍可读，不溢出，不把普通指标无理由做成横幅。',
  },
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
