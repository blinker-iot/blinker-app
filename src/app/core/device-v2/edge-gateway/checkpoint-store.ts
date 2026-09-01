import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

import { base64UrlDecode, base64UrlEncode } from '../ble-direct/wire';
import { EdgeGatewayAttachRequest } from './api';

export type EdgeGatewayAttachCheckpoint = EdgeGatewayAttachRequest;

export interface EdgeGatewayAttachCheckpointStore {
  save(value: EdgeGatewayAttachCheckpoint): Promise<void>;
  load(operationId: Uint8Array): Promise<EdgeGatewayAttachCheckpoint | undefined>;
  list(): Promise<EdgeGatewayAttachCheckpoint[]>;
  remove(operationId: Uint8Array): Promise<void>;
}

interface StoredCheckpoint {
  version: 1;
  operationId: string;
  edgeHubLogicalDeviceId: string;
  childLogicalDeviceId: string;
  childDeviceInstanceId: string;
}

const PREFIX = 'blinker_v2_edge_gateway_attach_';

export class CapacitorEdgeGatewayAttachCheckpointStore
implements EdgeGatewayAttachCheckpointStore {
  async save(value: EdgeGatewayAttachCheckpoint): Promise<void> {
    requireNative();
    validateCheckpoint(value);
    const stored: StoredCheckpoint = {
      version: 1,
      operationId: base64UrlEncode(value.operationId),
      edgeHubLogicalDeviceId: value.edgeHubLogicalDeviceId,
      childLogicalDeviceId: value.childLogicalDeviceId,
      childDeviceInstanceId: base64UrlEncode(value.childDeviceInstanceId),
    };
    await SecureStorage.setItem(PREFIX + stored.operationId, JSON.stringify(stored));
  }

  async load(operationId: Uint8Array): Promise<EdgeGatewayAttachCheckpoint | undefined> {
    requireNative();
    const encodedId = operationText(operationId);
    const value = await SecureStorage.getItem(PREFIX + encodedId);
    if (value === null) return undefined;
    return decodeCheckpoint(value, encodedId);
  }

  async list(): Promise<EdgeGatewayAttachCheckpoint[]> {
    requireNative();
    const output: EdgeGatewayAttachCheckpoint[] = [];
    for (const key of new Set(await SecureStorage.keys())) {
      if (!key.startsWith(PREFIX)) continue;
      const encodedId = key.slice(PREFIX.length);
      const value = await SecureStorage.getItem(key);
      if (value !== null) output.push(decodeCheckpoint(value, encodedId));
    }
    return output;
  }

  async remove(operationId: Uint8Array): Promise<void> {
    requireNative();
    await SecureStorage.removeItem(PREFIX + operationText(operationId));
  }
}

function decodeCheckpoint(value: string, encodedId: string): EdgeGatewayAttachCheckpoint {
  let stored: StoredCheckpoint;
  try {
    stored = JSON.parse(value) as StoredCheckpoint;
  } catch {
    throw new Error('EDGE_GATEWAY_CHECKPOINT_CORRUPT');
  }
  if (stored.version !== 1 || stored.operationId !== encodedId) {
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
