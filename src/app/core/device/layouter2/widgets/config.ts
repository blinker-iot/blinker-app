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
  { name: '文字', icon: 'iconfont icon-text', type: 'tex' },
  { name: '按键', icon: 'iconfont icon-button', type: 'btn' },
  { name: '数据', icon: 'iconfont icon-number', type: 'num' },
  { name: '滑块', icon: 'iconfont icon-slider', type: 'ran' },
  { name: '颜色', icon: 'iconfont icon-color', type: 'col' },
  { name: '摇杆', icon: 'fal fa-gamepad', type: 'joy' },
  { name: '定时', icon: 'iconfont icon-timer', type: 'tim' },
  { name: '调试', icon: 'iconfont icon-debug', type: 'deb' },
  { name: '图表', icon: 'iconfont icon-chart', type: 'cha' },
  { name: '地图', icon: 'iconfont icon-map', type: 'map' },
  // { name: '选项卡', icon: 'iconfont icon-tabs', type: 'tab' },
  { name: '视频', icon: 'fal fa-camera-retro', type: 'vid' },
  { name: '输入框', icon: 'fal fa-keyboard', type: 'inp' },
  { name: '图片', icon: 'fal fa-images', type: 'img' },
]

export let configList = {
  "tex": { type: "tex", t0: "文本1", t1: "文本2", size: 14,bg: 0, ico: "fal fa-font" },
  "num": { type: "num", t0: "文本1", ico: "fal fa-question", clr: "#389BEE", min: 0, max: 100, uni: "单位", bg: 0 },
  "btn": { type: "btn", ico: "fal fa-power-off", mode: 0, t0: "文本1", t1: "文本2", bg: 0 },
  "col": { type: "col", t0: "颜色拾取", clr: "#389BEE", bg: 0 },
  "ran": { type: "ran", t0: "滑动条", clr: "#389BEE", max: 100, min: 0, bg: 0 },
  "cha": { type: "cha", bg: 0, sty: 'line', clr: '#389BEE', sty1: 'line', clr1: '#389BEE', sty2: 'line', clr2: '#389BEE' },
  "map": { type: "map", bg: 0 },
  "joy": { type: "joy", bg: 0 },
  "deb": { type: "deb", mode: 0, bg: 0 },
  "tim": { type: "tim", bg: 0 },
  "vid": { type: "vid", bg: 0 },
  "tab": { type: "tab", bg: 0 },
  "inp": { type: "inp", bg: 0 },
  "img": { type: "img", bg: 0, list: [{ url: '' }, { url: '' }, { url: '' }, { url: '' }, { url: '' }], img: 0 },
}

export let styleList = {
  'tex': [
    { cols: 2, rows: 1 },
    { cols: 4, rows: 1 },
    { cols: 2, rows: 2 },
    { cols: 4, rows: 2 },
    { cols: 2, rows: 2 },
    { cols: 8, rows: 1 },
    { cols: 8, rows: 2 },
  ],
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
    { cols: 8, rows: 3 },
    { cols: 8, rows: 4 },
  ],
  "cha": [
    { cols: 8, rows: 3 },
    { cols: 8, rows: 4 },
  ],
  "map": [
    { cols: 8, rows: 4 },
  ],
  "tim": [
    { cols: 2, rows: 2 },
    { cols: 1, rows: 1 },
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
