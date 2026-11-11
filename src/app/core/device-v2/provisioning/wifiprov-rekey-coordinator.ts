import type { ProvisionOptions } from 'capacitor-wifiprov';
import { base64UrlDecode, base64UrlEncode } from '../base64url';
import type { Esp32ProvisioningTransport } from './esp32-wifiprov';
import { copyWiFiProvWifiOptions } from './wifiprov-owned-options';
import { applyWiFiProvRekeyEvent, assertWiFiProvRekeyCheckpointScope, createWiFiProvRekeyCheckpoint,
  type WiFiProvRekeyCheckpoint, type WiFiProvRekeyEvent, type WiFiProvRekeyScope } from './wifiprov-rekey-checkpoint';
import { acceptWiFiProvRekeyPermit, challengeWiFiProvRekey, installWiFiProvRekey, readWiFiProvRekeyReceipt,
  type WiFiProvRekeyBinding, type WiFiProvRekeyOldBinding } from './wifiprov-rekey-wire';

export interface WiFiProvRekeyJournal {
  load(logicalDeviceId: string): Promise<WiFiProvRekeyCheckpoint | undefined>;
  replace(expected: WiFiProvRekeyCheckpoint | undefined, next: WiFiProvRekeyCheckpoint): Promise<void>;
}

export interface WiFiProvRekeyServerState {
  readonly logicalDeviceId: string;
  readonly operationId: string;
  readonly state: 'prepared' | 'key_issued' | 'committed' | 'expired';
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly newLocator?: string;
  readonly binding?: { readonly operationId: string; readonly challenge: string; readonly instance: string;
    readonly accessEpoch: number; readonly fromVersion: number; readonly oldLocator: string };
}

export interface WiFiProvRekeyGateway {
  prepare(scope: WiFiProvRekeyScope): Promise<WiFiProvRekeyServerState>;
  issue(scope: WiFiProvRekeyScope, proof: Uint8Array): Promise<WiFiProvRekeyServerState & { transfer: { iv: Uint8Array; box: Uint8Array } }>;
  confirm(scope: WiFiProvRekeyScope, receipt: Uint8Array): Promise<WiFiProvRekeyServerState & { wifiPermit: Uint8Array }>;
  read(scope: WiFiProvRekeyScope): Promise<WiFiProvRekeyServerState | null>;
}

export interface WiFiProvRekeyPorts {
  readonly journal: WiFiProvRekeyJournal;
  readonly gateway: WiFiProvRekeyGateway;
  readonly local: {
    readonly transport: Esp32ProvisioningTransport;
    assertCurrent(): void;
    authorize(binding: WiFiProvRekeyOldBinding): Promise<void>;
    provision(options: ProvisionOptions, checkpoint: WiFiProvRekeyCheckpoint): Promise<{ success: boolean }>;
  };
  /** Active account, authority and page generation, not the transport's ready bit. */
  assertCurrent(): void;
  /** Preserve Admin; update only its cloud context under the original CAS. */
  onCommitted(checkpoint: WiFiProvRekeyCheckpoint): Promise<void>;
  /** Only explicit native terminal errors, never timeout or disconnect. */
  explicitWiFiRejection?(error: unknown): boolean;
  clock?: () => number;
}

const coded = (code: string) => Object.assign(Error(code), { code });
const mismatch = () => coded('WIFIPROV_REKEY_CONTEXT_CHANGED');
const unresolved = () => coded('WIFIPROV_REKEY_UNRESOLVED');
type WriteStep = Extract<WiFiProvRekeyEvent, { step: unknown }>['step'];

function assertServer(scope: WiFiProvRekeyScope, result: WiFiProvRekeyServerState, state: WiFiProvRekeyServerState['state']): void {
  if (!result || result.state !== state || result.logicalDeviceId !== scope.logicalDeviceId
    || result.operationId !== scope.operationId || result.fromVersion !== scope.previous.credentialVersion
    || result.toVersion !== scope.previous.credentialVersion + 1) throw mismatch();
}

