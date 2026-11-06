import type { ProvisionOptions, WiFiProvPlugin } from 'capacitor-wifiprov';
import type { InitialCloudWifiCarrierConsumer, InitialCloudWifiCarrierUse } from '../ble-direct/cloud-registration-carrier';
import { WiFiProvCloudBoundary, wiFiProvCloudBoundary } from './wifiprov-cloud-boundary';
import type { InitialCloudWifiApply, InitialCloudWifiCarrierEvidence } from './wifiprov-initial-cloud-observation';
import { readWiFiProvSoftApAttempt } from './wifiprov-network-state';
import { assertWiFiProvResponseOwner, copyWiFiProvWifiOptions, exactWiFiProvKeys } from './wifiprov-owned-options';
import { WiFiProvSoftApAcquisition, type WiFiProvSoftApAcquisitionPorts } from './wifiprov-softap-acquisition';
import { isolatedWiFiProvOwner, type IsolatedWiFiProvOwner } from './wifiprov-softap-stages';

type CandidateClient = Pick<WiFiProvPlugin, 'getCapabilities' | 'checkPermissions' | 'getProvisioningNetworkState' | 'createDevice' | 'connect'
  | 'submitInitialCloudWifi' | 'closeInitialCloudWifi'>;
const outcomes = ['apply-queued', 'apply-unknown', 'set-unconfirmed', 'apply-not-sent', 'not-sent'] as const satisfies readonly InitialCloudWifiApply[];
function isOutcome(value: unknown): value is InitialCloudWifiApply { return outcomes.some(outcome => outcome === value); }
const coded = (code: string) => Object.assign(Error(code), { code });
const unconfirmedClose = () => coded('WIFIPROV_CLOSE_UNCONFIRMED');
type WifiStopPhase = 'create' | 'connect' | 'submit' | 'close';
type WifiStopReason = 'timeout' | 'cancelled' | 'foreground' | 'owner' | 'receipt'
  | 'checkpoint' | 'unclassified' | 'release-unconfirmed';

// Diagnostic projection only. Never retain an upstream error, code, cause or
// arguments; a supplied sink receives exactly two fixed, bounded tokens.
function wifiStopReason(error: unknown): WifiStopReason {
  try {
    if (!error || typeof error !== 'object') return 'unclassified';
    const code = Object.getOwnPropertyDescriptor(error, 'code')?.value
      ?? Object.getOwnPropertyDescriptor(error, 'message')?.value;
    switch (code) {
      case 'WIFIPROV_CONNECT_TIMEOUT': case 'WIFIPROV_RPC_TIMEOUT': case 'WIFIPROV_WORKER_BIND_TIMEOUT':
      case 'WIFIPROV_SOFTAP_ACQUISITION_TIMEOUT': case 'WIFIPROV_INITIAL_CLOUD_EXPIRED': return 'timeout';
      case 'WIFIPROV_OPERATION_CANCELLED': case 'ACCESS_REGISTRATION_CANCELLED': return 'cancelled';
      case 'BLE_DIRECT_APP_INACTIVE': return 'foreground';
      case 'WIFIPROV_ISOLATED_OWNER_REQUIRED': case 'WIFIPROV_OWNER_NOT_CURRENT': return 'owner';
      case 'PROVISIONING_RESULT_UNKNOWN': case 'WIFIPROV_RESPONSE_UNCONFIRMED': return 'receipt';
      case 'INITIAL_NETWORK_CHECKPOINT_WRITE_UNCONFIRMED': case 'INITIAL_NETWORK_CHECKPOINT_RECOVERY_REQUIRED':
      case 'INITIAL_NETWORK_CHECKPOINT_WINDOW_CLOSED': case 'INITIAL_NETWORK_CHECKPOINT_PHASE_CONFLICT':
      case 'INITIAL_NETWORK_CHECKPOINT_INVALID': return 'checkpoint';
      default: return 'unclassified';
    }
  } catch { return 'unclassified'; }
}

const apName = /^BLK-[0-9a-f]{16}$/;
const hex = /^[0-9a-f]{32}$/;

/** Retains only an in-flight Local connect; never a background write permit. */
export class InitialCloudWifiContinuation {
  private acquisition?: WiFiProvSoftApAcquisition;

  constructor(private readonly waiting: (value: boolean) => void) {}

  pause(): boolean { return this.acquisition?.pause() === true; }
  continue(): void { this.acquisition?.continue(); }

