import { registerPlugin } from '@capacitor/core';
import { isServiceRegion, type ServiceRegion } from '../../../configs/service-region.config';
import { isLogicalDeviceReferenceId } from '../../protocol/device-v2/logical-device-reference';
import { base64UrlEncode } from '../base64url';
import type { Bc5CheckpointPort } from './bc5-install-checkpoint';
import { BleDirectCrypto } from './crypto';
import { snapshotInstalledKeyInitialNetwork, type InstalledKeyInitialNetworkOperation } from './initial-cloud-network-wire';

export const INITIAL_NETWORK_CHECKPOINT_NAMESPACE = 'blinker.initial-network-checkpoint.v1';
export const INITIAL_NETWORK_CHECKPOINT_PURPOSE = 'installed-key-initial-network';

export interface InitialNetworkAdmission extends InstalledKeyInitialNetworkOperation {
  origin: string;
  region: ServiceRegion;
  tenantId: string;
  ownerUserId: string;
  cloudCredentialVersion: number;
}

export type InitialNetworkPhase = 'prepared' | 'dispatched' | 'accepted' | 'wifi-dispatched'
  | 'wifi-accepted' | 'wifi-rejected' | 'wifi-unknown';
export type InitialNetworkWifiResult = 'accepted' | 'rejected' | 'unknown';
export interface InitialNetworkCloudObservation { issuedAt: number; stateUpdatedAt: number; observedAt: number }
export interface InitialNetworkCheckpoint {
  version: 1;
  purpose: typeof INITIAL_NETWORK_CHECKPOINT_PURPOSE;
  admission: InitialNetworkAdmission;
  phase: InitialNetworkPhase;
  createdAt: number;
  updatedAt: number;
  dispatchedAt?: number;
  acceptedAt?: number;
  wifiDispatchedAt?: number;
  wifiResultAt?: number;
  cloudIssuedAt?: number;
  cloudStateUpdatedAt?: number;
  cloudObservedAt?: number;
}

export const initialNetworkCheckpointNative = registerPlugin<Bc5CheckpointPort & {
  getInitialNetworkAdmission(): Promise<unknown>;
}>('BlinkerBc5Checkpoint');

const invalid = () => Error('INITIAL_NETWORK_CHECKPOINT_INVALID');
const recovery = () => Error('INITIAL_NETWORK_CHECKPOINT_RECOVERY_REQUIRED');
const unconfirmed = () => Error('INITIAL_NETWORK_CHECKPOINT_WRITE_UNCONFIRMED');
const windowClosed = () => Error('INITIAL_NETWORK_CHECKPOINT_WINDOW_CLOSED');
const phaseConflict = () => Error('INITIAL_NETWORK_CHECKPOINT_PHASE_CONFLICT');
const time = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const u32 = (value: unknown): value is number => time(value) && value <= 0xffffffff;
const admissionKeys = ['contract', 'operationId', 'sourceLogicalDeviceId', 'targetLogicalDeviceId', 'expectedRoot',
  'existingLocator', 'expiresAt', 'origin', 'region', 'tenantId', 'ownerUserId', 'cloudCredentialVersion'];
const rootKeys = ['deviceInstanceId', 'accessEpoch', 'controllerId', 'credentialVersion', 'adminFingerprint'];
const optionalTimes = ['dispatchedAt', 'acceptedAt', 'wifiDispatchedAt', 'wifiResultAt',
  'cloudIssuedAt', 'cloudStateUpdatedAt', 'cloudObservedAt'] as const;

function fields(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const prototype = Object.getPrototypeOf(value), keys = Reflect.ownKeys(value);
  if ((prototype !== Object.prototype && prototype !== null) || required.some(key => !Object.hasOwn(value, key))
    || keys.some(key => typeof key !== 'string' || (!required.includes(key) && !optional.includes(key))
      || !Object.getOwnPropertyDescriptor(value, key)?.enumerable
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) throw invalid();
  return value as Record<string, unknown>;
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value.trim() === value
    && !/[\u0000-\u001f\u007f/]/.test(value) && new TextEncoder().encode(value).length <= 128;
}

/** Metadata only; no Key, secret, receipt, session binding or AP/PoP fields. */
export function snapshotInitialNetworkAdmission(value: unknown): InitialNetworkAdmission {
  try {
    const item = fields(value, admissionKeys);
    fields(item['expectedRoot'], rootKeys);
    const operation = snapshotInstalledKeyInitialNetwork(item as unknown as InstalledKeyInitialNetworkOperation);
    const { origin, region, tenantId, ownerUserId, cloudCredentialVersion } = item;
    if (typeof origin !== 'string' || origin.length > 512 || !isServiceRegion(region)
      || !identifier(tenantId) || !identifier(ownerUserId) || !u32(cloudCredentialVersion)
      || !isLogicalDeviceReferenceId(operation.sourceLogicalDeviceId)
      || !isLogicalDeviceReferenceId(operation.targetLogicalDeviceId)) throw invalid();
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || url.port === '0') throw invalid();
    return Object.freeze({ ...operation, expectedRoot: Object.freeze({ ...operation.expectedRoot }),
      origin, region, tenantId, ownerUserId, cloudCredentialVersion });
  } catch { throw invalid(); }
}

