import { DirectDeviceSession } from '../../protocol/device-v2/direct-session';
import type { LocalAccessContext } from './api';
import { LocalAccessPreparationError } from './preparation-error';
import { sameLocalAccessBytes } from '../../protocol/device-v2/local-access';
import { LocalAccessMessageLink, SelfLocalAccessRequest } from './client';
import { LocalLanCandidate } from './discovery';

export interface LocalAccessConnectorPorts {
  context(id: string, signal: AbortSignal): Promise<LocalAccessContext>;
  scan(signal: AbortSignal, found: (candidate: LocalLanCandidate) => void): Promise<void>;
  // CANDIDATE_UNAVAILABLE is allowed only before a link was handed out, with
  // no access/business send and confirmed native cleanup. Other errors are final.
  link(candidate: LocalLanCandidate, signal: AbortSignal): Promise<LocalAccessMessageLink>;
  session(link: LocalAccessMessageLink, request: SelfLocalAccessRequest, signal: AbortSignal): Promise<DirectDeviceSession>;
  randomId(): Uint8Array;
}
export interface LocalAccessConnection { session: DirectDeviceSession; permissions: 1 | 3; }

// One physical native slot, no socket pool or background retry scheduler.
// The existing page group owns the lifetime. A failed native release keeps
// this slot occupied until process restart; it never authorizes a second open.
export class LocalAccessConnector {
  private occupied = false;
  constructor(private readonly ports: LocalAccessConnectorPorts) {}

