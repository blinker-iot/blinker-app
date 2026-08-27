import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';

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
import { DeviceV2BleService } from '../services/device-v2-ble.service';
import { AppVisibilityService } from '../services/app-visibility.service';
import { DeviceV2ManifestCache } from '../services/device-v2-manifest-cache.service';

export type DeviceUiConnectionState = DeviceV2AccountState | 'nearby';
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

  constructor(
    private readonly deviceV2: DeviceV2Service,
    private readonly ble: DeviceV2BleService,
    private readonly zone: NgZone,
    appVisibility: AppVisibilityService,
    private readonly manifestCache?: DeviceV2ManifestCache,
  ) {
    this.appActive = appVisibility.active.asObservable();
  }

  connect(logicalDeviceId: string): Promise<void> {
    return this.isBleDirect(logicalDeviceId)
      ? this.ble.ensureReady(logicalDeviceId)
      : this.deviceV2.ensureReady(logicalDeviceId);
  }

  disconnect(logicalDeviceId: string): Promise<void> {
    return this.isBleDirect(logicalDeviceId)
      ? this.ble.disconnect(logicalDeviceId)
      : Promise.resolve();
  }

  watchConnection(logicalDeviceId: string): Observable<DeviceUiConnectionState> {
    const source = this.isBleDirect(logicalDeviceId)
      ? this.ble.watchConnection(logicalDeviceId)
      : this.deviceV2.state;
    return new Observable(subscriber => source.subscribe(state => {
      this.zone.run(() => subscriber.next(state));
    }));
  }

  refreshBlePresence(logicalDeviceIds: readonly string[]): Promise<void> {
    return this.ble.refreshPresence(logicalDeviceIds.filter(
      logicalDeviceId => this.isBleDirect(logicalDeviceId),
    ));
  }

  watchState(logicalDeviceId: string): Observable<DeviceUiSnapshot> {
    return new Observable(subscriber => {
      const direct = this.isBleDirect(logicalDeviceId);
      const cached = this.cachedSnapshot(logicalDeviceId);
      const initial = this.mapSnapshot(
        direct ? this.ble.snapshot(logicalDeviceId) : this.deviceV2.snapshot(logicalDeviceId),
      );
      subscriber.next(initial.manifestAccepted ? initial : cached ?? initial);
      const subscribe = direct
        ? this.ble.subscribe.bind(this.ble)
        : this.deviceV2.store.subscribe.bind(this.deviceV2.store);
      return subscribe((changedId, snapshot) => {
        if (changedId === logicalDeviceId) {
          const mapped = this.mapSnapshot(snapshot);
          this.zone.run(() => subscriber.next(
            mapped.manifestAccepted ? mapped : this.cachedSnapshot(logicalDeviceId) ?? mapped,
          ));
        }
      });
    });
  }

  watchEvents(logicalDeviceId: string): Observable<DeviceUiEvent> {
    const subscribe = this.isBleDirect(logicalDeviceId)
      ? this.ble.subscribeEvents.bind(this.ble)
      : this.deviceV2.store.subscribeEvents.bind(this.deviceV2.store);
    return new Observable(subscriber => subscribe(event => {
      if (event.logicalDeviceId === logicalDeviceId) {
        this.zone.run(() => subscriber.next(this.mapEvent(event)));
      }
    }));
  }

  async sendCommand(logicalDeviceId: string, endpointKey: string, value: unknown): Promise<void> {
    if (this.isBleDirect(logicalDeviceId)) {
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
    if (this.isBleDirect(logicalDeviceId)) {
      throw new Error('BLE_DIRECT_TELEMETRY_NOT_ENABLED');
    }
    const lease = await this.deviceV2.openTelemetry(logicalDeviceId, endpointKeys, intervalMs);
    return new DeviceUiTelemetryLeaseAdapter(lease, this.zone);
  }

  isBleDirect(logicalDeviceId: string): boolean {
    return /^ble_[A-Za-z0-9_-]{22}$/.test(logicalDeviceId);
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
