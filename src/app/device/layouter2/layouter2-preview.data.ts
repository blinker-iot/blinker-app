export interface Layouter2PreviewData {
  version: string;
  config: {
    headerColor: string;
    headerStyle: 'dark' | 'light';
    background: {
      img: string;
      isFull: boolean;
    };
  };
  dashboard: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
  triggers: Array<Record<string, unknown>>;
}

export const LAYOUTER2_PREVIEW_DATA: Layouter2PreviewData = {
  version: '2.0.0',
  config: {
    headerColor: 'transparent',
    headerStyle: 'light',
    background: {
      img: '',
      isFull: false,
    },
  },
  dashboard: [
    {
      type: 'tex',
      key: 'welcome',
      t0: '拖拽编辑器测试面板',
      t1: '点击右上角编辑按钮开始调整布局',
      ico: 'fal fa-grid-2',
      clr: '#334155',
      size: 14,
      lstyle: 5,
      x: 0,
      y: 0,
      cols: 8,
      rows: 1,
    },
    {
      type: 'btn',
      key: 'switch',
      t0: '测试开关',
      ico: 'fal fa-power-off',
      clr: '#389BEE',
      mode: 1,
      lstyle: 0,
      x: 0,
      y: 1,
      cols: 2,
      rows: 2,
    },
    {
      type: 'num',
      key: 'temperature',
      t0: '温度',
      ico: 'fal fa-temperature-half',
      clr: '#ff7a45',
      min: 0,
      max: 50,
      uni: '°C',
      lstyle: 0,
      x: 2,
      y: 1,
      cols: 3,
      rows: 2,
    },
    {
      type: 'num',
      key: 'humidity',
      t0: '湿度',
      ico: 'fal fa-droplet',
      clr: '#36cfc9',
      min: 0,
      max: 100,
      uni: '%',
      lstyle: 0,
      x: 5,
      y: 1,
      cols: 3,
      rows: 2,
    },
    {
      type: 'ran',
      key: 'brightness',
      t0: '亮度',
      ico: 'fal fa-sun-bright',
      clr: '#f5a623',
      min: 0,
      max: 100,
      lstyle: 0,
      x: 0,
      y: 3,
      cols: 8,
      rows: 2,
    },
    {
      type: 'map',
      key: 'position',
      x: 0,
      y: 5,
      cols: 8,
      rows: 4,
    },
  ],
  actions: [
    { cmd: { switch: 'on' }, text: '打开测试开关' },
    { cmd: { switch: 'off' }, text: '关闭测试开关' },
  ],
  triggers: [
    {
      source: 'switch',
      source_zh: '开关状态',
      state: ['on', 'off'],
      state_zh: ['打开', '关闭'],
    },
  ],
};

export const LAYOUTER2_PREVIEW_DEVICE_DATA = {
  enable: true,
  state: 'online',
  switch: 'on',
  welcome: {
    tex: '拖拽编辑器测试面板',
    tex1: '点击右上角编辑按钮开始调整布局',
  },
  temperature: { val: 26.4 },
  humidity: { val: 58 },
  brightness: { val: 68 },
};
