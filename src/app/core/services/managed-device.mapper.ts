import { Subject } from 'rxjs';

import { BlinkerDevice } from '../model/device.model';

export interface ManagedDeviceDto {
  deviceId: string;
  tenantId?: string;
  name: string;
  deviceType: string;
  status: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface ManagedDeviceListResponse {
  devices: ManagedDeviceDto[];
}

export interface ManagedDeviceResponse {
  device: ManagedDeviceDto;
}

export interface ManagedDeviceStatusDto {
  status: number;
  mode?: string;
  lastActiveAt?: string | number | null;
  updatedAt?: string | number | null;
  httpAuthed?: boolean;
  httpAuthFresh?: boolean;
  httpAuthAt?: string | number | null;
  mqttOnline?: boolean;
  mqttConnectedAt?: string | number | null;
  mqttLastSeenAt?: string | number | null;
}

export interface ManagedDeviceStatusResponse {
  device: Pick<ManagedDeviceDto, 'deviceId' | 'status'>;
  status: ManagedDeviceStatusDto;
  brokerStatus?: string;
}

export interface ManagedDeviceSnapshotDto {
  protocol: string;
  receivedAt: number;
  sourceClientId: string;
  data?: unknown;
}

export interface ManagedDeviceSnapshotResponse {
  device: Pick<ManagedDeviceDto, 'deviceId'>;
  data: ManagedDeviceSnapshotDto | null;
}

export interface ManagedDeviceConfigResponse {
  config: Record<string, unknown>;
}

export interface ManagedDeviceSnapshotMetadata {
  protocol: 'json';
  receivedAt: number;
  sourceClientId: string;
}

export interface ManagedDeviceMetadata {
  tenantId?: string;
  lifecycleStatus?: string;
  createdAt?: number;
  updatedAt?: number;
  mqttOnline?: boolean;
  brokerStatus?: string;
  lastActiveAt?: string | number | null;
  latestSnapshot?: ManagedDeviceSnapshotMetadata;
  projectedSnapshotKeys?: string[];
}

export type ManagedBlinkerDevice = BlinkerDevice & {
  isManaged: true;
  managed: ManagedDeviceMetadata;
  config: BlinkerDevice['config'] & {
    rawConfig?: Record<string, unknown>;
  };
};

const PROTOTYPE_POLLUTION_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/** Keys owned by the App runtime rather than the device's JSON payload. */
export const MANAGED_SNAPSHOT_RESERVED_KEYS = new Set([
  ...PROTOTYPE_POLLUTION_KEYS,
  'enable',
  'state',
  'oldState',
  'switch',
  'hasNewVersion',
  'layouterData',
  'history',
  'receivedAt',
  'sourceClientId',
  'protocol',
  'id',
  'deviceId',
  'deviceName',
  'deviceType',
  'isManaged',
  'managed',
  'config',
  'storage',
  'subject',
  'authKey',
]);

type SafeJsonValue =
  | null
  | boolean
  | number
  | string
  | SafeJsonValue[]
  | { [key: string]: SafeJsonValue };

function cloneSafeJson(
  value: unknown,
  ancestors: Set<object> = new Set(),
): SafeJsonValue | undefined {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'object' || ancestors.has(value)) return undefined;

  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    return undefined;
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    const cloned: SafeJsonValue[] = [];
    for (const item of value) {
      const safeItem = cloneSafeJson(item, ancestors);
      if (typeof safeItem === 'undefined') {
        ancestors.delete(value);
        return undefined;
      }
      cloned.push(safeItem);
    }
    ancestors.delete(value);
    return cloned;
  }

  const cloned: { [key: string]: SafeJsonValue } = {};
  for (const [key, item] of Object.entries(value)) {
    if (PROTOTYPE_POLLUTION_KEYS.has(key)) continue;
    const safeItem = cloneSafeJson(item, ancestors);
    if (typeof safeItem !== 'undefined') cloned[key] = safeItem;
  }
  ancestors.delete(value);
  return cloned;
}

function projectSnapshotData(value: unknown): Record<string, SafeJsonValue> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return {};

  const projected: Record<string, SafeJsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (MANAGED_SNAPSHOT_RESERVED_KEYS.has(key)) continue;
    const safeItem = cloneSafeJson(item);
    if (typeof safeItem !== 'undefined') projected[key] = safeItem;
  }
  return projected;
}

