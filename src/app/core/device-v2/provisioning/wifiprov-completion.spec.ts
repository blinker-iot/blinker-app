import { base64UrlEncode } from '../ble-direct/wire';
import type { WiFiProvCloudReadResult } from '../../model/response.model';
import { WiFiProvCloudObservation, WiFiProvCloudReconciliation, WiFiProvCloudReadPorts }
  from './wifiprov-cloud-reconciliation';
import { confirmWiFiProvCompletion, wiFiProvCompletionResult, WiFiProvCompletionPorts,
  WIFI_PROV_COMPLETION_WINDOW_MS } from './wifiprov-completion';

const turns = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  return { promise: new Promise<T>((a, b) => { resolve = a; reject = b; }), resolve, reject };
}
function fixture() {
  const controller = new AbortController();
  const ports: WiFiProvCompletionPorts = { signal: controller.signal, assertCurrent: vi.fn(),
    read: vi.fn(async (): Promise<'unconfirmed'> => 'unconfirmed') };
  return { controller, ports };
}

describe('WiFiProv product completion, independent of official receipt', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it.each(['confirmed', 'unknown'] as const)('fresh Cloud success is ready while preserving %s receipt', async receipt => {
    const f = fixture(); vi.mocked(f.ports.read).mockResolvedValue('online');
    await expect(confirmWiFiProvCompletion(receipt, f.ports)).resolves.toEqual({ officialReceipt: receipt,
      cloud: 'online', outcome: 'ready' });
    expect(f.ports.read).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('device rejection stops immediately, without Cloud, timers or credential writes', async () => {
    const f = fixture();
    await expect(confirmWiFiProvCompletion('rejected', f.ports)).resolves.toEqual({ officialReceipt: 'rejected',
      cloud: 'unconfirmed', outcome: 'failed' });
    expect(f.ports.read).not.toHaveBeenCalled(); expect(f.ports.assertCurrent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['confirmed', 'unknown'] as const)('deadline does not misreport %s receipt as WiFi failure', async receipt => {
    const f = fixture(), work = confirmWiFiProvCompletion(receipt, f.ports);
    await vi.advanceTimersByTimeAsync(WIFI_PROV_COMPLETION_WINDOW_MS);
    await expect(work).resolves.toEqual({ officialReceipt: receipt, cloud: 'unconfirmed',
      outcome: receipt === 'confirmed' ? 'wifi-connected' : 'unconfirmed', reason: 'timeout' });
    expect(f.ports.read).toHaveBeenCalledTimes(5); expect(vi.getTimerCount()).toBe(0);
  });

  it('normal unconfirmed progress alone permits a later observation', async () => {
    const f = fixture(); vi.mocked(f.ports.read).mockResolvedValueOnce('unconfirmed').mockResolvedValueOnce('online');
    const work = confirmWiFiProvCompletion('unknown', f.ports); await turns();
    expect(f.ports.read).toHaveBeenCalledOnce(); await vi.advanceTimersByTimeAsync(1999);
    expect(f.ports.read).toHaveBeenCalledOnce(); await vi.advanceTimersByTimeAsync(1);
    await expect(work).resolves.toMatchObject({ officialReceipt: 'unknown', outcome: 'ready' });
    expect(f.ports.read).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });

  it('slow observations skip expired slots, never overlap or catch up in a burst', async () => {
    const f = fixture(), pending = deferred<'unconfirmed'>();
    vi.mocked(f.ports.read).mockReturnValueOnce(pending.promise).mockResolvedValue('online');
    const work = confirmWiFiProvCompletion('confirmed', f.ports); await turns();
    await vi.advanceTimersByTimeAsync(7000); expect(f.ports.read).toHaveBeenCalledOnce();
    pending.resolve('unconfirmed'); await turns(); expect(f.ports.read).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2999); expect(f.ports.read).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1); await expect(work).resolves.toMatchObject({ outcome: 'ready' });
    expect(f.ports.read).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['confirmed', 'unknown'] as const)('unavailable is terminal without retry for %s', async receipt => {
    const f = fixture(); vi.mocked(f.ports.read).mockResolvedValue('unavailable');
    await expect(confirmWiFiProvCompletion(receipt, f.ports)).resolves.toMatchObject({ officialReceipt: receipt,
      cloud: 'unavailable', outcome: receipt === 'confirmed' ? 'wifi-connected' : 'unconfirmed' });
    await vi.advanceTimersByTimeAsync(60000); expect(f.ports.read).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('read failure is terminal, retains receipt, and never automatically retries', async () => {
    const f = fixture(); vi.mocked(f.ports.read).mockRejectedValue(Error('network not available'));
    await expect(confirmWiFiProvCompletion('confirmed', f.ports)).resolves.toEqual({ officialReceipt: 'confirmed',
      cloud: 'unavailable', outcome: 'wifi-connected', reason: 'read-error' });
    await vi.advanceTimersByTimeAsync(60000); expect(f.ports.read).toHaveBeenCalledOnce();
  });

  it.each(['WIFIPROV_KEY_CONTEXT_CHANGED', 'WIFIPROV_DEVICE_CONTEXT_CHANGED', 'WIFIPROV_CHECKPOINT_NOT_CURRENT',
    'WIFIPROV_CLOSE_UNCONFIRMED', 'WIFIPROV_CLOUD_BOUNDARY_BUSY', 'BLE_SCAN_CLOSE_FAILED',
    'DEVICE_V2_ACCOUNT_CONTEXT_CHANGED'])('known %s cannot enter further observations', async code => {
    const f = fixture(); vi.mocked(f.ports.read).mockRejectedValue({ error: { errorCode: code } });
    await expect(confirmWiFiProvCompletion('unknown', f.ports)).resolves.toMatchObject({ cloud: 'blocked',
      reason: 'context-changed' });
    await vi.advanceTimersByTimeAsync(60000); expect(f.ports.read).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each([401, 403, 404, 409, 410])('HTTP %s blocks rather than retrying or inferring WiFi failure', async status => {
    const f = fixture(); vi.mocked(f.ports.read).mockRejectedValue({ status });
    await expect(confirmWiFiProvCompletion('unknown', f.ports)).resolves.toMatchObject({ officialReceipt: 'unknown',
      cloud: 'blocked', outcome: 'unconfirmed', reason: 'context-changed' });
    expect(f.ports.read).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('initial account/generation failure prevents even the first read', async () => {
    const f = fixture(); vi.mocked(f.ports.assertCurrent).mockImplementation(() => { throw Error('old account'); });
    await expect(confirmWiFiProvCompletion('confirmed', f.ports)).resolves.toMatchObject({ cloud: 'blocked', reason: 'context-changed' });
    expect(f.ports.read).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('account change after a read cannot publish the late online result', async () => {
    const f = fixture(), pending = deferred<'online'>(); vi.mocked(f.ports.read).mockReturnValue(pending.promise);
    const work = confirmWiFiProvCompletion('unknown', f.ports); await turns();
    vi.mocked(f.ports.assertCurrent).mockImplementation(() => { throw Error('new generation'); });
    pending.resolve('online'); await expect(work).resolves.toMatchObject({ cloud: 'blocked', reason: 'context-changed' });
    expect(f.ports.read).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('already aborted operation makes no read', async () => {
    const f = fixture(); f.controller.abort();
    await expect(confirmWiFiProvCompletion('unknown', f.ports)).resolves.toEqual({ officialReceipt: 'unknown',
      cloud: 'unconfirmed', outcome: 'unconfirmed', reason: 'cancelled' });
    expect(f.ports.read).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('cancel during wait releases timers and stops all future observations', async () => {
    const f = fixture(), work = confirmWiFiProvCompletion('unknown', f.ports); await turns();
    f.controller.abort(); await expect(work).resolves.toMatchObject({ reason: 'cancelled' });
    await vi.advanceTimersByTimeAsync(60000); expect(f.ports.read).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancel during a non-cooperating read completes promptly and drops late success', async () => {
    const f = fixture(), pending = deferred<'online'>(); vi.mocked(f.ports.read).mockReturnValue(pending.promise);
    const work = confirmWiFiProvCompletion('confirmed', f.ports); await turns(); f.controller.abort();
    const result = await work; expect(result).toMatchObject({ outcome: 'wifi-connected', reason: 'cancelled' });
    pending.resolve('online'); await turns(); expect(result.cloud).toBe('unconfirmed');
    expect(f.ports.read).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('absolute deadline aborts a non-cooperating read and never accepts late success', async () => {
    const f = fixture(), pending = deferred<'online'>(); let signal!: AbortSignal;
    vi.mocked(f.ports.read).mockImplementation(value => { signal = value; return pending.promise; });
    const work = confirmWiFiProvCompletion('unknown', f.ports); await turns();
    await vi.advanceTimersByTimeAsync(WIFI_PROV_COMPLETION_WINDOW_MS);
    const result = await work; expect(result).toMatchObject({ cloud: 'unconfirmed', reason: 'timeout' });
    expect(signal.aborted).toBe(true); pending.resolve('online'); await turns();
    expect(result.outcome).toBe('unconfirmed'); expect(f.ports.read).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('uses monotonic elapsed time, independent of wall-clock changes', async () => {
    const f = fixture(); vi.spyOn(Date, 'now').mockReturnValue(1);
    const work = confirmWiFiProvCompletion('confirmed', f.ports);
    await vi.advanceTimersByTimeAsync(WIFI_PROV_COMPLETION_WINDOW_MS);
    await expect(work).resolves.toMatchObject({ officialReceipt: 'confirmed', reason: 'timeout' });
    expect(f.ports.read).toHaveBeenCalledTimes(5);
  });

  it('maps product availability independently without rewriting the official receipt', () => {
    expect(wiFiProvCompletionResult('unknown', 'online')).toEqual({ officialReceipt: 'unknown', cloud: 'online', outcome: 'ready' });
    expect(wiFiProvCompletionResult('confirmed', 'checking').outcome).toBe('checking');
    expect(wiFiProvCompletionResult('confirmed', 'blocked', 'context-changed').outcome).toBe('wifi-connected');
    expect(wiFiProvCompletionResult('unknown', 'unconfirmed', 'timeout').outcome).toBe('unconfirmed');
    expect(wiFiProvCompletionResult('rejected', 'online').outcome).toBe('failed');
    expect(Object.isFrozen(wiFiProvCompletionResult('unknown', 'online'))).toBe(true);
  });
});

describe('generic single Cloud observation preserves original UNKNOWN recovery contract', () => {
  it('completion cancellation cannot turn a late owner close into permission for Cloud', async () => {
    const identity = { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111', credentialVersion: 1,
      locator: 'AQEBAQEBAQEBAQEBAQEBAQ' }, instance = new Uint8Array(16).fill(1), controller = new AbortController();
    const close = deferred<void>(), read = vi.fn(), assertCloud = vi.fn();
    const observation = new WiFiProvCloudObservation({ identity, deviceInstanceId: instance, attemptedAt: 1000 });
    const work = confirmWiFiProvCompletion('confirmed', { signal: controller.signal, assertCurrent: vi.fn(),
      read: signal => observation.read({ signal, assertCurrent: vi.fn(), closeLocal: () => close.promise, assertCloud, read }) });
    await turns(); controller.abort();
    await expect(work).resolves.toMatchObject({ officialReceipt: 'confirmed', reason: 'cancelled' });
    close.resolve(); await turns(); expect(assertCloud).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });

  it('shares strict instance/context/fresh-session checks without inventing an official receipt', async () => {
    const identity = { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111', credentialVersion: 1,
      locator: 'AQEBAQEBAQEBAQEBAQEBAQ' }, instance = new Uint8Array(16).fill(1), controller = new AbortController();
    const receipt = { identity, deviceInstanceId: instance, attemptedAt: 1000 };
    const response: WiFiProvCloudReadResult = { device: { ...identity, state: 'active', cloudEnabled: true },
      observation: { kind: 'online', observedAt: 1400, deviceInstanceId: base64UrlEncode(instance), issuedAt: 1100, stateUpdatedAt: 1200 } };
    const ports: WiFiProvCloudReadPorts = { signal: controller.signal, assertCurrent: vi.fn(), closeLocal: vi.fn(async () => undefined),
      assertCloud: vi.fn(async () => undefined), read: vi.fn(async () => response) };
    const observation = new WiFiProvCloudObservation(receipt), recovery = new WiFiProvCloudReconciliation(receipt);
    expect('localReceipt' in observation).toBe(false);
    await expect(observation.read(ports)).resolves.toBe('online');
    await expect(recovery.read(ports)).resolves.toBe('online'); expect(recovery.localReceipt).toBe('unknown');
    expect(ports.closeLocal).toHaveBeenCalledTimes(2); expect(ports.read).toHaveBeenCalledTimes(2);
  });
});
