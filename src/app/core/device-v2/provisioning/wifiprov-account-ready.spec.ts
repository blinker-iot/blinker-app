import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { waitForWiFiProvAccount } from './wifiprov-account-ready';

const authority = 'https://wifiprov-account.example';
function fixture(auth: { uuid?: string; accessToken?: string } | null = null, epoch = 0) {
  const data = { auth, user: {} as { id?: string }, sessionEpoch: epoch, authDataChanged: new Subject<void>() };
  const controller = new AbortController();
  const restore = (uuid = 'owner-a', sessionEpoch = epoch + 1) => {
    data.auth = { uuid }; data.sessionEpoch = sessionEpoch; data.authDataChanged.next();
  };
  return { data, controller, restore, wait: () => waitForWiFiProvAccount(data, authority, controller.signal) };
}

describe('WiFiProv initial account readiness', () => {
  it('captures an existing authenticated identity without subscribing or starting other work', async () => {
    const f = fixture({ uuid: 'owner-a' }, 4);
    expect(await f.wait()).toEqual({ authority, accountId: 'owner-a', sessionEpoch: 4 });
    expect(f.data.authDataChanged.observers).toHaveLength(0);
  });

  it('accepts a resolved user identity only when an authenticated session still exists', async () => {
    const f = fixture({ accessToken: 'fixture-only' }, 4); f.data.user.id = 'owner-a';
    expect(await f.wait()).toEqual({ authority, accountId: 'owner-a', sessionEpoch: 4 });
    expect(f.data.authDataChanged.observers).toHaveLength(0);
  });

  it('rejects a stale profile without auth instead of treating it as a restored login', async () => {
    const f = fixture(); f.data.user.id = 'stale-owner';
    await expect(f.wait()).rejects.toThrow('DEVICE_V2_ACCOUNT_SCOPE_INVALID');
    expect(f.data.authDataChanged.observers).toHaveLength(0);
  });

  it('waits for one native restore and cleans the only subscription before repeated announcements', async () => {
    const f = fixture(), pending = f.wait();
    expect(f.data.authDataChanged.observers).toHaveLength(1);
    f.restore();
    expect(f.data.authDataChanged.observers).toHaveLength(0);
    f.data.authDataChanged.next(); f.data.authDataChanged.next();
    expect(await pending).toEqual({ authority, accountId: 'owner-a', sessionEpoch: 1 });
  });

  it('waits through incomplete token announcements for a UUID within the same session', async () => {
    const f = fixture({ accessToken: 'fixture-only' }, 7), pending = f.wait();
    f.data.authDataChanged.next(); f.data.authDataChanged.next();
    expect(f.data.authDataChanged.observers).toHaveLength(1);
    f.restore('owner-a', 7);
    expect(await pending).toEqual({ authority, accountId: 'owner-a', sessionEpoch: 7 });
    expect(f.data.authDataChanged.observers).toHaveLength(0);
  });

  it.each(['logout', 'new-login', 'too-many-restores', 'epoch-rollback'] as const)(
    'rejects %s while waiting instead of following another session', async reason => {
      const f = reason === 'new-login' ? fixture({ accessToken: 'fixture-only' }, 7) : fixture(null, 4);
      const pending = f.wait(), rejected = expect(pending).rejects.toThrow('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
      if (reason === 'logout') { f.data.sessionEpoch = 5; f.data.auth = null; f.data.authDataChanged.next(); }
      else if (reason === 'new-login') f.restore('owner-b', 8);
      else f.restore('owner-b', reason === 'too-many-restores' ? 6 : 3);
      await rejected;
      expect(f.data.authDataChanged.observers).toHaveLength(0);
    });

  it('rejects an explicit empty-auth announcement even before the epoch advances', async () => {
    const f = fixture(), pending = f.wait();
    const rejected = expect(pending).rejects.toThrow('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
    f.data.authDataChanged.next(); await rejected;
    expect(f.data.authDataChanged.observers).toHaveLength(0);
  });

  it('propagates an already aborted reason without installing any listeners', async () => {
    const f = fixture(), reason = Error('fixture-abort'); f.controller.abort(reason);
    await expect(f.wait()).rejects.toBe(reason);
    expect(f.data.authDataChanged.observers).toHaveLength(0);
  });

  it('aborts a pending restore and removes both account and abort listeners', async () => {
    const f = fixture(), remove = vi.spyOn(f.controller.signal, 'removeEventListener');
    const pending = f.wait(), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    f.controller.abort(); await rejected;
    expect(f.data.authDataChanged.observers).toHaveLength(0);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    remove.mockRestore();
  });

  it('does not return a ready context if logout wins the completion microtask', async () => {
    const f = fixture(), pending = f.wait();
    const rejected = expect(pending).rejects.toThrow('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
    f.restore(); f.data.auth = null; f.data.sessionEpoch = 2; f.data.authDataChanged.next();
    await rejected;
    expect(f.data.authDataChanged.observers).toHaveLength(0);
  });

  it('lets cancellation win a queued readiness completion', async () => {
    const f = fixture(), pending = f.wait(), reason = Error('fixture-page-left');
    const rejected = expect(pending).rejects.toBe(reason);
    f.restore(); f.controller.abort(reason); await rejected;
    expect(f.data.authDataChanged.observers).toHaveLength(0);
  });

  it('does not silently switch an already captured account before returning it', async () => {
    const f = fixture({ uuid: 'owner-a' }, 4), pending = f.wait();
    const rejected = expect(pending).rejects.toThrow('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
    f.restore('owner-b', 5); await rejected;
    expect(f.data.authDataChanged.observers).toHaveLength(0);
  });

  it('rejects an invalid restored identity and releases the waiting subscription', async () => {
    const f = fixture(), pending = f.wait();
    const rejected = expect(pending).rejects.toThrow('DEVICE_V2_ACCOUNT_SCOPE_INVALID');
    f.restore('invalid\0owner'); await rejected;
    expect(f.data.authDataChanged.observers).toHaveLength(0);
  });

  it('uses no timers, storage writes or polling while awaiting one readiness event', async () => {
    const f = fixture(), timeout = vi.spyOn(globalThis, 'setTimeout'), interval = vi.spyOn(globalThis, 'setInterval');
    try {
      const pending = f.wait(); f.restore(); await pending;
      expect(timeout).not.toHaveBeenCalled(); expect(interval).not.toHaveBeenCalled();
      expect(f.data.auth).toEqual({ uuid: 'owner-a' }); expect(f.data.sessionEpoch).toBe(1);
      expect(f.data.authDataChanged.observers).toHaveLength(0);
    } finally { timeout.mockRestore(); interval.mockRestore(); }
  });
});
