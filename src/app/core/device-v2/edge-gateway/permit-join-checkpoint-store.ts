import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Capacitor } from '@capacitor/core';

import { base64UrlDecode, base64UrlEncode } from '../ble-direct/wire';
import {
  DeviceV2AccountScope,
  DeviceV2AccountScopeProvider,
  deviceV2AccountStoragePrefix,
  validateDeviceV2AccountScope,
} from '../account-scope';

export interface EdgeGatewayPermitJoinCheckpoint {
  operationId: Uint8Array;
  edgeHubLogicalDeviceId: string;
  adapterId: number;
}

export interface EdgeGatewayPermitJoinCheckpointStore {
  save(value: EdgeGatewayPermitJoinCheckpoint): Promise<void>;
  list(): Promise<EdgeGatewayPermitJoinCheckpoint[]>;
  remove(operationId: Uint8Array): Promise<void>;
}

interface StoredCheckpoint {
  version: 2;
  authority: string;
  accountId: string;
  operationId: string;
  edgeHubLogicalDeviceId: string;
  adapterId: number;
}

const PREFIX = 'blinker_v2_edge_gateway_permit_join_';

export class CapacitorEdgeGatewayPermitJoinCheckpointStore
implements EdgeGatewayPermitJoinCheckpointStore {
  constructor(private readonly scope: DeviceV2AccountScopeProvider) {}

  async save(value: EdgeGatewayPermitJoinCheckpoint): Promise<void> {
    requireNative();
    const scope = this.currentScope();
    validate(value);
    const stored: StoredCheckpoint = {
      version: 2,
      authority: scope.authority,
      accountId: scope.accountId,
      operationId: base64UrlEncode(value.operationId),
      edgeHubLogicalDeviceId: value.edgeHubLogicalDeviceId,
      adapterId: value.adapterId,
    };
    await SecureStorage.setItem(scopedPrefix(scope) + stored.operationId, JSON.stringify(stored));
  }

  async list(): Promise<EdgeGatewayPermitJoinCheckpoint[]> {
    requireNative();
    const scope = this.currentScope();
    const prefix = scopedPrefix(scope);
    const output: EdgeGatewayPermitJoinCheckpoint[] = [];
    for (const key of new Set(await SecureStorage.keys())) {
      if (!key.startsWith(prefix)) continue;
      const value = await SecureStorage.getItem(key);
      if (value !== null) output.push(decode(value, scope, key.slice(prefix.length)));
    }
    return output;
  }

  async remove(operationId: Uint8Array): Promise<void> {
    requireNative();
    await SecureStorage.removeItem(
      scopedPrefix(this.currentScope()) + operationText(operationId),
    );
  }

  private currentScope(): DeviceV2AccountScope {
    return validateDeviceV2AccountScope(this.scope());
  }
}

function decode(
  value: string,
  scope: DeviceV2AccountScope,
  encodedId: string,
): EdgeGatewayPermitJoinCheckpoint {
  let stored: StoredCheckpoint;
  try {
    stored = JSON.parse(value) as StoredCheckpoint;
  } catch {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_CHECKPOINT_CORRUPT');
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)
    || stored.version !== 2 || stored.authority !== scope.authority
    || stored.accountId !== scope.accountId || stored.operationId !== encodedId) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_CHECKPOINT_CORRUPT');
  }
  const result: EdgeGatewayPermitJoinCheckpoint = {
    operationId: base64UrlDecode(stored.operationId, 16),
    edgeHubLogicalDeviceId: stored.edgeHubLogicalDeviceId,
    adapterId: stored.adapterId,
  };
  validate(result);
  return result;
}

function scopedPrefix(scope: DeviceV2AccountScope): string {
  return deviceV2AccountStoragePrefix(PREFIX, scope);
}

function validate(value: EdgeGatewayPermitJoinCheckpoint): void {
  operationText(value.operationId);
  if (!boundedId(value.edgeHubLogicalDeviceId)
    || !Number.isSafeInteger(value.adapterId) || value.adapterId < 1
    || value.adapterId > 0xffff) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_CHECKPOINT_INVALID');
  }
}

function operationText(value: Uint8Array): string {
  if (!(value instanceof Uint8Array) || value.length !== 16
    || !value.some(byte => byte !== 0)) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_OPERATION_ID_INVALID');
  }
  return base64UrlEncode(value);
}

function boundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
    && !value.includes('/') && !value.includes('\0');
}

function requireNative(): void {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_SECURE_STORAGE_REQUIRED');
  }
}
