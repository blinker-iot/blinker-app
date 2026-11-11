import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API } from '../../configs/api.config';
import type { DataService } from '../../core/services/data.service';
import { RoomReadRecovery } from './room-read-recovery';

interface RecoveryDataDouble {
  auth: { uuid?: string; accessToken?: string } | null;
  user: { id?: string };
  sessionEpoch: number;
  authDataChanged: Subject<void>;
  authDataLoader: BehaviorSubject<boolean>;
  userDataLoader: BehaviorSubject<boolean>;
}

const api = API as { BASE_URL: string };
const originalAuthority = API.BASE_URL;
const scopeFailure = () => new Error('DEVICE_V2_ACCOUNT_SCOPE_INVALID');

// Exercise only the page-local state machine. No DataService construction,
// native storage, account requests, TestBed, timers or device access are needed.
describe('room cold-read recovery', () => {
  let data: RecoveryDataDouble;
  let recovery: RoomReadRecovery;
  let retry: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    api.BASE_URL = 'https://room-recovery.example';
    data = {
      auth: null, user: {}, sessionEpoch: 0,
      authDataChanged: new Subject<void>(),
      authDataLoader: new BehaviorSubject(false),
      userDataLoader: new BehaviorSubject(false),
    };
    recovery = new RoomReadRecovery(data as unknown as DataService);
    retry = vi.fn<() => void>();
  });

  afterEach(() => {
    recovery.leave();
    vi.restoreAllMocks();
    api.BASE_URL = originalAuthority;
  });

  function restoreIdentity(epoch = 1): void {
    data.auth = { uuid: 'room-account' };
    data.sessionEpoch = epoch;
    data.authDataChanged.next();
  }

  function expectNoObservers(): void {
    expect(data.authDataChanged.observers).toHaveLength(0);
    expect(data.authDataLoader.observers).toHaveLength(0);
    expect(data.userDataLoader.observers).toHaveLength(0);
  }

  it('captures the read context and supersedes earlier generations on begin', () => {
    const first = recovery.begin()!;
    expect(first).toEqual({ generation: 1, authority: API.BASE_URL,
      sessionEpoch: 0, hadAuth: false, missingIdentity: true });
    expect(recovery.current(first)).toBe(true);
    expect(recovery.accepts(first)).toBe(true);

    data.auth = { uuid: 'room-account' };
    data.sessionEpoch = 1;
    const next = recovery.begin()!;
    expect(next).toEqual({ generation: 2, authority: API.BASE_URL,
      sessionEpoch: 1, hadAuth: true, missingIdentity: false });
    expect(recovery.current(first)).toBe(false);
    expect(recovery.accepts(first)).toBe(false);
    expect(recovery.accepts(next)).toBe(true);
    expectNoObservers();
  });

  it('distinguishes a current read from a result that belongs to an earlier session', () => {
    const attempt = recovery.begin()!;
    data.sessionEpoch++;
    expect(recovery.current(attempt)).toBe(true);
    expect(recovery.accepts(attempt)).toBe(false);
  });

  it('blocks reads after leave and does not revive old attempts on re-entry', () => {
    const attempt = recovery.begin()!;
    recovery.leave();
    expect(recovery.begin()).toBeUndefined();
    expect(recovery.current(attempt)).toBe(false);
    expect(recovery.accepts(attempt)).toBe(false);

    recovery.enter();
    const next = recovery.begin()!;
    expect(next.generation).toBeGreaterThan(attempt.generation);
    expect(recovery.accepts(next)).toBe(true);
    expect(recovery.current(attempt)).toBe(false);
  });

  it.each([
    { auth: null, user: {}, hadAuth: false, missingIdentity: true },
    { auth: { accessToken: 'fixture-only' }, user: {}, hadAuth: true, missingIdentity: true },
    { auth: { uuid: 'room-account' }, user: {}, hadAuth: true, missingIdentity: false },
    { auth: null, user: { id: 'room-account' }, hadAuth: false, missingIdentity: false },
  ])('records identity availability independently of token availability: $hadAuth / $missingIdentity',
    ({ auth, user, hadAuth, missingIdentity }) => {
      data.auth = auth;
      data.user = user;
      expect(recovery.begin()).toMatchObject({ hadAuth, missingIdentity });
    });

  it('recovers an initially empty native session from epoch zero to one exactly once', async () => {
    const attempt = recovery.begin()!;
    recovery.afterFailure(scopeFailure(), attempt, retry);
    expect(data.authDataChanged.observers).toHaveLength(1);
    expect(data.authDataLoader.observers).toHaveLength(0);
    expect(data.userDataLoader.observers).toHaveLength(0);

    restoreIdentity();
    data.authDataChanged.next();
    data.authDataChanged.next();
    expect(retry).not.toHaveBeenCalled();
    expectNoObservers();
    await Promise.resolve();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(recovery.accepts(attempt)).toBe(false);

    data.authDataChanged.next();
    await Promise.resolve();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it.each(['auth UUID', 'user ID'])('recovers an existing token when its %s appears within the same session', async identity => {
    data.auth = { accessToken: 'fixture-only' };
    data.sessionEpoch = 7;
    const attempt = recovery.begin()!;
    recovery.afterFailure(scopeFailure(), attempt, retry);
    data.authDataChanged.next();
    data.userDataLoader.next(true);
    expect(retry).not.toHaveBeenCalled();
    expect(data.authDataChanged.observers).toHaveLength(1);

    if (identity === 'auth UUID') data.auth.uuid = 'room-account';
    else data.user.id = 'room-account';
    data.authDataChanged.next();
    expectNoObservers();
    await Promise.resolve();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(data.sessionEpoch).toBe(7);
  });

  it.each(['native restore', 'existing token'])('checks a completed %s even if its event preceded the failure handler', async kind => {
    if (kind === 'existing token') {
      data.auth = { accessToken: 'fixture-only' };
      data.sessionEpoch = 7;
    }
    const attempt = recovery.begin()!;
    restoreIdentity(kind === 'existing token' ? 7 : 1);
    expectNoObservers();

    recovery.afterFailure(scopeFailure(), attempt, retry);
    expect(retry).not.toHaveBeenCalled();
    expectNoObservers();
    await Promise.resolve();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('continues waiting through incomplete identity announcements without polling or timers', async () => {
    data.auth = { accessToken: 'fixture-only' };
    data.sessionEpoch = 4;
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const interval = vi.spyOn(globalThis, 'setInterval');
    recovery.afterFailure(scopeFailure(), recovery.begin()!, retry);
    for (let index = 0; index < 10; index++) {
      data.authDataChanged.next();
      data.authDataLoader.next(true);
      data.userDataLoader.next(true);
    }
    expect(data.authDataChanged.observers).toHaveLength(1);
    expect(retry).not.toHaveBeenCalled();

    restoreIdentity(4);
    expect(timeout).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expectNoObservers();
    timeout.mockRestore();
    interval.mockRestore();
    await Promise.resolve();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('waits for a valid scoped identity rather than retrying an invalid identity announcement', async () => {
    recovery.afterFailure(scopeFailure(), recovery.begin()!, retry);
    data.auth = { uuid: 'invalid\0identity' };
    data.sessionEpoch = 1;
    data.authDataChanged.next();
    expect(data.authDataChanged.observers).toHaveLength(1);
    await Promise.resolve();
    expect(retry).not.toHaveBeenCalled();

    restoreIdentity();
    await Promise.resolve();
    expect(retry).toHaveBeenCalledTimes(1);
    expectNoObservers();
  });

  it.each([
    new Error('offline'), new Error('HTTP 503'), new Error('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED'),
    { status: 401, message: 'DEVICE_V2_ACCOUNT_SCOPE_INVALID' },
    'DEVICE_V2_ACCOUNT_SCOPE_INVALID', null,
  ])('does not turn unrelated or HTTP failures into an auth-triggered retry: %j', async error => {
    recovery.afterFailure(error, recovery.begin()!, retry);
    expectNoObservers();
    restoreIdentity();
    await Promise.resolve();
    expect(retry).not.toHaveBeenCalled();
  });

  it.each(['auth UUID', 'user ID'])('does not recover a scope error if the read already had an %s', async identity => {
    data.auth = { accessToken: 'fixture-only' };
    if (identity === 'auth UUID') data.auth.uuid = 'room-account';
    else data.user.id = 'room-account';
    recovery.afterFailure(scopeFailure(), recovery.begin()!, retry);
    expectNoObservers();
    restoreIdentity();
    await Promise.resolve();
    expect(retry).not.toHaveBeenCalled();
  });

  it.each(['leave', 'manual begin'])('ignores a late failure from a read superseded by %s', async reason => {
    const attempt = recovery.begin()!;
    if (reason === 'leave') recovery.leave();
    else recovery.begin();
    recovery.afterFailure(scopeFailure(), attempt, retry);
    expectNoObservers();
    restoreIdentity();
    await Promise.resolve();
    expect(retry).not.toHaveBeenCalled();
  });

  it('unsubscribes a waiting recovery on leave and does not restore it on re-entry', async () => {
    recovery.afterFailure(scopeFailure(), recovery.begin()!, retry);
    expect(data.authDataChanged.observers).toHaveLength(1);
    recovery.leave();
    expectNoObservers();
    recovery.enter();
    restoreIdentity();
    await Promise.resolve();
    expect(retry).not.toHaveBeenCalled();
  });

  it('lets a manual begin replace the waiting recovery without retaining its subscription', async () => {
    recovery.afterFailure(scopeFailure(), recovery.begin()!, retry);
    const manualRetry = vi.fn();
    const manualAttempt = recovery.begin()!;
    expectNoObservers();
    recovery.afterFailure(scopeFailure(), manualAttempt, manualRetry);
    expect(data.authDataChanged.observers).toHaveLength(1);
    restoreIdentity();
    await Promise.resolve();
    expect(retry).not.toHaveBeenCalled();
    expect(manualRetry).toHaveBeenCalledTimes(1);
    expectNoObservers();
  });

  it('rejects results and releases waiting recovery when the authority changes', async () => {
    const attempt = recovery.begin()!;
    recovery.afterFailure(scopeFailure(), attempt, retry);
    api.BASE_URL = 'https://different-room-authority.example';
    expect(recovery.current(attempt)).toBe(false);
    expect(recovery.accepts(attempt)).toBe(false);
    restoreIdentity();
    expectNoObservers();
    await Promise.resolve();
    expect(retry).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'native logout', hadAuth: false, startEpoch: 0, endEpoch: 1 },
    { label: 'existing session logout', hadAuth: true, startEpoch: 7, endEpoch: 8 },
    { label: 'same-session auth rollback', hadAuth: true, startEpoch: 7, endEpoch: 7 },
  ])('cancels waiting recovery after $label instead of listening for a future login', async ({ hadAuth, startEpoch, endEpoch }) => {
    data.auth = hadAuth ? { accessToken: 'fixture-only' } : null;
    data.sessionEpoch = startEpoch;
    recovery.afterFailure(scopeFailure(), recovery.begin()!, retry);
    data.auth = null;
    data.sessionEpoch = endEpoch;
    data.authDataChanged.next();
    expectNoObservers();

    restoreIdentity(endEpoch + 1);
    await Promise.resolve();
    expect(retry).not.toHaveBeenCalled();
  });

  it('releases recovery when a failed native restore or logout event preceded the failure handler', async () => {
    const attempt = recovery.begin()!;
    data.sessionEpoch = 1;
    data.authDataChanged.next();
    recovery.afterFailure(scopeFailure(), attempt, retry);
    expectNoObservers();

    restoreIdentity(2);
    await Promise.resolve();
    expect(retry).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'a second native session', hadAuth: false, startEpoch: 0, endEpoch: 2 },
    { label: 'a replacement authenticated session', hadAuth: true, startEpoch: 7, endEpoch: 8 },
    { label: 'an earlier session epoch', hadAuth: true, startEpoch: 7, endEpoch: 6 },
  ])('cancels when identity arrives from $label', async ({ hadAuth, startEpoch, endEpoch }) => {
    data.auth = hadAuth ? { accessToken: 'fixture-only' } : null;
    data.sessionEpoch = startEpoch;
    recovery.afterFailure(scopeFailure(), recovery.begin()!, retry);
    restoreIdentity(endEpoch);
    expectNoObservers();
    await Promise.resolve();
    expect(retry).not.toHaveBeenCalled();
  });

  it.each(['leave', 'manual begin', 'authority', 'session', 'same-session auth rollback'])(
    'cancels an already queued retry after %s', async reason => {
      const attempt = recovery.begin()!;
      recovery.afterFailure(scopeFailure(), attempt, retry);
      restoreIdentity();
      expectNoObservers();
      expect(retry).not.toHaveBeenCalled();

      if (reason === 'leave') recovery.leave();
      if (reason === 'manual begin') recovery.begin();
      if (reason === 'authority') api.BASE_URL = 'https://different-room-authority.example';
      if (reason === 'session') {
        data.auth = null;
        data.sessionEpoch++;
      }
      if (reason === 'same-session auth rollback') data.auth = null;
      data.authDataChanged.next();
      await Promise.resolve();
      expect(retry).not.toHaveBeenCalled();
    });

  it('does not subscribe or reload an initially accepted draft on later auth or user-loader events', async () => {
    restoreIdentity();
    const accepted = recovery.begin()!;
    expect(recovery.accepts(accepted)).toBe(true);
    expectNoObservers();

    data.authDataLoader.next(true);
    data.userDataLoader.next(true);
    data.authDataChanged.next();
    data.auth = null;
    data.sessionEpoch++;
    data.authDataLoader.next(false);
    data.authDataChanged.next();
    restoreIdentity(3);
    data.userDataLoader.next(true);
    await Promise.resolve();
    expect(retry).not.toHaveBeenCalled();
    expectNoObservers();
  });

  it('does not reload again after its one recovery read has accepted an editing draft', async () => {
    let accepted: NonNullable<ReturnType<RoomReadRecovery['begin']>> | undefined;
    retry.mockImplementation(() => { accepted = recovery.begin()!; });
    recovery.afterFailure(scopeFailure(), recovery.begin()!, retry);
    restoreIdentity();
    await Promise.resolve();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(recovery.accepts(accepted!)).toBe(true);
    expectNoObservers();

    data.authDataChanged.next();
    data.authDataLoader.next(true);
    data.userDataLoader.next(true);
    data.auth = null;
    data.sessionEpoch++;
    data.authDataLoader.next(false);
    data.authDataChanged.next();
    restoreIdentity(3);
    data.userDataLoader.next(true);
    await Promise.resolve();
    expect(retry).toHaveBeenCalledTimes(1);
    expectNoObservers();
  });
});
