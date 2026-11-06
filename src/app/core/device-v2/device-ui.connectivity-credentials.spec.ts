import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DeviceUiPort, type DeviceUiConnectivitySnapshot } from './device-ui.port';

const logicalDeviceId = 'device_11111111-1111-4111-8111-111111111111';
const turn = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

// Cloud hybrid only: preserve the existing pure-BLE initial access contract.
// Credential changes are local invalidation signals, not permission to connect.
function harness(reads: readonly Promise<boolean>[]) {
  const changes = new Subject<void>();
  const connection = new BehaviorSubject('idle');
  const nearby = new BehaviorSubject(false);
  const nearbyAlias = new BehaviorSubject(false);
  const deviceChanges = new Subject<void>();
  const device = { deviceType: 'diy', cloudEnabled: true, gatewayRouted: false,
    data: { cloudReachable: true }, subject: deviceChanges };
  let nextRead = 0;
  const ble = {
    connectionSnapshot: vi.fn(() => connection.value),
    nearbySnapshot: vi.fn(() => nearby.value),
    watchConnection: vi.fn(() => connection.asObservable()),
    watchNearby: vi.fn(() => nearby.asObservable()),
    watchNearbyAlias: vi.fn(() => nearbyAlias.asObservable()),
    watchAdapterEnabled: vi.fn(() => new BehaviorSubject(true)),
    // This mock is valid before the new optional production hook is consumed.
    watchCredentialChanges: vi.fn((_id: string) => changes.asObservable()),
    hasActiveCredential: vi.fn((_id: string): Promise<boolean> => {
      if (nextRead >= reads.length) throw new Error('UNEXPECTED_LOCAL_CREDENTIAL_READ');
      return reads[nextRead++];
    }),
    ensureReady: vi.fn(), connect: vi.fn(), command: vi.fn(),
    refreshPresence: vi.fn(), syncPresenceCredential: vi.fn(),
  };
  const cloud = {
    state: new BehaviorSubject('ready'),
    ensureReady: vi.fn(), waitUntilReady: vi.fn(), command: vi.fn(),
    acquireStateInterest: vi.fn(), acquireConnectionDemand: vi.fn(),
    readState: vi.fn(), readManifest: vi.fn(),
  };
  const port = new DeviceUiPort(cloud as any, ble as any,
    { run: (callback: () => unknown) => callback() } as any,
    { active: new BehaviorSubject(true) } as any,
    { getDevice: () => device, sessionEpoch: 1, authDataChanged: new Subject<void>() } as any);
  const snapshots: DeviceUiConnectivitySnapshot[] = [];
  const subscription = port.watchConnectivity(logicalDeviceId).subscribe(value => snapshots.push(value));
  return { changes, nearbyAlias, ble, cloud, snapshots, subscription };
}

function noActiveWork(fixture: ReturnType<typeof harness>) {
  for (const action of [fixture.ble.ensureReady, fixture.ble.connect, fixture.ble.command,
    fixture.ble.refreshPresence, fixture.ble.syncPresenceCredential,
    fixture.cloud.ensureReady, fixture.cloud.waitUntilReady, fixture.cloud.command,
    fixture.cloud.acquireStateInterest, fixture.cloud.acquireConnectionDemand,
    fixture.cloud.readState, fixture.cloud.readManifest]) expect(action).not.toHaveBeenCalled();
  expect(fixture.snapshots.every(value => value.activeTransport === 'cloud'
    && value.bleState === 'idle' && value.bleNearby === false && value.cloudSessionState === 'ready')).toBe(true);
}

describe('DA-2 local credential changes in connectivity observations', () => {
  it('publishes nearby-only evidence without changing access, primary transport or cloud readiness', async () => {
    const fixture = harness([Promise.resolve(false)]);
    try {
      await turn();
      fixture.nearbyAlias.next(true);
      expect(fixture.snapshots.at(-1)).toMatchObject({ bleNearbyOnly: true, bleNearby: false,
        bleAccess: false, activeTransport: 'cloud', bleState: 'idle', cloudSessionState: 'ready' });
      fixture.nearbyAlias.next(false);
      expect(fixture.snapshots.at(-1)?.bleNearbyOnly).toBeUndefined();
      noActiveWork(fixture);
    } finally { fixture.subscription.unsubscribe(); }
  });
  it('retires a known access result to unknown immediately, then publishes the fresh local result', async () => {
    const refreshed = deferred<boolean>();
    const fixture = harness([Promise.resolve(true), refreshed.promise]);
    try {
      await turn();
      expect(fixture.snapshots.at(-1)?.bleAccess).toBe(true);
      fixture.changes.next();
      expect(fixture.snapshots.at(-1)?.bleAccess).toBeNull();
      expect(fixture.ble.hasActiveCredential).toHaveBeenCalledTimes(2);
      refreshed.resolve(false); await turn();
      expect(fixture.snapshots.at(-1)?.bleAccess).toBe(false);
      expect(fixture.ble.watchCredentialChanges).toHaveBeenCalledWith(logicalDeviceId);
      noActiveWork(fixture);
    } finally { fixture.subscription.unsubscribe(); }
  });

  it('does not let an earlier late access read overwrite the successor credential result', async () => {
    const original = deferred<boolean>(), successor = deferred<boolean>();
    const fixture = harness([original.promise, successor.promise]);
    try {
      expect(fixture.snapshots.at(-1)?.bleAccess).toBeNull();
      fixture.changes.next();
      expect(fixture.ble.hasActiveCredential).toHaveBeenCalledTimes(2);
      successor.resolve(false); await turn();
      expect(fixture.snapshots.at(-1)?.bleAccess).toBe(false);
      const afterFresh = fixture.snapshots.length;
      original.resolve(true); await turn();
      expect(fixture.snapshots.at(-1)?.bleAccess).toBe(false);
      expect(fixture.snapshots.length).toBe(afterFresh);
      noActiveWork(fixture);
    } finally { fixture.subscription.unsubscribe(); }
  });

  it('does not start a new credential read after the connectivity observer unsubscribes', async () => {
    const fixture = harness([Promise.resolve(true)]);
    try {
      await turn();
      expect(fixture.ble.hasActiveCredential).toHaveBeenCalledOnce();
      fixture.subscription.unsubscribe();
      const published = fixture.snapshots.length;
      fixture.changes.next(); await turn();
      expect(fixture.ble.hasActiveCredential).toHaveBeenCalledOnce();
      expect(fixture.snapshots.length).toBe(published);
      noActiveWork(fixture);
    } finally { fixture.subscription.unsubscribe(); }
  });

  it('refreshes local access only, without connecting, scanning, commanding or reading the service', async () => {
    const fixture = harness([Promise.resolve(true), Promise.resolve(false)]);
    try {
      await turn(); fixture.changes.next(); await turn();
      expect(fixture.ble.hasActiveCredential).toHaveBeenCalledTimes(2);
      expect(fixture.snapshots.at(-1)?.bleAccess).toBe(false);
      noActiveWork(fixture);
    } finally { fixture.subscription.unsubscribe(); }
  });
});
