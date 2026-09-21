import { DeviceKeyLogicalDevice, DeviceV2ShareGrant } from '../model/response.model';
import { DeviceV2AccountScope, deviceV2AccountStoragePrefix } from './account-scope';

// A directory entry is a page address, not a cached session, ACL or presence fact.
export interface DeviceCatalogItem {
  device: Pick<DeviceKeyLogicalDevice, 'logicalDeviceId' | 'name' | 'deviceType' | 'cloudEnabled' | 'gatewayRouted'>;
  state: string;
  shared: boolean;
  access: Pick<DeviceV2ShareGrant, 'shareId' | 'role'> | null;
}

const PREFIX = 'blinker-v2-catalog:';
const MAX_ENTRIES = 256;
const MAX_BYTES = 128 * 1024;
const encoder = new TextEncoder();

export function loadDeviceCatalog(scope: DeviceV2AccountScope): DeviceCatalogItem[] | undefined {
  try {
    const encoded = localStorage.getItem(key(scope));
    if (!encoded || encoded.length > MAX_BYTES || encoder.encode(encoded).length > MAX_BYTES) return;
    const value = JSON.parse(encoded);
    if (value?.version !== 1 || value.authority !== scope.authority || value.accountId !== scope.accountId) return;
    return project(value.entries);
  } catch { return; }
}

export function saveDeviceCatalog(scope: DeviceV2AccountScope, inventory: DeviceCatalogItem[]): void {
  try {
    const entries = project(inventory);
    const encoded = entries && JSON.stringify({ version: 1, ...scope, entries });
    // A complete but unsupported/oversized snapshot must not resurrect an older directory.
    if (!encoded || encoder.encode(encoded).length > MAX_BYTES) localStorage.removeItem(key(scope));
    else localStorage.setItem(key(scope), encoded);
  } catch {
    // Quota/privacy failure must not leave a previously revoked directory restorable.
    removeDeviceCatalog(scope);
  }
}

export function removeDeviceCatalog(scope: DeviceV2AccountScope): void {
  try { localStorage.removeItem(key(scope)); } catch { /* Optional display cache. */ }
}

function key(scope: DeviceV2AccountScope): string {
  return deviceV2AccountStoragePrefix(PREFIX, scope) + 'inventory';
}

function project(value: unknown): DeviceCatalogItem[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) return;
  const seen = new Set<string>();
  const entries: DeviceCatalogItem[] = [];
  for (const item of value) {
    const d = item?.device;
    if (!d || !text(d.logicalDeviceId, 128) || seen.has(d.logicalDeviceId)
      || !text(d.name, 128) || !text(d.deviceType, 64) || encoder.encode(d.deviceType).length > 128
      || typeof d.cloudEnabled !== 'boolean' || !text(item.state, 32)
      || (d.gatewayRouted !== undefined && typeof d.gatewayRouted !== 'boolean')
      || typeof item.shared !== 'boolean'
      || (item.shared ? !item.access || !text(item.access.shareId, 128)
        || !['viewer', 'operator'].includes(item.access.role) : item.access !== null)) return;
    seen.add(d.logicalDeviceId);
    entries.push({
      device: { logicalDeviceId: d.logicalDeviceId, name: d.name,
        deviceType: d.deviceType, cloudEnabled: d.cloudEnabled,
        ...(d.gatewayRouted !== undefined ? { gatewayRouted: d.gatewayRouted } : {}) },
      state: item.state, shared: item.shared,
      access: item.shared ? { shareId: item.access.shareId, role: item.access.role } : null,
    });
  }
  return entries;
}

function text(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit
    && !value.includes('\0');
}
