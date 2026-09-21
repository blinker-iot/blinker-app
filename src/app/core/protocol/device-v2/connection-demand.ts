// Bounded owner lifetime and optional Direct Ready projection, separate from
// Presence and business payloads. State observation uses an independent instance
// with a different wire sender, never Hub wake. Each instance belongs to ONE session; its
// sender must never transparently reconnect or send via a replacement account.
// UI scopes consume this runtime; physical Hub arbitration is a separate layer.
export interface DeviceV2DemandRequest {
  readonly ownerId: number;
  readonly revision: number;
  readonly action: 'acquire' | 'renew' | 'release';
  readonly target: string;
  readonly purpose?: 'direct';
}

export interface DeviceV2DemandReply {
  readonly ownerId: number;
  readonly revision: number;
  readonly status: 'accepted' | 'released' | 'stale' | 'denied' | 'busy' | 'capacity';
}

export interface DeviceV2DirectReadyQuery { readonly ownerId: number; readonly revision: number; }
export interface DeviceV2DirectReadyReply extends DeviceV2DirectReadyQuery {
  readonly status: 'pending' | 'ready' | 'stale' | 'denied';
  readonly remainingMillis: number;
}

export type DeviceV2DemandCloseReason = 'cancelled' | 'session-ended' | 'timeout' | 'rejected' | 'capacity' | 'unavailable';
export class DeviceV2DemandError extends Error {
  constructor(readonly reason: DeviceV2DemandCloseReason) {
    super(`Device V2 connection demand ${reason}`);
    this.name = reason === 'cancelled' ? 'AbortError' : 'DeviceV2DemandError';
  }
}

export interface DeviceV2DemandOwner {
  // Acceptance only, not connectivity, fresh State or permission to send Action.
  readonly accepted: Promise<void>;
  readonly closed: Promise<DeviceV2DemandCloseReason>;
  release(): void;
}

export interface DeviceV2DirectOwner extends DeviceV2DemandOwner {
  // Physical Hub yield only; caller still needs BLE authentication and State.
  readonly ready: Promise<void>;
  assertActive(): void;
  assertReady(): void;
}

interface Owner {
  readonly id: number;
  readonly target: string;
  readonly purpose?: 'direct';
  revision: number;
  acceptedRevision?: number;
  deadline: number;
  nextRenew: number;
  direct?: { deadline: number; nextQuery: number; verified: boolean; resolve: () => void; reject: (error: Error) => void };
  timer?: ReturnType<typeof setTimeout>;
  cancelRequest?: () => void;
  dispose: () => void;
  accept: () => void;
  reject: (error: Error) => void;
  close: (reason: DeviceV2DemandCloseReason) => void;
}

export class DeviceV2DemandOwners {
  private nextOwnerId = 0;
  private retired = false;
  private readonly owners = new Set<Owner>();
  private readonly requests = new Set<AbortController>();

  constructor(private readonly send: (
    request: DeviceV2DemandRequest, signal: AbortSignal,
  ) => Promise<DeviceV2DemandReply>, private readonly query?: (
    request: DeviceV2DirectReadyQuery & { readonly target: string }, signal: AbortSignal,
  ) => Promise<DeviceV2DirectReadyReply>) {}

