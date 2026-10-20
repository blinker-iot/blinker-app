import { bytesToHex, logicalDevicePeerId } from './codec';
import { DeviceV2Presence } from './types';

interface Attempt { id: Uint8Array; controller: AbortController }
interface Interest {
  attempt?: Attempt; pending?: Promise<boolean>; subscribed: boolean;
  retries: number; due?: number; error?: unknown;
}
const RETRY_DELAYS = [1000, 3000, 10000];

// Explicit account interests, independent of page ownership and of transport.
// Only Subscribe is retried: never replay a Command/Action after path failure.
export class DeviceV2PresenceSubscriptions {
  private readonly interests = new Map<string, Interest>();
  private timer?: ReturnType<typeof setTimeout>;
  private active = 0;
  private closed = false;

  constructor(private readonly ports: {
    id: () => Uint8Array;
    request: (target: string, id: Uint8Array, signal: AbortSignal) => Promise<DeviceV2Presence>;
    apply: (target: string, value: DeviceV2Presence) => void;
    lost: (target: string) => void;
    terminal: (error: unknown) => boolean;
    failed: (error: unknown) => void;
  }) {}

  subscribe(target: string, restart = false): Promise<boolean> {
    logicalDevicePeerId(target);
    if (this.closed) return Promise.reject(new Error('Presence subscriptions closed'));
    let record = this.interests.get(target);
    if (record) {
      if (record.pending) return record.pending;
      if (record.subscribed || record.due !== undefined) return Promise.resolve(true);
      if (!restart) return Promise.reject(record.error || new Error('Presence recovery exhausted'));
      // Only an explicit new consumer operation can replenish an exhausted
      // budget. Ordinary inventory notifications cannot restart the retry loop.
      this.interests.delete(target);
    }
    if (this.interests.size >= 256) return Promise.reject(new Error('Presence interest capacity'));
    record = { subscribed: false, retries: 0 };
    this.interests.set(target, record);
    return this.start(target, record);
  }

  lost(target: string, requestId: Uint8Array): void {
    const record = this.interests.get(target);
    if (!record?.attempt || bytesToHex(record.attempt.id) !== bytesToHex(requestId)) return;
    const attempt = record.attempt;
    record.attempt = undefined; record.subscribed = false;
    // Invalidate before synchronous Store listeners can attempt more commands.
    record.error = new Error('Presence subscription lost');
    this.retry(record, record.error);
    attempt.controller.abort(); this.ports.lost(target); this.schedule();
  }

  accepts(target: string): boolean {
    const record = this.interests.get(target);
    return !!record?.attempt && (record.subscribed || !!record.pending);
  }

  private retry(record: Interest, error: unknown): void {
    record.error = error;
    if (!this.ports.terminal(error) && record.retries < RETRY_DELAYS.length) {
      record.due = performance.now() + RETRY_DELAYS[record.retries++];
    } else { record.due = undefined; this.ports.failed(error); }
  }

  private start(target: string, record: Interest): Promise<boolean> {
    record.due = undefined;
    const attempt = { id: this.ports.id(), controller: new AbortController() };
    record.attempt = attempt; this.active++;
    const task = Promise.resolve().then(() => {
      if (this.closed || record.attempt !== attempt) throw new Error('Presence attempt retired');
      return this.ports.request(target, attempt.id, attempt.controller.signal);
    }).then(value => {
      if (this.closed || record.attempt !== attempt) throw new Error('Presence attempt retired');
      record.subscribed = true;
      this.ports.apply(target, value);
      return true;
    }).catch(error => {
      if (!this.closed && record.attempt === attempt) {
        record.attempt = undefined; record.subscribed = false;
        this.retry(record, error); this.ports.lost(target);
      }
      throw error;
    }).finally(() => {
      this.active--; // Non-cooperative requests retain their actual slot.
      if (record.pending === task) record.pending = undefined;
      this.schedule();
    });
    record.pending = task;
    return task;
  }

  private schedule(): void {
    clearTimeout(this.timer); this.timer = undefined;
    if (this.closed || this.active >= 4) return;
    const due = [...this.interests.values()].filter(r => !r.pending && r.due !== undefined).map(r => r.due!);
    if (!due.length) return;
    this.timer = setTimeout(() => {
      for (const [target, record] of this.interests) {
        if (this.active >= 4) break;
        if (!record.pending && record.due !== undefined && record.due <= performance.now()) {
          void this.start(target, record).catch(() => {});
        }
      }
      this.schedule();
    }, Math.max(1, Math.min(...due) - performance.now()));
  }

  close(): void {
    this.closed = true; clearTimeout(this.timer);
    for (const record of this.interests.values()) record.attempt?.controller.abort();
    this.interests.clear();
  }
}