function decode(raw: unknown, admission: InitialNetworkAdmission): InitialNetworkCheckpoint {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096) throw invalid();
  try {
    const item = fields(JSON.parse(raw), ['version', 'purpose', 'admission', 'phase', 'createdAt', 'updatedAt'], optionalTimes);
    const context = snapshotInitialNetworkAdmission(item['admission']);
    const { phase, createdAt, updatedAt } = item;
    const phases: InitialNetworkPhase[] = ['prepared', 'dispatched', 'accepted', 'wifi-dispatched',
      'wifi-accepted', 'wifi-rejected', 'wifi-unknown'];
    if (item['version'] !== 1 || item['purpose'] !== INITIAL_NETWORK_CHECKPOINT_PURPOSE
      || JSON.stringify(context) !== JSON.stringify(admission) || !phases.includes(phase as InitialNetworkPhase)
      || !time(createdAt) || !time(updatedAt) || updatedAt < createdAt || updatedAt >= admission.expiresAt) throw invalid();
    const output: InitialNetworkCheckpoint = { version: 1, purpose: INITIAL_NETWORK_CHECKPOINT_PURPOSE,
      admission: context, phase: phase as InitialNetworkPhase, createdAt, updatedAt };
    for (const key of optionalTimes) {
      if (Object.hasOwn(item, key)) {
        const value = item[key];
        if (!time(value) || value < createdAt || value > updatedAt) throw invalid();
        output[key] = value;
      }
    }
    const requireTime = (key: typeof optionalTimes[number], required: boolean, after: number) => {
      const value = output[key];
      if (required ? value === undefined || value < after : value !== undefined) throw invalid();
    };
    const index = phases.indexOf(output.phase);
    requireTime('dispatchedAt', index >= 1, createdAt);
    requireTime('acceptedAt', index >= 2, output.dispatchedAt ?? createdAt);
    requireTime('wifiDispatchedAt', index >= 3, output.acceptedAt ?? createdAt);
    requireTime('wifiResultAt', index >= 4, output.wifiDispatchedAt ?? createdAt);
    const cloud = output.cloudObservedAt !== undefined;
    requireTime('cloudIssuedAt', cloud, (output.wifiDispatchedAt ?? updatedAt) + 1);
    requireTime('cloudStateUpdatedAt', cloud, output.cloudIssuedAt ?? updatedAt);
    requireTime('cloudObservedAt', cloud, output.cloudStateUpdatedAt ?? updatedAt);
    if (cloud && (index < 3 || phase === 'wifi-rejected')) throw invalid();
    // Exact serialization also rejects duplicate fields, extra nested data and
    // noncanonical evidence instead of silently repairing an old checkpoint.
    if (JSON.stringify(output) !== raw) throw invalid();
    return output;
  } catch { throw invalid(); }
}

/** Reuses the checked native CAS port under a separate purpose/scope. Only the
 * live instance whose prepare CAS succeeded may advance; every recovered record
 * (even prepared) is inspection-only. A failed/unknown CAS is never retried. */
export class InitialNetworkCheckpoints {
  private readonly admission: InitialNetworkAdmission;
  private keyPromise?: Promise<{ scope: string; intentId: string }>;
  private attempted = false;
  private live = false;
  private raw?: string;

  constructor(admission: InitialNetworkAdmission, private readonly assertCurrent: () => void,
    private readonly port: Bc5CheckpointPort = initialNetworkCheckpointNative,
    private readonly crypto = new BleDirectCrypto(), private readonly now: () => number = Date.now) {
    this.admission = snapshotInitialNetworkAdmission(admission);
  }

  async inspect(): Promise<InitialNetworkCheckpoint | undefined> {
    const key = await this.key();
    this.checkCurrent();
    const result = await this.port.read(key);
    this.checkCurrent();
    const item = fields(result, ['encoded']);
    const value = item['encoded'] === null ? undefined : decode(item['encoded'], this.admission);
    const now = this.now();
    if ((value && this.raw !== item['encoded']) || !time(now) || now >= this.admission.expiresAt
      || (value && now < value.updatedAt)) this.closeWrites();
    return value;
  }

  async prepare(): Promise<InitialNetworkCheckpoint> {
    if (this.attempted) throw recovery();
    this.attempted = true;
    const now = this.writeTime();
    const value: InitialNetworkCheckpoint = { version: 1, purpose: INITIAL_NETWORK_CHECKPOINT_PURPOSE,
      admission: this.admission, phase: 'prepared', createdAt: now, updatedAt: now };
    await this.persist(null, value);
    return decode(this.raw, this.admission);
  }