  acquire(target: string, signal: AbortSignal | undefined, purpose: 'direct'): DeviceV2DirectOwner;
  acquire(target: string, signal?: AbortSignal): DeviceV2DemandOwner;
  acquire(target: string, signal?: AbortSignal, purpose?: 'direct'): DeviceV2DemandOwner {
    if (this.retired) throw new DeviceV2DemandError('session-ended');
    if (signal?.aborted) throw new DeviceV2DemandError('cancelled');
    if (purpose !== undefined && purpose !== 'direct') throw new Error('Invalid connection demand purpose');
    if (purpose === 'direct' && !this.query) throw new Error('Direct Ready query is required');
    if (typeof target !== 'string' || !target.length || target.length > 128 || /[^A-Za-z0-9_-]/.test(target)) {
      throw new Error('Invalid connection demand target');
    }
    if (this.owners.size >= 16 || this.requests.size >= 16 || this.nextOwnerId === 0xffffffff) {
      throw new DeviceV2DemandError('capacity');
    }
    let accept!: () => void, reject!: (error: Error) => void, close!: (reason: DeviceV2DemandCloseReason) => void;
    const accepted = new Promise<void>((resolve, fail) => { accept = resolve; reject = fail; });
    const closed = new Promise<DeviceV2DemandCloseReason>(resolve => { close = resolve; });
    const now = performance.now();
    const owner: Owner = { id: ++this.nextOwnerId, target, purpose, revision: 1,
      deadline: now + 30000, nextRenew: now + 10000, dispose: () => undefined, accept, reject, close };
    let ready: Promise<void> | undefined;
    if (purpose === 'direct') {
      void accepted.catch(() => undefined); // Direct callers may initially await ready instead.
      ready = new Promise<void>((resolve, fail) => {
        owner.direct = { deadline: now + 30000, nextQuery: Infinity, verified: false, resolve, reject: fail };
      });
      void ready.catch(() => undefined); // A caller may initially only await acceptance.
    }
    const release = () => this.finish(owner, 'cancelled');
    signal?.addEventListener('abort', release, { once: true });
    owner.dispose = () => signal?.removeEventListener('abort', release);
    this.owners.add(owner);
    this.request(owner, 'acquire');
    return ready ? { accepted, closed, release, ready, assertActive: () => {
      if (!this.check(owner)) throw new DeviceV2DemandError('rejected');
    }, assertReady: () => {
      if (!this.check(owner) || !owner.direct!.verified) throw new DeviceV2DemandError('rejected');
    } } as DeviceV2DirectOwner : { accepted, closed, release };
  }

  close(): void {
    this.retired = true;
    for (const owner of [...this.owners]) this.finish(owner, 'session-ended');
    for (const request of this.requests) request.abort();
  }

  // A shared target stream has one gap, even if older clients created several
  // owners. Correlate before retiring; an old notice cannot touch a new owner.
  lost(target: string, reply: DeviceV2DemandReply): boolean {
    if (reply.status !== 'stale' && reply.status !== 'denied') throw new Error('Invalid observation loss');
    const match = [...this.owners].some(owner => owner.target === target && !owner.purpose
      && owner.id === reply.ownerId && (owner.revision === reply.revision || owner.acceptedRevision === reply.revision));
    if (!match) return false;
    for (const owner of [...this.owners]) {
      if (owner.target === target && !owner.purpose) this.finish(owner, reply.status === 'denied' ? 'rejected' : 'unavailable');
    }
    return true;
  }

  private request(owner: Owner, action: 'acquire' | 'renew'): void {
    if (!this.check(owner)) return;
    const issued = performance.now();
    if (issued >= owner.deadline) { this.finish(owner, 'timeout'); return; }
    if (this.requests.size >= 16) { this.finish(owner, 'capacity'); return; }
    const request = Object.freeze({ ownerId: owner.id, revision: owner.revision, target: owner.target, action,
      ...(owner.purpose ? { purpose: owner.purpose } : {}) });
    owner.cancelRequest = this.transmit(signal => this.send(request, signal), (reply, error) => {
      owner.cancelRequest = undefined;
      if (!this.check(owner)) return;
      if (error) { this.finish(owner, error.reason); return; }
      if (!reply || reply.ownerId !== request.ownerId || reply.revision !== request.revision || reply.status !== 'accepted') {
        this.finish(owner, 'rejected'); return;
      }
      owner.deadline = issued + 30000; // Conservative client time, never receipt-time extension.
      owner.acceptedRevision = request.revision;
      owner.nextRenew = issued + 10000;
      if (owner.direct) owner.direct.nextQuery = performance.now();
      owner.accept();
      this.schedule(owner);
    });
    this.schedule(owner);
  }

  private schedule(owner: Owner): void {
    clearTimeout(owner.timer);
    if (!this.owners.has(owner)) return;
    const deadline = Math.min(owner.deadline, owner.direct?.deadline ?? Infinity);
    const due = owner.cancelRequest ? deadline : Math.min(deadline, owner.nextRenew, owner.direct?.nextQuery ?? Infinity);
    owner.timer = setTimeout(() => {
      if (!this.check(owner)) return;
      // Timer precision may wake us before the monotonic deadline. Keep the
      // same owner scheduled; never query early or abandon a Cloud renewal.
      if (performance.now() < due) { this.schedule(owner); return; }
      if (performance.now() < owner.nextRenew) { this.readyQuery(owner); return; }
      if (owner.revision === 0xffffffff) { this.finish(owner, 'capacity'); return; }
      if (owner.direct) owner.direct.verified = false;
      ++owner.revision;
      this.request(owner, 'renew');
    }, Math.max(0, Math.ceil(due - performance.now())));
  }

