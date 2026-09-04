import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Capacitor } from '@capacitor/core';

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
  version: 1;
}

const PREFIX = 'blinker_v2_edge_gateway_enrollment_';

export class CapacitorEdgeGatewayEnrollmentCheckpointStore
implements EdgeGatewayEnrollmentCheckpointStore {
  async save(value: EdgeGatewayEnrollmentCheckpoint): Promise<void> {
    requireNative();
    validate(value);
    const stored: StoredCheckpoint = { version: 1, ...value };
    await SecureStorage.setItem(PREFIX + value.childLogicalDeviceId, JSON.stringify(stored));
  }

  async list(): Promise<EdgeGatewayEnrollmentCheckpoint[]> {
    requireNative();
    const output: EdgeGatewayEnrollmentCheckpoint[] = [];
    for (const key of new Set(await SecureStorage.keys())) {
      if (!key.startsWith(PREFIX)) continue;
      const childLogicalDeviceId = key.slice(PREFIX.length);
      const encoded = await SecureStorage.getItem(key);
      if (encoded !== null) output.push(decode(encoded, childLogicalDeviceId));
    }
    return output;
  }

  async remove(childLogicalDeviceId: string): Promise<void> {
    requireNative();
    if (!boundedId(childLogicalDeviceId)) {
      throw new Error('EDGE_GATEWAY_ENROLLMENT_CHECKPOINT_INVALID');
    }
    await SecureStorage.removeItem(PREFIX + childLogicalDeviceId);
  }
}

function decode(value: string, childLogicalDeviceId: string): EdgeGatewayEnrollmentCheckpoint {
  let stored: StoredCheckpoint;
  try {
    stored = JSON.parse(value) as StoredCheckpoint;
  } catch {
    throw new Error('EDGE_GATEWAY_ENROLLMENT_CHECKPOINT_CORRUPT');
  }
  if (stored.version !== 1 || stored.childLogicalDeviceId !== childLogicalDeviceId) {
    throw new Error('EDGE_GATEWAY_ENROLLMENT_CHECKPOINT_CORRUPT');
  }
  validate(stored);
  return {
    edgeHubLogicalDeviceId: stored.edgeHubLogicalDeviceId,
    childLogicalDeviceId: stored.childLogicalDeviceId,
  };
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
