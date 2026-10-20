import {
  Bbp2ErrorCode, DeviceV2RouteError, DeviceV2Session, DeviceV2Store,
  DeviceV2TargetUnavailableError, isDeviceV2TargetReady, isLogicalDeviceId,
} from '../protocol/device-v2';

export class DeviceV2ReadyWaitError extends Error {
  constructor(readonly code: 'DEVICE_V2_READY_TIMEOUT' | 'DEVICE_V2_READY_CANCELLED'
    | 'DEVICE_V2_READY_RETIRED' | 'DEVICE_V2_READY_CAPACITY') {
    super(code);
    this.name = code === 'DEVICE_V2_READY_CANCELLED' ? 'AbortError' : 'DeviceV2ReadyWaitError';
  }
}

type ReadySession = Pick<DeviceV2Session, 'state' | 'subscribeState' | 'subscribePresence' | 'ensureReady'>;
type Consumer = (error?: unknown) => void;
interface Wait {
  deadline: number;
  consumers: Set<Consumer>;
  dispose: (() => void)[];
}

// Connection preparation only: no Action arguments, request IDs or retry queue.
// One absolute budget includes account login, Presence and read-only sync.
export class DeviceV2ReadyWaits {
  private readonly waits = new Map<string, Wait>();

  constructor(
    private readonly prepare: () => Promise<ReadySession>,
    private readonly store: Pick<DeviceV2Store, 'snapshot' | 'subscribe'>,
  ) {}

  wait(logicalDeviceId: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new DeviceV2ReadyWaitError('DEVICE_V2_READY_CANCELLED'));
    if (!isLogicalDeviceId(logicalDeviceId)) return Promise.reject(new Error('Invalid logical device identity'));
    let wait = this.waits.get(logicalDeviceId);
    if (wait && !this.current(logicalDeviceId, wait)) wait = undefined;
    if (!wait) {
      if (this.waits.size >= 16) return Promise.reject(new DeviceV2ReadyWaitError('DEVICE_V2_READY_CAPACITY'));
      wait = { deadline: performance.now() + 30_000, consumers: new Set(), dispose: [] };
      this.waits.set(logicalDeviceId, wait);
      const owned = wait;
      const timer = setTimeout(() => this.finish(logicalDeviceId, owned,
        new DeviceV2ReadyWaitError('DEVICE_V2_READY_TIMEOUT')), 30_000);
      wait.dispose.push(() => clearTimeout(timer));
      // Register the first consumer before even a synchronous Store callback.
      void Promise.resolve().then(() => this.open(logicalDeviceId, owned))
        .catch(error => {
          if (this.current(logicalDeviceId, owned)) this.finish(logicalDeviceId, owned, error);
        });
    }
    const owned = wait;
    return new Promise<void>((resolve, reject) => {
      const complete: Consumer = error => {
        signal?.removeEventListener('abort', abort);
        owned.consumers.delete(complete);
        if (error === undefined) resolve(); else reject(error);
      };
      const abort = () => {
        complete(new DeviceV2ReadyWaitError('DEVICE_V2_READY_CANCELLED'));
        if (!owned.consumers.size) this.finish(logicalDeviceId, owned);
      };
      owned.consumers.add(complete);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  retire(): void {
    for (const [id, wait] of this.waits) {
      this.finish(id, wait, new DeviceV2ReadyWaitError('DEVICE_V2_READY_RETIRED'));
    }
  }

  private current(id: string, wait: Wait): boolean {
    if (this.waits.get(id) !== wait) return false;
    // Browser suspension can delay the timer beyond a late HTTP/State result.
    if (performance.now() >= wait.deadline) {
      this.finish(id, wait, new DeviceV2ReadyWaitError('DEVICE_V2_READY_TIMEOUT'));
      return false;
    }
    return true;
  }

  private finish(id: string, wait: Wait, error?: unknown): void {
    if (this.waits.get(id) !== wait) return;
    this.waits.delete(id);
    wait.dispose.splice(0).forEach(dispose => dispose());
    [...wait.consumers].forEach(complete => complete(error));
  }

  private async open(id: string, wait: Wait): Promise<void> {
    if (!this.current(id, wait)) return;
    const session = await this.prepare();
    if (!this.current(id, wait)) return;
    if (session.state !== 'ready') throw new DeviceV2ReadyWaitError('DEVICE_V2_READY_RETIRED');
    wait.dispose.push(session.subscribeState(state => {
      if (state !== 'ready') this.finish(id, wait, new DeviceV2ReadyWaitError('DEVICE_V2_READY_RETIRED'));
    }));
    let subscribed = false, busy = false, onlineEpoch = 0;
    let reachable = this.store.snapshot(id).cloudReachable;
    const check = () => {
      if (!this.current(id, wait) || !subscribed || busy || reachable === false) return;
      busy = true;
      const attemptEpoch = onlineEpoch;
      void Promise.resolve().then(() => {
        if (this.current(id, wait)) return session.ensureReady(id);
      }).then(() => {
        if (!this.current(id, wait)) return;
        if (isDeviceV2TargetReady(this.store.snapshot(id))) this.finish(id, wait);
      }, error => {
        if (!this.current(id, wait)) return;
        if (!(error instanceof DeviceV2TargetUnavailableError)
          && !(error instanceof DeviceV2RouteError && error.code === Bbp2ErrorCode.NegotiationRequired)) {
          this.finish(id, wait, error);
        }
        // Transient unavailability waits for actual Presence, not a poll loop.
      }).finally(() => {
        busy = false;
        if (onlineEpoch !== attemptEpoch) check();
      });
    };
    wait.dispose.push(this.store.subscribe((changedId, snapshot) => {
      if (changedId !== id) return;
      if (snapshot.cloudReachable === true && reachable !== true) ++onlineEpoch;
      reachable = snapshot.cloudReachable;
      check();
    }));
    // A new explicit page/business wait may retry an exhausted target without
    // reconnecting the account. Ordinary Store events only call check().
    await session.subscribePresence(id, true); // Permission errors remain immediate.
    if (!this.current(id, wait)) return;
    subscribed = true;
    check();
  }
}