  async acquire(owner: IsolatedWiFiProvOwner, ports: Omit<WiFiProvSoftApAcquisitionPorts, 'waiting'>,
    connect: () => Promise<unknown>) {
    if (this.acquisition) throw coded('WIFIPROV_OPERATION_BUSY');
    const acquisition = new WiFiProvSoftApAcquisition(owner, { ...ports, waiting: this.waiting });
    this.acquisition = acquisition;
    try {
      // This candidate has no generic getDeviceInfo command. The retained
      // connect is only owner correlation; the fixed native submit rechecks
      // the exact live Network, version and Security1 before any Wi-Fi write.
      return await acquisition.run(connect, 'fixed-native-submit');
    } finally {
      acquisition.cancel();
      this.acquisition = undefined;
    }
  }
}

function candidatePassword(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) throw coded('WIFIPROV_REQUEST_INVALID');
  const value = String.fromCharCode(...bytes);
  if (!hex.test(value)) throw coded('WIFIPROV_REQUEST_INVALID');
  return value;
}

/** Cold preflight before committing the Key/handoff. It acquires no worker,
 * sends no WiFi credentials and never promises the later lease is available. */
export async function assertInitialCloudWifiProvAvailable(
  client: CandidateClient, signal: AbortSignal, assertCurrent: () => void,
  boundary: WiFiProvCloudBoundary = wiFiProvCloudBoundary,
): Promise<void> {
  const check = () => {
    if (signal.aborted) throw coded('WIFIPROV_OPERATION_CANCELLED');
    assertCurrent();
    if (signal.aborted) throw coded('WIFIPROV_OPERATION_CANCELLED');
    if (boundary.blocked) throw coded('WIFIPROV_CLOUD_BOUNDARY_BUSY');
  };
  check();
  if (typeof client.submitInitialCloudWifi !== 'function' || typeof client.closeInitialCloudWifi !== 'function')
    throw coded('WIFIPROV_INITIAL_CLOUD_UNSUPPORTED');
  const capabilities = await client.getCapabilities();
  check();
  if (capabilities?.softApProvisioning !== true || capabilities.softApInitialCloudWifiOnly !== true)
    throw coded('WIFIPROV_INITIAL_CLOUD_UNSUPPORTED');
  // Existing precise-location/nearby permission check; no prompt or system-connected attach.
  const permissions = await client.checkPermissions({ transport: 'softap', softApConnectionMode: 'system-connected' });
  check();
  if (permissions?.location !== 'granted' || permissions.nearbyWifi !== 'granted') throw coded('WIFIPROV_PERMISSION_REQUIRED');
  if (await readWiFiProvSoftApAttempt(client, signal)) throw unconfirmedClose();
  check();
}

/** Explicit internal consumer only. Native verifies the actual candidate AP/Security1;
 * the JS owner fields are correlation, not a radio or Internet-ready snapshot. */
