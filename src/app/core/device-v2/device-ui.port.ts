import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import {
  DeviceV2EndpointAccess,
  DeviceV2EndpointKind,
  DeviceV2Event,
  DeviceV2ManifestField,
  DeviceV2TargetSnapshot,
  DeviceV2TelemetryLease,
  DeviceV2TelemetrySnapshot,
  DeviceV2Value,
  DeviceV2ValueType,
} from '../protocol/device-v2';
import {
  DeviceV2AccountState,
  DeviceV2Service,
} from '../services/device-v2.service';
import {
  DeviceV2BleConnectionState,
  DeviceV2BleService,
} from '../services/device-v2-ble.service';
import { AppVisibilityService } from '../services/app-visibility.service';
import { DeviceV2ManifestCache } from '../services/device-v2-manifest-cache.service';
import { DataService } from '../services/data.service';

export type DeviceUiConnectionState = DeviceV2BleConnectionState;
export type DeviceUiTransport = 'cloud' | 'ble';
export type DeviceUiEndpointRole = 'property' | 'action' | 'event';
export type DeviceUiValueType =
  | 'boolean'
  | 'integer'
  | 'number'
  | 'text'
  | 'bytes'
  | 'object'
  | 'array'
  | 'null';
export type DeviceUiValue = boolean | number | bigint | string | null | Uint8Array;

export interface DeviceUiEndpoint {
  id: number;
  key: string;
  role: DeviceUiEndpointRole;
  valueType: DeviceUiValueType;
  readable: boolean;
  writable: boolean;
  notifies: boolean;
  value?: DeviceUiValue;
  minimum?: number;
  maximum?: number;
  step?: number;
  maxLength?: number;
  unit?: string;
  choices?: string[];
  telemetryMinimumIntervalMs?: number;
}

export interface DeviceUiSnapshot {
  manifestRevision: number | null;
  manifestFingerprint: string | null;
  manifestAccepted: boolean;
  stateRevision: number | null;
  stateFresh: boolean;
  endpoints: DeviceUiEndpoint[];
}

export interface DeviceUiEvent {
  logicalDeviceId: string;
  values: Readonly<Record<string, DeviceUiValue | undefined>>;
}

export interface DeviceUiTelemetrySnapshot {
  active: boolean;
  effectiveIntervalMs: number;
  values: Readonly<Record<string, DeviceUiValue | undefined>>;
}

export interface DeviceUiConnectivitySnapshot {
  activeTransport: DeviceUiTransport;
  directConnectAllowed: boolean;
  bleAccess: boolean | null;
  bleAdapterEnabled: boolean | null;
  bleState: DeviceV2BleConnectionState;
  cloudSessionState: DeviceV2AccountState;
}

const HYBRID_BLE_CONNECT_TIMEOUT_MS = 5_000;
const WIFI_PROV_DIRECT_HANDOFF_TIMEOUT_MS = 15_000;

export interface DeviceUiTelemetryLease {
  readonly snapshot: DeviceUiTelemetrySnapshot;
  subscribe(listener: (snapshot: DeviceUiTelemetrySnapshot) => void): () => void;
  setVisible(visible: boolean): Promise<void>;
  close(): Promise<void>;
}

function cloneUiValue(value: DeviceV2Value['value']): DeviceUiValue | undefined {
  return value instanceof Uint8Array ? new Uint8Array(value) : value;
}

function mapTelemetrySnapshot(snapshot: DeviceV2TelemetrySnapshot): DeviceUiTelemetrySnapshot {
  return {
    active: snapshot.active,
    effectiveIntervalMs: snapshot.effectiveIntervalMs,
    values: Object.fromEntries(Object.entries(snapshot.values).map(
      ([key, value]) => [key, cloneUiValue(value.value)],
    )),
  };
}

class DeviceUiTelemetryLeaseAdapter implements DeviceUiTelemetryLease {
  constructor(
    private readonly lease: DeviceV2TelemetryLease,
    private readonly zone: NgZone,
  ) {}

