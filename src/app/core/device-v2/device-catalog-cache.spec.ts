import { deviceV2AccountCacheScope, deviceV2AccountStoragePrefix } from './account-scope';
import { DeviceCatalogItem, loadDeviceCatalog, saveDeviceCatalog } from './device-catalog-cache';

const scope = { authority: 'https://gateway-a.example', accountId: 'user-a' };
const entry = (): DeviceCatalogItem => ({ device: { logicalDeviceId: 'ble_one', name: 'Sensor',
  deviceType: 'ble', cloudEnabled: true }, state: 'active', shared: false, access: null });
const cacheKey = () => deviceV2AccountStoragePrefix('blinker-v2-catalog:', scope) + 'inventory';
beforeEach(() => localStorage.clear());

describe('minimal device catalog', () => {
  it('persists only validated display metadata in the same authority/account/device directory', () => {
    const item = entry();
    item.device.displayMetadata = { logicalDeviceId: item.device.logicalDeviceId, revision: 1,
      name: item.device.name, capabilities: [{ key: 'power', kind: 0, type: 0, displayName: '电源' }] };
    saveDeviceCatalog(scope, [item]);
    expect(loadDeviceCatalog(scope)).toEqual([item]);
    expect(loadDeviceCatalog({ ...scope, accountId: 'other' })).toBeUndefined();
    saveDeviceCatalog(scope, [{ ...item, device: { ...item.device, displayMetadata: { ...item.device.displayMetadata,
      logicalDeviceId: 'other' } } }]);
    expect(loadDeviceCatalog(scope)).toBeUndefined();
  });
  it.each([true, false, undefined])('retains the nonsecret routing hint %s without inventing an absent hint', gatewayRouted => {
    const item = entry();
    if (gatewayRouted !== undefined) item.device.gatewayRouted = gatewayRouted;
    saveDeviceCatalog(scope, [item]);
    expect(loadDeviceCatalog(scope)).toEqual([item]);
  });
  it.each([null, 'false', 0, {}])('rejects an invalid routing hint %j', gatewayRouted => {
    saveDeviceCatalog(scope, [entry()]);
    saveDeviceCatalog(scope, [{ ...entry(), device: { ...entry().device, gatewayRouted } } as any]);
    expect(loadDeviceCatalog(scope)).toBeUndefined();
  });
  it('projects only nonsecret directory metadata, with no session, presence or raw share ACL', () => {
    const item = entry();
    Object.assign(item.device, { deviceKey: 'secret-key', cloudReachable: true, state: { power: true },
      controllerSecret: 'secret-controller', manifestFingerprint: 'ab'.repeat(32) });
    item.shared = true;
    item.access = { shareId: 'share-1', role: 'viewer', commandEndpointKeys: ['power'], secret: 'raw' } as any;
    saveDeviceCatalog(scope, [item]);
    expect(loadDeviceCatalog(scope)).toEqual([{ ...entry(), shared: true, access: { shareId: 'share-1', role: 'viewer' } }]);
    expect(localStorage.getItem(cacheKey())).not.toMatch(/secret|cloudReachable|commandEndpointKeys|manifestFingerprint/);
  });
  it('isolates authorities/accounts and requires authenticated identity, not a profile', () => {
    saveDeviceCatalog(scope, [entry()]);
    expect(loadDeviceCatalog({ ...scope, authority: 'https://gateway-b.example' })).toBeUndefined();
    expect(loadDeviceCatalog({ ...scope, accountId: 'user-b' })).toBeUndefined();
    expect(deviceV2AccountCacheScope({ auth: null, user: { id: 'user-a' } } as any, scope.authority)).toBeUndefined();
    expect(deviceV2AccountCacheScope({ auth: { uuid: 'user-a' } }, scope.authority)).toEqual(scope);
  });
  it('replaces the complete snapshot, including an empty/revoked directory', () => {
    saveDeviceCatalog(scope, [entry()]);
    saveDeviceCatalog(scope, []);
    expect(loadDeviceCatalog(scope)).toEqual([]);
  });
  it.each(['missing-cloud', 'missing-type', 'duplicate', 'bad-role', 'count', 'size'])('rejects %s without retaining the older snapshot', kind => {
    saveDeviceCatalog(scope, [entry()]);
    const items = [entry()];
    if (kind === 'missing-cloud') delete (items[0].device as any).cloudEnabled;
    if (kind === 'missing-type') items[0].device.deviceType = '';
    if (kind === 'duplicate') items.push(entry());
    if (kind === 'bad-role') { items[0].shared = true; items[0].access = { role: 'owner' } as any; }
    if (kind === 'count' || kind === 'size') {
      items.length = 0;
      for (let i = 0; i < (kind === 'count' ? 257 : 256); ++i) {
        items.push({ ...entry(), device: { ...entry().device, logicalDeviceId: `device_${i}`, name: '蜗'.repeat(128) } });
      }
    }
    saveDeviceCatalog(scope, items);
    expect(loadDeviceCatalog(scope)).toBeUndefined();
  });
  it.each(['null', '{', JSON.stringify({ version: 2 }), ' '.repeat(128 * 1024 + 1)])('ignores corrupted/versioned/oversized storage', encoded => {
    localStorage.setItem(cacheKey(), encoded);
    expect(loadDeviceCatalog(scope)).toBeUndefined();
  });
  it('rejects a copied envelope and sanitizes extra fields when reading', () => {
    localStorage.setItem(cacheKey(), JSON.stringify({ version: 1, ...scope, accountId: 'user-b', entries: [entry()] }));
    expect(loadDeviceCatalog(scope)).toBeUndefined();
    localStorage.setItem(cacheKey(), JSON.stringify({ version: 1, ...scope,
      entries: [{ ...entry(), device: { ...entry().device, password: 'unexpected' } }] }));
    expect(loadDeviceCatalog(scope)).toEqual([entry()]);
  });
});
