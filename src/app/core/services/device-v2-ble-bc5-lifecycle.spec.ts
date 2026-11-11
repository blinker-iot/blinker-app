import '@angular/compiler';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from 'src/environments/environment';
import { localCapabilities } from 'src/environments/deployment';
import type { AppVisibilityTransition } from './app-visibility.service';
import { DeviceV2BleService } from './device-v2-ble.service';

type RegistrationOperation = {
  registrationOperation<T>(signal: AbortSignal, radio: boolean,
    work: (context: unknown, foreground: () => void, signal: AbortSignal, contextCheck: () => void) => Promise<T>,
    continuation?: { pause(): boolean }): Promise<T>;
  accessRegistrationEpoch: number;
  clearNearby(): void;
  disconnectAll(): Promise<void>;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('DeviceV2BleService BC-5 lifecycle wiring', () => {
  const services: DeviceV2BleService[] = [];
  const deployment = environment.deployment;
  beforeEach(() => { environment.deployment = localCapabilities; });
  afterEach(() => {
    for (const service of services.splice(0)) service.ngOnDestroy();
    environment.deployment = deployment;
  });

  function fixture(continuation?: { pause(): boolean }, withTransitions = true) {
    const active = new BehaviorSubject(true);
    const transitions = new Subject<AppVisibilityTransition>();
    const data = { auth: { uuid: 'current-owner' }, user: { id: 'current-owner' }, sessionEpoch: 1,
      authDataChanged: new Subject<void>(), deviceDataLoader: new BehaviorSubject(false), getDevice: () => undefined };
    type Args = ConstructorParameters<typeof DeviceV2BleService>;
    const visibility = { active, ...(withTransitions ? { transitions } : {}) };
    const service = new DeviceV2BleService({} as Args[0], {} as Args[1], data as unknown as Args[2],
      visibility as unknown as Args[3]);
    services.push(service);
    const internal = service as unknown as RegistrationOperation;
    const clearNearby = vi.spyOn(internal, 'clearNearby');
    const disconnectAll = vi.spyOn(internal, 'disconnectAll');
    const external = new AbortController();
    const entered = deferred<{ foreground: () => void; signal: AbortSignal; contextCheck: () => void }>();
    const finish = deferred<string>();
    const work = internal.registrationOperation(external.signal, true, async (_context, foreground, signal, contextCheck) => {
      entered.resolve({ foreground, signal, contextCheck });
      return finish.promise;
    }, continuation);
    let sequence = 0;
    function event(reason: AppVisibilityTransition['reason']) {
      // Mirror AppVisibilityService: transition comes first; stop after pause
      // cannot rely on another false notification from the active stream.
      transitions.next({ reason, sequence: ++sequence });
      const next = reason === 'resume';
      if (active.value !== next) active.next(next);
    }
    const started = Promise.race([entered.promise, work.then(() => { throw Error('Operation did not enter its callback'); })]);
    return { internal, data, external, entered: started, work, finish: () => finish.resolve('done'),
      event, clearNearby, disconnectAll };
  }

  it.each(['ordinary', 'candidate before native connect', 'missing lifecycle reasons'] as const)(
    'aborts %s on the first foreground loss', async mode => {
      const continuation = mode === 'ordinary' ? undefined : { pause: vi.fn(() => mode !== 'candidate before native connect') };
      const f = fixture(continuation, mode !== 'missing lifecycle reasons');
      const current = await f.entered;
      f.event('pause');
      expect(current.signal.aborted).toBe(true);
      if (mode === 'candidate before native connect') expect(continuation?.pause).toHaveBeenCalledOnce();
      if (mode === 'missing lifecycle reasons') expect(continuation?.pause).not.toHaveBeenCalled();
      f.finish();
      await expect(f.work).rejects.toThrow();
    });

  it('retains only the permitted operation on pause and keeps ordinary foreground/resource fencing', async () => {
    const continuation = { pause: vi.fn(() => true) }, f = fixture(continuation);
    const current = await f.entered, epoch = f.internal.accessRegistrationEpoch;
    f.event('pause');
    expect(continuation.pause).toHaveBeenCalledOnce();
    expect(current.signal.aborted).toBe(false);
    expect(current.contextCheck).not.toThrow();
    expect(current.foreground).toThrow();
    expect(f.internal.accessRegistrationEpoch).toBe(epoch + 1);
    expect(f.clearNearby).toHaveBeenCalledOnce();
    expect(f.disconnectAll).toHaveBeenCalledOnce();
    f.event('resume');
    expect(current.foreground).not.toThrow();
    f.finish();
    await expect(f.work).resolves.toBe('done');
  });

  it.each(['stop', 'account switch', 'caller cancellation'] as const)('cancels a retained pause on %s without resurrecting on resume', async reason => {
    const f = fixture({ pause: vi.fn(() => true) });
    const current = await f.entered;
    f.event('pause');
    expect(current.signal.aborted).toBe(false);
    if (reason === 'stop') f.event('stop');
    if (reason === 'account switch') {
      f.data.auth.uuid = f.data.user.id = 'other-owner';
      f.data.sessionEpoch++;
      f.data.authDataChanged.next();
    }
    if (reason === 'caller cancellation') f.external.abort();
    expect(current.signal.aborted).toBe(true);
    f.event('resume');
    expect(current.contextCheck).toThrow();
    f.finish();
    await expect(f.work).rejects.toThrow();
  });
});
