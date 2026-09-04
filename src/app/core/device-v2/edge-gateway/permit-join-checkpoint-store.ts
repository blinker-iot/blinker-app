import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Capacitor } from '@capacitor/core';

import { base64UrlDecode, base64UrlEncode } from '../ble-direct/wire';

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
  version: 1;
  operationId: string;
  edgeHubLogicalDeviceId: string;
  adapterId: number;
}

const PREFIX = 'blinker_v2_edge_gateway_permit_join_';

export class CapacitorEdgeGatewayPermitJoinCheckpointStore
implements EdgeGatewayPermitJoinCheckpointStore {
  async save(value: EdgeGatewayPermitJoinCheckpoint): Promise<void> {
    requireNative();
    validate(value);
    const stored: StoredCheckpoint = {
      version: 1,
      operationId: base64UrlEncode(value.operationId),
      edgeHubLogicalDeviceId: value.edgeHubLogicalDeviceId,
      adapterId: value.adapterId,
    };
    await SecureStorage.setItem(PREFIX + stored.operationId, JSON.stringify(stored));
  }

  async list(): Promise<EdgeGatewayPermitJoinCheckpoint[]> {
    requireNative();
    const output: EdgeGatewayPermitJoinCheckpoint[] = [];
    for (const key of new Set(await SecureStorage.keys())) {
      if (!key.startsWith(PREFIX)) continue;
      const value = await SecureStorage.getItem(key);
      if (value !== null) output.push(decode(value, key.slice(PREFIX.length)));
    }
    return output;
  }

  async remove(operationId: Uint8Array): Promise<void> {
    requireNative();
    await SecureStorage.removeItem(PREFIX + operationText(operationId));
  }
}

function decode(value: string, encodedId: string): EdgeGatewayPermitJoinCheckpoint {
  let stored: StoredCheckpoint;
  try {
    stored = JSON.parse(value) as StoredCheckpoint;
  } catch {
    throw new Error('EDGE_GATEWAY_PERMIT_JOIN_CHECKPOINT_CORRUPT');
  }
  if (stored.version !== 1 || stored.operationId !== encodedId) {
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
