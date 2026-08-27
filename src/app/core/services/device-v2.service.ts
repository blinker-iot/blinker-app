import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

import { API } from '../../configs/api.config';
import { DeviceV2AccountClient, DeviceV2AccountState } from '../device-v2/account-client';
import { openMqttDeviceV2Channel } from '../device-v2/mqtt-channel';
import { AccountConnectionResponse } from '../model/response.model';
import {
  DeviceV2Ack,
  DeviceV2Store,
  DeviceV2TargetSnapshot,
  DeviceV2TelemetryLease,
  DeviceV2TelemetryOptions,
} from '../protocol/device-v2';
import { DataService } from './data.service';
import { DeviceV2ManifestCache } from './device-v2-manifest-cache.service';

export type { DeviceV2AccountState } from '../device-v2/account-client';

@Injectable({ providedIn: 'root' })
export class DeviceV2Service {
  readonly state = new BehaviorSubject<DeviceV2AccountState>('idle');
  readonly store: DeviceV2Store;
  private readonly client: DeviceV2AccountClient;
  private accountId?: string;

  constructor(
    http: HttpClient,
    data: DataService,
    zone: NgZone,
    manifestCache: DeviceV2ManifestCache,
  ) {
    this.client = new DeviceV2AccountClient(
      () => firstValueFrom(http.get<AccountConnectionResponse>(API.ACCOUNT.CONNECTION, {
        params: { wire: 'bbp2', pv: '2', transport: 'websocket' },
      })),
      response => openMqttDeviceV2Channel(response.mqtt),
    );
    this.store = this.client.store;
    this.store.subscribe((logicalDeviceId, snapshot) => zone.run(() => {
      if (snapshot.manifestAccepted && snapshot.manifest) {
        manifestCache.save(logicalDeviceId, snapshot.manifest);
      }
      data.updateDeviceV2Presence(
        logicalDeviceId,
        snapshot.cloudReachable,
        snapshot.cloudLastSeenAt,
      );
    }));
    data.deviceDataLoader.subscribe(loaded => {
      if (loaded) this.watchInventoryPresence(data);
    });
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

  openTelemetry(
    logicalDeviceId: string,
    endpointKeys: string[],
    intervalMs: number,
    options?: DeviceV2TelemetryOptions,
  ): Promise<DeviceV2TelemetryLease> {
    return this.client.openTelemetry(logicalDeviceId, endpointKeys, intervalMs, options);
  }

  snapshot(logicalDeviceId: string): DeviceV2TargetSnapshot {
    return this.client.snapshot(logicalDeviceId);
  }

  private watchInventoryPresence(data: DataService): void {
    const logicalDeviceIds = data.device.list.filter(logicalDeviceId => {
      const device = data.device.dict[logicalDeviceId];
      return device?.config?.mode === 'bbp2'
        && device.config.disabled !== true
        && !/^ble_[A-Za-z0-9_-]{22}$/.test(logicalDeviceId);
    });
    for (const logicalDeviceId of logicalDeviceIds) {
      const presence = data.device.dict[logicalDeviceId]?.data;
      if (typeof presence?.cloudReachable === 'boolean'
        && (presence.cloudLastSeenAt === null
          || Number.isSafeInteger(presence.cloudLastSeenAt))) {
        this.store.applyPresence(logicalDeviceId, {
          cloudReachable: presence.cloudReachable,
          cloudLastSeenAt: presence.cloudLastSeenAt,
        });
      }
    }
    void this.client.watchPresence(logicalDeviceIds).catch(() => undefined);
  }
}
