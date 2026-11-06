import { registerPlugin } from '@capacitor/core';
import { base64UrlDecode, base64UrlEncode } from '../base64url';
import type { Bc5AcceptanceAdmission } from './bc5-acceptance-client';
import { snapshotIssuedCloudRegistration, type IssuedCloudRegistration } from './cloud-registration-wire';
import { BleDirectCrypto } from './crypto';

const maxLength = 4096;
const corrupt = () => Error('BC5_CHECKPOINT_CORRUPT');

export interface Bc5InstallCheckpoint {
  issued: IssuedCloudRegistration;
  commitId: string;
  recordedAt: number;
  // This timestamp permits the original live caller to proceed; it never
  // proves dispatch or grants permission to a recovered caller.
  armedAt?: number;
}

interface CheckpointKey { scope: string; intentId: string }

/** compareAndSet must return applied only after the exact value is durable.
 * Android SecureStorage's async apply() cannot supply this contract. */
export interface Bc5CheckpointPort {
  read(key: CheckpointKey): Promise<{ encoded: string | null }>;
  compareAndSet(input: CheckpointKey & { expected: string | null; encoded: string }): Promise<{ applied: boolean }>;
}

export const bc5CheckpointNative = registerPlugin<Bc5CheckpointPort & {
  getAdmission(): Promise<unknown>;
  getRecoveryAdmission(): Promise<unknown>;
}>('BlinkerBc5Checkpoint');

/** Independent of v1 and the request journal. No Key, token, receipt,
 * session binding or radio credentials are persisted. */
export class Bc5InstallCheckpoints {
  constructor(private readonly admission: Bc5AcceptanceAdmission, private readonly assertCurrent: () => void,
    private readonly port: Bc5CheckpointPort = bc5CheckpointNative, private readonly crypto = new BleDirectCrypto()) {}

  async load(): Promise<Bc5InstallCheckpoint | undefined> {
    const raw = await this.read(await this.key());
    return raw === null ? undefined : this.decode(raw);
  }

  async reserve(issued: IssuedCloudRegistration, commitId: string): Promise<void> {
    const frozen = snapshotIssuedCloudRegistration(issued);
    const key = await this.key();
    await this.persist(key, null, { issued: frozen, commitId, recordedAt: this.writeTime(frozen) });
  }

  async arm(commitId: string): Promise<void> {
    const key = await this.key(), raw = await this.read(key);
    const current = raw === null ? undefined : this.decode(raw);
    if (!current || current.commitId !== commitId || current.armedAt !== undefined)
      throw Error('BC5_CHECKPOINT_RECOVERY_REQUIRED');
    const armedAt = this.writeTime(current.issued);
    if (armedAt < current.recordedAt) throw Error('BC5_CHECKPOINT_CLOCK_INVALID');
    await this.persist(key, raw, { ...current, armedAt });
  }

  private writeTime(issued: IssuedCloudRegistration): number {
    const now = Date.now();
    if (now <= 0 || now >= Math.min(this.admission.expiresAt, issued.expiresAt)) throw Error('BC5_CHECKPOINT_WINDOW_CLOSED');
    return now;
  }

  private async key(): Promise<CheckpointKey> {
    this.assertCurrent();
    const { origin, region, tenantId, ownerUserId, intentId } = this.admission;
    const tuple = new TextEncoder().encode(JSON.stringify(['blinker.bc5-checkpoint.v1', origin, region, tenantId, ownerUserId]));
    const scope = base64UrlEncode(await this.crypto.sha256(tuple));
    this.assertCurrent();
    return { scope, intentId };
  }

  private async read(key: CheckpointKey): Promise<string | null> {
    this.assertCurrent();
    const result = await this.port.read(key);
    this.assertCurrent();
    if (result?.encoded !== null && typeof result?.encoded !== 'string') throw corrupt();
    return result.encoded;
  }

  private async persist(key: CheckpointKey, expected: string | null, value: Bc5InstallCheckpoint): Promise<void> {
    const encoded = JSON.stringify({ version: 1, ...value });
    this.decode(encoded);
    this.assertCurrent();
    const result = await this.port.compareAndSet({ ...key, expected, encoded });
    this.assertCurrent();
    if (result?.applied === false) throw Error('BC5_CHECKPOINT_RECOVERY_REQUIRED');
    if (result?.applied !== true) throw Error('BC5_CHECKPOINT_WRITE_UNCONFIRMED');
  }

  private decode(raw: unknown): Bc5InstallCheckpoint {
    if (typeof raw !== 'string' || raw.length > maxLength) throw corrupt();
    let value: Record<string, unknown>, clean: Bc5InstallCheckpoint;
    try {
      value = JSON.parse(raw);
      if (value['version'] !== 1 || typeof value['commitId'] !== 'string' || value['commitId'].length !== 22) throw corrupt();
      base64UrlDecode(value['commitId'], 16);
      const issued = snapshotIssuedCloudRegistration(value['issued'] as IssuedCloudRegistration);
      if (issued.intentId !== this.admission.intentId || issued.ownerUserId !== this.admission.ownerUserId
        || issued.tenantId !== this.admission.tenantId || issued.sourceLogicalDeviceId !== this.admission.sourceLogicalDeviceId)
        throw corrupt();
      const recordedAt = value['recordedAt'], armedAt = value['armedAt'];
      if (typeof recordedAt !== 'number' || !Number.isSafeInteger(recordedAt) || recordedAt <= 0 || recordedAt >= issued.expiresAt
        || (armedAt !== undefined && (typeof armedAt !== 'number' || !Number.isSafeInteger(armedAt)
          || armedAt < recordedAt || armedAt >= issued.expiresAt))) throw corrupt();
      clean = { issued, commitId: value['commitId'], recordedAt, ...(typeof armedAt === 'number' ? { armedAt } : {}) };
    } catch { throw corrupt(); }
    // Our writer is canonical. Reject extra fields (including nested secrets),
    // duplicates and wrong shape rather than treating damaged evidence as absent.
    if (JSON.stringify({ version: 1, ...clean }) !== raw) throw corrupt();
    return clean;
  }
}
