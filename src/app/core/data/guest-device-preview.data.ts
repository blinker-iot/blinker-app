import { Subject } from 'rxjs';
import { OrderData } from '../model/data.model';
import { BlinkerDevice, DeviceCardConfig } from '../model/device.model';
import {
  LAYOUTER2_PREVIEW_DATA,
  LAYOUTER2_PREVIEW_DEVICE_DATA,
} from '../../device/layouter2/layouter2-preview.data';

interface GuestDevicePreview {
  device: OrderData;
  room: OrderData;
}

interface PreviewDeviceOptions {
  id: string;
  name: string;
  type: string;
  image: string;
  online: boolean;
  mode?: 'mqtt' | 'ble';
  nearby?: boolean;
  showSwitch: boolean;
  switchedOn?: boolean;
  metrics?: Record<string, number>;
  card?: DeviceCardConfig;
  component?: string;
  layouter?: string;
  data?: Record<string, unknown>;
  position?: {
    location: [number, number];
    address: string;
  };
}

function createPreviewDevice(options: PreviewDeviceOptions): BlinkerDevice {
  return {
    id: options.id,
    deviceName: options.id,
    deviceType: options.type,
    config: {
      broker: 'preview',
      customName: options.name,
      mode: options.mode || 'mqtt',
      image: options.image,
      isPreview: true,
      previewNearby: options.nearby,
      showSwitch: options.showSwitch,
      card: options.card,
      component: options.component || 'TestDashboard',
      layouter: options.layouter,
      headerStyle: 'light',
      position: options.position,
    },
    data: {
      enable: options.online,
      state: options.online ? 'online' : 'offline',
      ...(options.showSwitch
        ? { switch: options.switchedOn ? 'on' : 'off' }
        : {}),
      ...options.metrics,
      ...options.data,
    },
    storage: {},
    subject: new Subject<unknown>(),
  };
}

export function createGuestDevicePreview(): GuestDevicePreview {
  const devices = [
    createPreviewDevice({
      id: 'preview-living-light',
      name: '客厅主灯',
      type: '智能灯',
      image: 'home-living/smart-bulb-light.webp',
      online: true,
      showSwitch: true,
      switchedOn: true,
    }),
    createPreviewDevice({
      id: 'preview-air-conditioner',
      name: '客厅空调',
      type: '智能空调',
      image: 'municipal-buildings/air-conditioner-light.webp',
      online: true,
      showSwitch: true,
      switchedOn: false,
    }),
    createPreviewDevice({
      id: 'preview-humidifier',
      name: '卧室加湿器',
      type: '智能加湿器',
      image: 'home-living/humidifier-light.webp',
      online: true,
      showSwitch: true,
      switchedOn: true,
    }),
    createPreviewDevice({
      id: 'preview-nearby-ble',
      name: '附近蓝牙温湿度计',
      type: '蓝牙温湿度计',
      image: 'municipal-buildings/thermostat-light.webp',
      online: false,
      mode: 'ble',
      nearby: true,
      showSwitch: false,
      metrics: {
        temperature: 22.9,
        humidity: 61,
      },
    }),
    createPreviewDevice({
      id: 'preview-plant-monitor',
      name: '阳台绿植监测',
      type: '环境传感器',
      image: 'agriculture-forestry/soil-moisture-sensor-light.webp',
      online: false,
      showSwitch: false,
      metrics: {
        temperature: 24.6,
        soilMoisture: 42,
      },
    }),
    createPreviewDevice({
      id: 'preview-esp32',
      name: 'ESP32 开发板',
      type: 'DiyArduino',
      image: 'development-boards/esp32.webp',
      online: true,
      showSwitch: false,
      metrics: {
        voltage: 3.3,
        temperature: 31.2,
      },
      component: 'Layouter2Component',
      layouter: JSON.stringify(LAYOUTER2_PREVIEW_DATA),
      data: LAYOUTER2_PREVIEW_DEVICE_DATA,
      position: {
        location: [104.0668, 30.5728],
        address: '四川省成都市',
      },
    }),
    createPreviewDevice({
      id: 'preview-air-quality',
      name: '全屋空气质量',
      type: '环境监测器',
      image: 'health-wearables/air-quality-sensor-light.webp',
      online: true,
      showSwitch: false,
      metrics: {
        temperature: 23.8,
        humidity: 56,
        pm25: 18,
        co2: 620,
      },
      card: {
        layout: 'wide',
        metrics: [
          { key: 'temperature', label: '温度', unit: '°C' },
          { key: 'humidity', label: '湿度', unit: '%' },
          { key: 'pm25', label: 'PM2.5' },
          { key: 'co2', label: 'CO₂', unit: 'ppm' },
        ],
      },
    }),
    createPreviewDevice({
      id: 'preview-energy-monitor',
      name: '家庭能源监测',
      type: '电能监测器',
      image: 'home-living/smart-plug-light.webp',
      online: true,
      showSwitch: true,
      switchedOn: true,
      metrics: {
        voltage: 220.6,
        current: 1.8,
        power: 396,
        energy: 12.7,
        frequency: 50,
        powerFactor: 0.92,
      },
      card: {
        layout: 'wide',
        metrics: [
          { key: 'voltage', label: '电压', unit: 'V' },
          { key: 'current', label: '电流', unit: 'A' },
          { key: 'power', label: '功率', unit: 'W' },
          { key: 'energy', label: '今日用电', unit: 'kWh' },
          { key: 'frequency', label: '频率', unit: 'Hz' },
          { key: 'powerFactor', label: '功率因数' },
        ],
      },
    }),
    /* 宽卡快捷按钮暂时停用，保留测试设备配置以便后续恢复。
    createPreviewDevice({
      id: 'preview-scene-panel',
      name: '客厅场景面板',
      type: '场景控制器',
      image: 'station',
      online: true,
      showSwitch: false,
      card: {
        layout: 'wide',
        actions: [
          { key: 'home', label: '回家', icon: 'fa-light fa-house', command: { scene: 'home' } },
          { key: 'movie', label: '观影', icon: 'fa-light fa-film', command: { scene: 'movie' } },
          { key: 'away', label: '离家', icon: 'fa-light fa-person-walking-arrow-right', command: { scene: 'away' } },
        ],
      },
    }),
    */
  ];

  const deviceList = devices.map((device) => device.id as string);
  const deviceDict = Object.fromEntries(
    devices.map((device) => [device.id, device]),
  );

  return {
    device: {
      list: deviceList,
      dict: deviceDict,
    },
    room: {
      list: ['客厅', '卧室', '阳台', '工作室'],
      dict: {
        客厅: [
          'preview-living-light',
          'preview-air-conditioner',
          'preview-air-quality',
        ],
        卧室: ['preview-humidifier', 'preview-nearby-ble'],
        阳台: ['preview-plant-monitor'],
        工作室: ['preview-esp32', 'preview-energy-monitor'],
      },
    },
  };
}
