import { describe, expect, it, vi } from 'vitest';
import type { WiFiProvTransport } from 'capacitor-wifiprov';
import { protectedWiFiProvManagement, type WiFiProvManagement } from './wifiprov-management-port';

const methods = [
  'createDeviceKeyV2', 'revealDeviceKeyV2', 'rotateDeviceKeyV2', 'resolveDeviceInstanceV2',
  'getDirectAdminV2', 'registerDirectAdminV2', 'resetDirectAdminV2',
  'deleteDeviceV2', 'readDeviceStateV2',
] as const satisfies readonly (keyof WiFiProvManagement)[];

function fixture(transport: WiFiProvTransport | undefined = 'ble') {
  const result = { fixture: 'original-response' }, args = [new Uint8Array([1]), { fixture: 'original-argument' }];
  const source = Object.fromEntries(methods.map(name => [name, vi.fn(async function (this: unknown, ...actual: unknown[]) {
    expect(this).toBe(source); expect(actual[0]).toBe(args[0]); expect(actual[1]).toBe(args[1]); return result;
  })]));
  const assertCurrent = vi.fn();
  const port = protectedWiFiProvManagement(source as unknown as WiFiProvManagement, transport, assertCurrent, async () => undefined);
  const invoke = (name: keyof WiFiProvManagement) => (port[name] as (...values: unknown[]) => Promise<unknown>)(...args);
  return { source, result, args, assertCurrent, invoke, port };
}

