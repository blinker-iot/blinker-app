import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Input } from '@angular/core';
import { IonicModule } from '@ionic/angular';

import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import {
  DeviceUiPort,
  DeviceUiSnapshot,
} from 'src/app/core/device-v2/device-ui.port';
import { BlinkerDevice } from 'src/app/core/model/device.model';

interface CardMetric {
  key: string;
  value: string | number;
  unit: string;
}

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
  switchWaiting = false;

  @Input()
  set device(device: BlinkerDevice) {
    this.current = device;
    this.snapshot = undefined;
    this.unsubscribe?.();
    const id = device?.deviceName;
    if (!id) return;
    const subscription = this.deviceUi.watchState(id).subscribe(snapshot => {
      this.snapshot = snapshot;
      this.cd.markForCheck();
    });
    this.unsubscribe = () => subscription.unsubscribe();
    if (!this.deviceUi.isBleDirect(id)) {
      void this.deviceUi.connect(id).catch(() => this.cd.markForCheck());
    }
  }

  get device(): BlinkerDevice {
    return this.current as BlinkerDevice;
  }

  @Input() wide = false;

  get online(): boolean {
    return this.snapshot?.stateFresh === true;
  }

  get statusText(): string {
    return this.online ? '在线' : '离线';
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

  constructor(
    private readonly deviceUi: DeviceUiPort,
    private readonly cd: ChangeDetectorRef,
    destroyRef: DestroyRef,
  ) {
    destroyRef.onDestroy(() => this.unsubscribe?.());
  }

  async tapSwitch(event: Event): Promise<void> {
    event.stopPropagation();
    const logicalDeviceId = this.current?.deviceName;
    if (!logicalDeviceId || !this.online || !this.showSwitch || this.switchWaiting) return;
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
