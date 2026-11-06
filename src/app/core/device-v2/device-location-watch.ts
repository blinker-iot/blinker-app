import {
  DEVICE_LOCATION_FRESH_MS, DeviceLocationTelemetryLatest, DeviceLocationTelemetryLease, DeviceLocationTelemetryLeaseControl,
  locationTelemetryFreshness,
} from './device-location-telemetry';

/** The existing authenticated HTTP service is the port; no transport or auth owner lives here. */
export interface DeviceLocationWatchPort {
  read(id: string, signal: AbortSignal): Promise<DeviceLocationTelemetryLatest>;
  control(id: string, command: DeviceLocationTelemetryLeaseControl,
    signal: AbortSignal): Promise<DeviceLocationTelemetryLease>;
}
export interface DeviceLocationWatchSnapshot {
  phase: 'idle' | 'loading' | 'watching' | 'unsupported' | 'paused' | 'error';
  latest: DeviceLocationTelemetryLatest | null;
  /** Service acceptance only: an active lease is not device ACK or proof of a fresh fix. */
  lease: DeviceLocationTelemetryLease | null;
  error: unknown | null;
  ageMillis: number | null;
  fresh: boolean;
}
interface WatchContext { id: string; current: () => boolean }
interface WatchRun {
  context: WatchContext;
  controller: AbortController;
  nonce: string;
  opened: boolean;
  poll?: ReturnType<typeof setTimeout>;
  renew?: ReturnType<typeof setTimeout>;
  freshness?: ReturnType<typeof setTimeout>;
}
const POLL_MS = 5000;
const RENEW_MS = 10000;
// A tighter caller deadline leaves margin inside the server's fixed 30 s lease.
const REQUEST_MS = 10000;
const CLOSE_MS = 2000;

/** A page lifetime over the private Cloud lease, not a second device execution chain. */
export class DeviceLocationWatch {
  private context?: WatchContext;
  private run?: WatchRun;
  private closing?: AbortController;
  private destroyed = false;
  private failed = false;
  private receivedAt = 0;
  private phase: DeviceLocationWatchSnapshot['phase'] = 'idle';
  private latest: DeviceLocationTelemetryLatest | null = null;
  private lease: DeviceLocationTelemetryLease | null = null;
  private error: unknown | null = null;
  private readonly now: () => number;
  private readonly nonce: () => string;

  constructor(private readonly port: DeviceLocationWatchPort, private readonly changed: () => void,
    options: { monotonicNow?: () => number; nonce?: () => string } = {}) {
    this.now = options.monotonicNow ?? (() => performance.now());
    this.nonce = options.nonce ?? (() => crypto.randomUUID());
  }

  get snapshot(): DeviceLocationWatchSnapshot {
    const freshness = this.latest === null ? { ageMillis: null, fresh: false }
      : locationTelemetryFreshness(this.latest, this.now() - this.receivedAt);
    return { phase: this.phase, latest: this.latest, lease: this.lease, error: this.error, ...freshness };
  }

  /** Call only for a visible owner page. Freeze account, device and API context in current. */
  start(id: string, current: () => boolean): void {
    if (this.destroyed) return;
    if (!this.context || this.context.id !== id || !this.context.current()) {
      this.stop();
      this.context = { id, current };
    }
    if (!current() || this.run || this.failed) return;
    const run: WatchRun = { context: this.context, controller: new AbortController(),
      nonce: this.nonce(), opened: false };
    this.run = run;
    this.phase = 'loading'; this.error = null; this.lease = null;
    this.notify();
    void this.open(run);
  }

  /** A normal same-account background/page hide may resume, but never clears a failure gate. */
  pause(): void {
    this.retire();
    if (!this.failed) this.phase = 'paused';
    this.notify();
  }

  /** Retire the identity as well. An invalid old scope cannot Close using a new account. */
  stop(): void {
    this.retire();
    if (this.context && !this.context.current()) this.closing?.abort();
    this.context = undefined; this.latest = null; this.lease = null;
    this.failed = false; this.error = null; this.phase = 'idle';
    this.notify();
  }

  /** Explicit user intent is the only recovery from an HTTP/lease failure. */
  refresh(): void {
    const context = this.context;
    if (this.destroyed || !context?.current()) return;
    this.retire();
    this.failed = false;
    this.start(context.id, context.current);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.stop();
    this.destroyed = true;
  }

  private async open(run: WatchRun): Promise<void> {
    try {
      if (!await this.read(run)) return;
      if (!this.current(run)) return;
      // Remember an attempted Open even if its response is cancelled or unknown.
      run.opened = true;
      const started = this.now();
      const lease = await this.request(run, signal => this.port.control(run.context.id,
        { operation: 'open', leaseId: run.nonce, intervalMs: POLL_MS }, signal));
      if (!this.current(run)) return;
      this.lease = lease; this.phase = 'watching'; this.notify();
      this.schedulePoll(run);
      this.scheduleRenew(run, started);
    } catch (error) { this.fail(run, error); }
  }