  get snapshot(): DeviceUiTelemetrySnapshot {
    return mapTelemetrySnapshot(this.lease.snapshot);
  }

  subscribe(listener: (snapshot: DeviceUiTelemetrySnapshot) => void): () => void {
    return this.lease.subscribe(snapshot => {
      this.zone.run(() => listener(mapTelemetrySnapshot(snapshot)));
    });
  }

  setVisible(visible: boolean): Promise<void> {
    return this.lease.setVisible(visible);
  }

  close(): Promise<void> {
    return this.lease.close();
  }
}

@Injectable({ providedIn: 'root' })
export class DeviceUiPort {
  readonly appActive: Observable<boolean>;
  private readonly transports = new Map<string, BehaviorSubject<DeviceUiTransport>>();
  private readonly directHandoffs = new Map<string, Promise<void>>();

  constructor(
    private readonly deviceV2: DeviceV2Service,
    private readonly ble: DeviceV2BleService,
    private readonly zone: NgZone,
    appVisibility: AppVisibilityService,
    private readonly data: DataService,
    private readonly manifestCache?: DeviceV2ManifestCache,
  ) {
    this.appActive = appVisibility.active.asObservable();
  }

  async connect(logicalDeviceId: string): Promise<void> {
    if (!this.supportsDirectBle(logicalDeviceId)) {
      // A stored Direct credential is historical local evidence, not a
      // product capability. Edge Hubs are BLE centrals, never Direct
      // peripherals, so a stale credential must not delay Cloud with a scan.
      this.selectTransport(logicalDeviceId, 'cloud');
      await this.deviceV2.ensureReady(logicalDeviceId);
      return;
    }
    if (!this.isCloudCapable(logicalDeviceId)) {
      void this.syncManagedPresence(logicalDeviceId);
      this.selectTransport(logicalDeviceId, 'ble');
      await this.ble.ensureReady(logicalDeviceId);
      return;
    }

    if (!this.directConnectAllowed(logicalDeviceId)) {
      this.selectTransport(logicalDeviceId, 'cloud');
      await this.ble.disconnect(logicalDeviceId).catch(() => undefined);
      await this.deviceV2.ensureReady(logicalDeviceId);
      return;
    }

    // WiFiProv and Direct use different native BLE owners. During the exact
    // handoff window, keep Cloud usable while one long-lived Direct scan waits
    // for the peripheral to replace its provisioning advertisement. Starting
    // the ordinary 5 s page scan in parallel would only churn Android GATT.
    if (this.directHandoffs.has(logicalDeviceId)) {
      this.selectTransport(logicalDeviceId, 'cloud');
      await this.deviceV2.ensureReady(logicalDeviceId);
      return;
    }

    const hasDirectAccess = await this.ble.hasActiveCredential(logicalDeviceId)
      .catch(() => false);
    if (hasDirectAccess) {
      void this.syncManagedPresence(logicalDeviceId);
      this.selectTransport(logicalDeviceId, 'ble');
      try {
        // A background presence scan is only a discovery optimization.
        // ensureReady cancels it and proves the selected logical device with
        // Method 2, so an ambiguous/stale transport address cannot force Cloud.
        await this.ble.ensureReady(logicalDeviceId, HYBRID_BLE_CONNECT_TIMEOUT_MS);
        return;
      } catch {
        // No business command has been sent yet, so connection fallback is safe.
        this.selectTransport(logicalDeviceId, 'cloud');
      }
    }
    await this.deviceV2.ensureReady(logicalDeviceId);
  }

