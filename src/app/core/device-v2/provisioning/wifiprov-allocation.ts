import type { DeviceKeyContext, DeviceKeyRevealData } from '../../model/response.model';
import type { DeviceV2ManagementService } from '../../services/device-v2-management.service';
import { logicalDevicePeerId } from '../../protocol/device-v2';
import { base64UrlDecode } from '../ble-direct/wire';
import { encodeBlinkerConfigInstall } from './esp32-wifiprov';

export interface WiFiProvAllocationRecord {
  requestId: string;
  name: string;
  context?: DeviceKeyContext;
}

export interface WiFiProvAllocationStore {
  load(instance: Uint8Array): Promise<WiFiProvAllocationRecord | undefined>;
  prepare(instance: Uint8Array, name: string): Promise<WiFiProvAllocationRecord>;
  bind(instance: Uint8Array, requestId: string, context: DeviceKeyContext): Promise<void>;
  complete(instance: Uint8Array, logicalDeviceId: string): Promise<void>;
}

// Only first allocation. Admin installation/rotation remains in WiFiProvAdmin.
// The journal contains request identity and public context, never DeviceKey.
export class WiFiProvAllocation {
  constructor(
    private readonly store: WiFiProvAllocationStore,
    private readonly management: Pick<DeviceV2ManagementService, 'createDeviceKeyV2' | 'revealDeviceKeyV2'>,
    private readonly assertCurrent: () => void,
  ) {}

  async create(instance: Uint8Array, name: string): Promise<DeviceKeyRevealData> {
    const record = await this.step(() => this.store.prepare(instance, name));
    let context = record.context;
    if (!context) {
      const response = await this.step(() => this.management.createDeviceKeyV2(record.name, record.requestId, 'diy'));
      const device = response.data?.device;
      if (![200, 201].includes(response.status) || device?.state !== 'active' || device.deviceType !== 'diy') {
        throw Error('WIFIPROV_ALLOCATION_RESPONSE_INVALID');
      }
      context = allocationContext(device);
      // Loss of this write replays CREATE with the same durable identity.
      await this.step(() => this.store.bind(instance, record.requestId, context!));
    }
    const expected = allocationContext(context);
    const revealed = await this.step(() => this.management.revealDeviceKeyV2(expected));
    if (revealed.status !== 200 || !sameAllocationContext(allocationContext(revealed.data), expected)) {
      throw Error('WIFIPROV_ALLOCATION_CONTEXT_CHANGED');
    }
    const encoded = encodeBlinkerConfigInstall(revealed.data.deviceKey);
    encoded.fill(0);
    return revealed.data;
  }

  private async step<T>(work: () => Promise<T>): Promise<T> {
    this.assertCurrent();
    const value = await work();
    this.assertCurrent();
    return value;
  }
}

export function allocationContext(value: DeviceKeyContext): DeviceKeyContext {
  if (!value || !Number.isSafeInteger(value.credentialVersion) || value.credentialVersion < 1
    || value.credentialVersion > 0xffffffff || !base64UrlDecode(value.locator, 16).some(Boolean)) {
    throw Error('WIFIPROV_ALLOCATION_CONTEXT_INVALID');
  }
  logicalDevicePeerId(value.logicalDeviceId);
  return { logicalDeviceId: value.logicalDeviceId, credentialVersion: value.credentialVersion, locator: value.locator };
}

export function sameAllocationContext(a: DeviceKeyContext, b: DeviceKeyContext): boolean {
  return a.logicalDeviceId === b.logicalDeviceId && a.credentialVersion === b.credentialVersion && a.locator === b.locator;
}
