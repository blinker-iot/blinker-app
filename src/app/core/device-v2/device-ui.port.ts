import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';

import {
  DeviceV2EndpointAccess,
  DeviceV2EndpointKind,
  DeviceV2Event,
  DeviceV2ManifestField,
  DeviceV2TargetSnapshot,
  DeviceV2Value,
  DeviceV2ValueType,
} from '../protocol/device-v2';
import {
  DeviceV2AccountState,
  DeviceV2Service,
} from '../services/device-v2.service';

export type DeviceUiConnectionState = DeviceV2AccountState;
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

@Injectable({ providedIn: 'root' })
export class DeviceUiPort {
  readonly connectionState = this.deviceV2.state.asObservable();

  constructor(
    private readonly deviceV2: DeviceV2Service,
    private readonly zone: NgZone = { run: callback => callback() } as NgZone,
  ) {}

  connect(logicalDeviceId: string): Promise<void> {
    return this.deviceV2.ensureReady(logicalDeviceId);
  }

  watchState(logicalDeviceId: string): Observable<DeviceUiSnapshot> {
    return new Observable(subscriber => {
      subscriber.next(this.mapSnapshot(this.deviceV2.snapshot(logicalDeviceId)));
      return this.deviceV2.store.subscribe((changedId, snapshot) => {
        if (changedId === logicalDeviceId) {
          this.zone.run(() => subscriber.next(this.mapSnapshot(snapshot)));
        }
      });
    });
  }

  watchEvents(logicalDeviceId: string): Observable<DeviceUiEvent> {
    return new Observable(subscriber => this.deviceV2.store.subscribeEvents(event => {
      if (event.logicalDeviceId === logicalDeviceId) {
        this.zone.run(() => subscriber.next(this.mapEvent(event)));
      }
    }));
  }

  async sendCommand(logicalDeviceId: string, endpointKey: string, value: unknown): Promise<void> {
    await this.deviceV2.command(logicalDeviceId, endpointKey, value);
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
    return value instanceof Uint8Array ? new Uint8Array(value) : value;
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