  startDirectHandoff(logicalDeviceId: string): Promise<void> {
    if (!this.supportsDirectBle(logicalDeviceId)
      || !this.isCloudCapable(logicalDeviceId)
      || !this.directConnectAllowed(logicalDeviceId)) return Promise.resolve();
    const active = this.directHandoffs.get(logicalDeviceId);
    if (active) return active;

    this.selectTransport(logicalDeviceId, 'cloud');
    const task = this.openDirectHandoff(logicalDeviceId).finally(() => {
      if (this.directHandoffs.get(logicalDeviceId) === task) {
        this.directHandoffs.delete(logicalDeviceId);
      }
    });
    this.directHandoffs.set(logicalDeviceId, task);
    return task;
  }

  private async openDirectHandoff(logicalDeviceId: string): Promise<void> {
    const hasDirectAccess = await this.ble.hasActiveCredential(logicalDeviceId)
      .catch(() => false);
    if (!hasDirectAccess) return;
    void this.syncManagedPresence(logicalDeviceId);
    try {
      await this.ble.ensureReady(
        logicalDeviceId,
        WIFI_PROV_DIRECT_HANDOFF_TIMEOUT_MS,
      );
      this.selectTransport(logicalDeviceId, 'ble');
    } catch {
      // Cloud remains selected. The visible page owns any later retry budget.
    }
  }

  private async syncManagedPresence(logicalDeviceId: string): Promise<void> {
    if (!this.supportsDirectBle(logicalDeviceId)) return;
    const canManage = await this.ble
      .canManagePresenceCredential(logicalDeviceId)
      .catch(() => false);
    if (!canManage) return;
    // Page entry retries both the initial v2 -> v3 installation and a durable
    // server-side rotation request. The caller deliberately runs this in the
    // background: a local PresenceKey can select the peripheral immediately,
    // and an unavailable server must not delay an authenticated Direct session.
    await this.ble.syncPresenceCredential(logicalDeviceId).catch(() => undefined);
  }

  async disconnect(logicalDeviceId: string): Promise<void> {
    // Transport selection may already have fallen back to Cloud while a
    // bounded Direct scan is still open. Always delegate cancellation; the
    // BLE service is a no-op unless this logical device owns a session/open.
    await this.ble.disconnect(logicalDeviceId);
    if (this.isCloudCapable(logicalDeviceId)) {
      this.selectTransport(logicalDeviceId, 'cloud');
    }
  }

  watchConnection(logicalDeviceId: string): Observable<DeviceUiConnectionState> {
    return new Observable(subscriber => {
      let selected = this.transport(logicalDeviceId).value;
      let cloudState: DeviceUiConnectionState = this.deviceV2.state.value;
      let bleState: DeviceUiConnectionState = this.ble.connectionSnapshot(logicalDeviceId);
      let last: DeviceUiConnectionState | undefined;
      const publish = () => {
        const next = selected === 'ble' ? bleState : cloudState;
        if (next === last) return;
        last = next;
        this.zone.run(() => subscriber.next(next));
      };
      const transportSubscription = this.transport(logicalDeviceId).subscribe(value => {
        selected = value;
        publish();
      });
      const cloudSubscription = this.deviceV2.state.subscribe(value => {
        cloudState = value;
        publish();
      });
      const bleSubscription = this.ble.watchConnection(logicalDeviceId).subscribe(value => {
        bleState = value;
        if (this.isCloudCapable(logicalDeviceId)
          && this.directConnectAllowed(logicalDeviceId)
          && value === 'ready' && selected !== 'ble') {
          // A bounded Direct attempt may transiently report stopped before a
          // later retry completes. Once Method 2 has proved the same logical
          // device, BLE is usable and must become the hybrid foreground path
          // again; otherwise the page remains pinned to a slower/failing Cloud
          // session even though its Direct Manifest and State are already live.
          this.selectTransport(logicalDeviceId, 'ble');
          return;
        }
        if (this.isCloudCapable(logicalDeviceId) && selected === 'ble' && value === 'stopped') {
          // Direct is preferred only while it is usable. A peripheral may
          // retire an idle or faulted GATT session; keep the hybrid device
          // available through its existing cloud session without replaying
          // the command that preceded the disconnect.
          this.selectTransport(logicalDeviceId, 'cloud');
          // Switching the view is not enough: the account session may only
          // have subscribed to Presence while Direct BLE supplied Manifest
          // and State. Synchronize the same logical device before enabling
          // cloud controls.
          void this.deviceV2.ensureReady(logicalDeviceId).catch(() => undefined);
          return;
        }
        publish();
      });
      return () => {
        transportSubscription.unsubscribe();
        cloudSubscription.unsubscribe();
        bleSubscription.unsubscribe();
      };
    });
  }

