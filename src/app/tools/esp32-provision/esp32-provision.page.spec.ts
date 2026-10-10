import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';

import { BlinkerConfigOperation } from '../../core/device-v2/provisioning/esp32-wifiprov';
import { Esp32ProvisionPage } from './esp32-provision.page';

describe('Esp32ProvisionPage existing-device flow', () => {
  const logicalDeviceId = 'device_11111111-1111-4111-8111-111111111111';
  const deviceKey = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

  function info(flags = 0x02, accessEpoch = 0): Uint8Array {
    const response = new Uint8Array(24);
    response.set([2, BlinkerConfigOperation.GetInfo, 0, flags]);
    for (let index = 0; index < 16; index += 1) response[4 + index] = index + 1;
    new DataView(response.buffer).setUint32(20, accessEpoch, false);
    return response;
  }

  function harness(reconfigure = true) {
    const management = {
      getDirectAdminV2: vi.fn().mockResolvedValue(null),
      resetDirectAdminV2: vi.fn(async (id: string, value: any) => ({ logicalDeviceId: id,
        accessEpoch: value.expectedAccessEpoch + 1, controllerId: value.controllerId, credentialVersion: 1 })),
      registerDirectAdminV2: vi.fn(async (id: string, controllerId: Uint8Array) => ({
        logicalDeviceId: id, controllerId: btoa(String.fromCharCode(...controllerId)).replace(/=/g, '')
          .replace(/\+/g, '-').replace(/\//g, '_'), accessEpoch: 1, credentialVersion: 1,
      })),
      createDeviceKeyV2: vi.fn(),
      readDeviceStateV2: vi.fn().mockResolvedValue('active'),
      deleteDeviceV2: vi.fn().mockResolvedValue({ status: 200, data: { logicalDeviceId, state: 'deleted' } }),
      revealDeviceKeyV2: vi.fn(async (context: any) => ({ status: 200, data: { ...context, deviceKey } })),
      rotateDeviceKeyV2: vi.fn(),
      enableDeviceCloudV2: vi.fn(),
      resolveDeviceInstanceV2: vi.fn().mockResolvedValue({
        status: 200,
        data: { device: null },
      }),
    };
    const data = {
      auth: { uuid: 'owner' }, sessionEpoch: 1,
      getDevice: vi.fn(() => ({
        logicalDeviceId,
        credentialVersion: 1,
        locator: 'AQEBAQEBAQEBAQEBAQEBAQ',
        config: { customName: 'Hybrid light', isShared: false },
      })),
    };
    const route = {
      snapshot: {
        queryParamMap: {
          get: (name: string) => ({
            ...(reconfigure ? { mode: 'reconfigure', logicalDeviceId } : {}),
          } as Record<string, string>)[name] ?? null,
        },
      },
    };
    const nav = { navigateRoot: vi.fn().mockResolvedValue(true) };
    const deviceUi = { startDirectHandoff: vi.fn().mockResolvedValue(undefined) };
    const alert = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm' }),
    };
    const alerts = { create: vi.fn().mockResolvedValue(alert) };
    const page = new Esp32ProvisionPage(
      { run: (callback: () => void) => callback() } as any,
      { detectChanges: vi.fn() } as any,
      { create: vi.fn() } as any,
      management as any,
      { getAllInfo: vi.fn().mockResolvedValue(true) } as any,
      data as any,
      deviceUi as any,
      route as any,
      nav as any,
      alerts as any,
    );
    const requests: Uint8Array[] = [];
    (page as any).provisioningTransport = {
      request: vi.fn(async (_endpoint: string, payload: Uint8Array) => {
        requests.push(payload.slice());
        if (payload[1] === BlinkerConfigOperation.GetInfo) return info();
        if (payload[1] === BlinkerConfigOperation.Bootstrap) {
          return Uint8Array.of(2, BlinkerConfigOperation.Bootstrap, 0);
        }
        throw new Error('unexpected-operation');
      }),
    };
    let stored: any;
    const copy = (value: any) => value && { ...value, deviceInstanceId: value.deviceInstanceId.slice(),
      controllerId: value.controllerId.slice(), controllerSecret: value.controllerSecret.slice(),
      intentId: value.intentId.slice(), commitId: value.commitId.slice(), receipt: value.receipt.slice() };
    const credentials = {
      save: vi.fn(async (value: any) => { stored = copy(value); }),
      load: vi.fn(async () => copy(stored)),
      remove: vi.fn(async () => { stored = undefined; }),
      findWiFiProv: vi.fn().mockResolvedValue(undefined),
    };
    (page as any).controllerCredentials = credentials;
    let journal: any;
    const allocations = {
      findDevice: vi.fn(async (_id: string) => journal?.context?.logicalDeviceId === _id ? info().slice(4, 20) : undefined),
      load: vi.fn(async (_instance: Uint8Array) => journal && JSON.parse(JSON.stringify(journal))),
      prepare: vi.fn(async (_instance: Uint8Array, name: string) => {
        journal ??= { requestId: 'wifiprov-' + '01'.repeat(16), name: name.trim() };
        return JSON.parse(JSON.stringify(journal));
      }),
      bind: vi.fn(async (_instance: Uint8Array, requestId: string, context: any) => {
        if (journal?.requestId !== requestId) throw Error('JOURNAL_CONFLICT');
        journal = { ...journal, context: { ...context } };
      }),
      complete: vi.fn(async (_instance: Uint8Array, id: string) => {
        if (journal && journal.context?.logicalDeviceId !== id) throw Error('JOURNAL_CONFLICT');
        journal = undefined;
      }),
    };
    (page as any).allocationStore = allocations;
    (page as any).selectedDevice = { id: 'android:AA:BB', connected: true };
    return { page, management, credentials, allocations, requests, nav, alerts, deviceUi, data };
  }

  const newDeviceResponse = () => ({ status: 201, data: { replayed: false, device: {
    logicalDeviceId, credentialVersion: 1, locator: 'AQEBAQEBAQEBAQEBAQEBAQ', state: 'active', deviceType: 'diy',
  } } });

  it('re-enters after explicit removal with an empty root, retires only old recovery and creates a new device', async () => {
    const first = harness(false); first.management.createDeviceKeyV2.mockResolvedValue(newDeviceResponse());
    await (first.page as any).installBlinkerIdentity();
    const next = harness(false);
    (next.page as any).allocationStore = first.allocations;
    (next.page as any).controllerCredentials = first.credentials;
    next.management.readDeviceStateV2.mockResolvedValue('deleted');
    const newId = 'device_22222222-2222-4222-8222-222222222222';
    next.management.createDeviceKeyV2.mockResolvedValue({ ...newDeviceResponse(), data: { device: {
      ...newDeviceResponse().data.device, logicalDeviceId: newId,
    } } });
    await (next.page as any).installBlinkerIdentity();
    expect(next.alerts.create).toHaveBeenCalledWith(expect.objectContaining({ header: '原设备已移除' }));
    expect(next.management.deleteDeviceV2).toHaveBeenCalledExactlyOnceWith(logicalDeviceId);
    expect(first.credentials.remove).toHaveBeenCalledExactlyOnceWith(logicalDeviceId);
    expect(first.allocations.complete).toHaveBeenCalledExactlyOnceWith(info().slice(4, 20), logicalDeviceId);
    expect(next.management.createDeviceKeyV2).toHaveBeenCalledOnce();
    expect(next.management.rotateDeviceKeyV2).not.toHaveBeenCalled();
    expect((next.page as any).allocation.logicalDeviceId).toBe(newId);
  });

  it.each(['create-response', 'reveal', 'pending-save'])('resumes first provisioning after %s loss on a new page', async failure => {
    const first = harness(false);
    first.management.createDeviceKeyV2.mockResolvedValue(newDeviceResponse());
    if (failure === 'create-response') first.management.createDeviceKeyV2.mockRejectedValueOnce(Error('lost'));
    if (failure === 'reveal') first.management.revealDeviceKeyV2.mockRejectedValueOnce(Error('lost'));
    if (failure === 'pending-save') first.credentials.save.mockRejectedValueOnce(Error('lost'));
    await expect((first.page as any).installBlinkerIdentity()).rejects.toThrow('lost');
    expect(first.requests.every(request => request[1] === BlinkerConfigOperation.GetInfo)).toBe(true);
    const second = harness(false);
    (second.page as any).allocationStore = first.allocations;
    (second.page as any).deviceManagement = first.management;
    second.page.blinkerDeviceName = 'Changed after restart';
    await (second.page as any).installBlinkerIdentity();
    expect(first.management.createDeviceKeyV2).toHaveBeenCalledTimes(failure === 'create-response' ? 2 : 1);
    if (failure === 'create-response') expect(first.management.createDeviceKeyV2.mock.calls[0])
      .toEqual(first.management.createDeviceKeyV2.mock.calls[1]);
    expect(first.management.rotateDeviceKeyV2).not.toHaveBeenCalled();
    expect(second.credentials.save).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'active', logicalDeviceId }));
    expect(first.allocations.complete).not.toHaveBeenCalled();
    expect(second.requests.filter(request => request[1] === BlinkerConfigOperation.Bootstrap)).toHaveLength(1);
  });

  it('hands recovered pending Admin to the existing coordinator without reallocating or rotating', async () => {
    const first = harness(false); first.management.createDeviceKeyV2.mockResolvedValue(newDeviceResponse());
    first.management.registerDirectAdminV2.mockRejectedValueOnce(Error('response lost'));
    await expect((first.page as any).installBlinkerIdentity()).rejects.toThrow('response lost');
    const second = harness(false);
    (second.page as any).allocationStore = first.allocations;
    (second.page as any).controllerCredentials = first.credentials;
    (second.page as any).deviceManagement = first.management;
    first.credentials.findWiFiProv.mockImplementation(async () => first.credentials.load());
    await (second.page as any).installBlinkerIdentity();
    expect(first.management.createDeviceKeyV2).toHaveBeenCalledOnce();
    expect(first.management.rotateDeviceKeyV2).not.toHaveBeenCalled();
    expect(first.management.registerDirectAdminV2.mock.calls[0][1]).toEqual(first.management.registerDirectAdminV2.mock.calls[1][1]);
    expect(first.allocations.complete).not.toHaveBeenCalled();
  });

  it('does not repeat Bootstrap when post-association journal cleanup fails', async () => {
    const h = harness(false); h.management.createDeviceKeyV2.mockResolvedValue(newDeviceResponse());
    await (h.page as any).installBlinkerIdentity();
    vi.spyOn(h.page as any, 'releasePlugin').mockResolvedValue(undefined);
    h.management.resolveDeviceInstanceV2.mockResolvedValue({ status: 200, data: { device: { logicalDeviceId } } });
    h.allocations.complete.mockRejectedValueOnce(Error('cleanup disk'));
    await h.page.openProvisionedDevice();
    expect(h.nav.navigateRoot).toHaveBeenCalled();
    expect(await h.allocations.load(new Uint8Array(16).fill(1))).toBeDefined();
    expect((h.page as any).allocation.deviceKey).toBe('');
    (h.page as any).provisioningTransport.request = vi.fn(async () => info(0x07, 1));
    await (h.page as any).installBlinkerIdentity();
    await h.page.openProvisionedDevice();
    expect(h.management.createDeviceKeyV2).toHaveBeenCalledOnce();
    expect(h.requests.filter(request => request[1] === BlinkerConfigOperation.Bootstrap)).toHaveLength(1);
    expect(h.allocations.complete).toHaveBeenCalledTimes(2);
  });

  it.each(['resume', 'lookup-error', 'ambiguous', 'epoch-mismatch', 'revoked'])(
    'recovers installed WiFiProv before its first cloud session: %s', async scenario => {
      const first = harness(false);
      first.management.createDeviceKeyV2.mockResolvedValue(newDeviceResponse());
      await (first.page as any).installBlinkerIdentity();
      const next = harness(false);
      (next.page as any).deviceManagement = first.management;
      (next.page as any).controllerCredentials = first.credentials;
      (next.page as any).allocationStore = first.allocations;
      (next.page as any).provisioningTransport.request = vi.fn(async (_endpoint, payload) => {
        next.requests.push(payload.slice());
        return info(7, scenario === 'epoch-mismatch' ? 2 : 1);
      });
      first.credentials.findWiFiProv.mockImplementation(async () => first.credentials.load());
      first.management.createDeviceKeyV2.mockClear();
      first.management.registerDirectAdminV2.mockClear();
      if (scenario === 'lookup-error') first.management.resolveDeviceInstanceV2.mockRejectedValue(Error('lookup failed'));
      if (scenario === 'ambiguous') {
        first.allocations.load.mockResolvedValue(undefined);
        first.credentials.findWiFiProv.mockRejectedValue(Error('BLE_DIRECT_PENDING_AMBIGUOUS'));
      } else first.credentials.findWiFiProv.mockRejectedValue(Error('Historical records must not be guessed'));
      if (scenario === 'revoked') first.management.revealDeviceKeyV2.mockRejectedValue(Error('revoked'));
      if (scenario === 'resume') {
        await (next.page as any).installBlinkerIdentity();
        expect((next.page as any).allocation).toMatchObject({ logicalDeviceId, accessEpoch: 1, deviceKey: '', preserveAccess: true });
        expect(first.management.registerDirectAdminV2).toHaveBeenCalledOnce();
      } else {
        await expect((next.page as any).installBlinkerIdentity()).rejects.toThrow();
        expect(first.management.registerDirectAdminV2).not.toHaveBeenCalled();
      }
      expect(first.management.createDeviceKeyV2).not.toHaveBeenCalled();
      expect(first.management.rotateDeviceKeyV2).not.toHaveBeenCalled();
      expect(first.management.enableDeviceCloudV2).not.toHaveBeenCalled();
      expect(next.requests.map(value => value[1])).toEqual([BlinkerConfigOperation.GetInfo]);
      if (scenario === 'lookup-error') expect(first.credentials.findWiFiProv).toHaveBeenCalledTimes(1); // Initial empty-root search only.
    },
  );

  it('does not create or install after the first allocation journal write fails', async () => {
    const h = harness(false); h.allocations.prepare.mockRejectedValueOnce(Error('disk'));
    await expect((h.page as any).installBlinkerIdentity()).rejects.toThrow('disk');
    expect(h.management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(h.management.registerDirectAdminV2).not.toHaveBeenCalled();
    expect(h.requests).toHaveLength(1);
  });

  it('keeps the exact recovery ID while cloud association is absent, then clears after confirmation', async () => {
    const h = harness(false); h.management.createDeviceKeyV2.mockResolvedValue(newDeviceResponse());
    await (h.page as any).installBlinkerIdentity();
    vi.spyOn(h.page as any, 'releasePlugin').mockResolvedValue(undefined);
    await h.page.openProvisionedDevice();
    expect(h.allocations.complete).not.toHaveBeenCalled();
    expect(h.nav.navigateRoot).toHaveBeenCalled();
    expect(await h.allocations.load(new Uint8Array(16).fill(1))).toMatchObject({ context: { logicalDeviceId } });
    h.management.resolveDeviceInstanceV2.mockResolvedValue({ status: 200, data: { device: { logicalDeviceId } } });
    await h.page.openProvisionedDevice();
    expect(h.allocations.complete).toHaveBeenCalledOnce();
    expect(await h.allocations.load(new Uint8Array(16).fill(1))).toBeUndefined();
  });

  it('does not select a different server identity over an unfinished first allocation', async () => {
    const first = harness(false); first.management.createDeviceKeyV2.mockResolvedValue(newDeviceResponse());
    await (first.page as any).installBlinkerIdentity();
    const next = harness(false);
    (next.page as any).allocationStore = first.allocations;
    (next.page as any).provisioningTransport.request = vi.fn().mockResolvedValue(info(7, 1));
    next.management.resolveDeviceInstanceV2.mockResolvedValue({ status: 200, data: { device: { logicalDeviceId: 'device_22222222-2222-4222-8222-222222222222' } } });
    await expect((next.page as any).installBlinkerIdentity()).rejects.toThrow('WIFIPROV_ALLOCATION_CONFLICT');
    expect(next.credentials.load).not.toHaveBeenCalled();
    expect(next.management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(first.allocations.complete).not.toHaveBeenCalled();
  });

  it('rotates the original logical device only after reset was verified', async () => {
    const { page, management, credentials, requests } = harness();
    management.rotateDeviceKeyV2.mockResolvedValue({
      status: 200,
      data: { logicalDeviceId, credentialVersion: 2, locator: 'AgICAgICAgICAgICAgICAg', deviceKey },
    });
    expect((page as any).loadReconfigureContext()).toBe(true);

    await (page as any).installBlinkerIdentity();

    expect(management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(management.rotateDeviceKeyV2).toHaveBeenCalledWith(
      { logicalDeviceId, credentialVersion: 1, locator: 'AQEBAQEBAQEBAQEBAQEBAQ' },
      expect.stringMatching(/^wifiprov-/),
    );
    expect(requests.map(request => request[1])).toEqual([
      BlinkerConfigOperation.GetInfo,
      BlinkerConfigOperation.GetInfo,
      BlinkerConfigOperation.Bootstrap,
    ]);
    expect(credentials.save).toHaveBeenCalledWith(expect.objectContaining({
      logicalDeviceId,
      source: 'wifiprov',
      state: 'active',
    }));
  });

  it('keeps the rotate request id stable across an ambiguous timeout retry', async () => {
    const { page, management } = harness();
    management.rotateDeviceKeyV2
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        status: 200,
        data: { logicalDeviceId, credentialVersion: 2, locator: 'AgICAgICAgICAgICAgICAg', deviceKey },
      });
    expect((page as any).loadReconfigureContext()).toBe(true);

    await expect((page as any).installBlinkerIdentity()).rejects.toThrow('timeout');
    await (page as any).installBlinkerIdentity();

    expect(management.rotateDeviceKeyV2).toHaveBeenCalledTimes(2);
    expect(management.rotateDeviceKeyV2.mock.calls[0][1]).toBe(
      management.rotateDeviceKeyV2.mock.calls[1][1],
    );
  });

  it('rejects malformed existing Admin metadata before rotating Key or overwriting the secure checkpoint', async () => {
    const { page, management, credentials, requests } = harness();
    management.getDirectAdminV2.mockResolvedValue({ accessEpoch: 1 });
    expect((page as any).loadReconfigureContext()).toBe(true);
    await expect((page as any).installBlinkerIdentity()).rejects.toThrow('EPOCH_CONFLICT');
    expect(management.rotateDeviceKeyV2).not.toHaveBeenCalled();
    expect(credentials.save).not.toHaveBeenCalled();
    expect(requests.map(request => request[1])).toEqual([BlinkerConfigOperation.GetInfo]);
  });

  it('reconfigures a registered Admin through PATCH and keeps the actual new epoch for network retries', async () => {
    const { page, management, credentials, requests } = harness();
    management.getDirectAdminV2.mockResolvedValue({ logicalDeviceId, accessEpoch: 7, credentialVersion: 1,
      controllerId: 'AQEBAQEBAQEBAQEBAQEBAQ' });
    management.rotateDeviceKeyV2.mockResolvedValue({ status: 200,
      data: { logicalDeviceId, credentialVersion: 2, locator: 'AgICAgICAgICAgICAgICAg', deviceKey } });
    expect((page as any).loadReconfigureContext()).toBe(true);
    await (page as any).installBlinkerIdentity();
    expect(management.resetDirectAdminV2).toHaveBeenCalledTimes(1);
    expect(management.registerDirectAdminV2).not.toHaveBeenCalled();
    expect(management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect((page as any).allocation).toMatchObject({ logicalDeviceId, accessEpoch: 8, deviceKey: '', preserveAccess: true });
    expect(credentials.save.mock.calls[0][0]).toMatchObject({ state: 'pending',
      keyRotation: expect.objectContaining({ phase: 'prepared', expectedAdmin: expect.objectContaining({ accessEpoch: 7 }) }) });
    (page as any).provisioningTransport.request = vi.fn().mockResolvedValue(info(7, 8));
    await (page as any).installBlinkerIdentity();
    expect(management.rotateDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(requests.map(value => value[1])).toEqual([BlinkerConfigOperation.GetInfo,
      BlinkerConfigOperation.GetInfo, BlinkerConfigOperation.Bootstrap]);
  });

  it('a new reconfigure page resumes prepared rotation after an ambiguous response with the same request id', async () => {
    const first = harness();
    first.management.rotateDeviceKeyV2.mockRejectedValueOnce(Error('lost'));
    expect((first.page as any).loadReconfigureContext()).toBe(true);
    await expect((first.page as any).installBlinkerIdentity()).rejects.toThrow('lost');
    const next = harness();
    (next.page as any).controllerCredentials = first.credentials;
    (next.page as any).deviceManagement = first.management;
    first.management.rotateDeviceKeyV2.mockResolvedValueOnce({ status: 200,
      data: { logicalDeviceId, credentialVersion: 2, locator: 'AgICAgICAgICAgICAgICAg', deviceKey } });
    expect((next.page as any).loadReconfigureContext()).toBe(true);
    await (next.page as any).installBlinkerIdentity();
    expect(first.management.rotateDeviceKeyV2.mock.calls[1]).toEqual(first.management.rotateDeviceKeyV2.mock.calls[0]);
    expect(first.management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect((next.page as any).allocation.accessEpoch).toBe(1);
  });

  it('a recreated add-device page resumes the pending Bootstrap without create or rotate', async () => {
    const { page, management, credentials, requests } = harness(false);
    const locator = 'AQEBAQEBAQEBAQEBAQEBAQ';
    credentials.findWiFiProv.mockResolvedValue({ source: 'wifiprov', state: 'pending', logicalDeviceId,
      deviceInstanceId: Uint8Array.from({ length: 16 }, (_, index) => index + 1), accessEpoch: 1,
      controllerId: new Uint8Array(16).fill(3), controllerSecret: new Uint8Array(32).fill(4),
      credentialVersion: 1, permissions: 15, cloudContext: { credentialVersion: 2, locator },
      intentId: new Uint8Array(), commitId: new Uint8Array(), receipt: new Uint8Array(),
    });
    management.revealDeviceKeyV2.mockResolvedValue({ status: 200,
      data: { logicalDeviceId, credentialVersion: 2, locator, deviceKey } });
    await (page as any).installBlinkerIdentity();
    expect(management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(management.rotateDeviceKeyV2).not.toHaveBeenCalled();
    expect(requests.map(request => request[1])).toEqual([BlinkerConfigOperation.GetInfo, BlinkerConfigOperation.Bootstrap]);
    expect(credentials.save).toHaveBeenCalledWith(expect.objectContaining({ state: 'active', logicalDeviceId }));
    expect((page as any).allocation.deviceKey).toBe('');
    expect((page as any).allocation.controllerSecret).toBeUndefined();
  });

  it('does not reuse a cached success if the device is reset before WiFi is retried', async () => {
    const { page, management } = harness();
    management.rotateDeviceKeyV2.mockResolvedValue({ status: 200,
      data: { logicalDeviceId, credentialVersion: 2, locator: 'AgICAgICAgICAgICAgICAg', deviceKey } });
    expect((page as any).loadReconfigureContext()).toBe(true);
    await (page as any).installBlinkerIdentity();
    await expect((page as any).installBlinkerIdentity()).rejects.toThrow('接入根已变化');
    expect(management.rotateDeviceKeyV2).toHaveBeenCalledTimes(1);
  });

  it('does not install identity after an account change during Key rotation', async () => {
    const { page, management, credentials, requests, data } = harness();
    expect((page as any).loadReconfigureContext()).toBe(true);
    management.rotateDeviceKeyV2.mockImplementation(async () => {
      data.auth.uuid = 'other'; data.sessionEpoch++;
      return { data: { logicalDeviceId, credentialVersion: 2, locator: 'AgICAgICAgICAgICAgICAg', deviceKey } };
    });
    await expect((page as any).installBlinkerIdentity()).rejects.toThrow('CONTEXT_CHANGED');
    expect(credentials.save).toHaveBeenCalledTimes(1);
    expect(credentials.save).toHaveBeenCalledWith(expect.objectContaining({ state: 'pending',
      keyRotation: expect.objectContaining({ phase: 'prepared' }) }));
    expect(management.registerDirectAdminV2).not.toHaveBeenCalled();
    expect(requests.map(request => request[1])).toEqual([BlinkerConfigOperation.GetInfo]);
  });

  it('installs only DeviceKey and removes stale Direct state for a Cloud-only product', async () => {
    const { page, management, credentials, requests } = harness();
    (page as any).provisioningTransport.request = vi.fn(
      async (_endpoint: string, payload: Uint8Array) => {
        requests.push(payload.slice());
        if (payload[1] === BlinkerConfigOperation.GetInfo) return info(0);
        if (payload[1] === BlinkerConfigOperation.Install) {
          return Uint8Array.of(2, BlinkerConfigOperation.Install, 0);
        }
        throw new Error('unexpected-operation');
      },
    );
    management.rotateDeviceKeyV2.mockResolvedValue({
      status: 200,
      data: { logicalDeviceId, credentialVersion: 2, locator: 'AgICAgICAgICAgICAgICAg', deviceKey },
    });
    expect((page as any).loadReconfigureContext()).toBe(true);

    await (page as any).installBlinkerIdentity();

    expect(requests.map(request => request[1])).toEqual([
      BlinkerConfigOperation.GetInfo,
      BlinkerConfigOperation.Install,
    ]);
    expect(credentials.save).not.toHaveBeenCalled();
    expect(credentials.remove).toHaveBeenCalledWith(logicalDeviceId);
    expect((page as any).allocation.preserveAccess).toBe(false);
    expect((page as any).allocation.controllerSecret).toBeUndefined();
  });

  it('reuses the exact installed identity for a network-only reset', async () => {
    const { page, management, requests } = harness();
    (page as any).provisioningTransport.request = vi.fn(
      async (_endpoint: string, payload: Uint8Array) => {
        requests.push(payload.slice());
        return info(0x01);
      },
    );
    management.resolveDeviceInstanceV2.mockResolvedValue({
      status: 200,
      data: {
        device: {
          logicalDeviceId,
          name: 'Hybrid light',
          credentialVersion: 1,
          locator: 'AQEBAQEBAQEBAQEBAQEBAQ',
        },
      },
    });
    expect((page as any).loadReconfigureContext()).toBe(true);

    await (page as any).installBlinkerIdentity();

    expect(management.rotateDeviceKeyV2).not.toHaveBeenCalled();
    expect(requests.map(request => request[1])).toEqual([
      BlinkerConfigOperation.GetInfo,
    ]);
    expect((page as any).allocation).toEqual(expect.objectContaining({
      logicalDeviceId,
      deviceKey: '',
      preserveAccess: false,
      credentialStored: true,
    }));
  });

  it('preserves the matching Direct credential during a network-only reset', async () => {
    const { page, management, credentials, requests } = harness();
    const deviceInstanceId = Uint8Array.from(
      { length: 16 },
      (_, index) => index + 1,
    );
    (page as any).provisioningTransport.request = vi.fn(
      async (_endpoint: string, payload: Uint8Array) => {
        requests.push(payload.slice());
        return info(0x07, 7);
      },
    );
    management.resolveDeviceInstanceV2.mockResolvedValue({
      status: 200,
      data: {
        device: {
          logicalDeviceId,
          name: 'Hybrid light',
          credentialVersion: 1,
          locator: 'AQEBAQEBAQEBAQEBAQEBAQ',
        },
      },
    });
    credentials.load.mockResolvedValue({
      source: 'wifiprov',
      state: 'active',
      logicalDeviceId,
      deviceInstanceId,
      accessEpoch: 7,
      controllerId: new Uint8Array(16).fill(0x21),
      controllerSecret: new Uint8Array(32).fill(0x22),
      credentialVersion: 1,
      permissions: 0x0f,
      intentId: new Uint8Array(16).fill(0x23),
      commitId: new Uint8Array(16).fill(0x24),
      receipt: Uint8Array.of(1),
    });
    expect((page as any).loadReconfigureContext()).toBe(true);

    await (page as any).installBlinkerIdentity();

    expect(management.rotateDeviceKeyV2).not.toHaveBeenCalled();
    expect(credentials.remove).not.toHaveBeenCalled();
    expect(requests.map(request => request[1])).toEqual([
      BlinkerConfigOperation.GetInfo,
    ]);
    expect((page as any).allocation).toEqual(expect.objectContaining({
      logicalDeviceId,
      preserveAccess: true,
      accessEpoch: 7,
      credentialStored: true,
    }));
  });

  it('rejects a different physical device during network-only reconfiguration', async () => {
    const { page, management } = harness();
    (page as any).provisioningTransport.request = vi.fn().mockResolvedValue(info(0x01));
    management.resolveDeviceInstanceV2.mockResolvedValue({
      status: 200,
      data: {
        device: {
          logicalDeviceId: 'device_other',
          name: 'Other device',
          credentialVersion: 1,
          locator: 'AQEBAQEBAQEBAQEBAQEBAQ',
        },
      },
    });
    expect((page as any).loadReconfigureContext()).toBe(true);

    await expect((page as any).installBlinkerIdentity()).rejects.toThrow(
      '不是当前重新配网的原设备',
    );
    expect(management.rotateDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('releases the provisioning transport before opening the device page', async () => {
    const { page, nav, deviceUi } = harness();
    const order: string[] = [];
    (page as any).allocation = { logicalDeviceId };
    vi.spyOn(page as any, 'releasePlugin').mockImplementation(async () => {
      order.push('release');
    });
    nav.navigateRoot.mockImplementation(async () => {
      order.push('navigate');
      return true;
    });
    deviceUi.startDirectHandoff.mockImplementation(() => {
      order.push('handoff');
      return Promise.resolve();
    });

    await page.openProvisionedDevice();

    expect(order).toEqual(['release', 'handoff', 'navigate']);
  });

  it('reuses an activated owned device from the add-device entry', async () => {
    const { page, management, alerts } = harness(false);
    management.resolveDeviceInstanceV2.mockResolvedValue({
      status: 200,
      data: {
        device: {
          logicalDeviceId,
          tenantId: 'tenant-1',
          name: 'Existing hybrid',
          deviceType: 'diy',
          state: 'active',
          credentialVersion: 1,
          locator: 'AQEBAQEBAQEBAQEBAQEBAQ',
          createdAt: 1,
          updatedAt: 2,
        },
      },
    });
    management.rotateDeviceKeyV2.mockResolvedValue({
      status: 200,
      data: { logicalDeviceId, credentialVersion: 2, locator: 'AgICAgICAgICAgICAgICAg', deviceKey },
    });

    await (page as any).installBlinkerIdentity();

    expect(alerts.create).toHaveBeenCalledOnce();
    expect(management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(management.rotateDeviceKeyV2).toHaveBeenCalledWith(
      { logicalDeviceId, credentialVersion: 1, locator: 'AQEBAQEBAQEBAQEBAQEBAQ' },
      expect.stringMatching(/^wifiprov-/),
    );
  });

  it.each([0x06, 0x07])(
    'enables Wi-Fi on the same BLE identity without replacing direct access (flags %i)',
    async (flags) => {
      const { page, management, credentials, requests } = harness(false);
      // A retired WiFiProv checkpoint for this instance must never win over
      // the current BLE identity. Nor should this operation delete that cache.
      credentials.findWiFiProv.mockRejectedValue(Error('unscoped retired checkpoint selected'));
      const deviceInstanceId = Uint8Array.from(
        { length: 16 },
        (_, index) => index + 1,
      );
      (page as any).provisioningTransport.request = vi.fn(
        async (_endpoint: string, payload: Uint8Array) => {
          requests.push(payload.slice());
          if (payload[1] === BlinkerConfigOperation.GetInfo) return info(flags, 7);
          if (payload[1] === BlinkerConfigOperation.Install) {
            return Uint8Array.of(2, BlinkerConfigOperation.Install, 0);
          }
          throw new Error('unexpected-operation');
        },
      );
      management.resolveDeviceInstanceV2.mockResolvedValue({
        status: 200,
        data: {
          device: {
            logicalDeviceId,
            tenantId: 'tenant-1',
            name: 'Existing BLE light',
            deviceType: 'ble',
            state: 'active',
            credentialVersion: null,
            locator: null,
            createdAt: 1,
            updatedAt: 2,
          },
        },
      });
      management.enableDeviceCloudV2.mockResolvedValue({
        status: 200,
        data: {
          logicalDeviceId,
          credentialVersion: 1,
          locator: 'AQEBAQEBAQEBAQEBAQEBAQ',
          deviceKey,
          replayed: flags === 0x07,
        },
      });
      credentials.load.mockResolvedValue({
        source: 'enrollment',
        state: 'active',
        logicalDeviceId,
        deviceInstanceId,
        accessEpoch: 7,
        controllerId: new Uint8Array(16).fill(0x21),
        controllerSecret: new Uint8Array(32).fill(0x22),
        credentialVersion: 1,
        permissions: 0x0f,
        intentId: new Uint8Array(16).fill(0x23),
        commitId: new Uint8Array(16).fill(0x24),
        receipt: Uint8Array.of(1),
      });

      await (page as any).installBlinkerIdentity();

      expect(management.createDeviceKeyV2).not.toHaveBeenCalled();
      expect(management.rotateDeviceKeyV2).not.toHaveBeenCalled();
      expect(management.enableDeviceCloudV2).toHaveBeenCalledWith(deviceInstanceId);
      expect(credentials.findWiFiProv).not.toHaveBeenCalled();
      expect(credentials.load).toHaveBeenCalledWith(logicalDeviceId);
      expect(credentials.save).not.toHaveBeenCalled();
      expect(credentials.remove).not.toHaveBeenCalled();
      expect(requests.map(request => request[1])).toEqual([
        BlinkerConfigOperation.GetInfo,
        BlinkerConfigOperation.Install,
      ]);
      expect((page as any).allocation.logicalDeviceId).toBe(logicalDeviceId);
      expect((page as any).allocation.preserveAccess).toBe(true);
    },
  );

  it.each(['absent', 'offline', 'account-change'])('does not fall back to cached authority when instance resolution is %s', async failure => {
    const { page, management, credentials, data } = harness(false);
    (page as any).provisioningTransport.request = vi.fn().mockResolvedValue(info(6, 7));
    if (failure === 'offline') management.resolveDeviceInstanceV2.mockRejectedValue(Error('offline'));
    if (failure === 'account-change') management.resolveDeviceInstanceV2.mockImplementation(async () => {
      data.sessionEpoch++;
      return { status: 200, data: { device: { logicalDeviceId } } };
    });
    await expect((page as any).installBlinkerIdentity()).rejects.toThrow();
    expect(credentials.findWiFiProv).not.toHaveBeenCalled();
    expect(credentials.load).not.toHaveBeenCalled();
    expect(credentials.remove).not.toHaveBeenCalled();
    expect(management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(management.enableDeviceCloudV2).not.toHaveBeenCalled();
    expect(management.rotateDeviceKeyV2).not.toHaveBeenCalled();
    expect((page as any).provisioningTransport.request).toHaveBeenCalledOnce();
  });

  it('still rejects an epoch mismatch in the exact resolved checkpoint without deleting or replacing it', async () => {
    const { page, management, credentials } = harness(false);
    (page as any).provisioningTransport.request = vi.fn().mockResolvedValue(info(7, 7));
    management.resolveDeviceInstanceV2.mockResolvedValue({ status: 200, data: { device: { logicalDeviceId } } });
    credentials.load.mockResolvedValue({ source: 'wifiprov', state: 'pending', logicalDeviceId,
      deviceInstanceId: Uint8Array.from({ length: 16 }, (_, i) => i + 1), accessEpoch: 8,
      cloudContext: { credentialVersion: 1, locator: 'AQEBAQEBAQEBAQEBAQEBAQ' },
      controllerId: new Uint8Array(16).fill(3), controllerSecret: new Uint8Array(32).fill(4),
    });
    await expect((page as any).installBlinkerIdentity()).rejects.toThrow('CHECKPOINT_DEVICE_MISMATCH');
    expect(credentials.findWiFiProv).not.toHaveBeenCalled();
    expect(credentials.remove).not.toHaveBeenCalled();
    expect(credentials.save).not.toHaveBeenCalled();
    expect(management.revealDeviceKeyV2).not.toHaveBeenCalled();
    expect(management.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(management.rotateDeviceKeyV2).not.toHaveBeenCalled();
    expect(management.enableDeviceCloudV2).not.toHaveBeenCalled();
    expect((page as any).provisioningTransport.request).toHaveBeenCalledOnce();
  });
});
