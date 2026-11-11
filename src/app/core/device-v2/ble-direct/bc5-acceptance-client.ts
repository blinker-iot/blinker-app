import { isServiceRegion, type ServiceRegion } from '../../../configs/service-region.config';
import { base64UrlDecode, base64UrlEncode } from '../base64url';
import {
  assertCloudRegistrationCommitted, CLOUD_REGISTRATION_CONTRACT, snapshotIssuedCloudRegistration, verifyIssuedCloudRegistrationKey,
  type CloudRegistrationCommitRequest, type IssuedCloudRegistration,
} from './cloud-registration-wire';
import { BleDirectCrypto } from './crypto';
import { Bc5InstallCheckpoints, type Bc5CheckpointPort } from './bc5-install-checkpoint';
import type { BleDirectClient, InitialCloudRegistrationInstallation } from './client';
import type { BleDirectTarget } from './transport';

const text = new TextEncoder();
const transferDomain = 'blinker.access-registration-bc5-key.v1';
const transferInfo = text.encode(transferDomain);
const maxResponseBytes = 8192;
const endpoint = '/api/v2/internal/bc5/';
const committedEndpoint = '/api/v2/internal/bc5-committed/';
const invalid = () => Error('BC5_ACCEPTANCE_RESPONSE_INVALID');
const unavailable = () => Error('BC5_ACCEPTANCE_REQUEST_UNCONFIRMED');
type Action = 'preflight' | 'prepare' | 'issue' | 'key' | 'commit' | 'read' | 'read-exact-committed' | 'mark-unknown' | 'cancel';

export interface Bc5AcceptanceAdmission {
  /** One privately provisioned HTTPS origin; never supplied by a default route. */
  origin: string;
  ownerUserId: string;
  tenantId: string;
  region: ServiceRegion;
  intentId: string;
  sourceLogicalDeviceId: string;
  expiresAt: number;
}

export interface Bc5AcceptanceSession {
  accountId: string;
  region: ServiceRegion;
  token: string;
}

export type Bc5InstallRecovery = 'no-local-checkpoint' | 'installation-unconfirmed' | 'activation-confirmed';

type FetchPort = (url: string, init: RequestInit) => Promise<Response>;
type Fields = Record<string, unknown>;
type Phase = 'prepared' | 'key_issued' | 'install_unknown' | 'committed' | 'cancelled' | 'expired' | 'invalidated';
const phases: Phase[] = ['prepared', 'key_issued', 'install_unknown', 'committed', 'cancelled', 'expired', 'invalidated'];
const projectionKeys = new Set(['contract', 'intentId', 'sourceLogicalDeviceId', 'targetLogicalDeviceId', 'registrationProduct',
  'materialOwnerLogicalDeviceId', 'expectedRoot', 'clientNonce', 'expiresAt', 'state', 'quotaState', 'replayed', 'reason',
  'ownerUserId', 'tenantId', 'targetKey', 'rootBindingId', 'bindingRevision', 'committedAt', 'device']);
const deviceKeys = new Set(['logicalDeviceId', 'tenantId', 'name', 'deviceType', 'registrationProduct', 'state',
  'cloudEnabled', 'credentialVersion', 'locator', 'createdAt', 'updatedAt', 'deletedAt']);

function record(value: unknown): Fields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Fields;
}

function exact(value: unknown, keys: readonly string[]): Fields {
  const fields = record(value), names = Object.keys(fields);
  if (names.length !== keys.length || names.some(name => !keys.includes(name))) throw invalid();
  return fields;
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value.trim() === value && !/[\u0000-\u001f\u007f/]/.test(value)
    && text.encode(value).length <= 128;
}

function binary(value: unknown, size: number): Uint8Array {
  if (typeof value !== 'string' || value.length !== Math.ceil(size * 8 / 6)) throw invalid();
  try { return base64UrlDecode(value, size); } catch { throw invalid(); }
}

export function snapshotBc5AcceptanceAdmission(value: Bc5AcceptanceAdmission): Bc5AcceptanceAdmission {
  let origin: URL;
  try { origin = new URL(value.origin); } catch { throw Error('BC5_ACCEPTANCE_ADMISSION_INVALID'); }
  if (origin.protocol !== 'https:' || origin.origin !== value.origin || !isServiceRegion(value.region)
    || !identifier(value.ownerUserId) || !identifier(value.tenantId) || !identifier(value.sourceLogicalDeviceId)
    || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= 0 || value.expiresAt > Date.now() + 15 * 60_000)
    throw Error('BC5_ACCEPTANCE_ADMISSION_INVALID');
  binary(value.intentId, 16);
  return { origin: origin.origin, ownerUserId: value.ownerUserId, tenantId: value.tenantId, region: value.region,
    intentId: value.intentId, sourceLogicalDeviceId: value.sourceLogicalDeviceId, expiresAt: value.expiresAt };
}