export function createInitialCloudWifiProvConsumer(
  client: CandidateClient, network: ProvisionOptions, assertForeground: () => void,
  boundary: WiFiProvCloudBoundary = wiFiProvCloudBoundary,
  continuation?: { gate: InitialCloudWifiContinuation; assertContext(): void; beforeSubmit?(): Promise<void>;
    diagnostic?(phase: WifiStopPhase, reason: WifiStopReason): void },
): InitialCloudWifiCarrierConsumer<InitialCloudWifiCarrierEvidence> {
  let pending: ProvisionOptions | undefined = copyWiFiProvWifiOptions(network);
  const passwordBytes = new TextEncoder().encode(pending.password ?? '');
  const length = passwordBytes.length;
  passwordBytes.fill(0);
  if (length !== 0 && (length < 8 || length > 63)) throw coded('WIFIPROV_REQUEST_INVALID');
  return async (use: InitialCloudWifiCarrierUse) => {
    if (!pending) throw coded('WIFIPROV_INITIAL_CLOUD_CONSUMED');
    const selected = pending; pending = undefined;
    const check = () => { use.assertCurrent(); assertForeground(); use.assertCurrent(); };
    check();
    if (!apName.test(use.ssid)) throw coded('WIFIPROV_REQUEST_INVALID');
    await assertInitialCloudWifiProvAvailable(client, use.signal, check, boundary);
    check();
    const candidateId = crypto.randomUUID();
    const lease = boundary.enter();
    let owner: string | undefined, closeTask: Promise<void> | undefined;
    let createAttempted = false, attemptedAt: number | undefined;
    let outcome: InitialCloudWifiApply = 'not-sent';
    let phase: Exclude<WifiStopPhase, 'close'> = 'create';
    const diagnose = (at: WifiStopPhase, error?: unknown) => {
      try {
        // Default-off means the old path does not even inspect an error.
        const sink = continuation?.diagnostic;
        if (sink) sink(at, at === 'close' ? 'release-unconfirmed' : wifiStopReason(error));
      } catch { /* Observability cannot alter the outcome or release proof. */ }
    };
    const close = () => closeTask ??= lease.retire(async () => {
      // Only a locally proven NO invocation can release without native proof.
      if (!createAttempted) return;
      const proof = await client.closeInitialCloudWifi({ candidateId });
      if (proof?.candidateId !== candidateId) throw unconfirmedClose();
      if (proof.release === 'not-started') {
        if (owner || !exactWiFiProvKeys(proof, ['candidateId', 'release'])) throw unconfirmedClose();
      } else if (proof.release === 'binder-death') {
        if (!exactWiFiProvKeys(proof, ['candidateId', 'release', 'localOwner'])) throw unconfirmedClose();
        const released = isolatedWiFiProvOwner({ transport: 'softap', security: 1, localOwner: proof['localOwner'] });
        if (owner && released.session !== owner) throw unconfirmedClose();
      } else throw unconfirmedClose();
      // A matched worker's death cannot clear a prior main-process network hazard.
      if (await readWiFiProvSoftApAttempt(client, new AbortController().signal)) throw unconfirmedClose();
    });
    const onAbort = () => { void close().catch(() => undefined); };
    use.signal.addEventListener('abort', onAbort, { once: true });
    try {
      check();
      const remainingMs = Math.min(120_000, use.expiresAt - Date.now());
      if (!Number.isSafeInteger(remainingMs) || remainingMs < 1) throw coded('WIFIPROV_INITIAL_CLOUD_EXPIRED');
      let request = { name: use.ssid, transport: 'softap' as const, security: 1 as const,
        softApPassword: candidatePassword(use.passphrase), pop: candidatePassword(use.proofOfPossession),
        softApPurpose: 'blinker-initial-cloud' as const, remainingMs, expiresAt: use.expiresAt, candidateId };
      check();
      createAttempted = true;
      const creating = client.createDevice(request);
      request = undefined; // Bridge strings are immutable; avoid retaining another App reference.
      const created = await creating;
      check();
      const localOwner = isolatedWiFiProvOwner(created);
      owner = localOwner.session;
      if (created.name !== use.ssid || created.connected !== false) throw coded('WIFIPROV_ISOLATED_OWNER_REQUIRED');
      phase = 'connect';
      const connect = () => client.connect({ softApConnectionMode: 'sdk-managed', candidateId });
      const connected = continuation ? await continuation.gate.acquire(localOwner, {
        signal: use.signal, assertContext: continuation.assertContext, assertForeground: check,
      }, connect) : await connect();
      check();
      if (connected.name !== use.ssid || connected.connected !== true || isolatedWiFiProvOwner(connected).session !== owner)
        throw coded('WIFIPROV_ISOLATED_OWNER_REQUIRED');
      // One native invocation. A rejected or malformed result does not prove
      // no Apply reached the device, so hold UNKNOWN without retrying.
      phase = 'submit';
      if (continuation?.beforeSubmit) { await continuation.beforeSubmit(); check(); }
      outcome = 'apply-unknown';
      // Lower bound for a fresh Cloud read, not device/native Apply time.
      attemptedAt = Date.now();
      const receipt = await client.submitInitialCloudWifi({ candidateId, ssid: selected.ssid, password: selected.password ?? '' });
      check();
      if (!exactWiFiProvKeys(receipt, ['outcome', 'localOwner']) || !isOutcome(receipt['outcome']))
        throw coded('PROVISIONING_RESULT_UNKNOWN');
      assertWiFiProvResponseOwner(receipt['localOwner'], owner);
      outcome = receipt['outcome'];
    } catch (error) {
      diagnose(phase, error); // One stop projection, never success/ACK/release evidence.
      /* The phase's conservative outcome remains, subject to proven close and current owner below. */
    }
    finally {
      try { await close(); }
      catch { diagnose('close'); throw unconfirmedClose(); }
      finally { use.signal.removeEventListener('abort', onAbort); }
    }
    check();
    // Re-await the proved release only; never call native close twice.
    return { outcome, ...(attemptedAt === undefined ? {} : { attemptedAt }), closeLocal: () => closeTask! };
  };
}
