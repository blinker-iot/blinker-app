import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Input,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';

import { IonicModule } from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { Router } from '@angular/router';
import {
  BlinkerDevice,
  DeviceCardActionConfig,
  DeviceCardMetricConfig,
} from 'src/app/core/model/device.model';
import { AudioService } from 'src/app/core/services/audio.service';
import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';

@Component({
  selector: 'deviceblock',
  templateUrl: 'deviceblock.html',
  styleUrls: ['deviceblock.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonicModule, BDeviceImgComponent],
})
export class Deviceblock {
  private _device: BlinkerDevice;
  private deviceSubscription?: Subscription;
  private activeActionTimer?: number;
  private waitingForSwitchFeedback = false;

  @Input()
  set device(device: BlinkerDevice) {
    this.deviceSubscription?.unsubscribe();
    this._device = device;
    this.waitingForSwitchFeedback = false;

    if (!device?.subject) return;
    this.deviceSubscription = device.subject
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.handleDeviceUpdate(event));
  }

  get device() {
    return this._device;
  }

  @Input() wide = false;

  activeActionKey?: string;

  get switch() {
    return this.device?.data?.switch === 'on';
  }

  get showSwitch() {
    if (typeof this.device?.config?.showSwitch === 'boolean') {
      return this.device.config.showSwitch;
    }
    return typeof this.device?.data?.switch !== 'undefined';
  }

  get allMetrics() {
    const metadata: Record<string, { label: string; unit: string }> = {
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
      position: { label: '位置', unit: '%' },
      brightness: { label: '亮度', unit: '%' },
    };

    const data = this.device?.data || {};
    const configuredMetrics = this.device?.config?.card?.metrics;
    const metricConfigs: DeviceCardMetricConfig[] = configuredMetrics?.length
      ? configuredMetrics
      : Object.entries(data)
          .filter(
            (entry): entry is [string, number] =>
              typeof entry[1] === 'number' && Number.isFinite(entry[1])
          )
          .map(([key]) => ({ key }));

    return metricConfigs
      .map((config) => {
        const value = data[config.key];
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        return {
          key: config.key,
          label: config.label || metadata[config.key]?.label || config.key,
          unit: config.unit ?? metadata[config.key]?.unit ?? '',
          value: Number.isInteger(value) ? value : Number(value.toFixed(1)),
        };
      })
      .filter((metric) => metric !== null);
  }

  get metrics() {
    if (this.wide) return [];
    return this.allMetrics.slice(0, 1);
  }

  get extensionMetrics() {
    return this.allMetrics.slice(0, 6);
  }

  get quickActions() {
    const availableSlots = Math.max(0, 6 - this.extensionMetrics.length);
    return (this.device?.config?.card?.actions || []).slice(0, availableSlots);
  }

  get enable() {
    if (!this.device) return false;
    if (this.device.config.mode == 'mqtt') return !!this.device.data?.enable;
    if (
      this.device.config.mode == 'ble' &&
      this.deviceService.islocalDevice(this.device)
    )
      return true;
    return false;
  }

  get isNearbyBle() {
    return (
      this.device?.config?.mode === 'ble' &&
      this.deviceService.islocalDevice(this.device)
    );
  }

  get statusText() {
    if (this.isNearbyBle) return '附近可连接';
    return this.enable ? '在线' : '离线';
  }

  constructor(
    public router: Router,
    public deviceService: DeviceService,
    public userService: UserService,
    private audio: AudioService,
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => {
      this.deviceSubscription?.unsubscribe();
      if (typeof this.activeActionTimer !== 'undefined') {
        window.clearTimeout(this.activeActionTimer);
      }
    });
  }

  tapSwitch(e: Event) {
    e.stopPropagation();
    if (!this.showSwitch) return;
    if (this.device.config.isPreview) {
      this.device.data.switch = this.switch ? 'off' : 'on';
      this.deviceService.notifyDeviceUpdate(
        this.device,
        'switch',
        this.device.data.switch,
        'local'
      );
      return;
    }
    if (this.device.config.mode != 'mqtt') return;
    let message;
    if (this.device.data.switch == 'off') {
      message = `{"switch":"on"}`;
    } else if (this.device.data.switch == 'on') {
      message = `{"switch":"off"}`;
    } else {
      return;
    }
    const previousState = this.device.data.switch;
    this.waitingForSwitchFeedback = true;
    this.deviceService.beginSwitchWaiting(this.device, previousState);
    this.deviceService.pubMessage(this.device, message);
  }

  triggerAction(event: Event, action: DeviceCardActionConfig) {
    event.stopPropagation();
    if (!this.enable) return;

    this.activeActionKey = action.key;
    if (typeof this.activeActionTimer !== 'undefined') {
      window.clearTimeout(this.activeActionTimer);
    }
    this.activeActionTimer = window.setTimeout(() => {
      this.activeActionTimer = undefined;
      if (this.activeActionKey === action.key) this.activeActionKey = undefined;
      this.cd.markForCheck();
    }, 500);

    if (this.device.config.isPreview || !action.command) return;
    this.deviceService.pubMessage(this.device, JSON.stringify(action.command));
  }

  private handleDeviceUpdate(event: { source?: string } | undefined) {
    if (
      this.waitingForSwitchFeedback &&
      this.device?.data?.switch !== 'waiting'
    ) {
      this.waitingForSwitchFeedback = false;
      if (event?.source !== 'switch-timeout') {
        this.audio.switch(this.device.data.switch);
      }
    }
    this.cd.markForCheck();
  }
}