describe('WiFiProv Cloud identity management boundary', () => {
  it('invalidates only the previous root after an exact new Cloud key version receipt', async () => {
    const context = { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111', credentialVersion: 1,
      locator: 'AQEBAQEBAQEBAQEBAQEBAQ' };
    const result = { status: 200, data: { ...context, credentialVersion: 2, locator: 'AgICAgICAgICAgICAgICAg' } };
    const source = { rotateDeviceKeyV2: vi.fn(async () => result) } as unknown as WiFiProvManagement;
    const changed = vi.fn(async () => undefined), current = vi.fn();
    const port = protectedWiFiProvManagement(source, 'ble', current, async () => undefined, undefined, changed);
    expect(await port.rotateDeviceKeyV2(context, 'fixture-request')).toBe(result);
    expect(changed).toHaveBeenCalledExactlyOnceWith(context.logicalDeviceId, { cloudCredentialVersion: 1 });
    expect(source.rotateDeviceKeyV2).toHaveBeenCalledExactlyOnceWith(context, 'fixture-request');
  });
  it('retains an unknown RPC and never invalidates from its rejected response', async () => {
    const failure = Error('UNKNOWN');
    const source = { rotateDeviceKeyV2: vi.fn(async () => { throw failure; }) } as unknown as WiFiProvManagement;
    const changed = vi.fn(), port = protectedWiFiProvManagement(source, 'ble', () => undefined,
      async () => undefined, undefined, changed);
    await expect(port.rotateDeviceKeyV2({ logicalDeviceId: 'fixture', credentialVersion: 1, locator: 'fixture' }, 'request')).rejects.toBe(failure);
    expect(changed).not.toHaveBeenCalled();
  });
  it('links a reset receipt to the exact previous epoch/controller, not an ordinary registration/read', async () => {
    const id = 'device_11111111-1111-4111-8111-111111111111';
    const input = { expectedAccessEpoch: 1, expectedControllerId: 'AQEBAQEBAQEBAQEBAQEBAQ', controllerId: 'AgICAgICAgICAgICAgICAg' } as any;
    const result = { logicalDeviceId: id, accessEpoch: 2, credentialVersion: 1, controllerId: input.controllerId };
    const source = { resetDirectAdminV2: vi.fn(async () => result) } as unknown as WiFiProvManagement;
    const changed = vi.fn(async () => undefined), port = protectedWiFiProvManagement(source, 'ble', () => undefined,
      async () => undefined, undefined, changed);
    expect(await port.resetDirectAdminV2(id, input)).toBe(result);
    expect(changed).toHaveBeenCalledExactlyOnceWith(id, { accessEpoch: 1, controllerId: new Uint8Array(16).fill(1) });
  });
  it('AR-3f wraps the actual SoftAP HTTP invocation, not just its preflight', async () => {
    const order: string[] = [], response = { fixture: true };
    const source = { readDeviceStateV2: vi.fn(async () => { order.push('http'); return response; }) } as unknown as WiFiProvManagement;
    const assertCurrent = vi.fn(() => { order.push('current'); });
    const port = protectedWiFiProvManagement(source, 'softap', assertCurrent,
      async () => { order.push('network'); }, async work => {
        order.push('stage-enter'); const value = await work(); order.push('stage-result'); return value;
      });
    expect(await port.readDeviceStateV2('fixture')).toBe(response);
    expect(order).toEqual(['current', 'stage-enter', 'network', 'current', 'http', 'current', 'stage-result']);
    expect(source.readDeviceStateV2).toHaveBeenCalledExactlyOnceWith('fixture');
  });

  it('AR-3f stage refusal cannot consult the network or send the pending request', async () => {
    const f = fixture('softap'), network = vi.fn(async () => undefined), failure = Error('cancelled-stage');
    const port = protectedWiFiProvManagement(f.source as unknown as WiFiProvManagement, 'softap', f.assertCurrent,
      network, async () => { throw failure; });
    await expect(port.readDeviceStateV2('fixture')).rejects.toBe(failure);
    expect(network).not.toHaveBeenCalled();
    expect(f.source['readDeviceStateV2']).not.toHaveBeenCalled();
  });

  it.each(methods)('blocks SoftAP %s before any Cloud request', async name => {
    const f = fixture('softap');
    await expect(f.invoke(name)).rejects.toMatchObject({ code: 'SOFTAP_CLOUD_NETWORK_REQUIRED' });
    expect(f.assertCurrent).toHaveBeenCalledOnce();
    for (const method of Object.values(f.source)) expect(method).not.toHaveBeenCalled();
  });

  it.each(methods)('forwards BLE %s once with the source receiver and exact arguments/result', async name => {
    const f = fixture(); expect(await f.invoke(name)).toBe(f.result);
    expect(f.source[name]).toHaveBeenCalledExactlyOnceWith(...f.args);
    expect(f.assertCurrent).toHaveBeenCalledTimes(3);
  });

  it('captures the selected transport instead of following a later UI change', async () => {
    let selected: WiFiProvTransport = 'softap';
    const f = fixture(selected); selected = 'ble';
    await expect(f.invoke('createDeviceKeyV2')).rejects.toMatchObject({ code: 'SOFTAP_CLOUD_NETWORK_REQUIRED' });
    expect(f.source['createDeviceKeyV2']).not.toHaveBeenCalled(); expect(selected).toBe('ble');
  });

  it.each([undefined, 'invalid' as WiFiProvTransport])('rejects unconfirmed transport %s', async transport => {
    // Explicit undefined is not the fixture's ordinary BLE default.
    const f = fixture();
    const port = protectedWiFiProvManagement(f.source as unknown as WiFiProvManagement, transport, f.assertCurrent, async () => undefined);
    await expect(port.readDeviceStateV2('fixture-only')).rejects.toMatchObject({ code: 'WIFIPROV_TRANSPORT_REQUIRED' });
    expect(f.source['readDeviceStateV2']).not.toHaveBeenCalled();
  });

  it('preserves the original failure without replaying the request', async () => {
    const f = fixture(), error = Object.assign(Error('fixture-unknown'), { code: 'UNKNOWN' });
    f.source['rotateDeviceKeyV2'].mockRejectedValueOnce(error);
    await expect(f.invoke('rotateDeviceKeyV2')).rejects.toBe(error);
    expect(f.source['rotateDeviceKeyV2']).toHaveBeenCalledOnce(); expect(f.assertCurrent).toHaveBeenCalledTimes(2);
  });

  it('rejects a stale account before consulting the transport or calling Cloud', async () => {
    const f = fixture('softap'), error = Error('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
    f.assertCurrent.mockImplementation(() => { throw error; });
    await expect(f.invoke('createDeviceKeyV2')).rejects.toBe(error);
    expect(f.source['createDeviceKeyV2']).not.toHaveBeenCalled();
  });

  it('does not publish a successful response after the account is invalidated', async () => {
    const f = fixture(), error = Error('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
    f.assertCurrent.mockImplementationOnce(() => undefined).mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => { throw error; });
    await expect(f.invoke('revealDeviceKeyV2')).rejects.toBe(error);
    expect(f.source['revealDeviceKeyV2']).toHaveBeenCalledOnce(); expect(f.assertCurrent).toHaveBeenCalledTimes(3);
  });
});
