import {
  TEXT_WIDGET_DEFAULT_ALIGNMENT,
  TEXT_WIDGET_DEFAULT_FONT_SIZE,
  TEXT_WIDGET_STYLES,
} from './widget-text/widget-text-layout';

export interface Layouter2Widget {
  device;
  widget;
  key;
  lstyle;
  refresh?;
  // content;
  // ngAfterContentInit;
  // ngOnDestroy;
}

export let widgetList = [
  { name: '文字', icon: 'fa-light fa-font', type: 'tex' },
  { name: '按键', icon: 'fa-light fa-circle-dot', type: 'btn' },
  { name: '数据', icon: 'fa-light fa-gauge', type: 'num' },
  { name: '滑块', icon: 'fa-light fa-sliders', type: 'ran' },
  { name: '颜色', icon: 'fa-light fa-palette', type: 'col' },
  { name: '摇杆', icon: 'fal fa-gamepad', type: 'joy' },
  { name: '调试', icon: 'fa-light fa-terminal', type: 'deb' },
  { name: '图表', icon: 'fa-light fa-chart-line', type: 'cha' },
  { name: '地图', icon: 'fa-light fa-map-location-dot', type: 'map' },
  // { name: '选项卡', icon: 'fa-light fa-table-columns', type: 'tab' },
  { name: '视频', icon: 'fal fa-camera-retro', type: 'vid' },
  { name: '输入框', icon: 'fal fa-keyboard', type: 'inp' },
  { name: '图片', icon: 'fal fa-images', type: 'img' },
  { name: '天气', icon: 'fa-light fa-cloud-sun', type: 'wea' },
  { name: '空气', icon: 'fa-light fa-lungs', type: 'air' },
]

export let configList = {
  "tex": { type: "tex", t0: "文本", size: TEXT_WIDGET_DEFAULT_FONT_SIZE, align: TEXT_WIDGET_DEFAULT_ALIGNMENT, lstyle: 0 },
  "num": { type: "num", t0: "文本1", ico: "fal fa-question", clr: "#389BEE", min: 0, max: 100, uni: "单位" },
  "btn": { type: "btn", ico: "fal fa-power-off", mode: 0, t0: "文本1", t1: "文本2" },
  "col": { type: "col", t0: "颜色拾取", clr: "#389BEE" },
  "ran": { type: "ran", t0: "滑动条", clr: "#389BEE", max: 100, min: 0 },
  "cha": { type: "cha", sty: 'line', clr: '#389BEE', sty1: 'line', clr1: '#389BEE', sty2: 'line', clr2: '#389BEE', lstyle: 0 },
  "map": { type: "map" },
  "joy": { type: "joy" },
  "deb": { type: "deb", mode: 0, lstyle: 0 },
  "vid": { type: "vid" },
  "tab": { type: "tab" },
  "inp": { type: "inp" },
  "img": { type: "img", list: [{ url: '' }, { url: '' }, { url: '' }, { url: '' }, { url: '' }], img: 0 },
  "wea": { type: "wea", lstyle: 0 },
  "air": { type: "air", lstyle: 0 },
}

export let styleList = {
  'tex': TEXT_WIDGET_STYLES,
  "num": [
    { cols: 2, rows: 2 },
    { cols: 4, rows: 2 },
    { cols: 4, rows: 2 },
    { cols: 4, rows: 2 },
    { cols: 4, rows: 4 },
    { cols: 4, rows: 4 }
  ],
  "btn": [
    { cols: 2, rows: 2 },
    { cols: 2, rows: 2 },
    { cols: 4, rows: 4 },
    { cols: 2, rows: 1 },
    { cols: 1, rows: 1 },
  ],
  "col": [
    { cols: 6, rows: 6 },
    { cols: 8, rows: 8 },
    { cols: 6, rows: 6 },
    { cols: 8, rows: 8 },
  ],
  "ran": [
    { cols: 8, rows: 2 },
    { cols: 6, rows: 2 },
    { cols: 8, rows: 2 },
    { cols: 8, rows: 1 },
    { cols: 6, rows: 2 },
    { cols: 6, rows: 1 },
  ],
  "joy": [
    { cols: 3, rows: 3 },
    { cols: 4, rows: 4 },
  ],
  "deb": [
    { cols: 8, rows: 4 },
  ],
  "cha": [
    { cols: 8, rows: 4 },
  ],
  "map": [
    { cols: 8, rows: 4 },
    { cols: 8, rows: 6 },
  ],
  "vid": [
    { cols: 8, rows: 5 },
  ],
  "tab": [
    { cols: 8, rows: 2 },
  ],
  "inp": [
    // { cols: 4, rows: 2 },
    { cols: 8, rows: 2 },
  ],
  "wea": [
    { cols: 8, rows: 3 },
  ],
  "air": [
    { cols: 8, rows: 3 },
  ],
  "img": [
    { cols: 2, rows: 2 },
    { cols: 4, rows: 2 },
    { cols: 4, rows: 3 },
    { cols: 4, rows: 4 },
    { cols: 4, rows: 6 },
    { cols: 4, rows: 8 },
    { cols: 6, rows: 2 },
    { cols: 6, rows: 3 },
    { cols: 6, rows: 4 },
    { cols: 6, rows: 5 },
    { cols: 6, rows: 6 },
    { cols: 6, rows: 8 },
    { cols: 8, rows: 2 },
    { cols: 8, rows: 3 },
    { cols: 8, rows: 4 },
    { cols: 8, rows: 5 },
    { cols: 8, rows: 6 },
    { cols: 8, rows: 7 },
    { cols: 8, rows: 8 },
  ]
}
