import type { DeviceV2ManagementService } from '../../services/device-v2-management.service';
import type { CapacitorBleControllerCredentialStore } from '../ble-direct/credential-store';
import type { WiFiProvAllocationStore } from './wifiprov-allocation';
import type { BlinkerConfigInfo } from './esp32-wifiprov';
import type { DeviceRemovalResponse } from '../../model/response.model';

// Cloud removal and this phone's exact first-allocation checkpoint retirement.
// Never claims to erase the MCU or other phones' credentials.
export class WiFiProvRetirement {
  constructor(
    private readonly store: Pick<WiFiProvAllocationStore, 'load' | 'complete'> & {
      findDevice(logicalDeviceId: string): Promise<Uint8Array | undefined>;
    },
    private readonly credentials: Pick<CapacitorBleControllerCredentialStore, 'removeDeletedRegistration'>,
    private readonly management: Pick<DeviceV2ManagementService, 'deleteDeviceV2' | 'readDeviceStateV2'>,
    private readonly assertCurrent: () => void,
  ) {}

  async removeOwned(logicalDeviceId: string, onConfirmed?: (response: DeviceRemovalResponse) => void) {
    const response = await this.step(() => this.management.deleteDeviceV2(logicalDeviceId));
    // The authoritative result is available before local I/O. A presentation
    // failure cannot turn a committed deletion back into an unconfirmed one.
    try { onConfirmed?.(response); } catch { this.assertCurrent(); }
    try {
      const allocationCleanupPending = await this.retire(logicalDeviceId);
      return { response, allocationCleanupPending };
    } catch {
      this.assertCurrent(); // Account changes must not update the new account's UI.
      return { response, allocationCleanupPending: true };
    }
  }

  async recoverRemoved(info: BlinkerConfigInfo, confirm: () => Promise<boolean>): Promise<void> {
    if (!info.supportsAccessBootstrap || info.hasDeviceKey || info.hasAccessState || info.accessEpoch !== 0) return;
    const record = await this.step(() => this.store.load(info.deviceInstanceId));
    const id = record?.context?.logicalDeviceId;
    if (!id || await this.step(() => this.management.readDeviceStateV2(id)) !== 'deleted') return;
    if (!await this.step(confirm)) throw Error('已取消清理原配网记录，未重新创建设备');
    // Idempotent original DELETE reconfirms cloud retirement after explicit consent.
    const result = await this.removeOwned(id);
    if (result.allocationCleanupPending) throw Error('云端设备已移除，本机配网记录清理失败，请重试');
  }

  private async retire(id: string): Promise<boolean> {
    const instance = await this.step(() => this.store.findDevice(id));
    let unknownWiFi = false;
    if (instance) {
      const allocation = await this.step(() => this.store.load(instance));
      if (allocation?.context?.logicalDeviceId !== id) throw Error('WIFIPROV_CHECKPOINT_CONFLICT');
      // Read-only WiFi recovery uses this non-secret context, not an active
      // Admin credential. Retire the card but preserve its original UNKNOWN.
      unknownWiFi = allocation.wifiUnknown !== undefined;
    }
    const local = await this.step(() => this.credentials.removeDeletedRegistration(id, instance));
    if (local.cleanupPending || unknownWiFi) return true;
    if (instance) await this.step(() => this.store.complete(instance, id));
    return false;
  }

  private async step<T>(work: () => Promise<T>): Promise<T> {
    this.assertCurrent();
    const result = await work();
    this.assertCurrent();
    return result;
  }
}