function clearProjectedSnapshot(device: ManagedBlinkerDevice): void {
  for (const key of device.managed.projectedSnapshotKeys || []) {
    delete device.data[key];
  }
  device.managed.projectedSnapshotKeys = [];
  device.managed.latestSnapshot = undefined;
}

/**
 * Creates or updates a managed-device view. Existing object/data/config/Subject
 * identities are retained so current component subscriptions remain valid.
 */
export function mapManagedDevice(
  dto: ManagedDeviceDto,
  existing?: ManagedBlinkerDevice,
): ManagedBlinkerDevice {
  const device = (existing || {
    deviceName: dto.deviceId,
    config: {
      broker: '',
      customName: dto.name,
      mode: 'managed-http',
      image: 'unknown',
      headerStyle: 'light',
    },
    data: { enable: false, state: 'offline' },
    storage: {},
    subject: new Subject<unknown>(),
    isManaged: true,
    managed: {},
  }) as ManagedBlinkerDevice;

  device.id = dto.deviceId;
  device.deviceName = dto.deviceId;
  device.deviceType = dto.deviceType;
  device.isManaged = true;
  device.config.broker = '';
  device.config.customName = dto.name;
  device.config.mode = 'managed-http';
  device.config.showSwitch = false;
  device.config.component = 'TestDashboard';
  device.config.headerStyle = 'light';
  device.config.image ||= 'unknown';

  if (typeof device.data.enable !== 'boolean') device.data.enable = false;
  if (device.data.state !== 'online' && device.data.state !== 'offline') {
    device.data.state = device.data.enable ? 'online' : 'offline';
  }

  device.managed ||= {};
  device.managed.tenantId = dto.tenantId;
  device.managed.lifecycleStatus = dto.status;
  device.managed.createdAt = dto.createdAt;
  device.managed.updatedAt = dto.updatedAt;
  return device;
}

export function applyManagedDeviceConfig(
  device: ManagedBlinkerDevice,
  response: ManagedDeviceConfigResponse,
): ManagedBlinkerDevice {
  const cloned = cloneSafeJson(response.config);
  device.config.rawConfig =
    cloned && typeof cloned === 'object' && !Array.isArray(cloned) ? cloned : {};
  const rawConfig = device.config.rawConfig;
  const displayName = rawConfig['displayName'] ?? rawConfig['customName'];
  if (typeof displayName === 'string' && displayName.trim()) {
    device.config.customName = displayName;
  }
  const image = rawConfig['image'];
  if (typeof image === 'string' && image.trim()) {
    device.config.image = image;
  }
  return device;
}

export function applyManagedDeviceStatus(
  device: ManagedBlinkerDevice,
  response: ManagedDeviceStatusResponse,
): ManagedBlinkerDevice {
  const online = response.status.mqttOnline;
  device.managed.lifecycleStatus = response.device.status;
  device.managed.mqttOnline = online;
  device.managed.brokerStatus = response.brokerStatus;
  device.managed.lastActiveAt = response.status.lastActiveAt;
  device.data.enable = online === true;
  device.data.state =
    online === true ? 'online' : online === false ? 'offline' : 'unknown';
  return device;
}

export function applyManagedDeviceSnapshot(
  device: ManagedBlinkerDevice,
  response: ManagedDeviceSnapshotResponse,
): ManagedBlinkerDevice {
  clearProjectedSnapshot(device);
  const snapshot = response.data;
  if (
    snapshot?.protocol !== 'json' ||
    !Number.isSafeInteger(snapshot.receivedAt) ||
    snapshot.receivedAt < 0 ||
    typeof snapshot.sourceClientId !== 'string'
  ) {
    return device;
  }

  const projected = projectSnapshotData(snapshot.data);
  Object.assign(device.data, projected);
  device.managed.projectedSnapshotKeys = Object.keys(projected);
  device.managed.latestSnapshot = {
    protocol: 'json',
    receivedAt: snapshot.receivedAt,
    sourceClientId: snapshot.sourceClientId,
  };
  return device;
}
