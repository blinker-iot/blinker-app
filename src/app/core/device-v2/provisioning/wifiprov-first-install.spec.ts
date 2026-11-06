import type { PlatformCapabilities, ProvisionOptions } from 'capacitor-wifiprov';
import { base64UrlEncode } from '../ble-direct/wire';
import { BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigBootstrap, encodeBlinkerConfigInfoRequest } from './esp32-wifiprov';
import { WiFiProvFirstInstallPort, assertFirstInstallPoP, supportsFirstInstall } from './wifiprov-first-install';

const session = '11111111-1111-4111-8111-111111111111';
const owner = () => ({ kind: 'isolated-softap' as const, version: 1 as const, session });
const device = () => ({ name: 'fixture', transport: 'softap' as const, security: 1 as const,
  connected: true, capabilities: [], localOwner: owner() });
const capabilities: PlatformCapabilities = { platform: 'android', bleProvisioning: true, softApProvisioning: true,
  softApSystemConnectedReadOnly: true, softApSystemConnectedConfigInfoRead: true, softApSystemConnectedFirstInstall: true,
  customEndpoints: true, qrPayloadImport: true, nativeQrScanner: false, notes: [] };
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const owned = (bytes: Uint8Array) => ({ base64: base64(bytes), localOwner: owner() });
function emptyInfo() {
  const bytes = new Uint8Array(24); bytes.set([2, 1, 0, 2]); bytes.fill(1, 4, 20); return bytes;
}
function bootstrap() {
  return encodeBlinkerConfigBootstrap(base64UrlEncode(new Uint8Array(32).fill(7)), {
    accessEpoch: 1, credentialVersion: 1, controllerId: new Uint8Array(16).fill(2), controllerSecret: new Uint8Array(32).fill(3),
  });
}
function setup() {
  let active = true;
  const changed = Error('fixture retired account/generation');
  const current = vi.fn(() => { if (!active) throw changed; });
  const client = {
    readBlinkerConfigInfo: vi.fn(async () => owned(emptyInfo())),
    bootstrapBlinkerAccess: vi.fn(async (_options: { deviceInstanceIdHex: string; base64: string }) => owned(Uint8Array.of(2, 3, 0))),
    provisionBlinkerWifi: vi.fn(async (_options: ProvisionOptions) => ({ success: true, localOwner: owner() })),
    sendCustomData: vi.fn(), provision: vi.fn(), clearState: vi.fn(),
  };
  const selected = device(), port = new WiFiProvFirstInstallPort(client, capabilities, selected, current);
  const read = () => port.request(BLINKER_CONFIG_ENDPOINT, encodeBlinkerConfigInfoRequest());
  const write = () => port.request(BLINKER_CONFIG_ENDPOINT, bootstrap());
  return { client, current, selected, port, read, write, changed, retireContext: () => { active = false; } };
}
const noFallback = (f: ReturnType<typeof setup>) => {
  expect(f.client.sendCustomData).not.toHaveBeenCalled(); expect(f.client.provision).not.toHaveBeenCalled();
  expect(f.client.clearState).not.toHaveBeenCalled();
};
async function bootstrapped() { const f = setup(); await f.read(); await f.write(); return f; }

