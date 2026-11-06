import type { DeviceKeyRevealData } from '../../model/response.model';
import type { DeviceV2ManagementService } from '../../services/device-v2-management.service';
import { base64UrlDecode, base64UrlEncode } from '../base64url';
import { allocationContext, sameAllocationContext } from './wifiprov-allocation';
import type { CapacitorWiFiProvAllocationStore } from './wifiprov-allocation-store';
import { normalizeSealedInstallationName, sealedInstallationId, validateSealedInstallation, validateInstallationStatus,
  type WiFiProvInstallRegion, type WiFiProvSealedInstallation, type WiFiProvInstallationStatus,
} from './wifiprov-sealed-installation-contract';

type FreshStore = Pick<CapacitorWiFiProvAllocationStore,
  'prepareSealedInstallation' | 'markSealedCreateDispatched' | 'bindSealedInstallation'>;
type InstallationPort = Pick<DeviceV2ManagementService, 'createDeviceForWiFiProvInstallV2'>;
type ReadPort = Pick<DeviceV2ManagementService, 'readWiFiProvInstallationStatusV2'>;
export type WiFiProvFreshInstallMaterial = DeviceKeyRevealData & { readonly requestId: string };
export type WiFiProvInstallReconciliation = WiFiProvInstallationStatus | { readonly state: 'not-dispatched' };

const blocked = (code: string) => Object.assign(Error(code), { code });

/** One fresh sealed CREATE. The material is only for the caller's current
 * Bootstrap, never for the journal, a retry, or a manual reveal fallback. */
export async function createFreshSealed(instance: Uint8Array, name: string, store: FreshStore,
  management: InstallationPort, assertCurrent: () => void, region: WiFiProvInstallRegion,
  signal?: AbortSignal): Promise<WiFiProvFreshInstallMaterial> {
  const check = () => { if (signal?.aborted) throw blocked('WIFIPROV_OPERATION_CANCELLED'); assertCurrent(); };
  check();
  if (typeof store.prepareSealedInstallation !== 'function' || typeof store.markSealedCreateDispatched !== 'function'
    || typeof store.bindSealedInstallation !== 'function' || typeof management.createDeviceForWiFiProvInstallV2 !== 'function') {
    throw blocked('WIFIPROV_SEALED_ALLOCATION_UNSUPPORTED');
  }
  const normalized = normalizeSealedInstallationName(name);
  if (!(instance instanceof Uint8Array) || instance.length !== 16 || !instance.some(Boolean)) {
    throw blocked('WIFIPROV_INSTALL_REQUEST_INVALID');
  }
  const deviceInstance = Uint8Array.from(instance);
  const step = async <T>(work: () => Promise<T>): Promise<T> => {
    check();
    const result = await work();
    check();
    return result;
  };
  // Native compare-and-create rejects any old or uncertain request for this instance.
  const record = validateSealedInstallation(await step(() => store.prepareSealedInstallation(deviceInstance.slice(), normalized, region)));
  if (record.phase !== 'prepared' || record.deviceInstanceId !== base64UrlEncode(deviceInstance)) {
    throw blocked('WIFIPROV_IDENTITY_UNCONFIRMED');
  }
  const requestId = record.requestId;
  let dispatched = false;
  const material = await step(() => management.createDeviceForWiFiProvInstallV2(normalized, requestId, deviceInstance.slice(), async recipient => {
    if (dispatched) throw blocked('WIFIPROV_IDENTITY_UNCONFIRMED');
    await step(() => store.markSealedCreateDispatched(deviceInstance.slice(), requestId, sealedInstallationId(recipient, 32), region));
    dispatched = true;
  }, signal));
  if (!dispatched) throw blocked('WIFIPROV_IDENTITY_UNCONFIRMED');
  const context = allocationContext(material);
  if (context.credentialVersion !== 1) throw blocked('WIFIPROV_ALLOCATION_CONTEXT_CHANGED');
  // The dedicated port has already authenticated the transfer and locator.
  // Validate the small public interface again without creating a wire copy.
  const deviceKey = material.deviceKey;
  base64UrlDecode(deviceKey, 32).fill(0);
  await step(() => store.bindSealedInstallation(deviceInstance.slice(), requestId, context, region));
  return { ...context, deviceKey, requestId };
}

/** Explicit read-only recovery, even from a new WebView process. A returned
 * card proves allocation only; no local phase advancement or Key reissue. */
export async function reconcileSealedInstallation(record: WiFiProvSealedInstallation,
  store: Pick<CapacitorWiFiProvAllocationStore, 'loadSealedInstallation'>, management: ReadPort,
  assertCurrent: () => void, region: WiFiProvInstallRegion, signal: AbortSignal): Promise<WiFiProvInstallReconciliation> {
  const check = () => { if (signal.aborted) throw blocked('WIFIPROV_OPERATION_CANCELLED'); assertCurrent(); };
  check();
  const expected = validateSealedInstallation(record);
  const current = await store.loadSealedInstallation(base64UrlDecode(expected.deviceInstanceId, 16), region);
  check();
  if (!current || JSON.stringify(validateSealedInstallation(current)) !== JSON.stringify(expected)) throw blocked('WIFIPROV_IDENTITY_UNCONFIRMED');
  if (expected.phase === 'prepared' || !expected.recipientPublicKey) return { state: 'not-dispatched' };
  const status = validateInstallationStatus(await management.readWiFiProvInstallationStatusV2({ requestId: expected.requestId,
    deviceInstanceId: expected.deviceInstanceId, recipientPublicKey: expected.recipientPublicKey, nameDigest: expected.nameDigest }, signal));
  check();
  if (status.state === 'created' && expected.context && !sameAllocationContext(status.device, expected.context)) {
    throw blocked('WIFIPROV_ALLOCATION_CONTEXT_CHANGED');
  }
  return status;
}
