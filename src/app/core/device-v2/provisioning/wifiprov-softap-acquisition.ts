import type { ProvisioningDevice } from 'capacitor-wifiprov';
import { IsolatedWiFiProvOwner, isolatedWiFiProvOwner } from './wifiprov-softap-stages';

export interface WiFiProvSoftApAcquisitionPorts {
  signal: AbortSignal;
  /** Account, authority, generation and view; this must not grant foreground access. */
  assertContext(): void;
  /** The existing strict foreground guard, not a cached ready/network snapshot. */
  assertForeground(): void;
  waiting(value: boolean): void;
}

type AcquisitionPhase = 'idle' | 'connecting' | 'await-user' | 'refreshing'
  | 'complete' | 'failed' | 'cancelled';
const coded = (code: string) => Object.assign(Error(code), { code });
const cancelled = () => coded('WIFIPROV_OPERATION_CANCELLED');
const timedOut = () => coded('WIFIPROV_SOFTAP_ACQUISITION_TIMEOUT');
// SoftAP includes an OS/user network decision, not only a local RPC. Reserve
// 60s for the native connect and 30s for explicit continuation/fresh info.
// One whole-operation deadline; neither returning nor waiting grants access.
const acquisitionBudgetMs = 90_000;

/**
 * One already-selected Local connection, never an identity/Cloud coordinator.
 * A pause-only system interaction can retain its result, not authorize writes.
 * Stop/Home/leave still cancel through the caller's original close path.
 */
export class WiFiProvSoftApAcquisition {
  private readonly owner: IsolatedWiFiProvOwner;
  private phase: AcquisitionPhase = 'idle';
  private connectStarted = false;
  private paused = false;
  private failure?: unknown;
  private readonly stop = new AbortController();
  private readonly onAbort = () => this.cancel();
  private deadline?: number;
  private timer?: ReturnType<typeof setTimeout>;
  private userWait?: { resolve(): void; reject(error: unknown): void };

  constructor(owner: IsolatedWiFiProvOwner, private readonly ports: WiFiProvSoftApAcquisitionPorts) {
    // Reuse the strict native metadata decoder and detach the caller's object.
    this.owner = isolatedWiFiProvOwner({ transport: 'softap', security: 1, localOwner: owner });
    ports.signal.addEventListener('abort', this.onAbort, { once: true });
    if (ports.signal.aborted) this.cancel();
  }

  get pending(): boolean {
    return this.phase === 'connecting' || this.phase === 'await-user' || this.phase === 'refreshing';
  }

  get waiting(): boolean { return this.phase === 'await-user' && !!this.userWait; }

  /** Only the original, actually invoked connect may survive a pause-only event. */
  pause(): boolean {
    if (this.phase !== 'connecting' || !this.connectStarted) return false;
    try { this.check(); } catch (error) { this.fail(error); return false; }
    this.paused = true;
    return true;
  }

  async run(connect: () => Promise<unknown>,
    recheck: (() => Promise<unknown>) | 'fixed-native-submit'): Promise<ProvisioningDevice> {
    if (this.phase !== 'idle') {
      this.check();
      throw coded('WIFIPROV_OPERATION_BUSY');
    }
    this.phase = 'connecting';
    this.deadline = performance.now() + acquisitionBudgetMs;
    this.timer = setTimeout(() => this.fail(timedOut()), acquisitionBudgetMs);
    try {
      this.check(); this.ports.assertForeground();
      const connected = this.sameOwner(await this.observe(() => {
        this.connectStarted = true;
        return connect();
      }));
      let result = connected;
      if (this.paused) {
        this.phase = 'await-user';
        // Construct under observe so synchronous cancel from waiting() is handled.
        await this.observe(() => new Promise<void>((resolve, reject) => {
          this.userWait = { resolve, reject };
          this.ports.waiting(true);
        }));
        this.check(); this.ports.assertForeground();
        if (typeof recheck === 'function') {
          this.phase = 'refreshing';
          result = this.sameOwner(await this.observe(recheck));
        } else if (recheck !== 'fixed-native-submit') throw coded('WIFIPROV_ISOLATED_OWNER_REQUIRED');
      }
      this.check(); this.ports.assertForeground();
      this.phase = 'complete';
      return result;
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      if (this.timer !== undefined) clearTimeout(this.timer);
      this.timer = undefined;
      this.deadline = undefined;
      this.ports.signal.removeEventListener('abort', this.onAbort);
    }
  }

  continue(): void {
    if (!this.waiting) return; // A click before the matching wait cannot prepay it.
    try { this.check(); this.ports.assertForeground(); }
    catch (error) { this.fail(error); return; }
    const wait = this.userWait!;
    this.userWait = undefined;
    this.notifyWaiting(false);
    wait.resolve();
  }

  cancel(): void {
    if (this.phase === 'complete' || this.phase === 'failed' || this.phase === 'cancelled') return;
    this.phase = 'cancelled';
    this.failure = cancelled();
    this.retireWait();
  }

  private sameOwner(value: unknown): ProvisioningDevice {
    const owner = isolatedWiFiProvOwner(value);
    if (owner.session !== this.owner.session) throw coded('WIFIPROV_ISOLATED_OWNER_REQUIRED');
    if ((value as ProvisioningDevice).connected !== true) throw coded('WIFIPROV_NOT_CONNECTED');
    return value as ProvisioningDevice;
  }

  private check(): void {
    if (this.ports.signal.aborted) this.cancel();
    if (this.phase === 'failed' || this.phase === 'cancelled') throw this.failure;
    if (this.deadline !== undefined && performance.now() >= this.deadline) throw timedOut();
    this.ports.assertContext();
  }

  private observe<T>(work: () => Promise<T>): Promise<T> {
    this.check();
    const pending = work();
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (ok: boolean, value: unknown) => {
        if (settled) return;
        settled = true;
        this.stop.signal.removeEventListener('abort', aborted);
        if (ok) resolve(value as T); else reject(value);
      };
      const aborted = () => finish(false, this.failure ?? cancelled());
      this.stop.signal.addEventListener('abort', aborted, { once: true });
      Promise.resolve(pending).then(value => {
        try { this.check(); finish(true, value); } catch (error) { finish(false, error); }
      }, error => finish(false, error));
      if (this.stop.signal.aborted) aborted();
    });
  }

  private fail(error: unknown): void {
    if (this.phase === 'complete' || this.phase === 'failed' || this.phase === 'cancelled') return;
    this.phase = 'failed'; this.failure = error;
    this.retireWait();
  }

  private retireWait(): void {
    const wait = this.userWait; this.userWait = undefined;
    wait?.reject(this.failure);
    this.stop.abort();
    this.ports.signal.removeEventListener('abort', this.onAbort);
    this.notifyWaiting(false);
  }

  private notifyWaiting(value: boolean): void {
    try { this.ports.waiting(value); } catch { /* Cleanup cannot authorize another operation. */ }
  }
}
