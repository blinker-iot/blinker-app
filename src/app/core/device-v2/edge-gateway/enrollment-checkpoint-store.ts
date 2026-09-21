import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Capacitor } from '@capacitor/core';
import {
  DeviceV2AccountScope,
  DeviceV2AccountScopeProvider,
  deviceV2AccountStoragePrefix,
  validateDeviceV2AccountScope,
} from '../account-scope';

export interface EdgeGatewayEnrollmentCheckpoint {
  edgeHubLogicalDeviceId: string;
  childLogicalDeviceId: string;
}

export interface EdgeGatewayEnrollmentCheckpointStore {
  save(value: EdgeGatewayEnrollmentCheckpoint): Promise<void>;
  list(): Promise<EdgeGatewayEnrollmentCheckpoint[]>;
  remove(childLogicalDeviceId: string): Promise<void>;
}

interface StoredCheckpoint extends EdgeGatewayEnrollmentCheckpoint {
  version: 2;
  authority: string;
  accountId: string;
}

const PREFIX = 'blinker_v2_edge_gateway_enrollment_';

export class CapacitorEdgeGatewayEnrollmentCheckpointStore
implements EdgeGatewayEnrollmentCheckpointStore {
  constructor(private readonly scope: DeviceV2AccountScopeProvider) {}

  async save(value: EdgeGatewayEnrollmentCheckpoint): Promise<void> {
    requireNative();
    const scope = this.currentScope();
    validate(value);
    const stored: StoredCheckpoint = {
      version: 2,
      authority: scope.authority,
      accountId: scope.accountId,
      ...value,
    };
    await SecureStorage.setItem(
      scopedPrefix(scope) + value.childLogicalDeviceId,
      JSON.stringify(stored),
    );
  }

  async list(): Promise<EdgeGatewayEnrollmentCheckpoint[]> {
    requireNative();
    const scope = this.currentScope();
    const prefix = scopedPrefix(scope);
    const output: EdgeGatewayEnrollmentCheckpoint[] = [];
    for (const key of new Set(await SecureStorage.keys())) {
      if (!key.startsWith(prefix)) continue;
      const childLogicalDeviceId = key.slice(prefix.length);
      const encoded = await SecureStorage.getItem(key);
      if (encoded !== null) output.push(decode(encoded, scope, childLogicalDeviceId));
    }
    return output;
  }

  async remove(childLogicalDeviceId: string): Promise<void> {
    requireNative();
    if (!boundedId(childLogicalDeviceId)) {
      throw new Error('EDGE_GATEWAY_ENROLLMENT_CHECKPOINT_INVALID');
    }
    await SecureStorage.removeItem(scopedPrefix(this.currentScope()) + childLogicalDeviceId);
  }

  private currentScope(): DeviceV2AccountScope {
    return validateDeviceV2AccountScope(this.scope());
  }
}

function decode(
  value: string,
  scope: DeviceV2AccountScope,
  childLogicalDeviceId: string,
): EdgeGatewayEnrollmentCheckpoint {
  let stored: StoredCheckpoint;
  try {
    stored = JSON.parse(value) as StoredCheckpoint;
  } catch {
    throw new Error('EDGE_GATEWAY_ENROLLMENT_CHECKPOINT_CORRUPT');
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)
    || stored.version !== 2 || stored.authority !== scope.authority
    || stored.accountId !== scope.accountId
    || stored.childLogicalDeviceId !== childLogicalDeviceId) {
    throw new Error('EDGE_GATEWAY_ENROLLMENT_CHECKPOINT_CORRUPT');
  }
  validate(stored);
  return {
    edgeHubLogicalDeviceId: stored.edgeHubLogicalDeviceId,
    childLogicalDeviceId: stored.childLogicalDeviceId,
  };
}

function scopedPrefix(scope: DeviceV2AccountScope): string {
  return deviceV2AccountStoragePrefix(PREFIX, scope);
}

function validate(value: EdgeGatewayEnrollmentCheckpoint): void {
  if (!boundedId(value.edgeHubLogicalDeviceId) || !boundedId(value.childLogicalDeviceId)) {
    throw new Error('EDGE_GATEWAY_ENROLLMENT_CHECKPOINT_INVALID');
  }
}

function boundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
    && !value.includes('/') && !value.includes('\0');
}

function requireNative(): void {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('EDGE_GATEWAY_ENROLLMENT_SECURE_STORAGE_REQUIRED');
  }
}
