import {
  BLINKER_CONFIG_ENDPOINT, BlinkerConfigInfo, BlinkerConfigOperation,
  decodeBlinkerConfigInfo, decodeBlinkerConfigStatus, encodeBlinkerConfigInfoRequest,
} from './esp32-wifiprov';
import { wiFiProvWiFiFailureReasonFromCode } from './wifiprov-wifi-failure';

export interface IsolatedWiFiProvOwner {
  kind: 'isolated-softap';
  version: 1;
  session: string;
}

type StageState = 'local' | 'closing' | 'await-cloud' | 'cloud' | 'await-local'
  | 'reconnecting' | 'failed' | 'cancelled';
type UserStage = 'cloud' | 'local';

/** In-memory phase checkpoint, not device authentication or a cryptographic root receipt. */
export interface WiFiProvSoftApHandoff {
  readonly stage: UserStage;
  readonly previousOwner: Readonly<IsolatedWiFiProvOwner>;
  readonly info: Readonly<{
    deviceInstanceIdHex: string;
    accessEpoch: number;
    hasDeviceKey: boolean;
    hasAccessState: boolean;
    supportsAccessBootstrap: boolean;
  }>;
}

// Issuance and consumption never survive a reload or accept serialized imports.
const issuedHandoffs = new WeakSet<WiFiProvSoftApHandoff>();
const consumedHandoffs = new WeakSet<WiFiProvSoftApHandoff>();

export interface WiFiProvSoftApStagePorts {
  signal: AbortSignal;
  assertCurrent(): void;
  /** Context-only capture guard; never authorizes background RPCs or continuation. */
  assertHandoffContext?(): void;
  assertCloud(): Promise<void>;
  /** Resolves only after the matching native remote owner has actually died. */
  close(): Promise<void>;
  reopen(): Promise<{ owner: IsolatedWiFiProvOwner; info: BlinkerConfigInfo }>;
  waiting(stage: UserStage | undefined): void;
}

const coded = (code: string) => Object.assign(Error(code), { code });
const cancelled = (write: boolean) => coded(write ? 'PROVISIONING_RESULT_UNKNOWN' : 'WIFIPROV_OPERATION_CANCELLED');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function copyOwner(value: unknown): IsolatedWiFiProvOwner {
  try {
    const candidate = value as Partial<IsolatedWiFiProvOwner> | null;
    if (!candidate || typeof candidate !== 'object' || candidate.kind !== 'isolated-softap' || candidate.version !== 1
      || typeof candidate.session !== 'string' || !uuid.test(candidate.session)
      || candidate.session === '00000000-0000-0000-0000-000000000000'
      || Object.keys(candidate).length !== 3
      || Object.keys(candidate).some(key => !['kind', 'version', 'session'].includes(key))) throw Error();
    return Object.freeze({ kind: candidate.kind, version: candidate.version, session: candidate.session });
  } catch { throw coded('WIFIPROV_ISOLATED_OWNER_REQUIRED'); }
}

/** Native ownership metadata only; capabilities and Internet-ready snapshots are not proof. */
export function isolatedWiFiProvOwner(device: unknown): IsolatedWiFiProvOwner {
  try {
    const candidate = device as { transport?: unknown; security?: unknown; localOwner?: unknown } | null;
    if (!candidate || candidate.transport !== 'softap' || candidate.security !== 1) throw Error();
    return copyOwner(candidate.localOwner);
  } catch { throw coded('WIFIPROV_ISOLATED_OWNER_REQUIRED'); }
}

function copyInfo(info: BlinkerConfigInfo): BlinkerConfigInfo {
  if (!(info?.deviceInstanceId instanceof Uint8Array) || info.deviceInstanceId.length !== 16
    || !Number.isSafeInteger(info.accessEpoch) || info.accessEpoch < 0 || info.accessEpoch > 0xffffffff
    || typeof info.hasDeviceKey !== 'boolean' || typeof info.hasAccessState !== 'boolean'
    || typeof info.supportsAccessBootstrap !== 'boolean') throw coded('WIFIPROV_DEVICE_CONTEXT_REQUIRED');
  return { deviceInstanceId: info.deviceInstanceId.slice(), accessEpoch: info.accessEpoch,
    hasDeviceKey: info.hasDeviceKey, hasAccessState: info.hasAccessState,
    supportsAccessBootstrap: info.supportsAccessBootstrap };
}