  private async read(run: WatchRun): Promise<boolean> {
    const started = this.now();
    const latest = await this.request(run, signal => this.port.read(run.context.id, signal));
    if (!this.current(run)) return false;
    const previous = this.latest?.capability;
    this.latest = latest;
    // Include request transit conservatively; a device timestamp never changes this clock.
    this.receivedAt = started;
    this.scheduleFreshness(run);
    if (latest.capability === null) {
      this.retire(); this.phase = 'unsupported'; this.notify();
      return false;
    }
    if (run.opened && previous && (previous.endpointId !== latest.capability.endpointId
      || previous.manifestFingerprint !== latest.capability.manifestFingerprint)) {
      throw Error('DEVICE_V2_LOCATION_CAPABILITY_CHANGED');
    }
    this.notify();
    return true;
  }

  private schedulePoll(run: WatchRun): void {
    run.poll = setTimeout(() => {
      if (!this.current(run)) return;
      void this.read(run).then(available => {
        if (available && this.current(run)) this.schedulePoll(run);
      }).catch(error => this.fail(run, error));
    }, POLL_MS);
  }

  private scheduleRenew(run: WatchRun, previousStart: number): void {
    run.renew = setTimeout(() => {
      if (!this.current(run)) return;
      const started = this.now();
      void this.request(run, signal => this.port.control(run.context.id,
        { operation: 'renew', leaseId: run.nonce }, signal)).then(lease => {
        if (!this.current(run)) return;
        this.lease = lease; this.notify(); this.scheduleRenew(run, started);
      }).catch(error => this.fail(run, error));
    }, Math.max(0, RENEW_MS - (this.now() - previousStart)));
  }

  private scheduleFreshness(run: WatchRun): void {
    clearTimeout(run.freshness);
    const freshness = this.snapshot;
    if (freshness.fresh) run.freshness = setTimeout(() => {
      if (this.current(run)) this.notify();
    }, Math.max(0, DEVICE_LOCATION_FRESH_MS + 1 - freshness.ageMillis!));
  }

  private current(run: WatchRun): boolean {
    if (this.run !== run || run.controller.signal.aborted) return false;
    if (run.context.current()) return true;
    // This is identity/permission retirement, not an ordinary page pause. Do
    // not retain private coordinates or cleanup work in the next auth scope.
    this.stop();
    return false;
  }

  private fail(run: WatchRun, error: unknown): void {
    if (!this.current(run)) return;
    const authorityLost = this.authorityLost(error);
    this.retire(!authorityLost);
    if (authorityLost) { this.closing?.abort(); this.latest = null; }
    this.failed = true; this.error = error; this.phase = 'error'; this.notify();
  }

  private authorityLost(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const status = (error as { httpStatus?: unknown }).httpStatus;
    const code = (error as { code?: unknown }).code;
    return status === 401 || status === 403 || (status === 404
      && ['DEVICE_V2_DEVICE_NOT_FOUND', 'DEVICE_V2_LOCATION_NOT_FOUND',
        'DEVICE_V2_LOCATION_LATEST_NOT_FOUND', 'DEVICE_V2_LOCATION_LEASE_NOT_FOUND'].includes(code as string));
  }

  private retire(close = true): void {
    const run = this.run;
    if (!run) return;
    this.run = undefined;
    clearTimeout(run.poll); clearTimeout(run.renew); clearTimeout(run.freshness);
    run.controller.abort(); this.lease = null;
    if (!close || !run.opened || !run.context.current()) return;
    // Nonce Close also tombstones an Open whose response was late/unknown. At most
    // one independent cleanup is in flight; never reuse an already-aborted signal.
    this.closing?.abort();
    const controller = new AbortController();
    this.closing = controller;
    void this.bounded(controller.signal, CLOSE_MS, signal => this.port.control(run.context.id,
      { operation: 'close', leaseId: run.nonce }, signal)).catch(() => undefined).finally(() => {
      if (this.closing === controller) this.closing = undefined;
    });
  }

  private request<T>(run: WatchRun, send: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (!this.current(run)) return Promise.reject(Error('DEVICE_V2_LOCATION_WATCH_CANCELLED'));
    return this.bounded(run.controller.signal, REQUEST_MS, send);
  }

  private bounded<T>(parent: AbortSignal, milliseconds: number,
    send: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController();
      let settled = false;
      const finish = (work: () => void) => {
        if (settled) return;
        settled = true; clearTimeout(timer); parent.removeEventListener('abort', cancelled); work();
      };
      const cancelled = () => {
        controller.abort(parent.reason);
        finish(() => reject(parent.reason ?? Error('DEVICE_V2_LOCATION_WATCH_CANCELLED')));
      };
      const timer = setTimeout(() => {
        const error = Error('DEVICE_V2_LOCATION_WATCH_TIMEOUT');
        controller.abort(error); finish(() => reject(error));
      }, milliseconds);
      parent.addEventListener('abort', cancelled, { once: true });
      if (parent.aborted) { cancelled(); return; }
      // Synchronous port throws and responses from a cancelled call are contained.
      try { Promise.resolve(send(controller.signal)).then(
        value => finish(() => resolve(value)), error => finish(() => reject(error))); }
      catch (error) { finish(() => reject(error)); }
    });
  }

  private notify(): void { if (!this.destroyed) this.changed(); }
}
