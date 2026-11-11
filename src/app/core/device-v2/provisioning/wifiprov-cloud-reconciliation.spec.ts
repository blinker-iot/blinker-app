import { base64UrlEncode } from '../ble-direct/wire';
import type { WiFiProvCloudReadResult } from '../../model/response.model';
import { WiFiProvCloudObservation, WiFiProvCloudReconciliation, WiFiProvCloudReadPorts } from './wifiprov-cloud-reconciliation';
import { allocationContext } from './wifiprov-allocation';

const identity = { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111', credentialVersion: 1,
  locator: 'AQEBAQEBAQEBAQEBAQEBAQ' };
const instance = new Uint8Array(16).fill(1);
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(r => { resolve = r; }), resolve: (value: T) => resolve(value) };
}
const turn = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
function online(): WiFiProvCloudReadResult {
  return { device: { ...identity, state: 'active', cloudEnabled: true }, observation: {
    kind: 'online', observedAt: 1400, deviceInstanceId: base64UrlEncode(instance), issuedAt: 1100, stateUpdatedAt: 1200,
  } };
}
function fixture() {
  const controller = new AbortController(), calls: string[] = [];
  const ports: WiFiProvCloudReadPorts = {
    signal: controller.signal, assertCurrent: vi.fn(),
    closeLocal: vi.fn(async () => { calls.push('real-death'); }),
    assertCloud: vi.fn(async () => { calls.push('cloud-boundary'); }),
    read: vi.fn(async () => { calls.push('owner-read'); return online(); }),
  };
  const reader = new WiFiProvCloudReconciliation({ identity, deviceInstanceId: instance, attemptedAt: 1000 });
  return { reader, ports, controller, calls };
}

describe('UNKNOWN WiFi read-only coordination', () => {
  it('requires matching real close before Cloud checks and one explicit owner read, leaving UNKNOWN intact', async () => {
    const f = fixture(); expect(f.ports.read).not.toHaveBeenCalled();
    await expect(f.reader.read(f.ports)).resolves.toBe('online');
    expect(f.calls).toEqual(['real-death', 'cloud-boundary', 'owner-read']);
    expect(f.ports.read).toHaveBeenCalledExactlyOnceWith(instance, identity, f.controller.signal);
    expect(f.reader.localReceipt).toBe('unknown');
  });

  it('no ready observation or time can bypass a pending death, and cancellation cannot continue it', async () => {
    const f = fixture(), close = deferred<void>(); vi.mocked(f.ports.closeLocal).mockReturnValue(close.promise);
    const work = f.reader.read(f.ports); await turn();
    expect(f.ports.assertCloud).not.toHaveBeenCalled(); expect(f.ports.read).not.toHaveBeenCalled();
    f.controller.abort(); await expect(work).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    close.resolve(); await turn(); expect(f.ports.read).not.toHaveBeenCalled();
  });

  it.each(['closeLocal', 'assertCloud'] as const)('stops on %s failure without a query or retry', async failure => {
    const f = fixture(); vi.mocked(f.ports[failure]).mockRejectedValue(Error('unconfirmed'));
    await expect(f.reader.read(f.ports)).rejects.toThrow('unconfirmed');
    expect(f.ports.read).not.toHaveBeenCalled(); expect(f.ports.closeLocal).toHaveBeenCalledOnce();
  });

  it('rejects overlap rather than queuing or starting another read', async () => {
    const f = fixture(), result = deferred<WiFiProvCloudReadResult>(); vi.mocked(f.ports.read).mockReturnValue(result.promise);
    const first = f.reader.read(f.ports); await turn();
    await expect(f.reader.read(f.ports)).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_BUSY' });
    result.resolve(online()); await first; expect(f.ports.read).toHaveBeenCalledOnce();
  });

  it('cancels an in-flight query and discards a late result without another query', async () => {
    const f = fixture(), result = deferred<WiFiProvCloudReadResult>(); vi.mocked(f.ports.read).mockReturnValue(result.promise);
    const work = f.reader.read(f.ports); await turn(); f.controller.abort();
    await expect(work).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    result.resolve(online()); await turn(); expect(f.ports.read).toHaveBeenCalledOnce(); expect(f.reader.localReceipt).toBe('unknown');
  });

  it('rechecks account/generation after HTTP and refuses its old result', async () => {
    const f = fixture(), result = deferred<WiFiProvCloudReadResult>(); vi.mocked(f.ports.read).mockReturnValue(result.promise);
    const work = f.reader.read(f.ports); await turn();
    vi.mocked(f.ports.assertCurrent).mockImplementation(() => { throw Error('account changed'); });
    result.resolve(online()); await expect(work).rejects.toThrow('account changed');
  });

  it.each(['identity', 'instance'] as const)('rejects a different %s instead of treating it as this attempt', async mismatch => {
    const f = fixture(), response = online();
    if (mismatch === 'identity') response.device.credentialVersion = 2;
    else response.observation.deviceInstanceId = base64UrlEncode(new Uint8Array(16).fill(2));
    vi.mocked(f.ports.read).mockResolvedValue(response);
    await expect(f.reader.read(f.ports)).rejects.toMatchObject({ code: mismatch === 'identity'
      ? 'WIFIPROV_KEY_CONTEXT_CHANGED' : 'WIFIPROV_DEVICE_CONTEXT_CHANGED' });
  });

  it.each(['unconfirmed', 'unavailable'] as const)('keeps %s separate from confirmed online', async kind => {
    const f = fixture(), response = online(); response.observation = {
      kind, observedAt: 1400, deviceInstanceId: null, issuedAt: null, stateUpdatedAt: null,
    };
    vi.mocked(f.ports.read).mockResolvedValue(response);
    await expect(f.reader.read(f.ports)).resolves.toBe(kind); expect(f.reader.localReceipt).toBe('unknown');
  });

  it('a session older than the WiFi call cannot confirm this attempt even with a fresh State', async () => {
    const f = fixture(), response = online(); response.observation.issuedAt = 999;
    vi.mocked(f.ports.read).mockResolvedValue(response);
    await expect(f.reader.read(f.ports)).resolves.toBe('unconfirmed');
  });

  it('copies the public identity/instance checkpoint before asynchronous reads', async () => {
    const key = { ...identity }, bytes = instance.slice(), f = fixture();
    const reader = new WiFiProvCloudReconciliation({ identity: key, deviceInstanceId: bytes, attemptedAt: 1000 });
    key.credentialVersion = 2; bytes.fill(2);
    await expect(reader.read(f.ports)).resolves.toBe('online');
    expect(f.ports.read).toHaveBeenCalledWith(instance, identity, f.controller.signal);
  });
});

