import { describe, expect, it } from 'vitest';
import { bytesToHex, logicalDevicePeerId } from '../protocol/device-v2/codec';
import { DeviceV2Store } from '../protocol/device-v2/store';
import { DeviceV2ReadyWaits } from './ready-waits';
import { isLogicalDeviceReferenceId } from '../protocol/device-v2/logical-device-reference';
import { accountInventoryPeers, accountLogicalDevicePeerId } from './account-peer-id';

const uuid = 'device_01234567-89ab-cdef-0123-456789abcdef';
const opaque = 'device_ASNFZ4mrze8BI0VniavN7w';
const ble = 'ble_ASNFZ4mrze8BI0VniavN7w';

describe('account-only logical peer compatibility', () => {
  it('preserves all existing route bytes and never creates a Direct credential identity for an opaque Cloud card', () => {
    const expected = '0123456789abcdef0123456789abcdef';
    for (const id of [uuid, opaque, ble]) expect(bytesToHex(accountLogicalDevicePeerId(id))).toBe(expected);
    expect(() => logicalDevicePeerId(opaque)).toThrow();
    expect(() => new DeviceV2Store().snapshot(opaque)).toThrow();
  });

  it('requires canonical nonzero identities and rejects both spellings rather than selecting a winner', () => {
    expect([...accountInventoryPeers([opaque, opaque]).values()]).toEqual([opaque]);
    expect(accountInventoryPeers([]).size).toBe(0);
    for (const pair of [[uuid, opaque], [opaque, uuid], [ble, opaque], [opaque, ble], [uuid, ble]]) {
      expect(() => accountInventoryPeers(pair)).toThrow('ambiguous');
    }
    for (const bad of ['device_AAAAAAAAAAAAAAAAAAAAAA', 'device_00000000-0000-0000-0000-000000000000',
      opaque + '=', opaque + '\n', opaque + '/other', opaque + '?x=y']) {
      expect(() => accountLogicalDevicePeerId(bad)).toThrow();
    }
  });

  it('leaves the shared ReadyWait default strict before preparing a session', async () => {
    const prepare = () => { throw Error('must not prepare'); };
    const waits = new DeviceV2ReadyWaits(prepare, new DeviceV2Store());
    await expect(waits.wait(opaque)).rejects.toThrow('Invalid logical device identity');
  });

  it('permits readiness preparation only with the explicit account validator', async () => {
    const snapshot = { manifestAccepted: true, stateFresh: true, cloudReachable: true } as ReturnType<DeviceV2Store['snapshot']>;
    let subscribed = '';
    const session = { state: 'ready' as const, subscribeState: () => () => undefined,
      subscribePresence: async (id: string) => { subscribed = id; return true; }, ensureReady: async () => undefined };
    const waits = new DeviceV2ReadyWaits(async () => session, {
      snapshot: () => snapshot, subscribe: () => () => undefined,
    }, isLogicalDeviceReferenceId);
    await waits.wait(opaque);
    expect(subscribed).toBe(opaque);
  });
});
