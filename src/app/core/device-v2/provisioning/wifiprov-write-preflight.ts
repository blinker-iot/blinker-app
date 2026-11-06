import { clearBleControllerCredentialSecrets, type BleControllerCredential } from '../ble-direct/credential-store';
import type { BlinkerConfigInfo } from './esp32-wifiprov';
import type { WiFiProvAllocationStore } from './wifiprov-allocation';

const blocked = (code: string) => Object.assign(Error(code), { code });

/** Read-only ambiguity check, NOT device authentication or permission to write. */
export async function assertWiFiProvWritePreflight(
  info: BlinkerConfigInfo,
  allocations: Pick<WiFiProvAllocationStore, 'load'>,
  credentials: {
    inspectForProvisioning(instance: Uint8Array): Promise<{ hasAny: boolean; hasUnconfirmed: boolean }>;
    findWiFiProv(instance: Uint8Array): Promise<BleControllerCredential | undefined>;
  },
  assertCurrent: () => void,
): Promise<void> {
  assertCurrent();
  const instance = info.deviceInstanceId.slice(), hasKey = info.hasDeviceKey, hasAccess = info.hasAccessState;
  if (instance.length !== 16 || !instance.some(Boolean) || info.supportsAccessBootstrap !== true
    || !Number.isSafeInteger(info.accessEpoch) || info.accessEpoch < 0 || info.accessEpoch > 0xffffffff
    || hasAccess !== (info.accessEpoch > 0) || typeof hasKey !== 'boolean' || typeof hasAccess !== 'boolean') {
    throw blocked('WIFIPROV_DEVICE_CONTEXT_REQUIRED');
  }
  // A prepared allocation may have reached CREATE even without a bound context.
  // Neither a reconnect nor public GetInfo can prove that it is safe to resend.
  const allocation = await allocations.load(instance.slice());
  assertCurrent();
  if (allocation) throw blocked('WIFIPROV_IDENTITY_UNCONFIRMED');
  const references = await credentials.inspectForProvisioning(instance.slice());
  assertCurrent();
  if (references.hasUnconfirmed) throw blocked('WIFIPROV_IDENTITY_UNCONFIRMED');
  if (hasAccess !== hasKey || (!hasAccess && references.hasAny)) throw blocked('WIFIPROV_DEVICE_CONTEXT_CHANGED');
  // A known BLE card is not the Cloud registration's authority. Only an
  // explicit WiFiProv credential may be selected after the all-reference gate.
  const credential = hasAccess ? await credentials.findWiFiProv(instance.slice()) : undefined;
  try {
    assertCurrent();
    if (credential && (credential.state !== 'active' || credential.keyRotation)) {
      throw blocked('WIFIPROV_IDENTITY_UNCONFIRMED');
    }
    if (hasAccess && !credential) throw blocked('WIFIPROV_ADMIN_CREDENTIAL_REQUIRED');
  } finally {
    if (credential) clearBleControllerCredentialSecrets(credential);
  }
}