function oldBinding(scope: WiFiProvRekeyScope, result: WiFiProvRekeyServerState): WiFiProvRekeyOldBinding {
  const original = result.binding;
  if (!original || original.operationId !== scope.operationId || original.instance !== scope.deviceInstanceId
    || original.accessEpoch !== scope.accessEpoch || original.fromVersion !== scope.previous.credentialVersion
    || original.oldLocator !== scope.previous.locator) throw mismatch();
  return { operationId: base64UrlDecode(original.operationId, 16), challenge: base64UrlDecode(original.challenge, 16),
    instance: base64UrlDecode(original.instance, 16), accessEpoch: original.accessEpoch, fromVersion: original.fromVersion,
    oldLocator: base64UrlDecode(original.oldLocator, 16) };
}

function nextContext(result: WiFiProvRekeyServerState) {
  if (typeof result.newLocator !== 'string') throw mismatch();
  return { credentialVersion: result.toVersion, locator: result.newLocator };
}

function newBinding(current: WiFiProvRekeyCheckpoint, result: WiFiProvRekeyServerState,
  original: WiFiProvRekeyOldBinding): WiFiProvRekeyBinding {
  const next = nextContext(result);
  if (current.next?.credentialVersion !== next.credentialVersion || current.next.locator !== next.locator) throw mismatch();
  return { ...original, newLocator: base64UrlDecode(next.locator, 16) };
}

/** Explicit foreground transaction. Ports own native owner and Cloud auth, never legacy fallback. */
export class WiFiProvRekeyCoordinator {
  private busy = false;
  private readonly clock: () => number;

  constructor(private readonly ports: WiFiProvRekeyPorts) { this.clock = ports.clock ?? Date.now; }

  async start(scope: WiFiProvRekeyScope, options: ProvisionOptions): Promise<WiFiProvRekeyCheckpoint> {
    const initial = createWiFiProvRekeyCheckpoint(scope, this.clock());
    const wifi = copyWiFiProvWifiOptions(options);
    return this.run(async () => {
      this.checkLocal();
      await this.ports.journal.replace(undefined, initial);
      const progress = this.progress(initial);
      let proof: Uint8Array | undefined, transfer: { iv: Uint8Array; box: Uint8Array } | undefined;
      let receipt: Uint8Array | undefined;
      try {
        const prepared = await progress.write('prepare', () => this.ports.gateway.prepare(initial.scope));
        assertServer(initial.scope, prepared, 'prepared');
        const original = oldBinding(initial.scope, prepared);
        await progress.save({ kind: 'prepared-confirmed', source: 'response', evidence: progress.evidence() });
        await this.local(() => this.ports.local.authorize(original));
        proof = await this.local(() => challengeWiFiProvRekey(this.ports.local.transport, original), true);
        const issued = await progress.write('issue', async () => {
          const result = await this.ports.gateway.issue(initial.scope, proof!);
          transfer = result.transfer; // Own cleanup even when the account changes while awaiting the HTTP response.
          return result;
        });
        proof.fill(0); proof = undefined;
        assertServer(initial.scope, issued, 'key_issued');
        await progress.save({ kind: 'issued', source: 'response', evidence: { ...progress.evidence(), next: nextContext(issued) } });
        const binding = newBinding(progress.current(), issued, original);
        if (!transfer) throw mismatch();
        receipt = await progress.write('install', () => this.local(() =>
          installWiFiProvRekey(this.ports.local.transport, binding, transfer!.iv, transfer!.box), true));
        transfer.iv.fill(0); transfer.box.fill(0); transfer = undefined;
        await progress.save({ kind: 'install-verified', source: 'response', evidence: progress.nextEvidence() });
        return await this.confirmAndProvision(progress, binding, receipt, wifi);
      } catch (error) { await progress.retainUnconfirmed(); throw error; }
      finally { proof?.fill(0); transfer?.iv.fill(0); transfer?.box.fill(0); receipt?.fill(0); }
    });
  }

