import { Capacitor } from '@capacitor/core';
import { snapshotBc5AcceptanceAdmission, type Bc5AcceptanceAdmission } from './bc5-acceptance-client';
import { bc5CheckpointNative } from './bc5-install-checkpoint';

const fields = ['origin', 'ownerUserId', 'tenantId', 'region', 'intentId', 'sourceLogicalDeviceId', 'expiresAt'];
const invalid = () => Error('BC5_ACCEPTANCE_ADMISSION_INVALID');

/** Native profile only: no default origin and no write authority. */
export function parseBc5LaunchProfile(value: unknown): Bc5AcceptanceAdmission {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    const prototype = Object.getPrototypeOf(value), keys = Reflect.ownKeys(value);
    if ((prototype !== Object.prototype && prototype !== null) || keys.length !== fields.length
      || !fields.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor?.enumerable && Object.hasOwn(descriptor, 'value');
      })) throw invalid();
    return snapshotBc5AcceptanceAdmission(value as Bc5AcceptanceAdmission);
  } catch { throw invalid(); }
}

async function readNativeAdmission(read: () => Promise<unknown>): Promise<Bc5AcceptanceAdmission | undefined> {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('BlinkerBc5Checkpoint')) return undefined;
  let value: unknown;
  try { value = await read(); }
  catch { throw Error('BC5_LAUNCH_PROFILE_UNAVAILABLE'); }
  return parseBc5LaunchProfile(value);
}

export function readBc5LaunchProfile(): Promise<Bc5AcceptanceAdmission | undefined> {
  return readNativeAdmission(() => bc5CheckpointNative.getAdmission());
}

export function readBc5RecoveryProfile(): Promise<Bc5AcceptanceAdmission | undefined> {
  return readNativeAdmission(() => bc5CheckpointNative.getRecoveryAdmission());
}
