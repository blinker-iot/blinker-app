import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { BDeviceImgComponent } from '../core/components/b-device-img/b-device-img.component';
import { BlinkerDevice } from '../core/model/device.model';
import { DataService } from '../core/services/data.service';
import { DeviceService } from '../core/services/device.service';
import { ViewService } from '../core/services/view.service';

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
  selector: 'app-device',
  templateUrl: './device.page.html',
  styleUrls: ['./device.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, IonicModule, RouterModule, BDeviceImgComponent],
})
export class DevicePage implements OnInit, OnDestroy {
  id = '';
  device?: BlinkerDevice;
  loaded = false;
  refreshedAt = new Date();

  private readonly subscriptions = new Subscription();
  private deviceSubscription?: Subscription;
  private heartbeatTimer?: number;
  private activeSessionId?: string;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly dataService: DataService,
    public readonly deviceService: DeviceService,
    private readonly viewService: ViewService,
    private readonly cd: ChangeDetectorRef,
  ) {}

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
    const ignoredKeys = new Set(['enable', 'state', 'oldState', 'switch', 'hasNewVersion']);

    return orderedKeys
      .filter((key, index) => orderedKeys.indexOf(key) === index)
      .filter((key) => !ignoredKeys.has(key))
      .map((key) => {
        const value = this.device?.data?.[key];
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

  ngOnInit(): void {
    this.subscriptions.add(
      this.activatedRoute.paramMap.subscribe((params) => {
        this.id = params.get('id') || '';
        this.bindDevice();
      }),
    );
    this.subscriptions.add(
      this.dataService.initCompleted.subscribe((completed) => {
        if (completed && !this.device) this.bindDevice();
      }),
    );
    this.viewService.setLightStatusBar();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.deviceSubscription?.unsubscribe();
    this.stopDeviceSession();
    if (this.viewService.devicePageIsRoot) {
      this.viewService.devicePageIsRoot = false;
    }
  }

  async refresh(): Promise<void> {
    if (!this.device) return;
    this.refreshedAt = new Date();
    if (!this.isPreview) this.deviceService.queryDevice(this.device);
    this.cd.detectChanges();
  }

  toggleSwitch(): void {
    if (!this.device || !this.hasSwitch || !this.isOnline || this.switchWaiting) {
      return;
    }

    const nextState = this.switchOn ? 'off' : 'on';
    if (this.isPreview) {
      this.device.data.switch = nextState;
      this.device.subject.next({ key: 'switch', value: nextState });
      this.cd.detectChanges();
      return;
    }

    const previousState = this.device.data.switch;
    this.device.data.switch = 'waiting';
    this.deviceService.pubMessage(this.device, JSON.stringify({ switch: nextState }));
    window.setTimeout(() => {
      if (this.device?.data?.switch === 'waiting') {
        this.device.data.switch = previousState;
        this.cd.detectChanges();
      }
    }, 3000);
  }

  private bindDevice(): void {
    const nextDevice = this.dataService.device?.dict?.[this.id] as
      | BlinkerDevice
      | undefined;

    if (!nextDevice) {
      this.device = undefined;
      this.loaded = true;
      this.cd.detectChanges();
      return;
    }

    if (this.device?.id === nextDevice.id && this.activeSessionId === nextDevice.id) {
      return;
    }

    this.deviceSubscription?.unsubscribe();
    this.stopDeviceSession();
    this.device = nextDevice;
    this.loaded = true;
    this.deviceSubscription = nextDevice.subject.subscribe(() => {
      this.refreshedAt = new Date();
      this.cd.detectChanges();
    });
    this.startDeviceSession();
    this.cd.detectChanges();
  }

  private async startDeviceSession(): Promise<void> {
    if (!this.device || this.isPreview) return;

    this.activeSessionId = this.device.id || this.device.deviceName;
    if (this.device.config.mode === 'ble') {
      await this.deviceService.connectDevice(this.device);
    }
    this.deviceService.queryDevice(this.device);
    this.heartbeatTimer = window.setInterval(() => {
      if (this.device) this.deviceService.queryDevice(this.device);
    }, this.device.config.mode === 'mqtt' ? 59001 : 29001);
  }

  private stopDeviceSession(): void {
    if (typeof this.heartbeatTimer !== 'undefined') {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.device && !this.isPreview) {
      this.deviceService.disconnectDevice(this.device);
    }
    this.activeSessionId = undefined;
  }
}