  /** Explicit read-only recovery. An installation receipt is not Gateway commit evidence. */
  async reconcile(scope: WiFiProvRekeyScope): Promise<WiFiProvRekeyCheckpoint> {
    const expected = createWiFiProvRekeyCheckpoint(scope, this.clock()).scope;
    return this.run(async () => {
      const progress = await this.load(expected);
      const phase = progress.current().phase;
      if (!['prepare-dispatched', 'prepare-unknown', 'issue-dispatched', 'issue-unknown', 'install-dispatched',
        'install-unknown', 'commit-dispatched', 'commit-unknown'].includes(phase)) return progress.current();
      const observed = await this.ports.gateway.read(expected);
      this.ports.assertCurrent();
      if (!observed || observed.state === 'expired') return progress.current();
      if ((phase === 'prepare-dispatched' || phase === 'prepare-unknown') && observed.state === 'prepared') {
        assertServer(expected, observed, 'prepared');
        oldBinding(expected, observed);
        await progress.save({ kind: 'prepared-confirmed', source: 'read-only', evidence: progress.evidence() });
      } else if ((phase === 'issue-dispatched' || phase === 'issue-unknown') && observed.state === 'key_issued') {
        assertServer(expected, observed, 'key_issued');
        oldBinding(expected, observed);
        await progress.save({ kind: 'issued', source: 'read-only', evidence: { ...progress.evidence(), next: nextContext(observed) } });
      } else if ((phase === 'install-dispatched' || phase === 'install-unknown') && observed.state === 'key_issued') {
        assertServer(expected, observed, 'key_issued');
        const binding = newBinding(progress.current(), observed, oldBinding(expected, observed));
        const receipt = await this.readLocalReceipt(binding);
        receipt.fill(0); // Do not persist or reuse this proof for a future explicit commit.
        await progress.save({ kind: 'install-verified', source: 'read-only', evidence: progress.nextEvidence() });
      } else if ((phase === 'commit-dispatched' || phase === 'commit-unknown') && observed.state === 'committed') {
        assertServer(expected, observed, 'committed');
        newBinding(progress.current(), observed, oldBinding(expected, observed));
        await progress.save({ kind: 'commit-verified', source: 'read-only', evidence: progress.nextEvidence() });
      }
      return progress.current();
    });
  }

  /** User-approved first Cloud commit, using newly read evidence. A re-opened
   * owner did not perform Install and cannot use the WiFi permit. */
  async continueInstalled(scope: WiFiProvRekeyScope): Promise<WiFiProvRekeyCheckpoint> {
    const expected = createWiFiProvRekeyCheckpoint(scope, this.clock()).scope;
    return this.run(async () => {
      const progress = await this.load(expected);
      if (progress.current().phase !== 'installed') throw unresolved();
      const observed = await this.ports.gateway.read(expected);
      this.ports.assertCurrent();
      if (!observed) throw unresolved();
      assertServer(expected, observed, 'key_issued');
      const binding = newBinding(progress.current(), observed, oldBinding(expected, observed));
      const receipt = await this.readLocalReceipt(binding);
      try { return await this.confirmAndProvision(progress, binding, receipt); }
      catch (error) { await progress.retainUnconfirmed(); throw error; }
      finally { receipt.fill(0); }
    });
  }

  private async readLocalReceipt(binding: WiFiProvRekeyBinding): Promise<Uint8Array> {
    await this.local(() => this.ports.local.authorize(binding));
    return this.local(() => readWiFiProvRekeyReceipt(this.ports.local.transport, binding), true);
  }

