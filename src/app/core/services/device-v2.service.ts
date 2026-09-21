import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

import { API } from '../../configs/api.config';
import { DeviceV2AccountClient, DeviceV2AccountState } from '../device-v2/account-client';
import { openMqttDeviceV2Channel } from '../device-v2/mqtt-channel';
import { AccountConnectionResponse, GatewayHttpError } from '../model/response.model';
import {
  DeviceV2Ack,
  DeviceV2Store,
  DeviceV2TargetSnapshot,
  DeviceV2TelemetryLease,
  DeviceV2TelemetryOptions,
} from '../protocol/device-v2';
import { DataService } from './data.service';
import { DeviceV2ManifestCache } from './device-v2-manifest-cache.service';
import { UserService } from './user.service';
import { DeviceV2DemandOwner, DeviceV2DirectOwner } from '../protocol/device-v2/connection-demand';

export type { DeviceV2AccountState } from '../device-v2/account-client';

@Injectable({ providedIn: 'root' })
export class DeviceV2Service {
  readonly state = new BehaviorSubject<DeviceV2AccountState>('idle');
  readonly store: DeviceV2Store;
  private readonly client: DeviceV2AccountClient;
  private accountId?: string;
  private migrationRefresh?: { epoch: number; task: Promise<void>; presencePending: boolean };

  constructor(
    http: HttpClient,
    private readonly data: DataService,
    zone: NgZone,
    manifestCache: DeviceV2ManifestCache,
    private readonly user: UserService,
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
      if (!loaded) return;
      if (this.migrationRefresh?.epoch === data.sessionEpoch) {
        this.migrationRefresh.presencePending = true;
      } else {
        void this.watchInventoryPresence(data).catch(() => undefined);
      }
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

  refreshAfterServerMigration(): Promise<void> {
    const epoch = this.data.sessionEpoch;
    if (this.migrationRefresh?.epoch === epoch) return this.migrationRefresh.task;
    const task = this.refreshMigratedDevices(epoch).finally(() => {
      if (this.migrationRefresh?.task !== task) return;
      const presencePending = this.migrationRefresh.presencePending;
      this.migrationRefresh = undefined;
      if (presencePending && this.data.auth && this.data.sessionEpoch === epoch) {
        void this.watchInventoryPresence(this.data).catch(() => undefined);
      }
    });
    this.migrationRefresh = { epoch, task, presencePending: false };
    return task;
  }

  private async refreshMigratedDevices(epoch: number): Promise<void> {
    this.assertRefreshSession(epoch);
    try {
      await this.client.reset();
    } finally {
      if (this.data.auth && this.data.sessionEpoch === epoch) {
        for (const logicalDeviceId of this.data.device.list) {
          const device = this.data.device.dict[logicalDeviceId];
          if (device?.config?.mode !== 'bbp2' || device.cloudEnabled !== true) continue;
          device.data = {
            ...device.data,
            state: device.config.disabled ? 'offline' : 'waiting',
            enable: false,
            manifestRevision: null,
            manifestFingerprint: null,
            manifestUpdatedAt: null,
          };
          this.data.updateDeviceV2Presence(logicalDeviceId, null, null);
        }
      }
    }
    this.assertRefreshSession(epoch);
    const loaded = await this.user.getAllInfo();
    this.assertRefreshSession(epoch);
    if (!loaded || this.data.userLoadError.value
      || this.data.deviceLoadError.value || this.data.configLoadError.value) {
      throw new Error('The migrated device inventory could not be refreshed.');
    }
    if (this.migrationRefresh?.epoch === epoch) this.migrationRefresh.presencePending = false;
    await this.client.start();
    this.assertRefreshSession(epoch);
    if (this.migrationRefresh?.epoch === epoch) this.migrationRefresh.presencePending = false;
    await this.watchInventoryPresence(this.data);
    this.assertRefreshSession(epoch);
  }

  private assertRefreshSession(epoch: number): void {
    if (this.data.auth && this.data.sessionEpoch === epoch) return;
    throw new GatewayHttpError({
      httpStatus: 401,
      code: 'AUTH_SESSION_CHANGED',
      message: 'The authenticated session changed during the device refresh.',
    });
  }

  ensureReady(logicalDeviceId: string): Promise<void> {
    return this.client.ensureReady(logicalDeviceId);
  }

  waitUntilReady(logicalDeviceId: string, signal?: AbortSignal): Promise<void> {
    return this.client.waitUntilReady(logicalDeviceId, signal);
  }

  acquireStateInterest(logicalDeviceId: string, signal: AbortSignal): Promise<DeviceV2DemandOwner | undefined> {
    return this.client.acquireStateInterest(logicalDeviceId, signal);
  }

  acquireConnectionDemand(logicalDeviceId: string, signal: AbortSignal): Promise<DeviceV2DemandOwner> {
    return this.client.acquireConnectionDemand(logicalDeviceId, signal);
  }

  reserveDirectPriority(logicalDeviceId: string, signal: AbortSignal): Promise<DeviceV2DirectOwner> {
    return this.client.reserveDirectPriority(logicalDeviceId, signal);
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

  private watchInventoryPresence(data: DataService): Promise<void> {
    const logicalDeviceIds = data.device.list.filter(logicalDeviceId => {
      const device = data.device.dict[logicalDeviceId];
      return device?.config?.mode === 'bbp2'
        && device.config.disabled !== true
        && device.cloudEnabled === true;
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
    return this.client.watchPresence(logicalDeviceIds);
  }
}