  watchConnectivity(logicalDeviceId: string): Observable<DeviceUiConnectivitySnapshot> {
    return new Observable(subscriber => {
      let activeTransport = this.transport(logicalDeviceId).value;
      let bleAccess: boolean | null = !this.supportsDirectBle(logicalDeviceId)
        ? false
        : this.isCloudCapable(logicalDeviceId) ? null : true;
      let bleAdapterEnabled: boolean | null = null;
      let bleState = this.ble.connectionSnapshot(logicalDeviceId);
      let cloudSessionState = this.deviceV2.state.value;
      let closed = false;
      let last = '';
      const publish = () => {
        const snapshot: DeviceUiConnectivitySnapshot = {
          activeTransport,
          directConnectAllowed: this.directConnectAllowed(logicalDeviceId),
          bleAccess,
          bleAdapterEnabled,
          bleState,
          cloudSessionState,
        };
        const key = `${activeTransport}|${String(bleAccess)}|${String(bleAdapterEnabled)}`
          + `|${bleState}|${cloudSessionState}`;
        if (key === last) return;
        last = key;
        this.zone.run(() => subscriber.next(snapshot));
      };
      const transportSubscription = this.transport(logicalDeviceId).subscribe(value => {
        activeTransport = value;
        publish();
      });
      const cloudSubscription = this.deviceV2.state.subscribe(value => {
        cloudSessionState = value;
        publish();
      });
      const bleSubscription = this.ble.watchConnection(logicalDeviceId).subscribe(value => {
        bleState = value;
        publish();
      });
      const adapterSubscription = this.supportsDirectBle(logicalDeviceId)
        ? this.ble.watchAdapterEnabled().subscribe(value => {
          bleAdapterEnabled = value;
          publish();
        })
        : undefined;
      const deviceSubscription = this.data.getDevice(logicalDeviceId)?.subject?.subscribe(() => {
        if (!this.directConnectAllowed(logicalDeviceId)) {
          this.selectTransport(logicalDeviceId, 'cloud');
          void this.ble.disconnect(logicalDeviceId).catch(() => undefined);
        }
        publish();
      });
      if (bleAccess === null) {
        void this.ble.hasActiveCredential(logicalDeviceId)
          .then(value => {
            if (closed) return;
            bleAccess = value;
            publish();
          })
          .catch(() => {
            if (closed) return;
            bleAccess = false;
            publish();
          });
      }
      return () => {
        closed = true;
        transportSubscription.unsubscribe();
        cloudSubscription.unsubscribe();
        bleSubscription.unsubscribe();
        adapterSubscription?.unsubscribe();
        deviceSubscription?.unsubscribe();
      };
    });
  }

  async refreshBlePresence(logicalDeviceIds: readonly string[]): Promise<void> {
    const ids = [...new Set(logicalDeviceIds.filter(id => id.length > 0))];
    const directIds = ids.filter(id => this.supportsDirectBle(id));
    if (directIds.length) await this.ble.refreshPresence(directIds);
    for (const logicalDeviceId of ids) {
      if (!this.supportsDirectBle(logicalDeviceId)) {
        this.selectTransport(logicalDeviceId, 'cloud');
        continue;
      }
      if (!this.isCloudCapable(logicalDeviceId)) {
        this.selectTransport(logicalDeviceId, 'ble');
        continue;
      }
      if (!this.directConnectAllowed(logicalDeviceId)) {
        this.selectTransport(logicalDeviceId, 'cloud');
        continue;
      }
      const state = this.ble.connectionSnapshot(logicalDeviceId);
      this.selectTransport(
        logicalDeviceId,
        state === 'nearby' || state === 'ready' ? 'ble' : 'cloud',
      );
    }
  }

