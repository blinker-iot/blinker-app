import { installAbortSignalCompatibility } from './abort-signal';

describe('AbortSignal compatibility', () => {
  const original = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'throwIfAborted');

  afterEach(() => {
    if (original) Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', original);
    else Reflect.deleteProperty(AbortSignal.prototype, 'throwIfAborted');
    vi.resetModules();
  });

  it('preserves native implementations', async () => {
    const native = vi.fn();
    Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', { configurable: true, value: native });
    installAbortSignalCompatibility();
    expect(AbortSignal.prototype.throwIfAborted).toBe(native);
  });

  it('does not throw before abort and preserves the abort reason', async () => {
    Reflect.deleteProperty(AbortSignal.prototype, 'throwIfAborted');
    installAbortSignalCompatibility();
    const controller = new AbortController();
    expect(() => controller.signal.throwIfAborted()).not.toThrow();
    const reason = new Error('cancelled');
    controller.abort(reason);
    expect(() => controller.signal.throwIfAborted()).toThrow(reason);
  });
});
