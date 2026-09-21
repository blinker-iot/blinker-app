import type { DeviceV2ManagementService } from '../../services/device-v2-management.service';
import type { BleControllerCredentialStore } from '../ble-direct/credential-store';
import { clearBleControllerCredentialSecrets } from '../ble-direct/credential-store';
import { sameBytes } from '../ble-direct/wire';
import type { WiFiProvAllocationStore } from './wifiprov-allocation';
import type { BlinkerConfigInfo } from './esp32-wifiprov';

// Cloud removal and this phone's exact first-allocation checkpoint retirement.
// Never claims to erase the MCU or other phones' credentials.
export class WiFiProvRetirement {
  constructor(
    private readonly store: Pick<WiFiProvAllocationStore, 'load' | 'complete'> & {
      findDevice(logicalDeviceId: string): Promise<Uint8Array | undefined>;
    },
    private readonly credentials: Pick<BleControllerCredentialStore, 'load' | 'remove'>,
    private readonly management: Pick<DeviceV2ManagementService, 'deleteDeviceV2' | 'readDeviceStateV2'>,
    private readonly assertCurrent: () => void,
  ) {}

  async removeOwned(logicalDeviceId: string) {
    const response = await this.step(() => this.management.deleteDeviceV2(logicalDeviceId));
    try {
      await this.retire(logicalDeviceId);
      return { response, allocationCleanupPending: false };
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

  private async retire(id: string): Promise<void> {
    const instance = await this.step(() => this.store.findDevice(id));
    if (!instance) return;
    const credential = await this.credentials.load(id);
    try {
      this.assertCurrent();
      if (credential) {
        if (credential.logicalDeviceId !== id || credential.source !== 'wifiprov'
          || !sameBytes(credential.deviceInstanceId, instance)) throw Error('WIFIPROV_CHECKPOINT_CONFLICT');
        // Keep the journal if this write fails, so re-entry can retry exact cleanup.
        await this.step(() => this.credentials.remove(id));
      }
      await this.step(() => this.store.complete(instance, id));
    } finally { if (credential) clearBleControllerCredentialSecrets(credential); }
  }

  private async step<T>(work: () => Promise<T>): Promise<T> {
    this.assertCurrent();
    const result = await work();
    this.assertCurrent();
    return result;
  }
}
