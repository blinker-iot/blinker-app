import { describe, expect, it, vi } from 'vitest';
import { WiFiProvCloudBoundary } from './wifiprov-cloud-boundary';

describe('WiFiProvCloudBoundary', () => {
  it('blocks synchronously for exactly one owner and releases only after its close', async () => {
    const boundary = new WiFiProvCloudBoundary(), states: boolean[] = [];
    const unsubscribe = boundary.subscribe(value => states.push(value));
    const lease = boundary.enter();
    expect(boundary.blocked).toBe(true);
    expect(() => boundary.enter()).toThrow();
    let finish!: () => void;
    const close = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const retired = lease.retire(close);
    expect(lease.retire(close)).toBe(retired);
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce(); expect(boundary.blocked).toBe(true);
    finish(); await retired;
    expect(states).toEqual([false, true, false]);
    const next = boundary.enter();
    await lease.retire(close);
    expect(boundary.blocked).toBe(true); expect(close).toHaveBeenCalledOnce();
    await next.retire(async () => undefined); unsubscribe();
  });

  it('keeps a failed close blocked without retrying and allows only an explicit close retry', async () => {
    const boundary = new WiFiProvCloudBoundary(), lease = boundary.enter();
    const failure = Error('native death unconfirmed'), close = vi.fn(async () => { throw failure; });
    await expect(lease.retire(close)).rejects.toBe(failure);
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce(); expect(boundary.blocked).toBe(true);
    expect(() => boundary.enter()).toThrow();
    await lease.retire(async () => undefined);
    expect(boundary.blocked).toBe(false);
  });

  it('does not let a throwing consumer replace or release the Local owner', async () => {
    const boundary = new WiFiProvCloudBoundary();
    boundary.subscribe(() => { throw Error('consumer failed'); });
    const lease = boundary.enter(); expect(boundary.blocked).toBe(true);
    await lease.retire(async () => undefined); expect(boundary.blocked).toBe(false);
  });
});
