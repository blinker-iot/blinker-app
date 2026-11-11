import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { DeviceV2AccountScopeProvider, deviceV2AccountStoragePrefix, validateDeviceV2AccountScope } from '../account-scope';
import { AccessRegistrationRequest } from './access-registration-api';
import { AccessRegistrationIntent, accessRegistrationRootJson, validateAccessRegistrationIntent } from './access-registration-contract';
import { base64UrlDecode } from './wire';

const MAX_ACCOUNT_CHECKPOINTS = 32;
const checkpointWrites = new Map<string, Promise<void>>();

export interface AccessRegistrationCheckpoint {
  request: AccessRegistrationRequest;
  commitId: string;
  phase: 'preparing' | 'prepared' | 'confirming' | 'unknown' | 'committed' | 'closed' | 'rejected';
  prepareRejection?: { httpStatus: 409; code: 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING' };
  unknownOperation?: 'prepare' | 'commit' | 'cancel';
  intent?: AccessRegistrationIntent;
  confirmationDigest?: string;
  localReferencePending?: boolean;
}
export interface AccessRegistrationCheckpoints {
  load(requestId: string): Promise<AccessRegistrationCheckpoint | undefined>;
  save(checkpoint: AccessRegistrationCheckpoint): Promise<void>;
  removeTerminal(requestId: string): Promise<void>;
}

// Non-secret operation checkpoint, separate from the immutable request journal.
// Never stores Key, Admin secret, raw proof or a fabricated Bootstrap receipt.
export class SecureAccessRegistrationCheckpoints implements AccessRegistrationCheckpoints {
  constructor(private readonly scope: DeviceV2AccountScopeProvider) {}
  async list(): Promise<AccessRegistrationCheckpoint[]> {
    const scope = validateDeviceV2AccountScope(this.scope());
    const prefix = deviceV2AccountStoragePrefix('blinker_v2_access_registration_', scope);
    const keys = [...new Set(await SecureStorage.keys())].filter(key => key.startsWith(prefix)); this.check(scope);
    if (keys.length > MAX_ACCOUNT_CHECKPOINTS) throw Error('ACCESS_REGISTRATION_CHECKPOINT_LIMIT');
    const values: AccessRegistrationCheckpoint[] = [];
    for (const key of keys.sort()) {
      const value = await this.load(key.slice(prefix.length)); this.check(scope);
      if (value) values.push(value);
    }
    return values;
  }
  async load(requestId: string): Promise<AccessRegistrationCheckpoint | undefined> {
    const scope = validateDeviceV2AccountScope(this.scope()), key = this.key(requestId, scope);
    const encoded = await SecureStorage.getItem(key); this.check(scope);
    if (encoded === null) return undefined;
    let value: any; try { value = JSON.parse(encoded); } catch { throw Error('ACCESS_REGISTRATION_CHECKPOINT_CORRUPT'); }
    if (value.version !== 1 || value.authority !== scope.authority || value.accountId !== scope.accountId
      || value.request?.requestId !== requestId) throw Error('ACCESS_REGISTRATION_CHECKPOINT_CORRUPT');
    return snapshotCheckpoint(value);
  }
  async save(checkpoint: AccessRegistrationCheckpoint): Promise<void> {
    const scope = validateDeviceV2AccountScope(this.scope()), saved = snapshotCheckpoint(checkpoint);
    const key = this.key(saved.request.requestId, scope);
    await this.mutate(scope, async () => {
      this.check(scope);
      if (await SecureStorage.getItem(key) === null) {
        this.check(scope);
        const prefix = deviceV2AccountStoragePrefix('blinker_v2_access_registration_', scope);
        const count = (await SecureStorage.keys()).filter(item => item.startsWith(prefix)).length; this.check(scope);
        // Never evict UNKNOWN to make room for a new operation.
        if (count >= MAX_ACCOUNT_CHECKPOINTS) throw Error('ACCESS_REGISTRATION_CHECKPOINT_LIMIT');
      }
      this.check(scope);
      await SecureStorage.setItem(key, JSON.stringify({ version: 1, ...scope, ...saved })); this.check(scope);
    });
  }
  async removeTerminal(requestId: string): Promise<void> {
    const scope = validateDeviceV2AccountScope(this.scope()), key = this.key(requestId, scope);
    await this.mutate(scope, async () => {
      this.check(scope);
      const value = await this.load(requestId); this.check(scope);
      if (!value) return;
      const terminal = value.phase === 'committed' ? value.intent?.state === 'committed'
        : value.phase === 'rejected' || value.phase === 'closed' && ['cancelled', 'expired', 'invalidated'].includes(value.intent?.state ?? '');
      if (!terminal || value.localReferencePending !== false)
        throw Error('ACCESS_REGISTRATION_RECOVERY_REQUIRED');
      // Explicit housekeeping does not touch root references or the request
      // journal. An unresolved checkpoint is never evicted by age or quota.
      this.check(scope); await SecureStorage.removeItem(key); this.check(scope);
    });
  }
  private async mutate(scope: { authority: string; accountId: string }, work: () => Promise<void>): Promise<void> {
    const prefix = deviceV2AccountStoragePrefix('blinker_v2_access_registration_', scope);
    const previous = checkpointWrites.get(prefix) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(work);
    checkpointWrites.set(prefix, pending);
    try { await pending; } finally { if (checkpointWrites.get(prefix) === pending) checkpointWrites.delete(prefix); }
  }
  private key(requestId: string, scope: { authority: string; accountId: string }): string {
    if (!base64UrlDecode(requestId, 16).some(Boolean)) throw Error('ACCESS_REGISTRATION_CHECKPOINT_CORRUPT');
    return deviceV2AccountStoragePrefix('blinker_v2_access_registration_', scope) + requestId;
  }
  private check(expected: { authority: string; accountId: string }): void {
    const actual = validateDeviceV2AccountScope(this.scope());
    if (actual.authority !== expected.authority || actual.accountId !== expected.accountId)
      throw Error('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
  }
}

export function snapshotCheckpoint(value: AccessRegistrationCheckpoint): AccessRegistrationCheckpoint {
  if (!value || !value.request || value.request.targetProduct !== 'ble_direct'
    || !base64UrlDecode(value.request.requestId, 16).some(Boolean)
    || !base64UrlDecode(value.commitId, 16).some(Boolean)
    || !['preparing', 'prepared', 'confirming', 'unknown', 'committed', 'closed', 'rejected'].includes(value.phase)
    || (value.unknownOperation !== undefined && !['prepare', 'commit', 'cancel'].includes(value.unknownOperation))
    || (value.localReferencePending !== undefined && typeof value.localReferencePending !== 'boolean'))
    throw Error('ACCESS_REGISTRATION_CHECKPOINT_CORRUPT');
  // This is one known prepare rejection, before a server intent/reservation
  // exists. It cannot be attached to or used to erase an uncertain operation.
  const rejection = value.prepareRejection;
  if (value.phase === 'rejected' ? !rejection || typeof rejection !== 'object' || Array.isArray(rejection)
    || Object.keys(rejection).length !== 2 || !Object.hasOwn(rejection, 'httpStatus') || !Object.hasOwn(rejection, 'code')
    || rejection.httpStatus !== 409
    || rejection.code !== 'ACCESS_REGISTRATION_ROOT_OPERATION_PENDING'
    || value.localReferencePending !== false || value.intent !== undefined
    || value.confirmationDigest !== undefined || value.unknownOperation !== undefined
    : rejection !== undefined) throw Error('ACCESS_REGISTRATION_CHECKPOINT_CORRUPT');
  const request = { requestId: value.request.requestId, sourceLogicalDeviceId: value.request.sourceLogicalDeviceId,
    targetProduct: 'ble_direct' as const, name: value.request.name,
    expectedRoot: accessRegistrationRootJson(value.request.expectedRoot) };
  let intent: AccessRegistrationIntent | undefined;
  if (value.intent) {
    validateAccessRegistrationIntent(value.intent);
    const item = value.intent;
    if (item.intentId !== request.requestId || item.sourceLogicalDeviceId !== request.sourceLogicalDeviceId)
      throw Error('ACCESS_REGISTRATION_CHECKPOINT_CORRUPT');
    intent = { intentId: item.intentId, sourceLogicalDeviceId: item.sourceLogicalDeviceId,
      targetLogicalDeviceId: item.targetLogicalDeviceId, registrationProduct: item.registrationProduct,
      rootBindingId: item.rootBindingId, bindingRevision: item.bindingRevision,
      expectedRoot: accessRegistrationRootJson(item.expectedRoot), clientNonce: item.clientNonce,
      expiresAt: item.expiresAt, state: item.state, quotaState: item.quotaState, replayed: item.replayed,
      ...(item.device ? { device: { logicalDeviceId: item.device.logicalDeviceId, state: item.device.state,
        registrationProduct: item.device.registrationProduct } } : {}) };
  }
  if (value.confirmationDigest && !base64UrlDecode(value.confirmationDigest, 32).some(Boolean))
    throw Error('ACCESS_REGISTRATION_CHECKPOINT_CORRUPT');
  return { request, commitId: value.commitId, phase: value.phase,
    ...(rejection ? { prepareRejection: { httpStatus: 409, code: rejection.code } } : {}),
    ...(value.unknownOperation ? { unknownOperation: value.unknownOperation } : {}),
    ...(value.localReferencePending === undefined ? {} : { localReferencePending: value.localReferencePending }),
    ...(intent ? { intent } : {}), ...(value.confirmationDigest ? { confirmationDigest: value.confirmationDigest } : {}) };
}
