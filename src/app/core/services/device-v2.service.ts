import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

import { API } from '../../configs/api.config';
import { DeviceV2AccountClient, DeviceV2AccountState } from '../device-v2/account-client';
import { openMqttDeviceV2Channel } from '../device-v2/mqtt-channel';
import { AccountConnectionResponse } from '../model/response.model';
import { DeviceV2Ack, DeviceV2Store, DeviceV2TargetSnapshot } from '../protocol/device-v2';
import { DataService } from './data.service';

export type { DeviceV2AccountState } from '../device-v2/account-client';

@Injectable({ providedIn: 'root' })
export class DeviceV2Service {
  readonly state = new BehaviorSubject<DeviceV2AccountState>('idle');
  readonly store: DeviceV2Store;
  private readonly client: DeviceV2AccountClient;
  private accountId?: string;

  constructor(http: HttpClient, data: DataService, zone: NgZone) {
    this.client = new DeviceV2AccountClient(
      () => firstValueFrom(http.get<AccountConnectionResponse>(API.ACCOUNT.CONNECTION, {
        params: { wire: 'bbp2', pv: '2', transport: 'websocket' },
      })),
      response => openMqttDeviceV2Channel(response.mqtt),
    );
    this.store = this.client.store;
    this.client.subscribeState(value => zone.run(() => this.state.next(value)));
    this.accountId = data.auth?.uuid;
    data.authDataChanged.subscribe(() => {
      const nextAccountId = data.auth?.uuid;
      const identityChanged = !data.auth
        || (this.accountId !== undefined && nextAccountId !== this.accountId);
      this.accountId = nextAccountId;
      if (identityChanged) void this.client.reset().catch(() => undefined);
    });
  }

  start(): Promise<void> {
    return this.client.start();
  }

  stop(): Promise<void> {
    return this.client.stop();
  }

  ensureReady(logicalDeviceId: string): Promise<void> {
    return this.client.ensureReady(logicalDeviceId);
  }

  command(logicalDeviceId: string, endpointKey: string, value: unknown): Promise<DeviceV2Ack> {
    return this.client.command(logicalDeviceId, endpointKey, value);
  }

  snapshot(logicalDeviceId: string): DeviceV2TargetSnapshot {
    return this.client.snapshot(logicalDeviceId);
  }
}