  private check(owner: Owner): boolean {
    if (!this.owners.has(owner)) return false;
    if (performance.now() < Math.min(owner.deadline, owner.direct?.deadline ?? Infinity)) return true;
    this.finish(owner, 'timeout');
    return false;
  }

  private readyQuery(owner: Owner): void {
    const direct = owner.direct;
    if (!direct || !this.query || !this.check(owner)) return;
    if (this.requests.size >= 16) { this.finish(owner, 'capacity'); return; }
    const request = Object.freeze({ ownerId: owner.id, revision: owner.revision, target: owner.target });
    const issued = performance.now();
    owner.cancelRequest = this.transmit(signal => this.query!(request, signal), (reply, error) => {
      owner.cancelRequest = undefined;
      if (!this.check(owner)) return;
      if (error) { this.finish(owner, error.reason); return; }
      if (!reply || reply.ownerId !== owner.id || reply.revision !== owner.revision
        || (reply.status !== 'ready' && reply.status !== 'pending')
        || !Number.isInteger(reply.remainingMillis) || reply.remainingMillis < 0 || reply.remainingMillis > 30000
        || (reply.status === 'ready') !== (reply.remainingMillis > 0)) {
        this.finish(owner, 'rejected'); return;
      }
      if (reply.status === 'ready') {
        direct.deadline = Math.min(owner.deadline, issued + reply.remainingMillis);
        if (!this.check(owner)) return;
        // Demand lifetime and physical promise are independent. Renew this
        // owner before the shorter promise ends, using the query's send-time
        // anchor; only a new exact Ready may extend the physical deadline.
        owner.nextRenew = Math.min(owner.nextRenew, issued + Math.max(1, Math.floor((direct.deadline - issued) / 2)));
        direct.verified = true;
        direct.nextQuery = Infinity;
        direct.resolve();
      } else direct.nextQuery = performance.now() + 1000;
      this.schedule(owner);
    });
    this.schedule(owner);
  }

  private finish(owner: Owner, reason: DeviceV2DemandCloseReason): void {
    if (!this.owners.delete(owner)) return;
    clearTimeout(owner.timer);
    owner.dispose();
    owner.cancelRequest?.();
    owner.reject(new DeviceV2DemandError(reason));
    owner.direct?.reject(new DeviceV2DemandError(reason));
    owner.close(reason);
    // Release the exact old owner, even if its acquire acknowledgment was lost.
    // No wait, retry or new-account fallback. Server expiry is the loss fallback.
    if (!this.retired && this.requests.size < 32 && owner.revision < 0xffffffff) {
      const request = Object.freeze({ ownerId: owner.id, revision: owner.revision + 1,
        action: 'release', target: owner.target,
        ...(owner.purpose ? { purpose: owner.purpose } : {}) } as const);
      this.transmit(signal => this.send(request, signal), () => undefined);
    }
  }

  private transmit<T>(send: (signal: AbortSignal) => Promise<T>, complete: (
    reply?: T, error?: DeviceV2DemandError,
  ) => void): () => void {
    const controller = new AbortController();
    this.requests.add(controller);
    let finished = false;
    const deadline = performance.now() + 5000;
    const timer = setTimeout(() => controller.abort(), 5000);
    const finish = (reply?: T, error?: DeviceV2DemandError) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', abort);
      complete(reply, error);
    };
    const abort = () => finish(undefined, new DeviceV2DemandError('timeout'));
    controller.signal.addEventListener('abort', abort, { once: true });
    void Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return send(controller.signal);
    }).then(reply => {
      if (performance.now() >= deadline) finish(undefined, new DeviceV2DemandError('timeout'));
      else finish(reply);
    }, error => finish(undefined, error instanceof DeviceV2DemandError ? error : new DeviceV2DemandError('rejected')))
      .finally(() => this.requests.delete(controller));
    // Keep the slot until a non-cooperative sender really settles, even after
    // local timeout/cancel. Churn cannot produce an unbounded orphan RPC queue.
    return () => controller.abort();
  }
}