async function boundedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get('content-length');
  if ((contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxResponseBytes))
    || !response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw invalid();
  const reader = response.body.getReader(), buffer = new Uint8Array(maxResponseBytes);
  let used = 0, done = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) { done = true; break; }
      if (chunk.value.length > buffer.length - used) throw invalid();
      buffer.set(chunk.value, used); used += chunk.value.length;
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used))); }
    catch { throw invalid(); }
  } finally {
    buffer.fill(0);
    if (!done) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Restricted BC-5 transport only. No default origin, token refresh/replay,
 * arbitrary actions, raw Key response, UI route or implicit account switch. */
export class Bc5AcceptanceClient {
  private readonly admission: Bc5AcceptanceAdmission;
  private readonly invoked = new Set<Action>();
  private preflightPassed = false;
  private target?: string;
  private preparedContext?: string;
  private issued?: IssuedCloudRegistration;
  private installed?: { commitId: string; confirmationDigest: string };

  constructor(admission: Bc5AcceptanceAdmission, private readonly session: () => Bc5AcceptanceSession,
    private readonly assertCurrent: () => void, private readonly fetcher: FetchPort = (url, init) => fetch(url, init),
    private readonly crypto = new BleDirectCrypto(), private readonly checkpointPort?: Bc5CheckpointPort) {
    this.admission = snapshotBc5AcceptanceAdmission(admission);
  }

  async preflight(signal: AbortSignal): Promise<void> {
    this.checkWindow(); this.preflightPassed = false;
    // Reject stale attempts or an unavailable native store before creating
    // any server state. Cold recovery is a different explicit operation.
    if (await this.checkpoints(signal).load()) throw Error('BC5_CHECKPOINT_RECOVERY_REQUIRED');
    this.checkWindow();
    const result = exact(await this.request('preflight', {}, signal),
      ['intentId', 'sourceLogicalDeviceId', 'serverSourceEligible', 'physicalStoreVerified']);
    if (result['intentId'] !== this.admission.intentId || result['sourceLogicalDeviceId'] !== this.admission.sourceLogicalDeviceId
      || result['serverSourceEligible'] !== true || result['physicalStoreVerified'] !== false) throw invalid();
    this.preflightPassed = true; // Server-only; never a physical board result.
  }

  async prepare(signal: AbortSignal): Promise<void> {
    this.checkWindow();
    if (!this.preflightPassed) throw Error('BC5_ACCEPTANCE_PREFLIGHT_REQUIRED');
    const value = this.projection(await this.request('prepare', {}, signal), ['prepared']);
    this.target = value['targetLogicalDeviceId'] as string;
    this.preparedContext = this.context(value);
  }

  async issue(signal: AbortSignal): Promise<IssuedCloudRegistration> {
    this.checkWindow();
    if (!this.target) throw Error('BC5_ACCEPTANCE_PREPARE_REQUIRED');
    const issued = this.issuedProjection(await this.request('issue', {}, signal));
    this.issued = issued;
    return snapshotIssuedCloudRegistration(issued);
  }

  /** The only candidate composition that can enter the real BLE installer.
   * A crash before/after the gate keeps the original attempt for read only. */
  async installIssuedKey(direct: Pick<BleDirectClient, 'installInitialCloudRegistrationKey'>,
    target: BleDirectTarget, signal: AbortSignal): Promise<{
      issued: IssuedCloudRegistration; commitId: string; installation: InitialCloudRegistrationInstallation;
    }> {
    const issued = this.issued;
    if (!issued) throw Error('BC5_ACCEPTANCE_KEY_UNAVAILABLE');
    const checkpoints = this.checkpoints(signal);
    const commitId = base64UrlEncode(this.crypto.random(16));
    await checkpoints.reserve(issued, commitId); // No Key loan until native durable compare-and-create.
    let installation: InitialCloudRegistrationInstallation | undefined, armed = false;
    try {
      const ready = await this.withIssuedKey(async key => {
        installation = await direct.installInitialCloudRegistrationKey(issued, key, target, {
          signal, writeDeadline: this.admission.expiresAt, assertCurrent: () => this.guard(signal), beforeWrite: async () => {
            await checkpoints.arm(commitId);
            this.checkWindow();
            armed = true;
          },
        });
        return installation;
      }, signal);
      if (!armed) throw Error('BC5_CHECKPOINT_WRITE_UNCONFIRMED');
      this.installed = { commitId, confirmationDigest: ready.confirmation.confirmationDigest };
      return { issued: snapshotIssuedCloudRegistration(issued), commitId, installation: ready };
    } catch (error) {
      await installation?.close().catch(() => undefined);
      throw error;
    }
  }

  /** Explicit same-account coordination only. No in-memory issuance is
   * restored, no write is authorized, and failure never removes evidence. */
  async recoverInstall(signal: AbortSignal,
    onCommitted?: (issued: IssuedCloudRegistration, committed: unknown) => Promise<void>): Promise<Bc5InstallRecovery> {
    const checkpoint = await this.checkpoints(signal).load();
    if (!checkpoint) return 'no-local-checkpoint';
    const issued = checkpoint.issued;
    const value = await this.read(signal);
    const state = record(value)['state'];
    if (state === 'committed') {
      assertCloudRegistrationCommitted(issued, value);
      if (onCommitted) {
        await onCommitted(issued, value);
        this.guard(signal);
      }
      return 'activation-confirmed'; // Not a radio ACK or fresh Cloud State.
    }
    if (state !== 'key_issued' && state !== 'install_unknown') throw invalid();
    const remote = this.issuedProjection({ ...record(value), state: 'key_issued' });
    if (JSON.stringify(remote) !== JSON.stringify(issued)) throw invalid();
    return 'installation-unconfirmed';
  }

  /** Read the exact committed install for a local nearby-only alias; never
   * consult the old projection or resume the consumed installation. */
  async readExactCommitted(signal: AbortSignal) {
    const checkpoint = await this.checkpoints(signal).load();
    if (!checkpoint || checkpoint.armedAt === undefined) throw Error('BC5_REGISTERED_PRESENCE_COMMIT_REQUIRED');
    const id = binary(checkpoint.commitId, 16);
    try { if (!id.some(Boolean)) throw invalid(); } finally { id.fill(0); }
    const data = exact(await this.request('read-exact-committed', { commitId: checkpoint.commitId }, signal),
      ['commitId', 'committed']);
    const authoritativeCommitId = data['commitId'];
    if (authoritativeCommitId !== checkpoint.commitId) throw invalid();
    const committed = this.projection(data['committed'], ['committed']);
    assertCloudRegistrationCommitted(checkpoint.issued, committed);
    return { checkpoint, authoritativeCommitId, committed };
  }

  /** Consumer must take its own bounded copy synchronously (the real BLE
   * installer does so before its first await); this holder erases its bytes
   * immediately and never puts plaintext in logs, storage or return values. */
  private async withIssuedKey<T>(consume: (key: Uint8Array) => Promise<T>, signal: AbortSignal): Promise<T> {
    this.check(signal); this.checkWindow();
    const issued = this.issued;
    if (!issued || Date.now() >= issued.expiresAt) throw Error('BC5_ACCEPTANCE_KEY_UNAVAILABLE');
    const recipient = await this.crypto.x25519();
    this.check(signal); this.checkWindow();
    if (Date.now() >= issued.expiresAt) throw Error('BC5_ACCEPTANCE_KEY_UNAVAILABLE');
    const recipientPublicKey = base64UrlEncode(recipient.publicKey);
    const data = exact(await this.request('key', { recipientPublicKey }, signal), ['issued', 'transfer']);
    const value = this.issuedProjection(data['issued'], true);
    if (JSON.stringify(value) !== JSON.stringify(issued)) throw invalid();
    const transfer = exact(data['transfer'], ['contract', 'senderPublicKey', 'nonce', 'ciphertext']);
    if (transfer['contract'] !== 'access-registration-bc5-key-v1') throw invalid();
    const sender = binary(transfer['senderPublicKey'], 32), nonce = binary(transfer['nonce'], 12);
    const ciphertext = binary(transfer['ciphertext'], 48);
    const aad = text.encode(JSON.stringify([transferDomain, this.admission.intentId, recipientPublicKey, transfer['senderPublicKey']]));
    let shared: Uint8Array | undefined, salt: Uint8Array | undefined, aes: Uint8Array | undefined, key: Uint8Array | undefined;
    try {
      try {
        shared = await recipient.sharedSecret(sender);
        salt = await this.crypto.sha256(aad);
        aes = await this.crypto.hkdf(salt, shared, transferInfo, 32);
        key = await this.crypto.aesGcmDecrypt(aes, nonce, aad, ciphertext);
        await verifyIssuedCloudRegistrationKey(this.crypto, issued, key);
      } catch { throw invalid(); }
      this.check(signal); this.checkWindow();
      if (Date.now() >= issued.expiresAt) throw Error('BC5_ACCEPTANCE_KEY_UNAVAILABLE');
      let pending: Promise<T>;
      try { pending = consume(key); }
      finally { key.fill(0); }
      const result = await pending;
      this.check(signal);
      return result;
    } finally {
      shared?.fill(0); salt?.fill(0); aes?.fill(0); key?.fill(0);
      recipient.publicKey.fill(0); sender.fill(0); nonce.fill(0); ciphertext.fill(0); aad.fill(0);
    }
  }

  async commit(value: CloudRegistrationCommitRequest, signal: AbortSignal): Promise<unknown> {
    const issued = this.issued;
    if (!issued || !this.installed || value?.commitId !== this.installed.commitId
      || value.confirmationDigest !== this.installed.confirmationDigest
      || value.ownerUserId !== this.admission.ownerUserId || value.tenantId !== this.admission.tenantId
      || value.intentId !== this.admission.intentId || value.contract !== issued.contract || value.clientNonce !== issued.clientNonce
      || value.receipt?.locator !== issued.targetKey.locator || value.receipt?.issuanceDigest !== issued.targetKey.issuanceDigest)
      throw Error('BC5_ACCEPTANCE_CONFIRMATION_INVALID');
    binary(value.commitId, 16); binary(value.confirmationDigest, 32);
    const receipt = exact(value.receipt,
      ['kind', 'authMethod', 'suite', 'sessionBinding', 'deviceNonce', 'result', 'credentialVersion', 'locator', 'issuanceDigest', 'ackDigest']);
    const result = this.projection(await this.request('commit', { contract: value.contract, commitId: value.commitId,
      clientNonce: value.clientNonce, receipt: { ...receipt }, confirmationDigest: value.confirmationDigest }, signal), ['committed']);
    assertCloudRegistrationCommitted(issued, result);
    return result;
  }

  async read(signal: AbortSignal): Promise<unknown> { return this.projection(await this.request('read', {}, signal), phases); }
  async markUnknown(signal: AbortSignal): Promise<unknown> {
    return this.projection(await this.request('mark-unknown', {}, signal), ['install_unknown']);
  }
  async cancel(signal: AbortSignal): Promise<unknown> {
    return this.projection(await this.request('cancel', {}, signal), ['cancelled', 'expired', 'invalidated']);
  }

  private projection(raw: unknown, states: readonly Phase[]): Fields {
    const value = record(raw);
    if (Object.keys(value).some(key => !projectionKeys.has(key))
      || value['contract'] !== CLOUD_REGISTRATION_CONTRACT || value['intentId'] !== this.admission.intentId
      || value['sourceLogicalDeviceId'] !== this.admission.sourceLogicalDeviceId
      || value['materialOwnerLogicalDeviceId'] !== this.admission.sourceLogicalDeviceId || value['registrationProduct'] !== 'cloud'
      || (value['ownerUserId'] !== undefined && value['ownerUserId'] !== this.admission.ownerUserId)
      || (value['tenantId'] !== undefined && value['tenantId'] !== this.admission.tenantId)
      || !identifier(value['targetLogicalDeviceId']) || value['targetLogicalDeviceId'] === this.admission.sourceLogicalDeviceId
      || (this.target !== undefined && value['targetLogicalDeviceId'] !== this.target)
      || !states.some(state => state === value['state'])) throw invalid();
    const context = this.context(value);
    if (this.preparedContext !== undefined && this.preparedContext !== context) throw invalid();
    if (value['targetKey'] !== undefined) exact(value['targetKey'], ['credentialVersion', 'locator', 'issuanceDigest', 'issuedAt']);
    if (value['device'] !== undefined && Object.keys(record(value['device'])).some(key => !deviceKeys.has(key))) throw invalid();
    return value;
  }

  private context(value: Fields): string {
    const root = exact(value['expectedRoot'], ['kind', 'deviceInstanceId', 'accessEpoch', 'controllerId', 'credentialVersion',
      'adminFingerprint', 'cloudKey']);
    const key = exact(root['cloudKey'], ['state']);
    const number = (raw: unknown, maximum = Number.MAX_SAFE_INTEGER) =>
      typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0 && raw <= maximum;
    if (root['kind'] !== 'ble-no-cloud-key-v2' || key['state'] !== 'absent' || !number(value['expiresAt'])
      || !number(root['accessEpoch'], 0xffffffff) || !number(root['credentialVersion'], 0xffffffff)) throw invalid();
    binary(value['clientNonce'], 16); binary(root['deviceInstanceId'], 16); binary(root['controllerId'], 16); binary(root['adminFingerprint'], 32);
    return JSON.stringify([value['clientNonce'], value['expiresAt'], root['deviceInstanceId'], root['accessEpoch'], root['controllerId'],
      root['credentialVersion'], root['adminFingerprint']]);
  }

  private issuedProjection(raw: unknown, requireScope = false): IssuedCloudRegistration {
    const value = this.projection(raw, ['key_issued']);
    const { ownerUserId, tenantId } = this.admission;
    if (requireScope && (value['ownerUserId'] !== ownerUserId || value['tenantId'] !== tenantId)) throw invalid();
    try { return snapshotIssuedCloudRegistration({ ...value, ownerUserId, tenantId } as unknown as IssuedCloudRegistration); }
    catch { throw invalid(); }
  }

  private checkWindow(): void {
    if (Date.now() >= this.admission.expiresAt) throw Error('BC5_ACCEPTANCE_EXPIRED');
  }

  private check(signal: AbortSignal): void {
    if (signal.aborted) throw Error('BC5_ACCEPTANCE_CANCELLED');
    this.assertCurrent();
    if (signal.aborted) throw Error('BC5_ACCEPTANCE_CANCELLED');
  }

  private guard(signal: AbortSignal): void {
    this.check(signal);
    this.currentSession();
  }

  private checkpoints(signal: AbortSignal): Bc5InstallCheckpoints {
    return new Bc5InstallCheckpoints(this.admission, () => this.guard(signal), this.checkpointPort, this.crypto);
  }

  private currentSession(): Bc5AcceptanceSession {
    const auth = this.session();
    if (auth?.accountId !== this.admission.ownerUserId || auth.region !== this.admission.region
      || typeof auth.token !== 'string' || !/^[\x21-\x7e]+$/.test(auth.token) || auth.token.length > 16_384)
      throw Error('BC5_ACCEPTANCE_ACCOUNT_CHANGED');
    return auth;
  }

  private async request(action: Action, body: Fields, signal: AbortSignal): Promise<unknown> {
    this.check(signal);
    const auth = this.currentSession();
    this.check(signal);
    if (action !== 'read' && action !== 'preflight') {
      if (this.invoked.has(action)) throw Error('BC5_ACCEPTANCE_ATTEMPT_CONSUMED');
      this.invoked.add(action);
    }
    const exactCommitted = action === 'read-exact-committed';
    const url = this.admission.origin + (exactCommitted
      ? committedEndpoint + this.admission.intentId : endpoint + this.admission.intentId + '/' + action);
    const stop = new AbortController(), onAbort = () => stop.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(onAbort, 15_000);
    try {
      let response: Response;
      try {
        response = await this.fetcher(url, { method: 'POST', cache: 'no-store', redirect: 'error', credentials: 'omit',
          referrerPolicy: 'no-referrer', signal: stop.signal,
          headers: { Authorization: 'Bearer ' + auth.token, 'x-region': auth.region,
            'X-Blinker-Contract': exactCommitted ? 'access-registration-bc5-committed-v1' : 'access-registration-bc5-v1',
            'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body) });
      } catch { this.check(signal); throw unavailable(); }
      this.check(signal);
      if (stop.signal.aborted) throw unavailable();
      if (response.redirected || response.url !== url || response.status !== 200
        || !response.headers.get('cache-control')?.split(',').some(token => token.trim().toLowerCase() === 'no-store')) throw invalid();
      let data: unknown;
      try { data = await boundedJson(response); }
      catch { this.check(signal); if (stop.signal.aborted) throw unavailable(); throw invalid(); }
      const envelope = exact(data, ['status', 'data']);
      this.check(signal);
      this.currentSession();
      if (stop.signal.aborted) throw unavailable();
      if (envelope['status'] !== 200) throw invalid();
      return envelope['data'];
    } finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); }
  }
}
