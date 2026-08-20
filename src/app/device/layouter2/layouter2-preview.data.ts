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

const PREVIEW_NOW_SECONDS = Math.floor(Date.now() / 1000);

function createPreviewSeries(
  values: number[],
  intervalSeconds: number,
): Array<{ date: number; value: number }> {
  return values.map((value, index) => ({
    date:
      PREVIEW_NOW_SECONDS -
      (values.length - index - 1) * intervalSeconds,
    value,
  }));
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
      size: 14,
      align: 'left',
      lstyle: 3,
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
    {
      type: 'wea',
      key: 'weather',
      lstyle: 0,
      x: 0,
      y: 9,
      cols: 8,
      rows: 3,
    },
    {
      type: 'air',
      key: 'air',
      lstyle: 0,
      x: 0,
      y: 12,
      cols: 8,
      rows: 3,
    },
    {
      type: 'col',
      key: 'lightColor',
      t0: '灯光颜色',
      clr: '#389BEE',
      lstyle: 0,
      x: 0,
      y: 15,
      cols: 6,
      rows: 6,
    },
    {
      type: 'img',
      key: 'gallery',
      list: [
        { url: 'img/blinker-icon.png' },
        { url: 'devices/development-boards/esp32.webp' },
        { url: 'devices/development-boards/arduino_uno.webp' },
        { url: 'devices/agriculture-forestry/weather-station-light.webp' },
        { url: 'devices/agriculture-forestry/outdoor-camera-light.webp' },
      ],
      img: 0,
      lstyle: 0,
      x: 6,
      y: 15,
      cols: 2,
      rows: 2,
    },
    {
      type: 'joy',
      key: 'joystick',
      lstyle: 0,
      x: 0,
      y: 21,
      cols: 3,
      rows: 3,
    },
    {
      type: 'deb',
      key: 'debug',
      mode: 0,
      lstyle: 0,
      x: 0,
      y: 24,
      cols: 8,
      rows: 3,
    },
    {
      type: 'cha',
      key: 'environmentHistory',
      key0: 'temperature',
      t0: '温度',
      sty: 'line',
      clr: '#ff7a45',
      key1: 'humidity',
      t1: '湿度',
      sty1: 'line',
      clr1: '#36cfc9',
      lstyle: 0,
      x: 0,
      y: 27,
      cols: 8,
      rows: 3,
    },
    {
      type: 'vid',
      key: 'video',
      str: 'mjpg',
      url: 'devices/agriculture-forestry/outdoor-camera-light.webp',
      mode: 1,
      lstyle: 0,
      x: 0,
      y: 30,
      cols: 8,
      rows: 5,
    },
    {
      type: 'inp',
      key: 'message',
      t0: '发送消息',
      ico: 'fal fa-keyboard',
      clr: '#389BEE',
      lstyle: 0,
      x: 0,
      y: 35,
      cols: 8,
      rows: 2,
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
  },
  temperature: { val: 26.4, date: PREVIEW_NOW_SECONDS },
  humidity: { val: 58, date: PREVIEW_NOW_SECONDS },
  brightness: { val: 68 },
  lightColor: [56, 155, 238, 180],
  joystick: [128, 128],
  history: {
    temperature: {
      '1h': createPreviewSeries([24.8, 25.2, 25.7, 26.1, 26.4], 15 * 60),
      '1d': createPreviewSeries([23.6, 24.1, 25.8, 27.2, 26.4], 6 * 60 * 60),
      '1w': createPreviewSeries([22.9, 24.5, 25.1, 26.8, 26.4], 24 * 60 * 60),
    },
    humidity: {
      '1h': createPreviewSeries([62, 61, 60, 59, 58], 15 * 60),
      '1d': createPreviewSeries([65, 63, 60, 57, 58], 6 * 60 * 60),
      '1w': createPreviewSeries([68, 64, 61, 59, 58], 24 * 60 * 60),
    },
  },
};
