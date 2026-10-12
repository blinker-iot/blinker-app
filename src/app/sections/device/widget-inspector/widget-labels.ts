import type { PageWidgetOptionKey, PageWidgetType, PageWidgetVariant } from '../../../core/device-v2/page-widget';

export const TYPE_LABELS: Readonly<Record<PageWidgetType, string>> = {
  switch: '开关', button: '按钮', slider: '调节', select: '选择', input: '输入', value: '显示', color: '颜色',
};

export const VARIANT_LABELS: Readonly<Record<PageWidgetVariant, string>> = {
  tile: '图标开关卡', toggle: '胶囊开关行', slide: '滑动开关',
  action: '动作按钮',
  level: '大块滑块', gradient: '色温 / 色彩滑块', dial: '环形旋钮', levels: '档位选择', stepper: '数值步进器', timer: '定时',
  mode: '模式宫格',
  text: '文本输入',
  number: '大数字读数', trend: '趋势曲线', ring: '环形进度', status: '状态徽章', log: '事件记录',
  picker: '色盘',
};

export const OPTION_LABELS: Readonly<Record<PageWidgetOptionKey, string>> = {
  icon: '图标', tone: '色调', caption: '说明', showTitle: '显示标题',
  onText: '开启文案', offText: '关闭文案', actionText: '按钮文案', doneText: '完成文案', placeholder: '占位文字',
  labels: '档位名称', states: '状态映射', choiceIcons: '选项图标', choiceTones: '选项色调', presets: '预设分钟', palette: '预设色板',
  confirm: '二次确认', hold: '长按执行', allowOff: '轻点当前档关闭', longPress: '长按连续', multiline: '多行',
  decimals: '小数位', scale: '换算倍率', format: '显示格式', min: '最小值', max: '最大值',
  warnBelow: '低于即告警', warnAbove: '高于即告警', points: '点数', ticks: '分段刻度',
  style: '样式', size: '尺寸', activeStyle: '开启样式', corner: '角标', iconStyle: '图标底', shape: '形状',
  orientation: '方向', fill: '填充', track: '轨道', trackSize: '轨道粗细', knob: '滑块', sweep: '弧度',
  thickness: '线宽', layout: '布局', chart: '图形', mode: '模式', unitPosition: '单位位置',
  showState: '显示状态', showCount: '显示次数', showValue: '显示数值', showTicks: '刻度标注', showButtons: '加减按钮',
  showIcons: '显示图标', showHex: '显示色值', showDelta: '显示变化', showRange: '显示范围',
  showAxis: '显示时间轴', showCounter: '字数计数', smooth: '平滑曲线', pulse: '呼吸动效',
};

// Display names of enum values; anything missing shows its raw value.
export const VALUE_LABELS: Readonly<Record<string, string>> = {
  blue: '蓝', orange: '橙', green: '绿', purple: '紫', teal: '青', red: '红',
  sm: '小', md: '中', lg: '大', xl: '特大',
  fill: '填充', tint: '浅色', outline: '描边', none: '无', dot: '圆点', chevron: '详情', plain: '无底',
  circle: '圆形', card: '操作卡', ring: '圆环', half: '半环', segments: '分段',
  vertical: '竖向', horizontal: '横向', solid: '纯色', gradient: '渐变',
  cct: '色温', hue: '色相', bright: '亮度', thin: '细', mid: '中', thick: '粗', bar: '进度条',
  inline: '两侧按钮', split: '底部按钮', sup: '右上', base: '基线',
  line: '折线', area: '面积', bars: '柱形', steps: '阶梯',
  wheel: '色环', swatches: '色板', both: '两者',
  tiles: '宫格', segmented: '分段', chips: '胶囊', dots: '圆点', segment: '分段', text: '文字', banner: '横幅',
  number: '数字', percent: '百分比', duration: '时长', clock: '时钟', bytes: '字节',
};

// Hints shown under text options that follow a small syntax.
export const OPTION_HINTS: Partial<Record<PageWidgetOptionKey, string>> = {
  labels: '逗号分隔，如：低,中,高,全速',
  states: '名称:语义，语义为 ok / off / warn / info',
  choiceIcons: '选项:图标，逗号分隔，如：省电:moon,性能:bolt',
  choiceTones: '选项:色调（blue orange green purple teal red），如：ERROR:red,WARN:orange',
  presets: '分钟，逗号分隔，最多 6 个',
  palette: '#RRGGBB，逗号分隔，最多 12 个',
  scale: '显示值 = 原始值 × 倍率，如 0.1',
};
