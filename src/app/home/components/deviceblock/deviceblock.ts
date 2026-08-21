import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Input } from '@angular/core';
import { IonicModule } from '@ionic/angular';

import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import {
  DeviceV2EndpointAccess,
  DeviceV2TargetSnapshot,
  DeviceV2ValueType,
} from 'src/app/core/protocol/device-v2';
import { DeviceV2Service } from 'src/app/core/services/device-v2.service';

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
  private snapshot?: DeviceV2TargetSnapshot;
  private unsubscribe?: () => void;
  switchWaiting = false;

  @Input()
  set device(device: BlinkerDevice) {
    this.current = device;
    this.snapshot = undefined;
    this.unsubscribe?.();
    const id = device?.deviceName;
    if (!id) return;
    this.unsubscribe = this.deviceV2.store.subscribe((logicalDeviceId, snapshot) => {
      if (logicalDeviceId !== id) return;
      this.snapshot = snapshot;
      this.cd.markForCheck();
    });
    void this.deviceV2.ensureReady(id).catch(() => this.cd.markForCheck());
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
    return !!this.snapshot?.manifest?.fields.some(field => (
      field.key === 'switch'
      && field.type === DeviceV2ValueType.Boolean
      && (field.access & DeviceV2EndpointAccess.Write) !== 0
    ));
  }

  get switchOn(): boolean {
    return this.snapshot?.values['switch']?.value === true;
  }

  get metrics(): CardMetric[] {
    const fields = this.snapshot?.manifest?.fields ?? [];
    const values = this.snapshot?.values ?? {};
    return fields.flatMap(field => {
      const value = values[field.key]?.value;
      if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'bigint') {
        return [];
      }
      return [{
        key: field.key,
        value: typeof value === 'bigint' ? value.toString() : value,
        unit: field.constraints?.unit ?? '',
      }];
    }).slice(0, this.wide ? 6 : 1);
  }

  constructor(
    private readonly deviceV2: DeviceV2Service,
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
      await this.deviceV2.command(logicalDeviceId, 'switch', !this.switchOn);
    } finally {
      this.switchWaiting = false;
      this.cd.markForCheck();
    }
  }
}