describe('WiFiProv explicit first-install thin port', () => {
  it('requires every explicit Android capability and every typed native method without fallback', () => {
    expect(supportsFirstInstall(capabilities)).toBe(true);
    for (const key of ['softApProvisioning', 'softApSystemConnectedReadOnly', 'softApSystemConnectedConfigInfoRead', 'softApSystemConnectedFirstInstall']) {
      for (const value of [undefined, false, 'true']) {
        const cap = { ...capabilities, [key]: value } as any, f = setup();
        expect(supportsFirstInstall(cap)).toBe(false);
        expect(() => new WiFiProvFirstInstallPort(f.client, cap, device(), f.current))
          .toThrow('WIFIPROV_SYSTEM_CONNECTED_UNSUPPORTED'); noFallback(f);
      }
    }
    for (const platform of ['web', 'ios']) expect(supportsFirstInstall({ ...capabilities, platform } as any)).toBe(false);
    for (const key of ['readBlinkerConfigInfo', 'bootstrapBlinkerAccess', 'provisionBlinkerWifi']) {
      const f = setup(); expect(() => new WiFiProvFirstInstallPort({ ...f.client, [key]: undefined }, capabilities, device(), f.current))
        .toThrow('WIFIPROV_SYSTEM_CONNECTED_UNSUPPORTED');
    }
  });

  it('validates explicit PoP by exact UTF8 bytes without trimming or deriving it', () => {
    for (const value of ['  fixture-pop  ', 'x'.repeat(64), '温'.repeat(21) + 'a']) expect(assertFirstInstallPoP(value)).toBe(value);
    for (const value of [undefined, null, 1, '', '  ', 'a\0b', 'x'.repeat(65), '温'.repeat(22)]) {
      expect(() => assertFirstInstallPoP(value)).toThrow('WIFIPROV_FIRST_INSTALL_POP_REQUIRED');
    }
  });

  it('reads once, reuses original Bootstrap bytes, then provisions once through only typed native calls', async () => {
    const f = setup(), bytes = bootstrap();
    expect(await f.read()).toEqual(emptyInfo()); expect(f.client.readBlinkerConfigInfo.mock.calls).toEqual([[]]);
    expect(await f.port.request(BLINKER_CONFIG_ENDPOINT, bytes)).toEqual(Uint8Array.of(2, 3, 0));
    expect(f.client.bootstrapBlinkerAccess).toHaveBeenCalledExactlyOnceWith({ deviceInstanceIdHex: '01'.repeat(16), base64: base64(bytes) });
    expect(await f.port.provision({ ssid: ' fixture wifi ', password: 'fixture-password' })).toEqual({ success: true });
    expect(f.client.provisionBlinkerWifi).toHaveBeenCalledExactlyOnceWith({ ssid: ' fixture wifi ', password: 'fixture-password' });
    noFallback(f);
  });

  it('refuses Install, arbitrary endpoint/payload and malformed Bootstrap before native entry', async () => {
    const malformed: Uint8Array[] = [new Uint8Array(45), Uint8Array.of(2, 9), new Uint8Array(1024)];
    for (const change of ['epoch', 'credentialVersion', 'key', 'controller', 'secret', 'version', 'operation']) {
      const bytes = bootstrap();
      if (change === 'epoch') bytes[48] = 2;
      if (change === 'credentialVersion') bytes[68] = 2;
      if (change === 'key') bytes[44] = '='.charCodeAt(0);
      if (change === 'controller') bytes.fill(0, 49, 65);
      if (change === 'secret') bytes.fill(0, 69, 101);
      if (change === 'version') bytes[0] = 1;
      if (change === 'operation') bytes[1] = 2;
      malformed.push(bytes);
    }
    for (const bytes of malformed) {
      const f = setup(); await f.read();
      await expect(f.port.request(BLINKER_CONFIG_ENDPOINT, bytes)).rejects.toMatchObject({ code: 'WIFIPROV_REQUEST_INVALID' });
      expect(f.client.bootstrapBlinkerAccess).not.toHaveBeenCalled(); noFallback(f);
    }
    const f = setup(); await expect(f.port.request('arbitrary', encodeBlinkerConfigInfoRequest())).rejects.toThrow('WIFIPROV_REQUEST_INVALID');
    expect(f.client.readBlinkerConfigInfo).not.toHaveBeenCalled();
  });

  it('requires a prior empty read and ACK, and no later read can rearm consumed attempts', async () => {
    const missing = setup(); await expect(missing.write()).rejects.toThrow('WIFIPROV_REQUEST_INVALID');
    expect(missing.client.bootstrapBlinkerAccess).not.toHaveBeenCalled();
    const noAck = setup(); await noAck.read();
    await expect(noAck.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_REQUEST_INVALID');
    expect(noAck.client.provisionBlinkerWifi).not.toHaveBeenCalled();
    const repeated = await bootstrapped(); await repeated.read();
    await expect(repeated.write()).rejects.toThrow('WIFIPROV_REQUEST_INVALID');
    expect(repeated.client.bootstrapBlinkerAccess).toHaveBeenCalledOnce();
    const done = await bootstrapped(); await done.port.provision({ ssid: 'fixture' });
    await expect(done.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_REQUEST_INVALID');
    expect(done.client.provisionBlinkerWifi).toHaveBeenCalledOnce();
  });

  it('rejects existing/partial roots or a changed instance as UNKNOWN without arming writes', async () => {
    for (const flags of [3, 6, 7]) {
      const f = setup(), bytes = emptyInfo(); bytes[3] = flags; if (flags & 4) bytes[23] = 1;
      f.client.readBlinkerConfigInfo.mockResolvedValueOnce(owned(bytes));
      await expect(f.read()).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
      await expect(f.write()).rejects.toThrow('WIFIPROV_SCOPE_QUARANTINED');
      expect(f.client.bootstrapBlinkerAccess).not.toHaveBeenCalled();
    }
    const changed = setup(); await changed.read(); const next = emptyInfo(); next[4] = 2;
    changed.client.readBlinkerConfigInfo.mockResolvedValueOnce(owned(next));
    await expect(changed.read()).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
  });

  it('returns exact explicit device status bytes and retires instead of falling through to writes', async () => {
    for (const status of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const read = setup(), infoReject = Uint8Array.of(2, 1, status);
      read.client.readBlinkerConfigInfo.mockResolvedValueOnce(owned(infoReject));
      expect(await read.read()).toEqual(infoReject);
      await expect(read.write()).rejects.toThrow('WIFIPROV_SCOPE_QUARANTINED');
      const write = setup(), reject = Uint8Array.of(2, 3, status); await write.read();
      write.client.bootstrapBlinkerAccess.mockResolvedValueOnce(owned(reject)); expect(await write.write()).toEqual(reject);
      await expect(write.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_SCOPE_QUARANTINED');
      expect(write.client.provisionBlinkerWifi).not.toHaveBeenCalled(); noFallback(write);
    }
  });

  it('rejects malformed/foreign Bootstrap responses without retry or a WiFi permit', async () => {
    const cases: any[] = [null, { ...owned(Uint8Array.of(2, 3, 0)), extra: true },
      { ...owned(Uint8Array.of(2, 3, 0)), base64: 'AgMA=' }, owned(Uint8Array.of(2, 3, 9)),
      owned(Uint8Array.of(1, 3, 0)), owned(Uint8Array.of(2, 2, 0)), owned(Uint8Array.of(2, 3, 0, 0)),
      { ...owned(Uint8Array.of(2, 3, 0)), localOwner: { ...owner(), session: '22222222-2222-4222-8222-222222222222' } }];
    for (const response of cases) {
      const f = setup(); await f.read(); f.client.bootstrapBlinkerAccess.mockResolvedValueOnce(response);
      await expect(f.write()).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
      await expect(f.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_SCOPE_QUARANTINED');
      expect(f.client.bootstrapBlinkerAccess).toHaveBeenCalledOnce(); expect(f.client.provisionBlinkerWifi).not.toHaveBeenCalled();
    }
  });

  it('accepts only exact success and the same live owner from native WiFi provisioning', async () => {
    for (const response of [null, { success: false, localOwner: owner() }, { success: true },
      { success: true, localOwner: owner(), ipAddress: '192.0.2.1' },
      { success: true, localOwner: { ...owner(), version: 2 } }]) {
      const f = await bootstrapped(); f.client.provisionBlinkerWifi.mockResolvedValueOnce(response as any);
      await expect(f.port.provision({ ssid: 'fixture' })).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
      expect(f.client.provisionBlinkerWifi).toHaveBeenCalledOnce(); noFallback(f);
    }
  });

  it('preserves the original UNKNOWN object at every native boundary without retry', async () => {
    for (const phase of ['read', 'bootstrap', 'wifi']) {
      const f = setup(), error = Object.assign(Error('fixture original UNKNOWN'), { code: 'PROVISIONING_RESULT_UNKNOWN' });
      if (phase !== 'read') await f.read();
      if (phase === 'wifi') await f.write();
      if (phase === 'read') f.client.readBlinkerConfigInfo.mockRejectedValueOnce(error);
      if (phase === 'bootstrap') f.client.bootstrapBlinkerAccess.mockRejectedValueOnce(error);
      if (phase === 'wifi') f.client.provisionBlinkerWifi.mockRejectedValueOnce(error);
      const work = phase === 'read' ? f.read() : phase === 'bootstrap' ? f.write() : f.port.provision({ ssid: 'fixture' });
      await expect(work).rejects.toBe(error); noFallback(f);
    }
  });

  it.each(['WIFIPROV_WIFI_AUTH_FAILED', 'WIFIPROV_WIFI_NETWORK_NOT_FOUND'])(
    'preserves matched first-install %s but retires before a second WiFi request', async code => {
      const f = await bootstrapped(), error = Object.assign(Error('generic IPC failure message'), { code });
      f.client.provisionBlinkerWifi.mockRejectedValueOnce(error);
      await expect(f.port.provision({ ssid: 'fixture' })).rejects.toBe(error);
      await expect(f.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_SCOPE_QUARANTINED');
      expect(f.client.provisionBlinkerWifi).toHaveBeenCalledOnce(); noFallback(f);
    });

  it.each(['WIFIPROV_WIFI_AUTH_FAILED', 'WIFIPROV_WIFI_NETWORK_NOT_FOUND'])(
    'keeps a late first-install %s after retirement UNKNOWN', async code => {
      const f = await bootstrapped(); let reject!: (error: unknown) => void;
      f.client.provisionBlinkerWifi.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
      const work = f.port.provision({ ssid: 'fixture' }); f.port.retire();
      reject(Object.assign(Error('generic IPC failure message'), { code }));
      await expect(work).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
      expect(f.client.provisionBlinkerWifi).toHaveBeenCalledOnce(); noFallback(f);
    });

  it('serializes the whole port and snapshots outgoing bytes/options before awaiting native', async () => {
    const f = setup(); await f.read(); let ack!: (value: ReturnType<typeof owned>) => void;
    f.client.bootstrapBlinkerAccess.mockReturnValueOnce(new Promise(resolve => { ack = resolve; }));
    const bytes = bootstrap(), expected = base64(bytes), pending = f.port.request(BLINKER_CONFIG_ENDPOINT, bytes); bytes.fill(0);
    expect(f.client.bootstrapBlinkerAccess.mock.calls[0][0].base64).toBe(expected);
    await expect(f.read()).rejects.toThrow('WIFIPROV_OPERATION_BUSY'); ack(owned(Uint8Array.of(2, 3, 0))); await pending;
    let accepted!: (value: { success: boolean; localOwner: ReturnType<typeof owner> }) => void;
    f.client.provisionBlinkerWifi.mockReturnValueOnce(new Promise(resolve => { accepted = resolve; }));
    const options = { ssid: 'fixture', password: 'original' }, wifi = f.port.provision(options); options.password = 'changed';
    expect(f.client.provisionBlinkerWifi.mock.calls[0][0]).toEqual({ ssid: 'fixture', password: 'original' });
    await expect(f.read()).rejects.toThrow('WIFIPROV_OPERATION_BUSY'); accepted({ success: true, localOwner: owner() }); await wifi;
    expect(f.client.readBlinkerConfigInfo).toHaveBeenCalledOnce();
  });

  it('synchronous retirement rejects every late native result without delivering or arming an ACK', async () => {
    for (const phase of ['read', 'bootstrap', 'wifi']) {
      const f = setup(); if (phase !== 'read') await f.read(); if (phase === 'wifi') await f.write();
      let resolve!: (value: any) => void;
      const pending = new Promise<any>(done => { resolve = done; });
      if (phase === 'read') f.client.readBlinkerConfigInfo.mockReturnValueOnce(pending);
      if (phase === 'bootstrap') f.client.bootstrapBlinkerAccess.mockReturnValueOnce(pending);
      if (phase === 'wifi') f.client.provisionBlinkerWifi.mockReturnValueOnce(pending);
      const work = phase === 'read' ? f.read() : phase === 'bootstrap' ? f.write() : f.port.provision({ ssid: 'fixture' });
      f.port.retire(); resolve(phase === 'read' ? owned(emptyInfo()) : phase === 'bootstrap' ? owned(Uint8Array.of(2, 3, 0)) : { success: true, localOwner: owner() });
      await expect(work).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
      await expect(f.port.provision({ ssid: 'fixture' })).rejects.toThrow('WIFIPROV_SCOPE_QUARANTINED'); noFallback(f);
    }
  });

  it('binds the original owner snapshot and treats a late account/generation change as UNKNOWN', async () => {
    const f = setup(); f.selected.localOwner.session = '22222222-2222-4222-8222-222222222222'; await f.read();
    let resolve!: (value: ReturnType<typeof owned>) => void;
    f.client.bootstrapBlinkerAccess.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const work = f.write(); f.retireContext(); resolve(owned(Uint8Array.of(2, 3, 0)));
    await expect(work).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
    expect(f.client.provisionBlinkerWifi).not.toHaveBeenCalled();
    const before = setup(); before.retireContext(); await expect(before.read()).rejects.toBe(before.changed);
    expect(before.client.readBlinkerConfigInfo).not.toHaveBeenCalled();
  });

  it('keeps cancellation after native invocation conservative and never closes/retries on its own', async () => {
    for (const code of ['WIFIPROV_OPERATION_CANCELLED', 'WIFIPROV_SCOPE_QUARANTINED', 'WIFIPROV_CLOSE_UNCONFIRMED']) {
      const f = setup(); await f.read(); f.client.bootstrapBlinkerAccess.mockRejectedValueOnce(Object.assign(Error(code), { code }));
      await expect(f.write()).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' }); noFallback(f);
    }
  });

  it('enforces exact bounded SSID/password options while retaining valid UTF8 and open WiFi', async () => {
    for (const options of [null, { ssid: '' }, { ssid: '  ' }, { ssid: 'a\0b' }, { ssid: '温'.repeat(11) },
      { ssid: 'fixture', password: '密'.repeat(22) }, { ssid: 'fixture', password: 'a\0b' }, { ssid: 'fixture', extra: true }]) {
      const f = await bootstrapped(); await expect(f.port.provision(options as any)).rejects.toThrow('WIFIPROV_REQUEST_INVALID');
      expect(f.client.provisionBlinkerWifi).not.toHaveBeenCalled();
    }
    const bounded = await bootstrapped(), options = { ssid: '温'.repeat(10) + 'ab', password: '密'.repeat(21) + 'a' };
    await bounded.port.provision(options); expect(bounded.client.provisionBlinkerWifi).toHaveBeenCalledExactlyOnceWith(options);
    const open = await bootstrapped(); await open.port.provision({ ssid: 'fixture', password: '' });
    expect(open.client.provisionBlinkerWifi).toHaveBeenCalledExactlyOnceWith({ ssid: 'fixture', password: '' });
  });
});