function publicInfo(info: BlinkerConfigInfo): WiFiProvSoftApHandoff['info'] {
  const detached = copyInfo(info);
  // Checkpoint-only physical facts. Do not change the existing protocol/parser
  // contract or claim that these observations authenticate an access root.
  if (!detached.deviceInstanceId.some(Boolean) || detached.hasAccessState !== (detached.accessEpoch > 0)) {
    throw coded('WIFIPROV_DEVICE_CONTEXT_REQUIRED');
  }
  return Object.freeze({
    deviceInstanceIdHex: Array.from(detached.deviceInstanceId, byte => byte.toString(16).padStart(2, '0')).join(''),
    accessEpoch: detached.accessEpoch, hasDeviceKey: detached.hasDeviceKey,
    hasAccessState: detached.hasAccessState, supportsAccessBootstrap: detached.supportsAccessBootstrap,
  });
}

/** Non-consuming comparison only; neither a read nor this match grants write permission. */
export function assertWiFiProvSoftApHandoff(
  handoff: WiFiProvSoftApHandoff, nextOwner: IsolatedWiFiProvOwner, freshInfo: BlinkerConfigInfo,
): void {
  if (!issuedHandoffs.has(handoff)) throw coded('WIFIPROV_HANDOFF_INVALID');
  if (consumedHandoffs.has(handoff)) throw coded('WIFIPROV_HANDOFF_CONSUMED');
  const next = copyOwner(nextOwner);
  if (next.session === handoff.previousOwner.session) throw coded('WIFIPROV_ISOLATED_OWNER_REQUIRED');
  const fresh = publicInfo(freshInfo), expected = handoff.info;
  if (fresh.deviceInstanceIdHex !== expected.deviceInstanceIdHex || fresh.accessEpoch !== expected.accessEpoch
    || fresh.hasDeviceKey !== expected.hasDeviceKey || fresh.hasAccessState !== expected.hasAccessState
    || fresh.supportsAccessBootstrap !== expected.supportsAccessBootstrap) {
    throw coded('WIFIPROV_DEVICE_CONTEXT_CHANGED');
  }
}

/** The explicit write-side caller still owns account/CAS/foreground and authorization guards. */
export function consumeWiFiProvSoftApHandoff(
  handoff: WiFiProvSoftApHandoff, nextOwner: IsolatedWiFiProvOwner, freshInfo: BlinkerConfigInfo,
): void {
  assertWiFiProvSoftApHandoff(handoff, nextOwner, freshInfo);
  consumedHandoffs.add(handoff);
}

/** Serial phase adapter, not another identity coordinator or a retry/UNKNOWN recovery engine. */
export class WiFiProvSoftApStages {
  private currentOwner: IsolatedWiFiProvOwner;
  private currentState: StageState = 'local';
  private expected?: BlinkerConfigInfo;
  private busy = false;
  private stopped = false;
  private failure?: unknown;
  private readonly stop = new AbortController();
  private readonly onAbort = () => this.cancel();
  private closedOwner?: IsolatedWiFiProvOwner;
  private userWait?: { stage: UserStage; resolve(): void; reject(error: unknown): void; handoff?: WiFiProvSoftApHandoff };

  constructor(owner: IsolatedWiFiProvOwner, private readonly ports: WiFiProvSoftApStagePorts) {
    this.currentOwner = copyOwner(owner);
    ports.signal.addEventListener('abort', this.onAbort, { once: true });
    if (ports.signal.aborted) this.cancel();
  }

  get owner(): IsolatedWiFiProvOwner { return this.currentOwner; }
  get state(): StageState { return this.currentState; }