describe('strict new-key session fence', () => {
  it.each([
    [999, 1200, 1400], [1000, 1200, 1400], [1200, 1100, 1400], [1100, 1401, 1400], [1100.5, 1200, 1400],
  ])('does not treat invalid/stale session and State times as online (%s, %s, %s)', async (issuedAt, stateUpdatedAt, observedAt) => {
    const f = fixture(), result = online();
    result.observation = { ...result.observation, issuedAt, stateUpdatedAt, observedAt };
    vi.mocked(f.ports.read).mockResolvedValue(result);
    const reader = new WiFiProvCloudObservation({ identity, deviceInstanceId: instance, attemptedAt: 1000 }, true);
    await expect(reader.read(f.ports)).resolves.toBe('unconfirmed');
  });

  it('accepts a later current session and monotonic State after owner release', async () => {
    const f = fixture(), reader = new WiFiProvCloudObservation({ identity, deviceInstanceId: instance, attemptedAt: 1000 }, true);
    await expect(reader.read(f.ports)).resolves.toBe('online');
    expect(f.calls).toEqual(['real-death', 'cloud-boundary', 'owner-read']);
  });
});

describe('explicit metadata-reference observation', () => {
  const opaque = { ...identity, logicalDeviceId: 'device_' + base64UrlEncode(new Uint8Array(16).fill(7)) };
  const receipt = () => ({ identity: { ...opaque }, deviceInstanceId: instance.slice(), attemptedAt: 1000 });
  function response() { return { ...online(), device: { ...online().device, ...opaque } }; }

  it('keeps the default observation and ordinary allocation strict for a real Cloud reference', () => {
    expect(opaque.logicalDeviceId).toHaveLength(29);
    expect(() => new WiFiProvCloudObservation(receipt())).toThrow();
    expect(() => allocationContext(opaque)).toThrow();
  });

  it('reads that exact reference once, only after the real release and Cloud boundary', async () => {
    const f = fixture(); vi.mocked(f.ports.read).mockResolvedValue(response());
    const reader = new WiFiProvCloudObservation(receipt(), false, 'metadata-reference');
    await expect(reader.read(f.ports)).resolves.toBe('online');
    expect(f.calls.slice(0, 2)).toEqual(['real-death', 'cloud-boundary']);
    expect(f.ports.read).toHaveBeenCalledExactlyOnceWith(instance, opaque, f.controller.signal);
  });

  it.each([1000, 1000.5])('forces a strictly new integer session even without requireNewSession (%s)', async issuedAt => {
    const f = fixture(), value = response(); value.observation.issuedAt = issuedAt;
    vi.mocked(f.ports.read).mockResolvedValue(value);
    await expect(new WiFiProvCloudObservation(receipt(), false, 'metadata-reference').read(f.ports))
      .resolves.toBe('unconfirmed');
    expect(f.ports.read).toHaveBeenCalledOnce();
  });

  it.each(['locator', 'version', 'instance'] as const)('retains exact %s matching in metadata mode', async mismatch => {
    const f = fixture(), value = response();
    if (mismatch === 'locator') value.device.locator = base64UrlEncode(new Uint8Array(16).fill(8));
    else if (mismatch === 'version') value.device.credentialVersion = 2;
    else value.observation.deviceInstanceId = base64UrlEncode(new Uint8Array(16).fill(8));
    vi.mocked(f.ports.read).mockResolvedValue(value);
    await expect(new WiFiProvCloudObservation(receipt(), false, 'metadata-reference').read(f.ports))
      .rejects.toMatchObject({ code: mismatch === 'instance' ? 'WIFIPROV_DEVICE_CONTEXT_CHANGED' : 'WIFIPROV_KEY_CONTEXT_CHANGED' });
    expect(f.ports.read).toHaveBeenCalledOnce();
  });

  it.each(['device_AAAAAAAAAAAAAAAAAAAAAA', 'device_AQEBAQEBAQEBAQEBAQEBAR', 'device_arbitrary', 'https://device.invalid'])
    ('rejects invalid reference %s before starting any read', logicalDeviceId => {
      expect(() => new WiFiProvCloudObservation({ ...receipt(), identity: { ...opaque, logicalDeviceId } }, false, 'metadata-reference'))
        .toThrow();
    });

  it('does not interpret an unknown mode as metadata admission', () => {
    expect(() => new WiFiProvCloudObservation(receipt(), false, 'unknown' as 'metadata-reference'))
      .toThrow('WIFIPROV_CLOUD_IDENTITY_MODE_INVALID');
  });
});
