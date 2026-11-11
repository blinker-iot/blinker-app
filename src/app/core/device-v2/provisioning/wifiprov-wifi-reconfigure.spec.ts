import type { BlinkerWifiOnlyProvisionOptions, PlatformCapabilities } from 'capacitor-wifiprov';
import { BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest } from './esp32-wifiprov';
import { assertWifiReconfigurePoP, supportsWifiReconfigure, WiFiProvWifiReconfigurePort } from './wifiprov-wifi-reconfigure';

const owner = () => ({ kind: 'isolated-softap' as const, version: 1 as const, session: '11111111-1111-4111-8111-111111111111' });
const device = () => ({ name: 'fixture', transport: 'softap' as const, security: 1 as const, connected: true,
  capabilities: [], localOwner: owner() });
const capabilities: PlatformCapabilities = { platform: 'android', bleProvisioning: true, softApProvisioning: true,
  softApSystemConnectedReadOnly: true, softApSystemConnectedConfigInfoRead: true, softApSystemConnectedWifiReconfigure: true,
  customEndpoints: true, qrPayloadImport: true, nativeQrScanner: false, notes: [] };
function info(epoch = 7, instanceByte = 1, flags = 7) {
  const bytes = new Uint8Array(24); bytes.set([2, 1, 0, flags]); bytes.fill(instanceByte, 4, 20);
  new DataView(bytes.buffer).setUint32(20, epoch, false); return bytes;
}
const owned = (bytes: Uint8Array) => ({ base64: btoa(String.fromCharCode(...bytes)), localOwner: owner() });
function setup() {
  let active = true;
  const changed = Error('fixture changed account/generation');
  const current = vi.fn(() => { if (!active) throw changed; });
  const client = {
    readBlinkerConfigInfo: vi.fn(async () => owned(info())),
    provisionBlinkerWifiOnly: vi.fn(async (_options: BlinkerWifiOnlyProvisionOptions) => ({ success: true, localOwner: owner() })),
    bootstrapBlinkerAccess: vi.fn(), provisionBlinkerWifi: vi.fn(), provision: vi.fn(), sendCustomData: vi.fn(), clearState: vi.fn(),
  };
  const selected = device(), port = new WiFiProvWifiReconfigurePort(client, capabilities, selected, current);
  const read = () => port.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest());
  return { client, port, read, selected, current, changed, retireContext: () => { active = false; } };
}
async function ready() { const f = setup(); await f.read(); return f; }
function noFallback(f: ReturnType<typeof setup>) {
  for (const method of ['bootstrapBlinkerAccess', 'provisionBlinkerWifi', 'provision', 'sendCustomData', 'clearState'] as const) {
    expect(f.client[method]).not.toHaveBeenCalled();
  }
}

