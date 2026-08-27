import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Input } from '@angular/core';
import { Subscription } from 'rxjs';
import { IonicModule } from '@ionic/angular';

import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import {
  DeviceUiConnectionState,
  DeviceUiPort,
  DeviceUiSnapshot,
} from 'src/app/core/device-v2/device-ui.port';
import { BlinkerDevice } from 'src/app/core/model/device.model';

interface CardMetric {
  key: string;
  value: string | number;
  unit: string;
}

type DeviceCardStatus = 'offline' | 'unknown' | 'reachable' | 'ready';

@Component({
  selector: 'deviceblock',
  templateUrl: 'deviceblock.html',
  styleUrls: ['deviceblock.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonicModule, BDeviceImgComponent],
})
export class Deviceblock {
  private current?: BlinkerDevice;
  private snapshot?: DeviceUiSnapshot;
  private unsubscribe?: () => void;
  private connection?: Subscription;
  private connectionState: DeviceUiConnectionState = 'idle';
  switchWaiting = false;

  @Input()
  set device(device: BlinkerDevice) {
    this.current = device;
    this.snapshot = undefined;
    this.unsubscribe?.();
    this.connection?.unsubscribe();
    this.connectionState = 'idle';
    const id = device?.deviceName;
    if (!id) return;
    const subscription = this.deviceUi.watchState(id).subscribe(snapshot => {
      this.snapshot = snapshot;
      this.cd.markForCheck();
    });
    this.unsubscribe = () => subscription.unsubscribe();
    this.connection = this.deviceUi.watchConnection(id).subscribe(state => {
      this.connectionState = state;
      this.cd.markForCheck();
    });
  }

  get device(): BlinkerDevice {
    return this.current as BlinkerDevice;
  }

  @Input() wide = false;

  get online(): boolean {
    return this.direct
      ? this.connectionState === 'ready'
      : this.current?.data?.cloudReachable === true;
  }

  get canControl(): boolean {
    return this.online
      && this.connectionState === 'ready'
      && this.snapshot?.stateFresh === true;
  }

  get status(): DeviceCardStatus {
    if (this.direct) {
      if (this.connectionState === 'ready') return 'ready';
      return this.connectionState === 'nearby'
        || this.connectionState === 'connecting'
        || this.connectionState === 'retrying'
        ? 'reachable'
        : 'offline';
    }
    if (this.current?.data?.cloudReachable !== true) {
      return this.current?.data?.cloudReachable === null ? 'unknown' : 'offline';
    }
    return this.canControl ? 'ready' : 'reachable';
  }

  get transportIcon(): string {
    return this.direct ? 'fa-brands fa-bluetooth-b' : 'fa-light fa-wifi';
  }

  get statusText(): string {
    if (this.status === 'ready') return this.direct
      ? '蓝牙已连接'
      : '云端已同步';
    if (this.status === 'reachable') {
      if (!this.direct) return '云端在线';
      return this.connectionState === 'nearby' ? '蓝牙在附近' : '正在连接蓝牙';
    }
    if (this.direct) return '蓝牙未连接';
    return this.current?.data?.cloudReachable === null ? '状态未知' : '离线';
  }

  get showSwitch(): boolean {
    return !!this.snapshot?.endpoints.some(field => (
      field.key === 'switch'
      && field.valueType === 'boolean'
      && field.writable
    ));
  }

  get switchOn(): boolean {
    return this.snapshot?.endpoints.find(field => field.key === 'switch')?.value === true;
  }

  get metrics(): CardMetric[] {
    return (this.snapshot?.endpoints ?? []).flatMap(field => {
      const value = field.value;
      if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'bigint') {
        return [];
      }
      return [{
        key: field.key,
        value: typeof value === 'bigint' ? value.toString() : value,
        unit: field.unit ?? '',
      }];
    }).slice(0, this.wide ? 6 : 1);
  }

  private get direct(): boolean {
    return this.deviceUi.isBleDirect(this.current?.deviceName || '');
  }

  constructor(
    private readonly deviceUi: DeviceUiPort,
    private readonly cd: ChangeDetectorRef,
    destroyRef: DestroyRef,
  ) {
    destroyRef.onDestroy(() => {
      this.unsubscribe?.();
      this.connection?.unsubscribe();
    });
  }

  async tapSwitch(event: Event): Promise<void> {
    event.stopPropagation();
    const logicalDeviceId = this.current?.deviceName;
    if (!logicalDeviceId || !this.canControl || !this.showSwitch || this.switchWaiting) return;
    this.switchWaiting = true;
    this.cd.markForCheck();
    try {
      await this.deviceUi.sendCommand(logicalDeviceId, 'switch', !this.switchOn);
    } finally {
      this.switchWaiting = false;
      this.cd.markForCheck();
    }
  }
}
