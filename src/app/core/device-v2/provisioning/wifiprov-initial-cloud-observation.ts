import { base64UrlDecode } from '../base64url';
import type { InitialCloudRegistrationInstallation } from '../ble-direct/client';
import type { InitialCloudWifiCarrierConsumer } from '../ble-direct/cloud-registration-carrier';
import {
  snapshotIssuedCloudRegistration,
  type ConfirmCloudRegistration,
  type IssuedCloudRegistration,
} from '../ble-direct/cloud-registration-wire';
import {
  WiFiProvCloudObservation,
  type WiFiProvCloudCheck,
  type WiFiProvCloudIdentityMode,
  type WiFiProvCloudReadPorts,
  type WiFiProvUnknownWiFiReceipt,
} from './wifiprov-cloud-reconciliation';

export type InitialCloudWifiApply = 'apply-queued' | 'apply-unknown' | 'set-unconfirmed' | 'apply-not-sent' | 'not-sent';

export interface InitialCloudWifiCarrierEvidence {
  readonly outcome: InitialCloudWifiApply;
  /** Local lower bound, immediately before the original native submit. */
  readonly attemptedAt?: number;
  /** Already verified correlated release, not a new close or retry. */
  closeLocal(): Promise<void>;
}

export interface InitialCloudWifiObservation {
  readonly apply: InitialCloudWifiApply;
  readonly cloud: WiFiProvCloudCheck | 'not-checked' | 'cancelled';
}

/** One explicit, read-only observation of the exact activated target.
 * Caller's closeLocal must consume/verify the matching candidate worker-death
 * receipt. The caller retains its local Apply result even if Cloud fails. */
export async function observeInitialCloudWifi(
  apply: InitialCloudWifiApply,
  receipt: WiFiProvUnknownWiFiReceipt,
  ports: WiFiProvCloudReadPorts,
  identityMode: WiFiProvCloudIdentityMode = 'logical-peer',
): Promise<InitialCloudWifiObservation> {
  switch (apply) {
    case 'not-sent': case 'set-unconfirmed': case 'apply-not-sent':
      return { apply, cloud: 'not-checked' };
    case 'apply-queued': case 'apply-unknown':
      break;
    default:
      throw Error('WIFIPROV_INITIAL_CLOUD_APPLY_INVALID');
  }
  let cloud: InitialCloudWifiObservation['cloud'];
  try {
    cloud = await new WiFiProvCloudObservation(receipt, identityMode === 'metadata-reference', identityMode).read({
      signal: ports.signal,
      assertCurrent: () => ports.assertCurrent(),
      closeLocal: () => ports.closeLocal(),
      assertCloud: () => ports.assertCloud(),
      read: async (instance, expected, signal) => {
        const result = await ports.read(instance, expected, signal);
        if (result.device.state !== 'active' || result.device.cloudEnabled !== true)
          throw Error('WIFIPROV_INITIAL_CLOUD_TARGET_INACTIVE');
        return result;
      },
    });
  } catch {
    cloud = ports.signal.aborted ? 'cancelled' : 'unavailable';
  }
  return { apply, cloud };
}

/** Explicit internal composition. No public route, WiFi fallback or second
 * attempt. Cloud reads are bound to the immutable issued target, never to the
 * source BLE card or a device selected by the local worker. */
export async function completeInitialCloudWifiHandoff(input: {
  issued: IssuedCloudRegistration;
  installation: InitialCloudRegistrationInstallation;
  commitId: string;
  confirm: ConfirmCloudRegistration;
  carrier: InitialCloudWifiCarrierConsumer<InitialCloudWifiCarrierEvidence>;
  cloud: Omit<WiFiProvCloudReadPorts, 'closeLocal'>;
}): Promise<InitialCloudWifiObservation> {
  const { installation, commitId, confirm, carrier, cloud } = input;
  const issued = snapshotIssuedCloudRegistration(input.issued);
  const verified = installation.confirmation;
  if (verified.contract !== issued.contract || verified.clientNonce !== issued.clientNonce
    || verified.receipt.locator !== issued.targetKey.locator
    || verified.receipt.issuanceDigest !== issued.targetKey.issuanceDigest
    || verified.receipt.credentialVersion !== issued.targetKey.credentialVersion)
    throw Error('WIFIPROV_INITIAL_CLOUD_TARGET_CHANGED');
  cloud.signal.throwIfAborted();
  cloud.assertCurrent();
  const local = await installation.submitWifiHandoff(commitId, confirm, carrier);
  cloud.signal.throwIfAborted();
  cloud.assertCurrent();
  const timestamp = local.attemptedAt;
  if ((local.outcome === 'apply-queued' || local.outcome === 'apply-unknown')
    && (timestamp === undefined || !Number.isSafeInteger(timestamp) || timestamp < issued.targetKey.issuedAt
      || timestamp > Date.now())) return { apply: local.outcome, cloud: 'unavailable' };
  return observeInitialCloudWifi(local.outcome, {
    identity: { logicalDeviceId: issued.targetLogicalDeviceId, credentialVersion: issued.targetKey.credentialVersion,
      locator: issued.targetKey.locator },
    deviceInstanceId: base64UrlDecode(issued.expectedRoot.deviceInstanceId, 16), attemptedAt: timestamp ?? 0,
  }, {
    signal: cloud.signal, assertCurrent: () => cloud.assertCurrent(), closeLocal: () => local.closeLocal(),
    assertCloud: () => cloud.assertCloud(), read: (instance, expected, signal) => cloud.read(instance, expected, signal),
  });
}
