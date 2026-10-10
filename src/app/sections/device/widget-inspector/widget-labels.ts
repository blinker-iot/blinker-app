import type { PageWidgetOptionKey, PageWidgetType } from '../../../core/device-v2/page-widget';

export const TYPE_LABELS: Readonly<Record<PageWidgetType, string>> = {
  switch: '开关', button: '按钮', slider: '调节', select: '选择', input: '输入', value: '显示', color: '颜色',
};

// Keyed "type:variant".
export const VARIANT_LABELS: Readonly<Record<string, string>> = {
  'switch:tile': '图标开关卡', 'switch:entity': '实体行', 'switch:toggle': '胶囊开关行', 'switch:power': '电源键',
  'switch:chip': '胶囊标签', 'switch:segment': '开/关分段', 'switch:check': '勾选', 'switch:lock': '门锁', 'switch:slide': '滑动开关',
  'button:pill': '胶囊按钮', 'button:tile': '场景磁贴', 'button:icon': '圆形按钮', 'button:hold': '长按确认',
  'button:scene': '场景卡', 'button:keycap': '机械键帽',
  'slider:fill': '大块滑块', 'slider:entity': '实体滑条', 'slider:bar': '细轨滑块', 'slider:gradient': '色温/色彩滑块',
  'slider:dial': '环形旋钮', 'slider:knob': '旋钮', 'slider:stepper': '数值步进器', 'slider:steps': '档位选择',
  'slider:curtain': '窗帘', 'slider:ruler': '刻度尺', 'slider:timer': '定时',
  'select:tiles': '模式宫格', 'select:segment': '分段', 'select:pills': '胶囊组', 'select:list': '单选列表',
  'select:wheel': '滚轮', 'select:menu': '下拉菜单',
  'input:field': '文本输入', 'input:keypad': '数字键盘', 'input:note': '多行文本',
  'value:metric': '大数字读数', 'value:entity': '实体行', 'value:chip': '胶囊标签', 'value:text': '数值行',
  'value:status': '状态徽章', 'value:countdown': '倒计时', 'value:matrix': '点阵大屏', 'value:gauge': '仪表',
  'value:ring': '环形进度', 'value:level': '进度条', 'value:battery': '电池', 'value:signal': '信号格',
  'value:compass': '罗盘', 'value:thermo': '温度计', 'value:trend': '趋势曲线', 'value:bars': '柱状历史',
  'value:wave': '声波', 'value:line': '时间轴折线', 'value:timeline': '状态时间条', 'value:stat': '统计',
  'value:log': '事件日志',
  'color:wheel': '色环', 'color:swatches': '色板', 'color:spectrum': '色相条',
};

export const OPTION_LABELS: Readonly<Record<PageWidgetOptionKey, string>> = {
  icon: '图标', tone: '色调', caption: '说明', showTitle: '显示标题', size: '字号', align: '对齐',
  onText: '开启文案', offText: '关闭文案', actionText: '按钮文案', doneText: '完成文案', placeholder: '占位文字',
  labels: '档位名称', states: '状态映射', choiceIcons: '选项图标', presets: '预设分钟', palette: '预设色板',
  confirm: '二次确认', holdMs: '长按时长', allowOff: '轻点当前档关闭', longPress: '长按连续',
  decimals: '小数位', scale: '换算倍率', format: '显示格式', min: '最小值', max: '最大值',
  warnBelow: '低于即告警', warnAbove: '高于即告警', points: '点数', ticks: '刻度',
  activeStyle: '开启样式', corner: '角标', iconStyle: '图标底', orientation: '方向', fill: '填充',
  track: '轨道', trackSize: '轨道粗细', knob: '滑块', sweep: '弧度', thickness: '线宽', layout: '布局',
  timerStyle: '运行显示', unitPosition: '单位位置', curve: '图形', shape: '形状', statusStyle: '形态',
  showState: '显示状态', showCount: '显示次数', showValue: '显示数值', showButtons: '加减按钮',
  showIcons: '显示图标', showHex: '显示色值', showDelta: '显示变化', showRange: '显示极值',
  showAxis: '显示时间轴', showCounter: '字数计数', smooth: '平滑曲线', pulse: '呼吸动效',
};

// Display names of enum values; anything missing shows its raw value.
export const VALUE_LABELS: Readonly<Record<string, string>> = {
  blue: '蓝', orange: '橙', green: '绿', purple: '紫', teal: '青', red: '红',
  md: '中', lg: '大', xl: '特大', start: '居左', center: '居中',
  fill: '填充', tint: '浅色', outline: '描边', none: '无', dot: '圆点', chevron: '详情',
  circle: '圆底', plain: '无底', horizontal: '横向', vertical: '竖向', solid: '纯色', gradient: '渐变',
  cct: '色温', hue: '色相', bright: '亮度', thin: '细', mid: '中', thick: '粗', ring: '圆环', bar: '竖条',
  inline: '两侧按钮', split: '底部按钮', text: '文字', sup: '右上', base: '基线',
  line: '折线', area: '面积', steps: '阶梯', half: '半环', segments: '分段', pill: '胶囊', banner: '横幅',
  number: '数字', percent: '百分比', duration: '时长', clock: '时钟', bytes: '字节',
};

// Hints shown under text options that follow a small syntax.
export const OPTION_HINTS: Partial<Record<PageWidgetOptionKey, string>> = {
  labels: '逗号分隔，如：静音,低,中,高',
  states: '名称:语义，语义为 ok / off / warn / info',
  choiceIcons: '选项:图标，逗号分隔，如：制冷:snow,制热:flame',
  presets: '分钟，逗号分隔，最多 6 个',
  palette: '#RRGGBB，逗号分隔，最多 12 个',
  scale: '显示值 = 原始值 × 倍率，如 0.1',
};
