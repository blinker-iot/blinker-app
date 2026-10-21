import { describe, expect, it, vi } from 'vitest';

import { environment } from 'src/environments/environment';
import { localCapabilities } from 'src/environments/deployment';
import { BehaviorSubject, Subject } from 'rxjs';
import { BleApplicationMode, deriveBlePresenceLocator } from '../device-v2/ble-direct';
import { DeviceV2BleService } from './device-v2-ble.service';

function fixture() {
  const data = { auth: { uuid: 'owner-a' }, sessionEpoch: 1, authDataChanged: new Subject<void>() };
  const cache = { save: vi.fn() };
  const service = createService({} as any, cache as any, data as any);
  const credential = {
    source: 'enrollment', state: 'pending', logicalDeviceId: 'ble_pending',
    deviceInstanceId: new Uint8Array(16).fill(1), accessEpoch: 7,
    controllerId: new Uint8Array(16).fill(2), controllerSecret: new Uint8Array(32).fill(3),
    presenceKeys: [{ state: 'current', accessEpoch: 7, version: 1, key: new Uint8Array(16).fill(4) }],
  };
  const store = { load: vi.fn().mockResolvedValue(credential), save: vi.fn(), remove: vi.fn() };
  vi.spyOn(service as any, 'credentialStore').mockReturnValue(store);
  const manifest = { fields: [] };
  const session = { close: vi.fn().mockResolvedValue(undefined), subscribeClosed: vi.fn().mockReturnValue(() => {}),
    store: { snapshot: () => ({ manifest }) } };
  const client = { resume: vi.fn().mockResolvedValue({ logicalDeviceId: 'ble_pending', session }), enroll: vi.fn() };
  vi.spyOn(service as any, 'client').mockReturnValue(client);
  const scan = vi.spyOn(service, 'discoverDirect');
  return { service, data, cache, credential, store, session, client, scan };
}

function createService(http: any, cache: any, data: any): DeviceV2BleService {
  data.deviceDataLoader ??= new BehaviorSubject(false);
  return new DeviceV2BleService(http, cache, data, { active: new BehaviorSubject(true) } as any);
}

const originalDeployment = environment.deployment;
beforeEach(() => { environment.deployment = localCapabilities; });
afterEach(() => { environment.deployment = originalDeployment; });

describe('ordinary BLE pending recovery', () => {
  it('discovers a fresh link by authorized Presence, then reuses the original resume and Manifest cache', async () => {
    const f = fixture(), abort = new AbortController();
    const profile = { mode: BleApplicationMode.Direct, wireVersion: 3, capabilities: 0x51,
      modeLocator: await deriveBlePresenceLocator(f.credential.presenceKeys[0].key, {
        deviceInstanceId: f.credential.deviceInstanceId, accessEpoch: 7, presenceKeyVersion: 1,
      }, Uint8Array.of(1, 2, 3, 4)) };
    const target = { device: { deviceId: 'untrusted-radio-address', name: 'Blinker' }, profile };
    f.scan.mockImplementation(async (_timeout, _excluded, signal, matcher) => {
      expect(signal).toBe(abort.signal);
      expect(await matcher!(target)).toBe(true);
      expect(await matcher!({ ...target, profile: { ...profile,
        modeLocator: profile.modeLocator.map((byte, i) => i === 0 ? byte ^ 1 : byte),
      } })).toBe(false);
      return target;
    });
    await expect(f.service.resume('ble_pending', abort.signal)).resolves.toMatchObject({ session: f.session });
    expect(f.client.resume).toHaveBeenCalledExactlyOnceWith('ble_pending', target);
    expect(f.client.enroll).not.toHaveBeenCalled();
    expect(f.store.save).not.toHaveBeenCalled(); expect(f.store.remove).not.toHaveBeenCalled();
    expect(f.cache.save).toHaveBeenCalledOnce();
    expect(f.credential.controllerSecret.every(b => b === 0)).toBe(true);
    expect(f.credential.presenceKeys[0].key.every(b => b === 0)).toBe(true);
  });

  it.each(['active', 'shared', 'missing-presence'])('rejects %s rather than scanning or re-enrolling', async kind => {
    const f = fixture();
    if (kind === 'active') f.credential.state = 'active';
    if (kind === 'shared') f.credential.source = 'shared';
    if (kind === 'missing-presence') f.credential.presenceKeys = [];
    await expect(f.service.resume('ble_pending', new AbortController().signal)).rejects.toThrow();
    expect(f.scan).not.toHaveBeenCalled(); expect(f.client.resume).not.toHaveBeenCalled();
    expect(f.credential.controllerSecret.every(b => b === 0)).toBe(true);
  });

  it.each(['load', 'scan'])('account changes during %s cannot acquire/commit under a successor account', async stage => {
    const f = fixture();
    const change = () => { f.data.auth = { uuid: 'owner-b' }; f.data.sessionEpoch++; };
    if (stage === 'load') f.store.load.mockImplementation(async () => { change(); return f.credential; });
    else f.scan.mockImplementation(async () => { change(); return {} as any; });
    await expect(f.service.resume('ble_pending', new AbortController().signal)).rejects.toThrow('DEVICE_V2_ACCOUNT_CONTEXT_CHANGED');
    expect(f.client.resume).not.toHaveBeenCalled(); expect(f.cache.save).not.toHaveBeenCalled();
    expect((f.service as any).accountLinks.size).toBe(0);
    expect(f.credential.controllerSecret.every(b => b === 0)).toBe(true);
  });

  it('abort during scan stops before authentication and leaves pending storage intact', async () => {
    const f = fixture(), abort = new AbortController();
    f.scan.mockImplementation(async () => { abort.abort(); return {} as any; });
    await expect(f.service.resume('ble_pending', abort.signal)).rejects.toThrow();
    expect(f.client.resume).not.toHaveBeenCalled(); expect(f.store.remove).not.toHaveBeenCalled();
    expect((f.service as any).accountLinks.size).toBe(0);
  });

  it('HTTP/retirement failure is surfaced without retry, cache activation or checkpoint deletion', async () => {
    const f = fixture();
    f.scan.mockResolvedValue({} as any);
    f.client.resume.mockRejectedValue(Error('DEVICE_RETIRED'));
    await expect(f.service.resume('ble_pending', new AbortController().signal)).rejects.toThrow('DEVICE_RETIRED');
    expect(f.client.resume).toHaveBeenCalledOnce(); expect(f.client.enroll).not.toHaveBeenCalled();
    expect(f.cache.save).not.toHaveBeenCalled(); expect(f.store.remove).not.toHaveBeenCalled();
    expect((f.service as any).accountLinks.size).toBe(0);
  });

  it('keeps the gateway relay waitForMode contract, sharing the same completion path', async () => {
    const f = fixture(), target = {} as any;
    const link = { waitForMode: vi.fn().mockResolvedValue(target), disconnect: vi.fn() };
    await f.service.resumeUsing(link as any, 'ble_pending');
    expect(link.waitForMode).toHaveBeenCalledWith(BleApplicationMode.Direct, 15000, expect.any(Function));
    expect(f.scan).not.toHaveBeenCalled(); expect(f.client.resume).toHaveBeenCalledExactlyOnceWith('ble_pending', target);
  });
});