  private async confirmAndProvision(progress: ReturnType<WiFiProvRekeyCoordinator['progress']>, binding: WiFiProvRekeyBinding,
    receipt: Uint8Array, options?: ProvisionOptions): Promise<WiFiProvRekeyCheckpoint> {
    const scope = progress.current().scope;
    let permit: Uint8Array | undefined;
    try {
      const confirmed = await progress.write('commit', async () => {
        const result = await this.ports.gateway.confirm(scope, receipt);
        permit = result.wifiPermit;
        return result;
      });
      receipt.fill(0);
      assertServer(scope, confirmed, 'committed');
      newBinding(progress.current(), confirmed, binding);
      await progress.save({ kind: 'commit-verified', source: 'response', evidence: progress.nextEvidence() });
      await this.ports.onCommitted(progress.current());
      if (!options) return progress.current();
      this.checkLocal();
      if (!permit) throw unresolved();
      await this.local(() => acceptWiFiProvRekeyPermit(this.ports.local.transport, binding, permit!));
      permit.fill(0); permit = undefined;
      const result = await progress.write('wifi', async () => {
        let response: { success: boolean };
        try { response = await this.ports.local.provision(options, progress.current()); }
        catch (error) { if (this.ports.explicitWiFiRejection?.(error)) return 'rejected'; throw error; }
        // The exact native terminal can validly close the owner. Do not
        // demote it to UNKNOWN merely because the Local owner is now gone.
        if (response?.success !== true && response?.success !== false) throw unresolved();
        return response.success ? 'accepted' : 'rejected';
      });
      await progress.save({ kind: 'wifi-receipt', result, evidence: progress.nextEvidence() });
      return progress.current();
    } finally { permit?.fill(0); }
  }

  private progress(initial: WiFiProvRekeyCheckpoint) {
    let current = initial;
    const evidence = () => ({ scope: current.scope, observedAt: this.clock() });
    const nextEvidence = () => {
      if (!current.next) throw mismatch();
      return { ...evidence(), next: current.next };
    };
    const save = async (event: WiFiProvRekeyEvent) => {
      this.ports.assertCurrent();
      const next = applyWiFiProvRekeyEvent(current, current.scope, event, this.clock());
      await this.ports.journal.replace(current, next);
      current = next;
      this.ports.assertCurrent();
    };
    const write = async <T>(step: WriteStep, invoke: () => Promise<T>): Promise<T> => {
      this.checkLocal();
      await save({ kind: 'dispatch', step });
      this.checkLocal();
      const result = await invoke();
      this.ports.assertCurrent();
      return result;
    };
    const retainUnconfirmed = async () => {
      const step = ['prepare', 'issue', 'install', 'commit', 'wifi'].find(value => current.phase === `${value}-dispatched`) as WriteStep | undefined;
      // The pre-dispatch marker already fences all sends if retirement prevents another local write.
      if (step) await save({ kind: 'unknown', step }).catch(() => undefined);
    };
    return { current: () => current, evidence, nextEvidence, save, write, retainUnconfirmed };
  }

  private async load(expected: WiFiProvRekeyScope) {
    const checkpoint = await this.ports.journal.load(expected.logicalDeviceId);
    this.ports.assertCurrent();
    if (!checkpoint) throw unresolved();
    return this.progress(assertWiFiProvRekeyCheckpointScope(checkpoint, expected));
  }

  private checkLocal(): void { this.ports.assertCurrent(); this.ports.local.assertCurrent(); }

  private async local<T>(work: () => Promise<T>, wipeOnLate = false): Promise<T> {
    this.checkLocal();
    const result = await work();
    try { this.checkLocal(); }
    catch (error) { if (wipeOnLate && result instanceof Uint8Array) result.fill(0); throw error; }
    return result;
  }

  private async run<T>(work: () => Promise<T>): Promise<T> {
    this.ports.assertCurrent();
    if (this.busy) throw coded('WIFIPROV_OPERATION_BUSY');
    this.busy = true;
    try { return await work(); }
    finally { this.busy = false; }
  }
}
