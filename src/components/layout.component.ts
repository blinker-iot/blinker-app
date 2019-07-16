export interface LayoutComponent {
  // isLocked: boolean;
  state;
  element;
  device;
}

export interface Layout2Component {
  device;
  layouter;
  key;
  // style;
  // content;
}


export let configList = {
  "tex": `{ "cols": 2, "rows": 1, "type": "tex","t0": "文本1","t1": "文本2" }`,
  "num": `{ "cols": 2, "rows": 1, "type": "num","t0":"文本1","ico":"fal fa-question","unit":"单位"}`,
  "btn": `{ "cols": 1, "rows": 1, "type": "btn","ico":"fal fa-power-off","t0":"文本1","t1":"文本2" }`,
  "col": `{ "cols": 3, "rows": 3, "type": "col","t0":"颜色拾取" }`,
  "ran": `{ "cols": 6, "rows": 1, "type": "ran","t0":"滑动条","max":100,"min":0 }`,
  "cha": `{ "cols": 6, "rows": 3, "type": "cha" }`,
  "joy": `{ "cols": 3, "rows": 3, "type": "joy" }`,
  "deb": `{ "cols": 6, "rows": 3, "type": "deb" }`,
  "tim": `{ "cols": 1, "rows": 1, "type": "tim" }`,
  "vid": `{ "cols": 6, "rows": 4, "type": "vid" }`,
}

export let styleList = {
  'tex': [
    { cols: 2, rows: 1 },
    { cols: 2, rows: 1 },
    { cols: 2, rows: 2 },
    { cols: 2, rows: 2 },
  ],
  "num": [
    { cols: 2, rows: 1 },
    { cols: 2, rows: 1 },
    { cols: 2, rows: 1 },
    { cols: 2, rows: 2 },
    { cols: 2, rows: 2 },
    { cols: 2, rows: 2 },
    { cols: 2, rows: 2 },
    { cols: 2, rows: 2 },
  ],
  "btn": [
    { cols: 1, rows: 1 },
    { cols: 1, rows: 1 },
    { cols: 2, rows: 1 },
    { cols: 2, rows: 1 },
    { cols: 2, rows: 2 },
    { cols: 2, rows: 2 },
    { cols: 1, rows: 1 },
  ],
  "col": [
    { cols: 3, rows: 3 },
    { cols: 4, rows: 4 },
  ],
  "ran": [
    { cols: 6, rows: 1 },
    { cols: 1, rows: 6 },
  ],
  "joy": [
    { cols: 3, rows: 3 },
    { cols: 4, rows: 4 },
  ],
  "deb": [
    { cols: 6, rows: 3 },
    { cols: 6, rows: 4 },
  ],
  "cha": [
    { cols: 2, rows: 1 },
    { cols: 2, rows: 1 },
    { cols: 2, rows: 1 },
    { cols: 2, rows: 1 },
  ],
  "tim": [
    { cols: 1, rows: 1 },
    { cols: 2, rows: 1 },
  ],
  "vid": [
    { cols: 6, rows: 4 },
  ],
}