  watchState(logicalDeviceId: string): Observable<DeviceUiSnapshot> {
    return new Observable(subscriber => {
      let selected = this.transport(logicalDeviceId).value;
      const publish = (snapshot: DeviceV2TargetSnapshot) => {
        const mapped = this.mapSnapshot(snapshot);
        this.zone.run(() => subscriber.next(
          mapped.manifestAccepted ? mapped : this.cachedSnapshot(logicalDeviceId) ?? mapped,
        ));
      };
      const publishSelected = () => publish(selected === 'ble'
        ? this.ble.snapshot(logicalDeviceId)
        : this.deviceV2.snapshot(logicalDeviceId));
      const transportSubscription = this.transport(logicalDeviceId).subscribe(value => {
        selected = value;
        publishSelected();
      });
      const detachCloud = this.deviceV2.store.subscribe((changedId, snapshot) => {
        if (selected === 'cloud' && changedId === logicalDeviceId) publish(snapshot);
      });
      const detachBle = this.ble.subscribe((changedId, snapshot) => {
        if (selected === 'ble' && changedId === logicalDeviceId) publish(snapshot);
      });
      return () => {
        transportSubscription.unsubscribe();
        detachCloud();
        detachBle();
      };
    });
  }

  watchEvents(logicalDeviceId: string): Observable<DeviceUiEvent> {
    return new Observable(subscriber => {
      const publish = (source: DeviceUiTransport, event: DeviceV2Event) => {
        if (this.transport(logicalDeviceId).value !== source
          || event.logicalDeviceId !== logicalDeviceId) return;
        this.zone.run(() => subscriber.next(this.mapEvent(event)));
      };
      const detachCloud = this.deviceV2.store.subscribeEvents(
        event => publish('cloud', event),
      );
      const detachBle = this.ble.subscribeEvents(event => publish('ble', event));
      return () => {
        detachCloud();
        detachBle();
      };
    });
  }

  async sendCommand(logicalDeviceId: string, endpointKey: string, value: unknown): Promise<void> {
    if (this.transport(logicalDeviceId).value === 'ble') {
      await this.ble.command(logicalDeviceId, endpointKey, value);
    } else {
      await this.deviceV2.command(logicalDeviceId, endpointKey, value);
    }
  }

  async openTelemetry(
    logicalDeviceId: string,
    endpointKeys: string[],
    intervalMs: number,
  ): Promise<DeviceUiTelemetryLease> {
    if (this.transport(logicalDeviceId).value === 'ble') {
      throw new Error('BLE_DIRECT_TELEMETRY_NOT_ENABLED');
    }
    const lease = await this.deviceV2.openTelemetry(logicalDeviceId, endpointKeys, intervalMs);
    return new DeviceUiTelemetryLeaseAdapter(lease, this.zone);
  }

  isBleDirect(logicalDeviceId: string): boolean {
    return this.transport(logicalDeviceId).value === 'ble';
  }

  private isCloudCapable(logicalDeviceId: string): boolean {
    return this.data.getDevice(logicalDeviceId)?.cloudEnabled === true;
  }

  private supportsDirectBle(logicalDeviceId: string): boolean {
    return this.data.getDevice(logicalDeviceId)?.deviceType !== 'edge-hub';
  }

  private directConnectAllowed(logicalDeviceId: string): boolean {
    const device = this.data.getDevice(logicalDeviceId);
    return device?.deviceType !== 'ble'
      || device.cloudEnabled !== true
      || device.data?.cloudReachable !== true;
  }

