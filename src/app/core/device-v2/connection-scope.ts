import { DeviceV2DemandError, DeviceV2DemandOwner, DeviceV2DirectOwner } from '../protocol/device-v2/connection-demand';
import { DeviceV2ReadyWaitError } from './ready-waits';

export interface DeviceUiConnection {
  readonly signal: AbortSignal;
  readonly ready: Promise<void>;
  readonly closed: Promise<void>;
  close(): void;
}

// A caller lifetime, not another lease engine. Renewal, wire correlation and
// account retirement remain owned by the exact Session's DemandOwner.
export class DeviceUiConnectionScope implements DeviceUiConnection {
  readonly ready: Promise<void>;
  readonly closed: Promise<void>;
  private readonly controller = new AbortController();
  private finish!: () => void;
  private readonly owners = new Set<DeviceV2DemandOwner>();
  private prepared = false;
  get signal(): AbortSignal { return this.controller.signal; }
  get isReady(): boolean { return this.prepared && !this.signal.aborted; }

  constructor(prepare: (scope: DeviceUiConnectionScope) => Promise<void>, signal?: AbortSignal) {
    this.closed = new Promise(resolve => { this.finish = resolve; });
    const abort = () => this.close();
    signal?.addEventListener('abort', abort, { once: true });
    void this.closed.then(() => signal?.removeEventListener('abort', abort));
    if (signal?.aborted) this.close();
    const timer = setTimeout(() => this.close(new DeviceV2ReadyWaitError('DEVICE_V2_READY_TIMEOUT')), 30_000);
    const work = Promise.resolve().then(() => {
      this.signal.throwIfAborted();
      return prepare(this);
    }).then(() => { this.signal.throwIfAborted(); this.prepared = true; });
    this.ready = Promise.race([work, this.closed.then(() => { throw this.signal.reason; })])
      .catch(error => { this.close(error); throw error; })
      .finally(() => clearTimeout(timer));
  }

  async hold(owner: DeviceV2DemandOwner | DeviceV2DirectOwner, required = true): Promise<void> {
    // A late account login must not resurrect a cancelled page or read.
    if (this.signal.aborted) {
      void owner.accepted.catch(() => undefined);
      owner.release();
      this.signal.throwIfAborted();
    }
    this.owners.add(owner);
    void owner.closed.then(reason => {
      if (this.owners.delete(owner) && required) this.close(new DeviceV2DemandError(reason));
    });
    await owner.accepted;
    if ('ready' in owner) {
      await owner.ready;
      owner.assertReady();
    }
    this.signal.throwIfAborted();
  }

  close(reason: unknown = new DeviceV2ReadyWaitError('DEVICE_V2_READY_CANCELLED')): void {
    if (this.signal.aborted) return;
    this.controller.abort(reason);
    const owners = [...this.owners];
    this.owners.clear();
    for (const owner of owners) owner.release();
    this.finish();
  }
}
