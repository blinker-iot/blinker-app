import type { LocalLanCandidate, LocalLanUpdate } from './discovery';

type Browser = (signal: AbortSignal, changed: (update: LocalLanUpdate) => void) => Promise<void>;
interface Round {
  controller: AbortController;
  readers: Set<(candidate: LocalLanCandidate) => void>;
  work: Promise<void>;
}

// One account/network/foreground lifetime. Only public hints live here; no
// identity mapping, authorization, socket, Angular dependency or polling loop.
export class LocalLanDirectory {
  private readonly entries = new Map<string, { observedAt: number; candidates: readonly LocalLanCandidate[] }>();
  private round?: Round;
  private closed = false;
  private cleanupFailure?: unknown;

  constructor(private readonly browse: Browser, private readonly now = () => performance.now()) {}

  async scan(signal: AbortSignal, found: (candidate: LocalLanCandidate) => void): Promise<void> {
    this.assertOpen(); signal.throwIfAborted();
    // A departing last reader owns retirement. New readers must not replace a
    // native watch while its unwatch/listener removal is still pending.
    while (this.round?.controller.signal.aborted) {
      await this.round.work;
      this.assertOpen(); signal.throwIfAborted();
    }
    const round = this.round ?? this.start();
    if (round.readers.size >= 16) throw new Error('LOCAL_DISCOVERY_BUSY');
    const seen = new Set<string>();
    let active = true, failure: Error | undefined, finish!: () => void;
    const done = new Promise<void>(resolve => { finish = () => { active = false; resolve(); }; });
    const deliver = (candidate: LocalLanCandidate) => {
      const key = `${candidate.host}:${candidate.port}/${candidate.locator}`;
      if (!active || this.closed || round.controller.signal.aborted || signal.aborted || seen.has(key) || seen.size >= 16) return;
      seen.add(key);
      try { found(candidate); }
      catch { failure = new Error('LOCAL_DISCOVERY_CONSUMER_FAILED'); finish(); }
    };
    round.readers.add(deliver);
    signal.addEventListener('abort', finish, { once: true });
    try {
      for (const candidate of this.snapshot()) deliver(candidate);
      await Promise.race([done, round.work]);
    } finally {
      active = false; signal.removeEventListener('abort', finish);
      round.readers.delete(deliver);
      if (!round.readers.size) {
        round.controller.abort();
        await round.work;
      }
    }
    if (failure) throw failure;
  }

  close(): Promise<void> {
    this.closed = true;
    this.entries.clear();
    this.round?.controller.abort();
    return (this.round?.work ?? Promise.resolve()).catch(() => undefined).then(() => {
      if (this.cleanupFailure) throw this.cleanupFailure;
    });
  }

  private assertOpen(): void {
    if (this.cleanupFailure) throw this.cleanupFailure;
    if (this.closed) throw new Error('LOCAL_DISCOVERY_SCOPE_CLOSED');
  }

  private snapshot(): LocalLanCandidate[] {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      // Native mDNS exposes no TTL. This is an App cache bound, not a DNS TTL.
      if (now < entry.observedAt || now - entry.observedAt >= 15000) this.entries.delete(key);
    }
    return [...this.entries.values()].flatMap(entry => [...entry.candidates]);
  }

  private start(): Round {
    const round: Round = { controller: new AbortController(), readers: new Set(), work: Promise.resolve() };
    this.round = round;
    const timer = setTimeout(() => round.controller.abort(), 10000);
    round.work = Promise.resolve().then(() => {
      if (round.controller.signal.aborted) return;
      return this.browse(round.controller.signal, update => {
        if (this.closed || round.controller.signal.aborted || this.round !== round) return;
        this.snapshot();
        this.entries.delete(update.service); // Replacement/removal cannot retain an old IP or locator.
        const remaining = 16 - this.snapshot().length;
        const candidates = update.candidates.slice(0, remaining).map(value => Object.freeze({ ...value }));
        if (candidates.length) this.entries.set(update.service, { observedAt: this.now(), candidates });
        for (const candidate of candidates) for (const reader of round.readers) reader(candidate);
      });
    }).catch(error => {
      this.entries.clear();
      if (error instanceof Error && error.message === 'LOCAL_DISCOVERY_CLEANUP_FAILED') this.cleanupFailure = error;
      throw error;
    }).finally(() => {
      clearTimeout(timer);
      if (this.round === round) this.round = undefined;
    });
    void round.work.catch(() => undefined);
    return round;
  }
}