  captureHandoff(): WiFiProvSoftApHandoff | undefined {
    const wait = this.userWait;
    if (this.stopped || this.ports.signal.aborted || !wait || !this.expected
      || this.currentState !== `await-${wait.stage}` || this.closedOwner?.session !== this.currentOwner.session) return;
    try {
      if (this.ports.assertHandoffContext) this.ports.assertHandoffContext();
      else this.ports.assertCurrent();
      if (!wait.handoff) {
        const handoff = Object.freeze({ stage: wait.stage, previousOwner: copyOwner(this.currentOwner), info: publicInfo(this.expected) });
        issuedHandoffs.add(handoff);
        wait.handoff = handoff;
      }
      return wait.handoff;
    } catch { return; }
  }

  prepareCloud(): Promise<void> { return this.run(() => this.ensureCloud()); }

  cloud<T>(work: () => Promise<T>): Promise<T> {
    return this.run(async () => { await this.ensureCloud(); return this.observe(work, false); });
  }

  local<T>(work: () => Promise<T>, write = false): Promise<T> {
    let started = false;
    return this.run(async () => {
      await this.ensureLocal();
      return this.observe(() => { started = true; return work(); }, write);
    }, error => {
      const code = (error as { code?: unknown } | null)?.code;
      return started && this.currentState === 'local'
        && (code === (write ? 'WIFIPROV_PROVISION_FAILED' : 'WIFIPROV_SCAN_FAILED')
          || write && wiFiProvWiFiFailureReasonFromCode(code) !== undefined);
    });
  }

  request(endpoint: string, payload: Uint8Array, work: () => Promise<Uint8Array>): Promise<Uint8Array> {
    // Extract only public operation/epoch before awaiting. Do not retain a Key,
    // Admin secret or a second payload copy as phase state.
    const header = encodeBlinkerConfigInfoRequest();
    const operation = payload?.[1] as BlinkerConfigOperation;
    const length = operation === BlinkerConfigOperation.GetInfo ? 2 : operation === BlinkerConfigOperation.Install ? 45
      : operation === BlinkerConfigOperation.Bootstrap ? 101 : -1;
    if (endpoint !== BLINKER_CONFIG_ENDPOINT || !(payload instanceof Uint8Array)
      || payload[0] !== header[0] || payload.length !== length) return Promise.reject(coded('WIFIPROV_REQUEST_INVALID'));
    const epoch = operation === BlinkerConfigOperation.Bootstrap
      ? new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(45, false) : undefined;
    if (epoch === 0) return Promise.reject(coded('WIFIPROV_REQUEST_INVALID'));

    return this.run(async () => {
      await this.ensureLocal();
      if (operation !== BlinkerConfigOperation.GetInfo && !this.expected) throw coded('WIFIPROV_DEVICE_CONTEXT_REQUIRED');
      // Native custom endpoints are opaque potential writes, including GetInfo.
      const response = await this.observe(work, true);
      if (operation === BlinkerConfigOperation.GetInfo) {
        const info = decodeBlinkerConfigInfo(response);
        if (this.expected) this.matchInfo(info); else this.expected = copyInfo(info);
      } else {
        // Explicit device rejection stays with the original caller/decoder.
        if (response.length >= 3 && response[0] === header[0] && response[1] === operation && response[2] !== 0) return response;
        decodeBlinkerConfigStatus(response, operation);
        this.check(true);
        this.expected = { ...this.expected!, hasDeviceKey: true,
          ...(operation === BlinkerConfigOperation.Bootstrap ? { hasAccessState: true, accessEpoch: epoch! } : {}) };
      }
      return response;
    });
  }

  continue(): void {
    const waiting = this.userWait;
    if (!waiting || this.currentState !== `await-${waiting.stage}`) return;
    try { this.check(); }
    catch (error) { this.fail(error); return; }
    this.userWait = undefined; this.notifyWaiting(undefined); waiting.resolve();
  }

  cancel(): void {
    if (this.stopped || this.currentState === 'failed') return;
    this.stopped = true; this.currentState = 'cancelled';
    const waiting = this.userWait; this.userWait = undefined;
    waiting?.reject(cancelled(false));
    this.stop.abort(); this.ports.signal.removeEventListener('abort', this.onAbort);
    this.notifyWaiting(undefined);
  }