  async markDispatch(): Promise<void> {
    const value = this.current('prepared'), now = this.writeTime(value.updatedAt);
    await this.persist(this.raw!, { ...value, phase: 'dispatched', updatedAt: now, dispatchedAt: now });
  }
  async markAccepted(): Promise<void> {
    const value = this.current('dispatched'), now = this.writeTime(value.updatedAt);
    await this.persist(this.raw!, { ...value, phase: 'accepted', updatedAt: now, acceptedAt: now });
  }
  async markWifiDispatch(): Promise<void> {
    const value = this.current('accepted'), now = this.writeTime(value.updatedAt);
    await this.persist(this.raw!, { ...value, phase: 'wifi-dispatched', updatedAt: now, wifiDispatchedAt: now });
  }
  async markWifiResult(result: InitialNetworkWifiResult): Promise<void> {
    const value = this.current('wifi-dispatched'), now = this.writeTime(value.updatedAt);
    if (!['accepted', 'rejected', 'unknown'].includes(result) || (result === 'rejected' && value.cloudObservedAt !== undefined))
      throw phaseConflict();
    await this.persist(this.raw!, { ...value, phase: `wifi-${result}`, updatedAt: now, wifiResultAt: now });
  }
  async markCloudObserved(evidence: InitialNetworkCloudObservation): Promise<void> {
    const value = this.current(), now = this.writeTime(value.updatedAt);
    if (!['wifi-dispatched', 'wifi-accepted', 'wifi-unknown'].includes(value.phase)
      || value.cloudObservedAt !== undefined) throw phaseConflict();
    fields(evidence, ['issuedAt', 'stateUpdatedAt', 'observedAt']);
    if (!time(evidence.issuedAt) || !time(evidence.stateUpdatedAt) || !time(evidence.observedAt)
      || evidence.issuedAt <= value.wifiDispatchedAt! || evidence.stateUpdatedAt < evidence.issuedAt
      || evidence.observedAt < evidence.stateUpdatedAt || evidence.observedAt > now) throw invalid();
    await this.persist(this.raw!, { ...value, updatedAt: now, cloudIssuedAt: evidence.issuedAt,
      cloudStateUpdatedAt: evidence.stateUpdatedAt, cloudObservedAt: evidence.observedAt });
  }

  private current(phase?: InitialNetworkPhase): InitialNetworkCheckpoint {
    this.checkCurrent();
    if (!this.live) throw recovery();
    const value = decode(this.raw, this.admission);
    if (phase !== undefined && value.phase !== phase) throw phaseConflict();
    return value;
  }
  private closeWrites(): void { this.live = false; this.attempted = true; }
  private checkCurrent(): void {
    try { this.assertCurrent(); }
    catch (error) { this.closeWrites(); throw error; }
  }
  private writeTime(after = 0): number {
    this.checkCurrent();
    const now = this.now();
    if (!time(now) || now < after || now >= this.admission.expiresAt) {
      this.closeWrites();
      throw windowClosed();
    }
    return now;
  }
  private key(): Promise<{ scope: string; intentId: string }> {
    this.checkCurrent();
    return this.keyPromise ??= (async () => {
      const { origin, region, tenantId, ownerUserId, operationId } = this.admission;
      const tuple = new TextEncoder().encode(JSON.stringify([
        INITIAL_NETWORK_CHECKPOINT_NAMESPACE, origin, region, tenantId, ownerUserId,
      ]));
      const digest = await this.crypto.sha256(tuple);
      this.checkCurrent();
      return { scope: base64UrlEncode(digest), intentId: operationId };
    })();
  }
  private async persist(expected: string | null, value: InitialNetworkCheckpoint): Promise<void> {
    fields(value, ['version', 'purpose', 'admission', 'phase', 'createdAt', 'updatedAt'], optionalTimes);
    const ordered: InitialNetworkCheckpoint = { version: value.version, purpose: value.purpose,
      admission: value.admission, phase: value.phase, createdAt: value.createdAt, updatedAt: value.updatedAt };
    for (const key of optionalTimes) if (value[key] !== undefined) ordered[key] = value[key];
    const encoded = JSON.stringify(ordered);
    decode(encoded, this.admission);
    this.live = false; // Includes an in-flight CAS, stale caller or unknown disk commit.
    const key = await this.key();
    this.writeTime(value.updatedAt);
    let result: { applied: boolean };
    try { result = await this.port.compareAndSet({ ...key, expected, encoded }); }
    catch { throw unconfirmed(); }
    this.writeTime(value.updatedAt);
    if (result?.applied === false) throw recovery();
    if (result?.applied !== true) throw unconfirmed();
    this.raw = encoded;
    this.live = true;
  }
}
