import { BlinkerConfigError } from './esp32-wifiprov';
import { readSystemConnectedConfigInfo, supportsSystemConnectedConfigInfo } from './wifiprov-config-info-read';

const session = '11111111-1111-4111-8111-111111111111';
const device = () => ({ name: 'fixture', transport: 'softap' as const, security: 1 as const,
  connected: true, capabilities: [], localOwner: { kind: 'isolated-softap' as const, version: 1 as const, session } });
const cap: PlatformCapabilities = { platform: 'android', bleProvisioning: true, softApProvisioning: true,
  softApSystemConnectedReadOnly: true, softApSystemConnectedConfigInfoRead: true,
  customEndpoints: true, qrPayloadImport: true, nativeQrScanner: false, notes: [] };
function raw() {
  const bytes = new Uint8Array(24); bytes.set([2, 1, 0, 7]); bytes.fill(1, 4, 20);
  new DataView(bytes.buffer).setUint32(20, 7, false); return bytes;
}
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function setup(bytes = raw()) {
  const client = { readBlinkerConfigInfo: vi.fn(async () => ({ base64: base64(bytes), localOwner: device().localOwner })),
    sendCustomData: vi.fn(), provision: vi.fn() };
  const current = vi.fn(); return { client, current, read: () => readSystemConnectedConfigInfo(client, cap, device(), current) };
}

describe('fixed manual GetInfo read', () => {
  it('uses one no-input native method and the original decoder, never the general custom/write ports', async () => {
    const f = setup(), info = await f.read();
    expect(f.client.readBlinkerConfigInfo.mock.calls).toEqual([[]]); expect(f.current).toHaveBeenCalledTimes(2);
    expect(info).toMatchObject({ accessEpoch: 7, hasDeviceKey: true, hasAccessState: true, supportsAccessBootstrap: true });
    expect(info.deviceInstanceId).toEqual(new Uint8Array(16).fill(1));
    expect(f.client.sendCustomData).not.toHaveBeenCalled(); expect(f.client.provision).not.toHaveBeenCalled();
  });

  it.each([undefined, false, 'true'])('refuses missing/false/nonboolean fixed capability %j with no fallback', async flag => {
    const f = setup(), old = { ...cap, softApSystemConnectedConfigInfoRead: flag } as any;
    expect(supportsSystemConnectedConfigInfo(old)).toBe(false);
    await expect(readSystemConnectedConfigInfo(f.client, old, device(), f.current))
      .rejects.toMatchObject({ code: 'WIFIPROV_SYSTEM_CONNECTED_UNSUPPORTED' });
    expect(f.client.readBlinkerConfigInfo).not.toHaveBeenCalled(); expect(f.client.sendCustomData).not.toHaveBeenCalled();
  });

  it('refuses a missing native method even if a stale capability says true', async () => {
    await expect(readSystemConnectedConfigInfo({} as any, cap, device(), vi.fn()))
      .rejects.toMatchObject({ code: 'WIFIPROV_SYSTEM_CONNECTED_UNSUPPORTED' });
  });

  it.each(['disconnected', 'missing-owner'])('rejects %s before native entry', async state => {
    const f = setup(), peer = device();
    if (state === 'disconnected') peer.connected = false; else delete (peer as any).localOwner;
    await expect(readSystemConnectedConfigInfo(f.client, cap, peer, f.current)).rejects.toThrow();
    expect(f.client.readBlinkerConfigInfo).not.toHaveBeenCalled();
  });

  it.each([1, 5, 8])('preserves the existing explicit device rejection status %s, not an empty success', async status => {
    const f = setup(Uint8Array.of(2, 1, status));
    const error = await f.read().catch(value => value);
    expect(error).toBeInstanceOf(BlinkerConfigError); expect(error.status).toBe(status);
    expect(error.code).not.toBe('PROVISIONING_RESULT_UNKNOWN');
  });

  it.each(['owner', 'extra', 'noncanonical', 'zero', 'epoch', 'flags', 'version', 'operation', 'success-size', 'unknown-status'])
    ('retains an unconfirmed %s response as UNKNOWN without retry', async change => {
      const f = setup(), bytes = raw(); let response: any = { base64: base64(bytes), localOwner: device().localOwner };
      if (change === 'owner') response.localOwner = { ...device().localOwner, session: '22222222-2222-4222-8222-222222222222' };
      else if (change === 'extra') response.endpoint = 'untrusted';
      else if (change === 'noncanonical') response.base64 += '=';
      else {
        if (change === 'zero') bytes.fill(0, 4, 20);
        if (change === 'epoch') bytes.fill(0, 20);
        if (change === 'flags') bytes[3] |= 8;
        if (change === 'version') bytes[0]++;
        if (change === 'operation') bytes[1]++;
        response.base64 = base64(change === 'success-size' ? Uint8Array.of(2, 1, 0)
          : change === 'unknown-status' ? Uint8Array.of(2, 1, 9) : bytes);
      }
      f.client.readBlinkerConfigInfo.mockResolvedValueOnce(response);
      await expect(f.read()).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
      expect(f.client.readBlinkerConfigInfo).toHaveBeenCalledOnce(); expect(f.client.sendCustomData).not.toHaveBeenCalled();
    });

  it('preserves the original native UNKNOWN object and makes no second call', async () => {
    const f = setup(), unknown = Object.assign(Error('fixture'), { code: 'PROVISIONING_RESULT_UNKNOWN' });
    f.client.readBlinkerConfigInfo.mockRejectedValueOnce(unknown);
    await expect(f.read()).rejects.toBe(unknown); expect(f.client.readBlinkerConfigInfo).toHaveBeenCalledOnce();
  });

  it('rejects a late account/generation result without interpreting it or retrying', async () => {
    const f = setup(); let resolve!: (value: any) => void;
    f.client.readBlinkerConfigInfo.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = f.read(), changed = Error('retired account');
    f.current.mockImplementation(() => { throw changed; });
    resolve({ base64: base64(raw()), localOwner: device().localOwner });
    await expect(pending).rejects.toBe(changed); expect(f.client.readBlinkerConfigInfo).toHaveBeenCalledOnce();
  });
});
import type { PlatformCapabilities } from 'capacitor-wifiprov';
