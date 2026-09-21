import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

import { base64UrlDecode, base64UrlEncode } from '../ble-direct/wire';
import {
  DeviceV2AccountScope,
  DeviceV2AccountScopeProvider,
  deviceV2AccountStoragePrefix,
  validateDeviceV2AccountScope,
} from '../account-scope';
import { EdgeGatewayAttachRequest } from './api';

export type EdgeGatewayAttachCheckpoint = EdgeGatewayAttachRequest;

export interface EdgeGatewayAttachCheckpointStore {
  save(value: EdgeGatewayAttachCheckpoint): Promise<void>;
  load(operationId: Uint8Array): Promise<EdgeGatewayAttachCheckpoint | undefined>;
  list(): Promise<EdgeGatewayAttachCheckpoint[]>;
  remove(operationId: Uint8Array): Promise<void>;
}

interface StoredCheckpoint {
  version: 2;
  authority: string;
  accountId: string;
  operationId: string;
  edgeHubLogicalDeviceId: string;
  childLogicalDeviceId: string;
  childDeviceInstanceId: string;
}

const PREFIX = 'blinker_v2_edge_gateway_attach_';

export class CapacitorEdgeGatewayAttachCheckpointStore
implements EdgeGatewayAttachCheckpointStore {
  constructor(private readonly scope: DeviceV2AccountScopeProvider) {}

  async save(value: EdgeGatewayAttachCheckpoint): Promise<void> {
    requireNative();
    const scope = this.currentScope();
    validateCheckpoint(value);
    const stored: StoredCheckpoint = {
      version: 2,
      authority: scope.authority,
      accountId: scope.accountId,
      operationId: base64UrlEncode(value.operationId),
      edgeHubLogicalDeviceId: value.edgeHubLogicalDeviceId,
      childLogicalDeviceId: value.childLogicalDeviceId,
      childDeviceInstanceId: base64UrlEncode(value.childDeviceInstanceId),
    };
    await SecureStorage.setItem(scopedPrefix(scope) + stored.operationId, JSON.stringify(stored));
  }

  async load(operationId: Uint8Array): Promise<EdgeGatewayAttachCheckpoint | undefined> {
    requireNative();
    const scope = this.currentScope();
    const encodedId = operationText(operationId);
    const value = await SecureStorage.getItem(scopedPrefix(scope) + encodedId);
    if (value === null) return undefined;
    return decodeCheckpoint(value, scope, encodedId);
  }

  async list(): Promise<EdgeGatewayAttachCheckpoint[]> {
    requireNative();
    const scope = this.currentScope();
    const prefix = scopedPrefix(scope);
    const output: EdgeGatewayAttachCheckpoint[] = [];
    for (const key of new Set(await SecureStorage.keys())) {
      if (!key.startsWith(prefix)) continue;
      const encodedId = key.slice(prefix.length);
      const value = await SecureStorage.getItem(key);
      if (value !== null) output.push(decodeCheckpoint(value, scope, encodedId));
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

function decodeCheckpoint(
  value: string,
  scope: DeviceV2AccountScope,
  encodedId: string,
): EdgeGatewayAttachCheckpoint {
  let stored: StoredCheckpoint;
  try {
    stored = JSON.parse(value) as StoredCheckpoint;
  } catch {
    throw new Error('EDGE_GATEWAY_CHECKPOINT_CORRUPT');
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)
    || stored.version !== 2 || stored.authority !== scope.authority
    || stored.accountId !== scope.accountId || stored.operationId !== encodedId) {
    throw new Error('EDGE_GATEWAY_CHECKPOINT_CORRUPT');
  }
  const result = {
    operationId: base64UrlDecode(stored.operationId, 16),
    edgeHubLogicalDeviceId: stored.edgeHubLogicalDeviceId,
    childLogicalDeviceId: stored.childLogicalDeviceId,
    childDeviceInstanceId: base64UrlDecode(stored.childDeviceInstanceId, 16),
  };
  validateCheckpoint(result);
  return result;
}

function scopedPrefix(scope: DeviceV2AccountScope): string {
  return deviceV2AccountStoragePrefix(PREFIX, scope);
}

function validateCheckpoint(value: EdgeGatewayAttachCheckpoint): void {
  operationText(value.operationId);
  if (value.childDeviceInstanceId.length !== 16
    || !value.childDeviceInstanceId.some(byte => byte !== 0)
    || !boundedId(value.edgeHubLogicalDeviceId)
    || !boundedId(value.childLogicalDeviceId)) {
    throw new Error('EDGE_GATEWAY_CHECKPOINT_INVALID');
  }
}

function operationText(value: Uint8Array): string {
  if (value.length !== 16 || !value.some(byte => byte !== 0)) {
    throw new Error('EDGE_GATEWAY_OPERATION_ID_INVALID');
  }
  return base64UrlEncode(value);
}

function boundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
    && !value.includes('/') && !value.includes('\0');
}

function requireNative(): void {
  if (!Capacitor.isNativePlatform()) throw new Error('EDGE_GATEWAY_SECURE_STORAGE_REQUIRED');
}