  async open(id: string, owner: AbortSignal, assertCurrent: () => void, callerSessionId: Uint8Array): Promise<LocalAccessConnection> {
    owner.throwIfAborted(); assertCurrent();
    if (!(callerSessionId instanceof Uint8Array) || callerSessionId.length !== 16 || !callerSessionId.some(byte => byte !== 0))
      throw new Error('LOCAL_ACCESS_CALLER_INVALID');
    const caller = callerSessionId.slice();
    if (this.occupied) throw new Error('LOCAL_ACCESS_BUSY');
    this.occupied = true;
    const lifetime = new AbortController(), scanning = new AbortController();
    let wake = () => undefined;
    const abort = () => { lifetime.abort(); scanning.abort(); wake(); };
    owner.addEventListener('abort', abort, { once: true });
    const deadline = performance.now() + 30000;
    const timer = setTimeout(abort, 30000);
    let link: LocalAccessMessageLink | undefined, session: DirectDeviceSession | undefined;
    let scan: Promise<void> | undefined, scanError: unknown, scanDone = false;
    const assert = () => {
      if (performance.now() >= deadline) abort();
      owner.throwIfAborted(); lifetime.signal.throwIfAborted(); assertCurrent();
    };
    const detach = () => owner.removeEventListener('abort', abort);
    const scanCleanupFailed = () => scanError instanceof Error && scanError.message === 'LOCAL_DISCOVERY_CLEANUP_FAILED';
    const retireScan = async () => {
      scanning.abort(); await scan;
      if (scanCleanupFailed()) throw scanError;
    };
    try {
      let context = await this.waitForContext(id, lifetime.signal, assert);
      let handoverUsed = false;
      const candidates: LocalLanCandidate[] = [];
      scan = this.ports.scan(scanning.signal, candidate => {
        if (!scanning.signal.aborted && candidates.length < 16) { candidates.push(candidate); wake(); }
      }).catch(error => { scanError = error; }).finally(() => { scanDone = true; wake(); });
      // Resolve candidates as they arrive, not after the entire 10s scan.
      for (let attempt = 0; attempt < 4; attempt++) {
        while (!candidates.length && !scanDone) { assert(); await new Promise<void>(resolve => { wake = resolve; }); }
        assert();
        if (scanError) throw scanError;
        const candidate = candidates.shift();
        if (!candidate) break;
        try { link = await this.ports.link(candidate, lifetime.signal); }
        catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'LOCAL_ACCESS_CANDIDATE_UNAVAILABLE') {
            assert(); continue;
          }
          throw error;
        }
        assert();
        const native = link;
        let accepted = false, closing: Promise<void> | undefined;
        // Composition-only lifetime barrier. Byte/security/BBP implementations
        // remain unaware of discovery; close starts native shutdown immediately.
        link = {
          send: (message, signal) => native.send(message, signal),
          receive: signal => native.receive(signal),
          close: () => {
            if (!closing) {
              closing = Promise.allSettled([
                (async () => { await native.close(); })(),
                accepted ? retireScan() : Promise.resolve(),
              ]).then(results => {
                if (accepted) detach();
                for (const result of results) if (result.status === 'rejected') throw result.reason;
              });
              void closing.catch(() => undefined);
            }
            return closing;
          },
        };
        try {
          session = await this.ports.session(link, { recipientLogicalDeviceId: id, targetLogicalDeviceId: '',
            securityProfile: context.securityProfile,
            targetDeviceInstanceId: context.deviceInstanceId.slice(), permissions: context.permissions,
            lifetimeMillis: Math.min(300000, context.maximumLifetimeMillis), accessEpoch: 0, topologyVersion: 0,
            callerSessionId: caller, requestId: this.ports.randomId() }, lifetime.signal);
          assert();
          if (closing || session.state !== 'ready') throw new Error('LOCAL_ACCESS_SESSION_CLOSED');
          if (scanError) throw scanError;
          accepted = true;
          scanning.abort();
          // Authenticated readiness does not depend on discovery hints anymore.
          // Retire in the background, but a failed scan still closes this lane.
          void scan.then(() => { if (scanError) abort(); });
          clearTimeout(timer);
          session.subscribeClosed(() => { this.occupied = false; detach(); });
          return { session, permissions: context.permissions };
        } catch (error) {
          // The issuer committed exact retirement without returning a Grant.
          // Its ACK invalidates this challenge: close first, then obtain fresh
          // context/challenge/request once. Never retry crypto/BBP/business.
          if (error instanceof LocalAccessPreparationError && error.phase === 'handover' && !handoverUsed) {
            handoverUsed = true;
            await link.close(); link = undefined; assert();
            const next = await this.waitForContext(id, lifetime.signal, assert);
            if (context.securityProfile !== next.securityProfile
              || !sameLocalAccessBytes(context.deviceInstanceId, next.deviceInstanceId))
              throw new Error('LOCAL_ACCESS_AUTHORITY_CHANGED');
            context = next; candidates.unshift(candidate); continue;
          }
          // Only a proven different instance, before issuance, may advance to
          // another candidate. Never retry grant/crypto/BBP/business failures.
          if (!(error instanceof Error) || error.message !== 'LOCAL_ACCESS_DEVICE_MISMATCH') throw error;
          await link.close(); link = undefined; assert();
        }
      }
      throw new Error('LOCAL_ACCESS_NOT_FOUND');
    } catch (error) {
      abort();
      // Do not release the slot until ALL native work has actually retired.
      try {
        const [nativeCleanup] = await Promise.allSettled([
          (async () => { if (session) await session.close(); else if (link) await link.close(); })(), scan,
        ]);
        const cleanupFailed = (error instanceof Error && 'code' in error && error.code === 'LOCAL_WS_CLEANUP_FAILED')
          || scanCleanupFailed() || nativeCleanup.status === 'rejected';
        if (!cleanupFailed) this.occupied = false;
        if (scanError) throw scanError;
        if (nativeCleanup.status === 'rejected') throw nativeCleanup.reason;
      } finally { detach(); }
      throw error;
    } finally { clearTimeout(timer); }
  }

  private async waitForContext(id: string, signal: AbortSignal, assert: () => void): Promise<LocalAccessContext> {
    for (let attempt = 0; attempt < 8; attempt++) {
      assert();
      try { const context = await this.ports.context(id, signal); assert(); return context; }
      catch (error) {
        assert();
        if (!(error instanceof LocalAccessPreparationError) || error.phase !== 'pending' || attempt === 7) throw error;
      }
      await new Promise<void>((resolve, reject) => {
        const stop = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, 1000);
        signal.addEventListener('abort', stop, { once: true });
        if (signal.aborted) stop();
      });
    }
    throw new Error('LOCAL_ACCESS_SYNC_REQUIRED');
  }
}
