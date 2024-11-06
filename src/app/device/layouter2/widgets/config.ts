export interface Layouter2Widget {
  device;
  widget;
  key;
  refresh?;
}

export let widgetList = [
  { name: "WIDGET.TEXT", icon: "iconfont icon-text", type: "tex" },
  { name: "WIDGET.BUTTON", icon: "iconfont icon-button", type: "btn" },
  { name: "WIDGET.DATA", icon: "iconfont icon-number", type: "num" },
  { name: "WIDGET.SLIDER", icon: "iconfont icon-slider", type: "ran" },
  { name: "WIDGET.COLOR", icon: "iconfont icon-color", type: "col" },
  { name: "WIDGET.STICK", icon: "fa-light fa-gamepad", type: "joy" },
  { name: "WIDGET.CHART", icon: "iconfont icon-chart", type: "cha" },
  { name: "WIDGET.SELECT", icon: "fa-light fa-ballot-check", type: "sel" },
  // { name: "WIDGET.MAP", icon: "iconfont icon-map", type: "map" },
  // { name: "WIDGET.VIDEO", icon: "fal fa-camera-retro", type: "vid" },
  // { name: "WIDGET.INPUT", icon: "fal fa-keyboard", type: "inp" },
  // { name: "WIDGET.IMAGE", icon: "fal fa-images", type: "img" },
  { name: "WIDGET.DEBUG", icon: "iconfont icon-debug", type: "deb" },
  // { name: "WIDGET.CUSTOM", icon: "fa-light fa-box-heart", type: "cus" },
];

export let configList = {
  "tex": {
    "type": "tex",
    "tit": "文本",
    "tex": "文本内容",
    "clr": "#389BEE",
    "ico": "fa-light fa-input-text",
    "cols": 4,
    "rows": 2,
  },
  "btn": {
    "type": "btn",
    "tit": "按键",
    "cols": 2,
    "rows": 2,
    "mode": 0,
    "ico": "fa-light fa-lightbulb-on",
    "clr": "#666",
  },
  "num": {
    "type": "num",
    "cols": 2,
    "rows": 2,
    "sty": 0,
    "tit": "数据",
    "ico": "fa-light fa-heart",
    "clr": "#389BEE",
    "min": 0,
    "max": 100,
    "uni": "单位",
  },
  "ran": {
    "type": "ran",
    "cols": 8,
    "rows": 2,
    "tit": "滑动条",
    "ico": "fa-light fa-slider",
    "clr": "#389BEE",
    "max": 100,
    "min": 0,
  },
  "sel": {
    "type": "sel",
    "cols": 4,
    "rows": 2,
    "tit": "选择",
    "opts": [
      {
        "value": "s1",
        "name": "选项1",
        "ico": "fa-regular fa-circle-1",
        "clr": "#389bee"
      },
      {
        "value": "s2",
        "name": "选项2",
        "ico": "fa-regular fa-circle-2",
        "clr": "#389bee"
      },
      {
        "value": "s3",
        "name": "选项3",
        "ico": "fa-regular fa-circle-3",
        "clr": "#389bee"
      },
    ]
  },
  "col": {
    "type": "col",
    "tit": "颜色",
    "cols": 4,
    "rows": 4,
  },
  "cha": {
    "type": "cha",
    "cols": 8,
    "rows": 4,
    "tit": "图表",
    "items": [{
      color: "#389bee",
      type: "line",
      key: "data1",
      name: "数据1",
    }],
  },
  "map": { type: "map", "cols": 8, "rows": 4 },
  "joy": {
    "type": "joy",
    "tit": "摇杆",
    "cols": 4,
    "rows": 4
  },
  "deb": { type: "deb", "cols": 8, "rows": 4 },
  "tim": { type: "tim", "cols": 2, "rows": 2 },
  "vid": { type: "vid", "cols": 8, "rows": 4 },
  "inp": { type: "inp", "cols": 8, "rows": 1 },
  "img": {
    type: "img",
    images: [{ url: "" }, { url: "" }, { url: "" }, { url: "" }, { url: "" }],
    img: 0,
  },
  "cus": { type: "cus", cols: 2, rows: 2, src: "assets/html/button.html" },
};
