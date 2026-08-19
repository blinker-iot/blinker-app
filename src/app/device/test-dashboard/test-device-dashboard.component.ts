import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { BDeviceImgComponent } from '../../core/components/b-device-img/b-device-img.component';
import { HeroCardComponent } from '../../core/components/hero-card/hero-card.component';
import { BlinkerDevice } from '../../core/model/device.model';
import { DeviceService } from '../../core/services/device.service';

interface DeviceMetric {
  key: string;
  label: string;
  value: string | number;
  unit: string;
}

const METRIC_METADATA: Record<string, { label: string; unit: string }> = {
  temperature: { label: '温度', unit: '°C' },
  temp: { label: '温度', unit: '°C' },
  humidity: { label: '湿度', unit: '%' },
  humi: { label: '湿度', unit: '%' },
  soilMoisture: { label: '土壤湿度', unit: '%' },
  moisture: { label: '湿度', unit: '%' },
  pm25: { label: 'PM2.5', unit: '' },
  co2: { label: 'CO₂', unit: 'ppm' },
  voltage: { label: '电压', unit: 'V' },
  current: { label: '电流', unit: 'A' },
  power: { label: '功率', unit: 'W' },
  energy: { label: '用电量', unit: 'kWh' },
  frequency: { label: '频率', unit: 'Hz' },
  powerFactor: { label: '功率因数', unit: '' },
  position: { label: '位置', unit: '%' },
  brightness: { label: '亮度', unit: '%' },
};

@Component({
  selector: 'app-test-device-dashboard',
  standalone: true,
  imports: [CommonModule, BDeviceImgComponent, HeroCardComponent],
  templateUrl: './test-device-dashboard.component.html',
  styleUrls: ['./test-device-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class TestDeviceDashboardComponent {
  @Input({ required: true }) device!: BlinkerDevice;

  refreshedAt = new Date();

  constructor(public readonly deviceService: DeviceService) {}

  get isPreview(): boolean {
    return !!this.device?.config?.isPreview;
  }

  get isOnline(): boolean {
    if (!this.device) return false;
    if (this.device.config.mode === 'ble') {
      return this.deviceService.islocalDevice(this.device);
    }
    return !!this.device.data?.enable;
  }

  get statusText(): string {
    if (this.isPreview) return this.isOnline ? '测试数据 · 在线' : '测试数据 · 离线';
    if (this.device?.config.mode === 'ble' && this.isOnline) return '附近可连接';
    return this.isOnline ? '在线' : '离线';
  }

  get hasSwitch(): boolean {
    return typeof this.device?.data?.switch !== 'undefined';
  }

  get switchOn(): boolean {
    return this.device?.data?.switch === 'on';
  }

  get switchWaiting(): boolean {
    return this.device?.data?.switch === 'waiting';
  }

  get metrics(): DeviceMetric[] {
    if (!this.device) return [];

    const configured = this.device.config.card?.metrics || [];
    const configuredByKey = new Map(configured.map((item) => [item.key, item]));
    const orderedKeys = [
      ...configured.map((item) => item.key),
      ...Object.keys(this.device.data || {}).filter(
        (key) => !configuredByKey.has(key),
      ),
    ];
    const ignoredKeys = new Set([
      'enable',
      'state',
      'oldState',
      'switch',
      'hasNewVersion',
      'layouterData',
      'history',
    ]);

    return orderedKeys
      .filter((key, index) => orderedKeys.indexOf(key) === index)
      .filter((key) => !ignoredKeys.has(key))
      .map((key) => {
        const value = this.device.data?.[key];
        if (
          (typeof value !== 'number' || !Number.isFinite(value)) &&
          typeof value !== 'string'
        ) {
          return null;
        }

        const config = configuredByKey.get(key);
        const metadata = METRIC_METADATA[key];
        return {
          key,
          label: config?.label || metadata?.label || key,
          value:
            typeof value === 'number' && !Number.isInteger(value)
              ? Number(value.toFixed(1))
              : value,
          unit: config?.unit ?? metadata?.unit ?? '',
        };
      })
      .filter((metric): metric is DeviceMetric => metric !== null);
  }

  refresh(): void {
    this.refreshedAt = new Date();
    if (!this.isPreview) this.deviceService.queryDevice(this.device);
  }

  toggleSwitch(): void {
    if (!this.hasSwitch || !this.isOnline || this.switchWaiting) return;

    const nextState = this.switchOn ? 'off' : 'on';
    if (this.isPreview) {
      this.device.data.switch = nextState;
      this.device.subject.next({ key: 'switch', value: nextState });
      this.refreshedAt = new Date();
      return;
    }

    const previousState = this.device.data.switch;
    this.device.data.switch = 'waiting';
    this.deviceService.pubMessage(
      this.device,
      JSON.stringify({ switch: nextState }),
    );
    window.setTimeout(() => {
      if (this.device.data?.switch === 'waiting') {
        this.device.data.switch = previousState;
      }
    }, 3000);
  }
}
