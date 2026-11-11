import { BleControllerCredential } from '../ble-direct/credential-store';
import { base64UrlEncode } from '../ble-direct/wire';
import { BlinkerConfigInfo, BlinkerConfigOperation } from './esp32-wifiprov';
import { WiFiProvAdmin } from './wifiprov-admin';

describe('WiFiProv Admin durable first install', () => {
  const context = { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111',
    credentialVersion: 1, locator: 'AQEBAQEBAQEBAQEBAQEBAQ',
    deviceKey: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8' };
  const info: BlinkerConfigInfo = { deviceInstanceId: new Uint8Array(16).fill(5), accessEpoch: 0,
    supportsAccessBootstrap: true, hasAccessState: false, hasDeviceKey: false };
  const installed = { ...info, hasAccessState: true, hasDeviceKey: true, accessEpoch: 1 };
  // jsdom structuredClone can return typed arrays from the Node realm.
  const copy = (value: BleControllerCredential): BleControllerCredential => ({ ...value,
    cloudContext: value.cloudContext && { ...value.cloudContext },
    keyRotation: value.keyRotation && { ...value.keyRotation, previousContext: { ...value.keyRotation.previousContext },
      expectedAdmin: value.keyRotation.expectedAdmin && { ...value.keyRotation.expectedAdmin } },
    presenceKeys: value.presenceKeys?.map(key => ({ ...key, key: key.key.slice() })),
    deviceInstanceId: Uint8Array.from(value.deviceInstanceId), controllerId: Uint8Array.from(value.controllerId),
    controllerSecret: Uint8Array.from(value.controllerSecret), intentId: Uint8Array.from(value.intentId),
    commitId: Uint8Array.from(value.commitId), receipt: Uint8Array.from(value.receipt),
  });

  function harness() {
    let stored: BleControllerCredential | undefined, active = true;
    let cloud = context, radio = info;
    const order: string[] = [], payloads: Uint8Array[] = [], fingerprints: Uint8Array[] = [];
    const store = {
      load: vi.fn(async () => stored && copy(stored)),
      findWiFiProv: vi.fn(async (_instance: Uint8Array, pendingOnly?: boolean) =>
        stored && (!pendingOnly || stored.state === 'pending') ? copy(stored) : undefined),
      save: vi.fn(async (value: BleControllerCredential) => {
        order.push(value.keyRotation?.phase ?? value.state); stored = copy(value);
      }),
    };
    const management = {
      getDirectAdminV2: vi.fn().mockResolvedValue(null),
      revealDeviceKeyV2: vi.fn(async () => ({ status: 200, data: cloud })),
      rotateDeviceKeyV2: vi.fn(async () => {
        order.push('rotate'); cloud = { ...context, credentialVersion: 2, locator: base64UrlEncode(new Uint8Array(16).fill(2)) };
        return { status: 200, data: cloud };
      }),
      resetDirectAdminV2: vi.fn(async (id: string, value: any) => {
        order.push('reset'); return { logicalDeviceId: id, controllerId: value.controllerId,
          accessEpoch: value.expectedAccessEpoch + 1, credentialVersion: 1 };
      }),
      registerDirectAdminV2: vi.fn(async (id: string, controller: Uint8Array, fingerprint: Uint8Array) => {
        order.push('register'); fingerprints.push(fingerprint.slice());
        return { logicalDeviceId: id, controllerId: base64UrlEncode(controller), accessEpoch: stored?.accessEpoch ?? 1, credentialVersion: 1 };
      }),
    };
    const transport = { request: vi.fn(async (_endpoint: string, value: Uint8Array) => {
      if (value[1] === BlinkerConfigOperation.GetInfo) {
        order.push('get-info');
        const bytes = new Uint8Array(24);
        bytes.set([2, BlinkerConfigOperation.GetInfo, 0, 2 | (radio.hasDeviceKey ? 1 : 0) | (radio.hasAccessState ? 4 : 0)]);
        bytes.set(radio.deviceInstanceId, 4); new DataView(bytes.buffer).setUint32(20, radio.accessEpoch, false);
        return bytes;
      }
      order.push('bootstrap'); payloads.push(value.slice());
      return Uint8Array.of(2, BlinkerConfigOperation.Bootstrap, 0);
    }) };
    const client = () => new WiFiProvAdmin(store, management as any, transport,
      () => { if (!active) throw Error('account changed'); });
    return { client, store, management, transport, order, payloads, fingerprints,
      stored: () => stored!, switchAccount: () => { active = false; }, setRadio: (value: BlinkerConfigInfo) => { radio = value; } };
  }

  it('saves pending before external effects and becomes active only after exact Bootstrap ACK', async () => {
    const h = harness();
    await h.client().install(context, info);
    expect(h.order).toEqual(['pending', 'register', 'bootstrap', 'active']);
    expect(h.payloads[0].length).toBe(101);
    expect(h.stored().state).toBe('active');
    expect(h.stored().controllerSecret.some(Boolean)).toBe(true);
    expect(h.stored()).not.toHaveProperty('deviceKey');
    expect(h.fingerprints[0].length).toBe(32);
    expect(h.fingerprints[0]).not.toEqual(h.stored().controllerSecret);
    expect(h.transport.request.mock.calls[0][1].every(byte => byte === 0)).toBe(true);
  });

  it('secure save failure causes no registration or device write', async () => {
    const h = harness(); h.store.save.mockRejectedValueOnce(Error('secure store unavailable'));
    await expect(h.client().install(context, info)).rejects.toThrow('secure store');
    expect(h.management.registerDirectAdminV2).not.toHaveBeenCalled();
    expect(h.transport.request).not.toHaveBeenCalled();
  });

  it('registration response loss preserves the same Admin across a new coordinator instance', async () => {
    const h = harness(); h.management.registerDirectAdminV2.mockRejectedValueOnce(Error('response lost'));
    await expect(h.client().install(context, info)).rejects.toThrow('response lost');
    const original = copy(h.stored());
    expect(original.state).toBe('pending'); expect(h.transport.request).not.toHaveBeenCalled();
    await expect(h.client().resume(info)).resolves.toMatchObject({ logicalDeviceId: context.logicalDeviceId });
    expect(h.stored().controllerId).toEqual(original.controllerId);
    expect(h.stored().controllerSecret).toEqual(original.controllerSecret);
    expect(h.management.revealDeviceKeyV2).toHaveBeenCalledWith({ logicalDeviceId: context.logicalDeviceId, ...original.cloudContext });
  });

  it('lost device ACK replays exact Bootstrap, never Key-only Install', async () => {
    const h = harness();
    h.transport.request.mockImplementationOnce(async (_endpoint, value) => {
      h.payloads.push(value.slice()); throw Error('ACK lost');
    });
    await expect(h.client().install(context, info)).rejects.toThrow('ACK lost');
    expect(h.stored().state).toBe('pending');
    await h.client().resume(installed);
    expect(h.payloads).toHaveLength(2);
    expect(h.payloads[1]).toEqual(h.payloads[0]);
    expect(h.payloads.every(value => value[1] === BlinkerConfigOperation.Bootstrap)).toBe(true);
    expect(h.stored().state).toBe('active');
  });

  it('an active-save failure retains pending recovery and does not generate a second root', async () => {
    const h = harness(), save = h.store.save.getMockImplementation()!;
    h.store.save.mockImplementation(async value => {
      if (value.state === 'active') throw Error('active save failed');
      await save(value);
    });
    await expect(h.client().install(context, info)).rejects.toThrow('active save failed');
    expect(h.stored().state).toBe('pending');
    h.store.save.mockImplementation(save);
    await h.client().resume(installed);
    expect(h.payloads[1]).toEqual(h.payloads[0]);
  });

  it('active checkpoint resumes the network step without rewriting an extended access root', async () => {
    const h = harness(); await h.client().install(context, info);
    h.transport.request.mockClear(); h.store.save.mockClear();
    await h.client().resume(installed);
    expect(h.transport.request).not.toHaveBeenCalled();
    expect(h.store.save).not.toHaveBeenCalled();
    await expect(h.client().resume(info, context.logicalDeviceId)).resolves.toBeUndefined();
    // Add-device flow leaves old active cache intact and resolves ownership next;
    // it must not silently bootstrap an explicitly erased active Admin again.
    await expect(h.client().resume(info)).resolves.toBeUndefined();
  });

  it.each(['device', 'epoch', 'capability'])('rejects %s mismatch without writing', async field => {
    const h = harness(); h.management.registerDirectAdminV2.mockRejectedValueOnce(Error('offline'));
    await expect(h.client().install(context, info)).rejects.toThrow('offline');
    const wrong = { ...installed,
      ...(field === 'device' ? { deviceInstanceId: new Uint8Array(16).fill(6) } : {}),
      ...(field === 'epoch' ? { accessEpoch: 2 } : {}),
      ...(field === 'capability' ? { supportsAccessBootstrap: false } : {}),
    };
    await expect(h.client().resume(wrong)).rejects.toThrow('MISMATCH');
    expect(h.transport.request).not.toHaveBeenCalled();
  });

  it('revoked or refreshed DeviceKey blocks pending recovery without changing the root', async () => {
    const h = harness(); h.management.registerDirectAdminV2.mockRejectedValueOnce(Error('offline'));
    await expect(h.client().install(context, info)).rejects.toThrow('offline');
    h.management.revealDeviceKeyV2.mockResolvedValueOnce({ status: 200, data: { ...context, credentialVersion: 2 } });
    await expect(h.client().resume(info)).rejects.toThrow('KEY_CONTEXT_CHANGED');
    h.management.revealDeviceKeyV2.mockRejectedValueOnce(Error('retired'));
    await expect(h.client().resume(info)).rejects.toThrow('retired');
    expect(h.transport.request).not.toHaveBeenCalled();
    expect(h.stored().state).toBe('pending');
  });

  it('account change after registration stops Bootstrap and keeps only the original account checkpoint', async () => {
    const h = harness(), register = h.management.registerDirectAdminV2.getMockImplementation()!;
    h.management.registerDirectAdminV2.mockImplementation(async (...args) => {
      const result = await register(...args); h.switchAccount(); return result;
    });
    await expect(h.client().install(context, info)).rejects.toThrow('account changed');
    expect(h.transport.request).not.toHaveBeenCalled(); expect(h.stored().state).toBe('pending');
  });

  it('clears a late loaded secret when the account changes while secure storage is being read', async () => {
    const h = harness(); h.management.registerDirectAdminV2.mockRejectedValueOnce(Error('offline'));
    await expect(h.client().install(context, info)).rejects.toThrow('offline');
    const loaded = copy(h.stored());
    h.store.findWiFiProv.mockImplementation(async () => { h.switchAccount(); return loaded; });
    await expect(h.client().resume(info)).rejects.toThrow('account changed');
    expect(loaded.controllerSecret.every(value => value === 0)).toBe(true);
    expect(h.stored().controllerSecret.some(Boolean)).toBe(true);
    expect(h.transport.request).not.toHaveBeenCalled();
  });

  async function replacement() {
    const h = harness(); await h.client().install(context, info);
    const old = copy(h.stored());
    h.management.getDirectAdminV2.mockResolvedValue({ logicalDeviceId: old.logicalDeviceId, accessEpoch: old.accessEpoch,
      controllerId: base64UrlEncode(old.controllerId), credentialVersion: 1 });
    h.order.length = 0; h.payloads.length = 0;
    h.transport.request.mockClear(); h.store.save.mockClear(); h.management.registerDirectAdminV2.mockClear();
    return { ...h, old };
  }

  it('persists prepared before rotate, key-ready before PATCH, and uses the same Bootstrap/active boundary', async () => {
    const h = await replacement();
    await expect(h.client().reconfigure(context, info)).resolves.toMatchObject({ accessEpoch: 2, credentialVersion: 2 });
    expect(h.order).toEqual(['prepared', 'rotate', 'key-ready', 'reset', 'get-info', 'bootstrap', 'active']);
    expect(h.stored().controllerId).not.toEqual(h.old.controllerId);
    expect(h.stored().controllerSecret).not.toEqual(h.old.controllerSecret);
    expect(h.stored().keyRotation).toBeUndefined();
    expect(h.stored().presenceKeys).toBeUndefined();
    expect(h.stored()).not.toHaveProperty('deviceKey');
    expect(h.payloads[0].length).toBe(101);
    const sent = h.management.resetDirectAdminV2.mock.calls[0][1];
    expect(sent.expectedControllerId).toBe(base64UrlEncode(h.old.controllerId));
    expect(sent.expectedAccessEpoch).toBe(1);
    expect(sent.cloudCredentialVersion).toBe(2);
    expect(sent).not.toHaveProperty('controllerSecret');
    expect(h.management.registerDirectAdminV2).not.toHaveBeenCalled();
    h.transport.request.mockClear();
    await h.client().resume({ ...installed, accessEpoch: 2 });
    expect(h.transport.request).not.toHaveBeenCalled();
    expect(h.management.resetDirectAdminV2).toHaveBeenCalledTimes(1);
  });

  it.each(['prepared', 'key-ready', 'active'])('recovers after %s save failure without inventing a new operation', async phase => {
    const h = await replacement(), save = h.store.save.getMockImplementation()!;
    h.store.save.mockImplementation(async value => {
      if ((value.keyRotation?.phase ?? value.state) === phase) throw Error('save failed');
      await save(value);
    });
    await expect(h.client().reconfigure(context, info)).rejects.toThrow('save failed');
    if (phase === 'prepared') {
      expect(h.management.rotateDeviceKeyV2).not.toHaveBeenCalled();
      expect(h.stored()).toEqual(h.old);
    } else {
      const pending = copy(h.stored());
      expect(pending.state).toBe('pending');
      h.store.save.mockImplementation(save);
      await h.client().resume(info);
      expect(h.stored().controllerSecret).toEqual(pending.controllerSecret);
      const ids = h.management.rotateDeviceKeyV2.mock.calls.map(call => (call as unknown[])[1]);
      expect(new Set(ids).size).toBe(1);
      if (phase === 'key-ready') expect(h.management.rotateDeviceKeyV2).toHaveBeenCalledTimes(2);
      if (phase === 'active') expect(h.payloads[1]).toEqual(h.payloads[0]);
    }
  });

  it.each(['rotate', 'patch', 'ack'])('rebuilds the coordinator after lost %s response and replays exact context', async phase => {
    const h = await replacement();
    if (phase === 'rotate') {
      const run = h.management.rotateDeviceKeyV2.getMockImplementation()!;
      h.management.rotateDeviceKeyV2.mockImplementationOnce(async () => { await run(); throw Error('lost'); });
    } else if (phase === 'patch') {
      h.management.resetDirectAdminV2.mockRejectedValueOnce(Error('lost'));
    } else {
      const run = h.transport.request.getMockImplementation()!;
      h.transport.request.mockImplementation(async (...args) => {
        const result = await run(...args);
        if (args[1][1] === BlinkerConfigOperation.Bootstrap) throw Error('lost');
        return result;
      });
    }
    await expect(h.client().reconfigure(context, info)).rejects.toThrow('lost');
    const pending = copy(h.stored()), firstPayload = h.payloads[0];
    if (phase === 'ack') {
      h.setRadio({ ...installed, accessEpoch: 2 });
      h.transport.request.mockImplementation(async (_endpoint, value) => {
        if (value[1] === BlinkerConfigOperation.GetInfo) {
          const bytes = new Uint8Array(24); bytes.set([2, BlinkerConfigOperation.GetInfo, 0, 7]);
          bytes.set(info.deviceInstanceId, 4); new DataView(bytes.buffer).setUint32(20, 2, false); return bytes;
        }
        h.payloads.push(value.slice()); return Uint8Array.of(2, BlinkerConfigOperation.Bootstrap, 0);
      });
    }
    await h.client().resume(phase === 'ack' ? { ...installed, accessEpoch: 2 } : info);
    expect(h.stored().controllerSecret).toEqual(pending.controllerSecret);
    expect(h.stored().controllerId).toEqual(pending.controllerId);
    expect(h.stored().state).toBe('active');
    expect(new Set(h.management.rotateDeviceKeyV2.mock.calls.map(call => (call as unknown[])[1])).size).toBe(1);
    if (phase !== 'rotate') expect(h.management.rotateDeviceKeyV2).toHaveBeenCalledTimes(1);
    if (phase === 'patch' || phase === 'ack')
      expect(h.management.resetDirectAdminV2.mock.calls[1]).toEqual(h.management.resetDirectAdminV2.mock.calls[0]);
    if (phase === 'ack') expect(h.payloads.at(-1)).toEqual(firstPayload);
  });

  it('Broker disconnect pending never reaches PATCH or Bootstrap and keeps its original rotate id', async () => {
    const h = await replacement(); h.management.rotateDeviceKeyV2.mockRejectedValueOnce(Error('DEVICE_KEY_DISCONNECT_PENDING'));
    await expect(h.client().reconfigure(context, info)).rejects.toThrow('DISCONNECT_PENDING');
    expect(h.stored().keyRotation?.phase).toBe('prepared');
    expect(h.management.resetDirectAdminV2).not.toHaveBeenCalled(); expect(h.payloads).toHaveLength(0);
    await h.client().resume(info);
    expect(h.management.rotateDeviceKeyV2.mock.calls[1]).toEqual(h.management.rotateDeviceKeyV2.mock.calls[0]);
  });

  it.each(['rotate', 'patch', 'save'])('account change after %s stops all subsequent work', async phase => {
    const h = await replacement();
    if (phase === 'rotate') {
      const run = h.management.rotateDeviceKeyV2.getMockImplementation()!;
      h.management.rotateDeviceKeyV2.mockImplementationOnce(async () => { const value = await run(); h.switchAccount(); return value; });
    } else if (phase === 'patch') {
      const run = h.management.resetDirectAdminV2.getMockImplementation()!;
      h.management.resetDirectAdminV2.mockImplementationOnce(async (...args) => { const value = await run(...args); h.switchAccount(); return value; });
    } else {
      const run = h.store.save.getMockImplementation()!;
      h.store.save.mockImplementationOnce(async value => { await run(value); h.switchAccount(); });
    }
    await expect(h.client().reconfigure(context, info)).rejects.toThrow('account changed');
    expect(h.payloads).toHaveLength(0); expect(h.stored().state).toBe('pending');
    if (phase === 'save') expect(h.management.rotateDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('a changed GetInfo after PATCH keeps pending and never writes to the wrong device', async () => {
    const h = await replacement(); h.setRadio({ ...info, deviceInstanceId: new Uint8Array(16).fill(6) });
    await expect(h.client().reconfigure(context, info)).rejects.toThrow('MISMATCH');
    expect(h.stored().keyRotation?.phase).toBe('key-ready'); expect(h.payloads).toHaveLength(0);
  });

  it('stale inventory, old root metadata, installed roots and legacy checkpoints do not start a rotation', async () => {
    const h = await replacement();
    await expect(h.client().reconfigure(context, installed)).rejects.toThrow('EMPTY_ROOT');
    await expect(h.client().reconfigure({ ...context, credentialVersion: 2 }, info)).rejects.toThrow('KEY_CONTEXT_CHANGED');
    h.management.getDirectAdminV2.mockResolvedValueOnce({ logicalDeviceId: context.logicalDeviceId, accessEpoch: 3,
      controllerId: base64UrlEncode(new Uint8Array(16).fill(8)), credentialVersion: 1 });
    await expect(h.client().reconfigure(context, info)).rejects.toThrow('CHECKPOINT_CONFLICT');
    await h.store.save({ ...h.old, cloudContext: undefined });
    await expect(h.client().reconfigure(context, info)).rejects.toThrow('旧配网记录');
    expect(h.management.rotateDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('a BLE enrollment source becomes a new WiFiProv root without copying its old receipt or Presence', async () => {
    const h = await replacement();
    await h.store.save({ ...h.old, source: 'enrollment', cloudContext: undefined,
      intentId: new Uint8Array(16).fill(1), commitId: new Uint8Array(16).fill(2), receipt: new Uint8Array(10).fill(3),
      presenceKeys: [{ state: 'current', accessEpoch: 1, version: 1, key: new Uint8Array(16).fill(4) }] });
    await h.client().reconfigure(context, info);
    expect(h.stored()).toMatchObject({ logicalDeviceId: context.logicalDeviceId, state: 'active', source: 'wifiprov', accessEpoch: 2 });
    expect(h.stored().receipt.length).toBe(0); expect(h.stored().presenceKeys).toBeUndefined();
    expect(h.management.resetDirectAdminV2).toHaveBeenCalledTimes(1);
  });

  it('a stale/superseded rotation response never reaches PATCH or Bootstrap', async () => {
    const h = await replacement();
    h.management.rotateDeviceKeyV2.mockResolvedValueOnce({ status: 200, data: { ...context, credentialVersion: 3 } });
    await expect(h.client().reconfigure(context, info)).rejects.toThrow('KEY_CONTEXT_CHANGED');
    expect(h.stored().keyRotation?.phase).toBe('prepared');
    expect(h.management.resetDirectAdminV2).not.toHaveBeenCalled(); expect(h.payloads).toHaveLength(0);
  });
});