describe('WiFiProv explicit existing-root WiFi-only thin port', () => {
  it('requires separate Android capabilities and both narrow methods, never first-install as a substitute', () => {
    expect(supportsWifiReconfigure(capabilities)).toBe(true);
    for (const key of ['softApProvisioning', 'softApSystemConnectedReadOnly', 'softApSystemConnectedConfigInfoRead', 'softApSystemConnectedWifiReconfigure']) {
      for (const value of [undefined, false, 'true']) {
        const cap = { ...capabilities, [key]: value, softApSystemConnectedFirstInstall: true } as any, f = setup();
        expect(supportsWifiReconfigure(cap)).toBe(false);
        expect(() => new WiFiProvWifiReconfigurePort(f.client, cap, device(), f.current)).toThrow('WIFIPROV_SYSTEM_CONNECTED_UNSUPPORTED');
        noFallback(f);
      }
    }
    for (const platform of ['web', 'ios']) expect(supportsWifiReconfigure({ ...capabilities, platform } as any)).toBe(false);
    for (const key of ['readBlinkerConfigInfo', 'provisionBlinkerWifiOnly']) {
      const f = setup(); expect(() => new WiFiProvWifiReconfigurePort({ ...f.client, [key]: undefined }, capabilities, device(), f.current))
        .toThrow('WIFIPROV_SYSTEM_CONNECTED_UNSUPPORTED');
    }
  });

  it('validates explicit nonempty PoP with bounded UTF8, without deriving or trimming it', () => {
    for (const value of [' fixture ', 'x'.repeat(64), '温'.repeat(21) + 'a']) expect(assertWifiReconfigurePoP(value)).toBe(value);
    for (const value of [undefined, null, 1, '', '  ', 'a\0b', 'x'.repeat(65), '温'.repeat(22)]) {
      expect(() => assertWifiReconfigurePoP(value)).toThrow('WIFIPROV_WIFI_RECONFIGURE_POP_REQUIRED');
    }
  });

  it('locks repeated fresh identical root reads then sends exactly one typed WiFi request without identity writes', async () => {
    const f = await ready(); expect(await f.read()).toEqual(info());
    expect(await f.port.provision({ ssid: ' fixture ', password: '' })).toEqual({ success: true });
    expect(f.port.submittedWiFi).toBe(true);
    expect(f.client.readBlinkerConfigInfo.mock.calls).toEqual([[], []]);
    expect(f.client.provisionBlinkerWifiOnly).toHaveBeenCalledExactlyOnceWith({ ssid: ' fixture ', password: '',
      deviceInstanceIdHex: '01'.repeat(16), accessEpoch: 7 });
    await f.read();
    await expect(f.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_REQUEST_INVALID');
    expect(f.client.provisionBlinkerWifiOnly).toHaveBeenCalledOnce(); noFallback(f);
  });

  it('forbids provisioning without a prior fresh complete-root read', async () => {
    const f = setup(); await expect(f.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_REQUEST_INVALID');
    expect(f.port.submittedWiFi).toBe(false); expect(f.client.provisionBlinkerWifiOnly).not.toHaveBeenCalled(); noFallback(f);
  });

  it('accepts the full uint32 epoch range and refuses empty/partial roots or zero instance', async () => {
    for (const epoch of [1, 0xffffffff]) {
      const f = setup(); f.client.readBlinkerConfigInfo.mockResolvedValueOnce(owned(info(epoch)));
      await f.read(); await f.port.provision({ ssid: 'fixture' });
      expect(f.client.provisionBlinkerWifiOnly.mock.calls[0][0].accessEpoch).toBe(epoch);
    }
    for (const bytes of [info(0), info(7, 0), info(0, 1, 2), info(0, 1, 3), info(7, 1, 6), info(7, 1, 15)]) {
      const f = setup(); f.client.readBlinkerConfigInfo.mockResolvedValueOnce(owned(bytes));
      await expect(f.read()).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
      await expect(f.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_SCOPE_QUARANTINED');
      expect(f.client.provisionBlinkerWifiOnly).not.toHaveBeenCalled(); noFallback(f);
    }
  });

  it('quarantines root instance/epoch changes and never substitutes the latest facts into an old owner', async () => {
    for (const next of [info(8), info(7, 2)]) {
      const f = await ready(); f.client.readBlinkerConfigInfo.mockResolvedValueOnce(owned(next));
      await expect(f.read()).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
      await expect(f.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_SCOPE_QUARANTINED');
      expect(f.client.provisionBlinkerWifiOnly).not.toHaveBeenCalled(); noFallback(f);
    }
  });

  it('permits only fixed GetInfo, never Bootstrap, Install, arbitrary custom or caller-supplied root options', async () => {
    for (const payload of [Uint8Array.of(2, 3), new Uint8Array(101), new Uint8Array(45), Uint8Array.of(2, 1, 0), new Uint8Array(10000)]) {
      const f = setup(); await expect(f.port.request(BLINKER_CONFIG_ENDPOINT, payload)).rejects.toThrow('WIFIPROV_REQUEST_INVALID');
      expect(f.client.readBlinkerConfigInfo).not.toHaveBeenCalled(); noFallback(f);
    }
    const wrongEndpoint = setup(); await expect(wrongEndpoint.port.request('other', encodeBlinkerConfigInfoRequest())).rejects.toThrow('WIFIPROV_REQUEST_INVALID');
    for (const options of [{ ssid: 'fixture', accessEpoch: 8 }, { ssid: 'fixture', deviceInstanceIdHex: '02'.repeat(16) }]) {
      const f = await ready(); await expect(f.port.provision(options as any)).rejects.toThrow('WIFIPROV_REQUEST_INVALID');
      expect(f.client.provisionBlinkerWifiOnly).not.toHaveBeenCalled();
    }
  });

  it('returns explicit fixed device status and retires, without authorizing a write', async () => {
    for (const status of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const f = setup(), bytes = Uint8Array.of(2, 1, status); f.client.readBlinkerConfigInfo.mockResolvedValueOnce(owned(bytes));
      expect(await f.read()).toEqual(bytes);
      await expect(f.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_SCOPE_QUARANTINED');
      expect(f.client.provisionBlinkerWifiOnly).not.toHaveBeenCalled(); noFallback(f);
    }
  });

  it('rejects malformed or foreign fixed-read responses before locking a root', async () => {
    for (const response of [null, { ...owned(info()), extra: true }, { ...owned(info()), base64: 'not-canonical' },
      { ...owned(info()), localOwner: { ...owner(), session: '22222222-2222-4222-8222-222222222222' } },
      owned(Uint8Array.of(2, 1, 9)), owned(Uint8Array.of(2, 1, 0))]) {
      const f = setup(); f.client.readBlinkerConfigInfo.mockResolvedValueOnce(response as any);
      await expect(f.read()).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
      await expect(f.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_SCOPE_QUARANTINED');
      expect(f.client.provisionBlinkerWifiOnly).not.toHaveBeenCalled(); noFallback(f);
    }
  });

  it('accepts only exact native success and original live owner, without acknowledging malformed results', async () => {
    for (const response of [null, { success: false, localOwner: owner() }, { success: true },
      { success: true, localOwner: owner(), ipAddress: '192.0.2.1' },
      { success: true, localOwner: { ...owner(), session: '22222222-2222-4222-8222-222222222222' } },
      { success: true, localOwner: { ...owner(), version: 2 } }]) {
      const f = await ready(); f.client.provisionBlinkerWifiOnly.mockResolvedValueOnce(response as any);
      await expect(f.port.provision({ ssid: 'fixture' })).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
      expect(f.port.submittedWiFi).toBe(true);
      await expect(f.read()).rejects.toThrow('WIFIPROV_SCOPE_QUARANTINED');
      expect(f.client.provisionBlinkerWifiOnly).toHaveBeenCalledOnce(); noFallback(f);
    }
  });

  it('snapshots the native owner and exact UTF8 WiFi options before awaiting, while serializing the whole port', async () => {
    const f = setup(); f.selected.localOwner.session = '22222222-2222-4222-8222-222222222222'; await f.read();
    let finish!: (value: { success: boolean; localOwner: ReturnType<typeof owner> }) => void;
    f.client.provisionBlinkerWifiOnly.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const options = { ssid: '温'.repeat(10) + 'ab', password: '密'.repeat(21) + 'a' }, expected = { ...options };
    const pending = f.port.provision(options); options.ssid = 'changed'; options.password = 'changed';
    expect(f.client.provisionBlinkerWifiOnly.mock.calls[0][0]).toEqual({ ...expected, deviceInstanceIdHex: '01'.repeat(16), accessEpoch: 7 });
    await expect(f.read()).rejects.toThrow('WIFIPROV_OPERATION_BUSY');
    await expect(f.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_OPERATION_BUSY');
    finish({ success: true, localOwner: owner() }); await pending; noFallback(f);
  });

  it('rejects malformed or oversized WiFi options before submission, with open WiFi still supported', async () => {
    for (const options of [null, { ssid: '' }, { ssid: ' ' }, { ssid: 'a\0b' }, { ssid: '温'.repeat(11) },
      { ssid: 'fixture', password: '密'.repeat(22) }, { ssid: 'fixture', password: 'a\0b' }, { ssid: 'fixture', extra: true }]) {
      const f = await ready(); await expect(f.port.provision(options as any)).rejects.toThrow('WIFIPROV_REQUEST_INVALID');
      expect(f.port.submittedWiFi).toBe(false); expect(f.client.provisionBlinkerWifiOnly).not.toHaveBeenCalled();
    }
    const f = await ready(); await f.port.provision({ ssid: 'fixture' });
    expect(f.client.provisionBlinkerWifiOnly.mock.calls[0][0]).toEqual({ ssid: 'fixture', deviceInstanceIdHex: '01'.repeat(16), accessEpoch: 7 });
  });

  it('preserves native UNKNOWN unchanged and conservatively classifies cancelled invoked calls without retries', async () => {
    const error = Object.assign(Error('fixture original UNKNOWN'), { code: 'PROVISIONING_RESULT_UNKNOWN' });
    const read = setup(); read.client.readBlinkerConfigInfo.mockRejectedValueOnce(error); await expect(read.read()).rejects.toBe(error);
    const wifi = await ready(); wifi.client.provisionBlinkerWifiOnly.mockRejectedValueOnce(error);
    await expect(wifi.port.provision({ ssid: 'fixture' })).rejects.toBe(error);
    for (const code of ['WIFIPROV_OPERATION_CANCELLED', 'WIFIPROV_SCOPE_QUARANTINED', 'WIFIPROV_CLOSE_UNCONFIRMED']) {
      const f = await ready(); f.client.provisionBlinkerWifiOnly.mockRejectedValueOnce(Object.assign(Error(code), { code }));
      await expect(f.port.provision({ ssid: 'fixture' })).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' }); noFallback(f);
    }
  });

  it.each(['WIFIPROV_WIFI_AUTH_FAILED', 'WIFIPROV_WIFI_NETWORK_NOT_FOUND'])(
    'preserves matched WiFi-only %s but retires before a second WiFi request', async code => {
      const f = await ready(), error = Object.assign(Error('generic IPC failure message'), { code });
      f.client.provisionBlinkerWifiOnly.mockRejectedValueOnce(error);
      await expect(f.port.provision({ ssid: 'fixture' })).rejects.toBe(error);
      await expect(f.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_SCOPE_QUARANTINED');
      expect(f.client.provisionBlinkerWifiOnly).toHaveBeenCalledOnce(); noFallback(f);
    });

  it.each(['WIFIPROV_WIFI_AUTH_FAILED', 'WIFIPROV_WIFI_NETWORK_NOT_FOUND'])(
    'keeps late WiFi-only %s after retirement or abort UNKNOWN', async code => {
      for (const cancelled of ['retire', 'abort']) {
        const f = await ready(), controller = new AbortController(); let reject!: (error: unknown) => void;
        f.client.provisionBlinkerWifiOnly.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
        const work = f.port.provision({ ssid: 'fixture' }, controller.signal);
        const outcome = expect(work).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
        if (cancelled === 'retire') f.port.retire(); else controller.abort();
        reject(Object.assign(Error('generic IPC failure message'), { code })); await outcome;
        expect(f.client.provisionBlinkerWifiOnly).toHaveBeenCalledOnce(); noFallback(f);
      }
    });

  it('does not invoke an already cancelled request, but returns UNKNOWN immediately for an in-flight cancellation', async () => {
    const before = await ready(), controller = new AbortController(); controller.abort();
    await expect(before.port.provision({ ssid: 'fixture' }, controller.signal)).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    expect(before.port.submittedWiFi).toBe(false); expect(before.client.provisionBlinkerWifiOnly).not.toHaveBeenCalled();
    const f = await ready(), stop = new AbortController();
    let finish!: (value: { success: boolean; localOwner: ReturnType<typeof owner> }) => void;
    f.client.provisionBlinkerWifiOnly.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = f.port.provision({ ssid: 'fixture' }, stop.signal); stop.abort();
    await expect(pending).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
    expect(f.port.submittedWiFi).toBe(true); finish({ success: true, localOwner: owner() });
    await expect(f.read()).rejects.toThrow('WIFIPROV_SCOPE_QUARANTINED');
    expect(f.client.provisionBlinkerWifiOnly).toHaveBeenCalledOnce(); noFallback(f);
  });

  it('removes its operation-scoped abort listener after terminal success and never lets a late abort rearm or cancel another read', async () => {
    const f = await ready(), stop = new AbortController();
    const add = vi.spyOn(stop.signal, 'addEventListener'), remove = vi.spyOn(stop.signal, 'removeEventListener');
    await f.port.provision({ ssid: 'fixture' }, stop.signal);
    expect(add).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledExactlyOnceWith('abort', add.mock.calls[0][1]);
    stop.abort(); expect(await f.read()).toEqual(info());
    await expect(f.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_REQUEST_INVALID');
    expect(f.client.provisionBlinkerWifiOnly).toHaveBeenCalledOnce(); noFallback(f);
  });

  it('isolates late read/WiFi callbacks after retirement or account/generation change', async () => {
    for (const phase of ['read', 'wifi']) {
      const f = setup(); if (phase === 'wifi') await f.read();
      let finish!: (value: any) => void;
      const response = new Promise<any>(resolve => { finish = resolve; });
      if (phase === 'read') f.client.readBlinkerConfigInfo.mockReturnValueOnce(response);
      else f.client.provisionBlinkerWifiOnly.mockReturnValueOnce(response);
      const pending = phase === 'read' ? f.read() : f.port.provision({ ssid: 'fixture' });
      f.port.retire(); finish(phase === 'read' ? owned(info()) : { success: true, localOwner: owner() });
      await expect(pending).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' }); noFallback(f);
    }
    const f = await ready(); let finish!: (value: any) => void;
    f.client.provisionBlinkerWifiOnly.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = f.port.provision({ ssid: 'fixture' }); f.retireContext(); finish({ success: true, localOwner: owner() });
    await expect(pending).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
    const before = setup(); before.retireContext(); await expect(before.read()).rejects.toBe(before.changed);
    expect(before.client.readBlinkerConfigInfo).not.toHaveBeenCalled();
  });
});