  private async ensureCloud(): Promise<void> {
    this.check();
    if (this.currentState === 'local') {
      if (!this.expected) throw coded('WIFIPROV_DEVICE_CONTEXT_REQUIRED');
      this.currentState = 'closing';
      await this.observe(() => this.ports.close(), false);
      this.closedOwner = this.currentOwner;
      await this.waitFor('cloud');
    }
    this.check();
    if (this.currentState !== 'cloud' && this.currentState !== 'await-cloud') throw coded('WIFIPROV_STAGE_INVALID');
    await this.observe(() => this.ports.assertCloud(), false);
    this.currentState = 'cloud';
  }

  private async ensureLocal(): Promise<void> {
    this.check();
    if (this.currentState === 'cloud') {
      await this.waitFor('local');
      this.check(); this.currentState = 'reconnecting';
      const reopened = await this.observe(() => this.ports.reopen(), false);
      const next = copyOwner(reopened?.owner);
      if (next.session === this.currentOwner.session) throw coded('WIFIPROV_ISOLATED_OWNER_REQUIRED');
      this.matchInfo(reopened.info);
      this.currentOwner = next; this.closedOwner = undefined; this.currentState = 'local';
    }
    this.check();
    if (this.currentState !== 'local') throw coded('WIFIPROV_STAGE_INVALID');
  }

  private waitFor(stage: UserStage): Promise<void> {
    this.check(); this.currentState = stage === 'cloud' ? 'await-cloud' : 'await-local';
    return this.observe(() => new Promise<void>((resolve, reject) => {
      this.userWait = { stage, resolve, reject };
      this.ports.waiting(stage);
    }), false);
  }

  private matchInfo(value: BlinkerConfigInfo): void {
    const info = copyInfo(value), expected = this.expected;
    if (!expected || info.accessEpoch !== expected.accessEpoch || info.hasDeviceKey !== expected.hasDeviceKey
      || info.hasAccessState !== expected.hasAccessState || info.supportsAccessBootstrap !== expected.supportsAccessBootstrap
      || info.deviceInstanceId.some((byte, index) => byte !== expected.deviceInstanceId[index])) {
      throw coded('WIFIPROV_DEVICE_CONTEXT_CHANGED');
    }
  }

  private async run<T>(work: () => Promise<T>, knownLocalRejection?: (error: unknown) => boolean): Promise<T> {
    this.check();
    if (this.busy) throw coded('WIFIPROV_OPERATION_BUSY');
    this.busy = true;
    try { return await work(); }
    catch (error) {
      if (!this.stopped && !knownLocalRejection?.(error)) this.fail(error);
      throw error;
    }
    finally { this.busy = false; }
  }

  private check(write = false): void {
    if (this.ports.signal.aborted && !this.stopped) this.cancel();
    if (this.stopped) throw cancelled(write);
    if (this.currentState === 'failed') throw this.failure;
    this.ports.assertCurrent();
  }

  private observe<T>(work: () => Promise<T>, write: boolean): Promise<T> {
    this.check();
    const pending = work(); // Set write cancellation semantics only after actual invocation.
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (ok: boolean, value: unknown) => {
        if (settled) return;
        settled = true; this.stop.signal.removeEventListener('abort', aborted);
        if (ok) resolve(value as T); else reject(value);
      };
      const aborted = () => queueMicrotask(() => finish(false, cancelled(write)));
      this.stop.signal.addEventListener('abort', aborted, { once: true });
      Promise.resolve(pending).then(value => {
        try { this.check(write); finish(true, value); } catch (error) { finish(false, error); }
      }, error => finish(false, error));
      if (this.stop.signal.aborted) aborted();
    });
  }

  private fail(error: unknown): void {
    if (this.stopped || this.currentState === 'failed') return;
    this.failure = error; this.currentState = 'failed';
    const waiting = this.userWait; this.userWait = undefined;
    waiting?.reject(error); this.stop.abort();
    this.ports.signal.removeEventListener('abort', this.onAbort); this.notifyWaiting(undefined);
  }

  private notifyWaiting(stage: UserStage | undefined): void {
    try { this.ports.waiting(stage); } catch { /* Cleanup never resumes a stopped identity chain. */ }
  }
}