  private transport(logicalDeviceId: string): BehaviorSubject<DeviceUiTransport> {
    let transport = this.transports.get(logicalDeviceId);
    if (!transport) {
      transport = new BehaviorSubject<DeviceUiTransport>(
        this.isCloudCapable(logicalDeviceId) ? 'cloud' : 'ble',
      );
      this.transports.set(logicalDeviceId, transport);
    }
    return transport;
  }

  private selectTransport(logicalDeviceId: string, value: DeviceUiTransport): void {
    const transport = this.transport(logicalDeviceId);
    if (transport.value !== value) transport.next(value);
  }

  private mapSnapshot(snapshot: DeviceV2TargetSnapshot): DeviceUiSnapshot {
    const fields = snapshot.manifest?.fields ?? [];
    return {
      manifestRevision: snapshot.manifest?.revision ?? null,
      manifestFingerprint: snapshot.manifest?.fingerprint ?? null,
      manifestAccepted: snapshot.manifestAccepted,
      stateRevision: snapshot.stateRevision,
      stateFresh: snapshot.stateFresh,
      endpoints: fields.map(field => this.mapEndpoint(field, snapshot.values[field.key])),
    };
  }

  private cachedSnapshot(logicalDeviceId: string): DeviceUiSnapshot | undefined {
    const manifest = this.manifestCache?.load(logicalDeviceId);
    return manifest ? this.mapSnapshot({
      manifest,
      manifestAccepted: true,
      stateRevision: null,
      stateFresh: false,
      values: Object.create(null),
      eventInterrupted: true,
      cloudReachable: null,
      cloudLastSeenAt: null,
    }) : undefined;
  }

  private mapEndpoint(field: DeviceV2ManifestField, value?: DeviceV2Value): DeviceUiEndpoint {
    const constraints = field.constraints;
    return {
      id: field.id,
      key: field.key,
      role: this.mapRole(field.kind),
      valueType: this.mapValueType(field.type),
      readable: (field.access & DeviceV2EndpointAccess.Read) !== 0,
      writable: (field.access & (DeviceV2EndpointAccess.Write | DeviceV2EndpointAccess.Command)) !== 0,
      notifies: (field.access & (DeviceV2EndpointAccess.Notify | DeviceV2EndpointAccess.Event)) !== 0,
      value: this.cloneValue(value?.value),
      minimum: constraints?.minimum,
      maximum: constraints?.maximum,
      step: constraints?.step,
      maxLength: constraints?.maxLength,
      unit: constraints?.unit,
      choices: constraints?.enumValues ? [...constraints.enumValues] : undefined,
      telemetryMinimumIntervalMs: field.telemetryMinimumIntervalMs,
    };
  }

  private mapEvent(event: DeviceV2Event): DeviceUiEvent {
    return {
      logicalDeviceId: event.logicalDeviceId,
      values: Object.fromEntries(Object.entries(event.values).map(
        ([key, value]) => [key, this.cloneValue(value.value)],
      )),
    };
  }

  private cloneValue(value: DeviceV2Value['value']): DeviceUiValue | undefined {
    return cloneUiValue(value);
  }

  private mapRole(kind: DeviceV2EndpointKind): DeviceUiEndpointRole {
    if (kind === DeviceV2EndpointKind.Property) return 'property';
    if (kind === DeviceV2EndpointKind.Action) return 'action';
    return 'event';
  }

  private mapValueType(type: DeviceV2ValueType): DeviceUiValueType {
    if (type === DeviceV2ValueType.Boolean) return 'boolean';
    if (type === DeviceV2ValueType.SignedInteger
      || type === DeviceV2ValueType.UnsignedInteger) return 'integer';
    if (type === DeviceV2ValueType.Float32 || type === DeviceV2ValueType.Float64) return 'number';
    if (type === DeviceV2ValueType.Text) return 'text';
    if (type === DeviceV2ValueType.Bytes) return 'bytes';
    if (type === DeviceV2ValueType.Object) return 'object';
    if (type === DeviceV2ValueType.Array) return 'array';
    return 'null';
  }
}
