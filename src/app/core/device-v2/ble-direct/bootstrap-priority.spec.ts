import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BLE_BOOTSTRAP_PRIORITY_WINDOW_MS,
  BLE_PRIORITY_RESPONSE_BUDGET_MS,
  startBleBootstrapPriority,
} from './bootstrap-priority';

describe('optional BLE bootstrap priority window', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('requests HIGH once, then BALANCED on fresh readiness without awaiting either response', () => {
    const request = vi.fn((_priority: 0 | 1) => new Promise<void>(() => undefined));
    const window = startBleBootstrapPriority(request, () => true);
    expect(request.mock.calls).toEqual([[1]]);
    expect(window.finish()).toBeUndefined();
    window.finish();
    expect(request.mock.calls).toEqual([[1], [0]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a successful request bounded by the full bootstrap deadline', async () => {
    const request = vi.fn(async (_priority: 0 | 1) => undefined);
    startBleBootstrapPriority(request, () => true);
    await vi.advanceTimersByTimeAsync(BLE_BOOTSTRAP_PRIORITY_WINDOW_MS - 1);
    expect(request.mock.calls).toEqual([[1]]);
    await vi.advanceTimersByTimeAsync(1);
    expect(request.mock.calls).toEqual([[1], [0]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ends an unresponsive request at the short budget, with no HIGH retry or late follow-up', async () => {
    let resolve!: () => void;
    const request = vi.fn((_priority: 0 | 1) => new Promise<void>(done => { resolve = done; }));
    startBleBootstrapPriority(request, () => true);
    const resolveHigh = resolve;
    await vi.advanceTimersByTimeAsync(BLE_PRIORITY_RESPONSE_BUDGET_MS - 1);
    expect(request.mock.calls).toEqual([[1]]);
    await vi.advanceTimersByTimeAsync(1);
    expect(request.mock.calls).toEqual([[1], [0]]);
    resolveHigh();
    await vi.runAllTimersAsync();
    expect(request.mock.calls).toEqual([[1], [0]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  for (const fault of ['reject', 'throw'] as const) {
    it(`treats HIGH ${fault} and a BALANCED rejection as nonfatal, without retry`, async () => {
      const request = vi.fn((priority: 0 | 1) => {
        if (priority === 1 && fault === 'throw') throw Error('unsupported');
        return Promise.reject(Error('unsupported'));
      });
      expect(() => startBleBootstrapPriority(request, () => true)).not.toThrow();
      await vi.runAllTimersAsync();
      expect(request.mock.calls).toEqual([[1], [0]]);
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it('also tolerates a synchronous BALANCED failure', () => {
    const request = vi.fn((priority: 0 | 1) => {
      if (priority === 0) throw Error('unsupported');
      return new Promise<void>(() => undefined);
    });
    const window = startBleBootstrapPriority(request, () => true);
    expect(() => window.finish()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  for (const settlement of ['resolve', 'reject'] as const) {
    it(`does not act on a successor after cancellation and late HIGH ${settlement}`, async () => {
      let settle!: () => void;
      const request = vi.fn((_priority: 0 | 1) => new Promise<void>((resolve, reject) => {
        settle = () => settlement === 'resolve' ? resolve() : reject(Error('late'));
      }));
      const window = startBleBootstrapPriority(request, () => true);
      window.cancel();
      settle();
      window.finish();
      await vi.runAllTimersAsync();
      expect(request.mock.calls).toEqual([[1]]);
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it('never starts a stale window', () => {
    const request = vi.fn(async (_priority: 0 | 1) => undefined);
    const window = startBleBootstrapPriority(request, () => false);
    window.finish();
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  for (const end of ['ready', 'deadline'] as const) {
    it(`suppresses BALANCED on generation change at ${end}`, async () => {
      let current = true;
      const request = vi.fn(async (_priority: 0 | 1) => undefined);
      const window = startBleBootstrapPriority(request, () => current);
      current = false;
      if (end === 'ready') window.finish();
      await vi.runAllTimersAsync();
      expect(request.mock.calls).toEqual([[1]]);
      expect(vi.getTimerCount()).toBe(0);
    });
  }
});
