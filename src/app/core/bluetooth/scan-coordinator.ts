// Discovery owns observations, not device identity, authentication or commands.
export interface ScanPort<T> {
  start(id: string, services: readonly string[], result: (value: T) => void, failed: (error: Error) => void): Promise<void>;
  stop(id: string): Promise<void>;
}

interface Observer<T> {
  deadline: number;
  result(value: T): void;
  finish(error?: Error): void;
}
interface Scan<T> {
  id: string;
  key: string;
  deadline: number;
  observers: Set<Observer<T>>;
  starting: Promise<void>;
  closing?: Promise<void>;
}

export class ScanCoordinator<T> {
  private scan?: Scan<T>;
  private externalOwner?: symbol;
  private sequence = 0;
  private readonly prefix = crypto.randomUUID();

  constructor(private readonly port: ScanPort<T>, private readonly now = () => performance.now()) {}

  run(services: readonly string[], timeoutMs: number, signal: AbortSignal | undefined,
    result: (value: T, finish: () => void) => void): Promise<void> {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) return Promise.reject(Error('BLE_SCAN_BUDGET_INVALID'));
    if (signal?.aborted) return Promise.reject(Error('BLE_SCAN_CANCELLED'));
    if (this.externalOwner) return Promise.reject(Error('BLE_SCAN_BUSY'));
    const filters = [...new Set(services.map(value => value.toLowerCase()))].sort();
    const key = filters.join(','), deadline = this.now() + timeoutMs;
    let scan = this.scan;
    if (scan && (scan.closing || scan.key !== key || scan.observers.size >= 8 || deadline > scan.deadline)) {
      return Promise.reject(Error('BLE_SCAN_BUSY'));
    }
    if (!scan) {
      scan = { id: `${this.prefix}:${++this.sequence}`, key, deadline: this.now() + 30_000,
        observers: new Set(), starting: Promise.resolve() };
      this.scan = scan;
      const current = scan;
      current.starting = Promise.resolve().then(async () => {
        // Cancellation before async start must not spend a native scan attempt.
        if (current.closing) return;
        await this.port.start(current.id, filters, value => {
          if (current.closing) return;
          for (const observer of [...current.observers]) {
            if (this.now() >= observer.deadline) observer.finish();
            else observer.result(value);
          }
        }, error => this.fail(current, error));
      });
      void current.starting.catch(error => this.fail(current, error instanceof Error ? error : Error('BLE_SCAN_FAILED')));
    }
    const current = scan;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
        current.observers.delete(observer);
        const closing = current.observers.size ? current.closing : this.close(current);
        void Promise.resolve(closing).then(() => error ? reject(error) : resolve(), () => reject(Error('BLE_SCAN_CLOSE_FAILED')));
      };
      const abort = () => finish(Error('BLE_SCAN_CANCELLED'));
      const observer: Observer<T> = { deadline, finish, result: value => {
        if (settled) return;
        try { result(value, () => finish()); } catch { finish(Error('BLE_SCAN_CALLBACK_FAILED')); }
      } };
      const timer = setTimeout(() => finish(), Math.max(0, deadline - this.now()));
      current.observers.add(observer);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }

  cancel(): void { if (this.scan) this.fail(this.scan, Error('BLE_SCAN_CANCELLED')); }

  // An external SDK owns its own observations. Drain our physical scan before
  // handing over, and reject new observations until that SDK confirms release.
  async acquireExclusive(): Promise<() => void> {
    if (this.externalOwner) throw Error('BLE_SCAN_BUSY');
    const owner = Symbol();
    this.externalOwner = owner;
    try {
      const scan = this.scan;
      if (scan) {
        this.fail(scan, Error('BLE_SCAN_CANCELLED'));
        await this.close(scan);
      }
      return () => { if (this.externalOwner === owner) this.externalOwner = undefined; };
    } catch {
      if (this.externalOwner === owner) this.externalOwner = undefined;
      throw Error('BLE_SCAN_CLOSE_FAILED');
    }
  }

  private fail(scan: Scan<T>, error: Error): void {
    this.close(scan);
    for (const observer of [...scan.observers]) observer.finish(error);
  }

  private close(scan: Scan<T>): Promise<void> {
    if (!scan.closing) {
      scan.closing = scan.starting.catch(() => undefined).then(() => this.port.stop(scan.id));
      // A failed physical close keeps the slot fenced. Never overlap an unknown scanner.
      void scan.closing.then(() => { if (this.scan === scan) this.scan = undefined; }, () => undefined);
    }
    return scan.closing;
  }
}
