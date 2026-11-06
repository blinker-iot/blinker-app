import { base64UrlDecode, base64UrlEncode } from '../base64url';
import type { BleDirectClient } from './client';
import type { BleDirectTarget } from './transport';
import { snapshotInitialNetworkAdmission, type InitialNetworkAdmission, type InitialNetworkCheckpoints } from './initial-network-checkpoint';
import type { InitialCloudWifiCarrierConsumer } from './cloud-registration-carrier';
import { observeInitialCloudWifi, type InitialCloudWifiCarrierEvidence, type InitialCloudWifiObservation } from '../provisioning/wifiprov-initial-cloud-observation';
import type { WiFiProvCloudReadPorts } from '../provisioning/wifiprov-cloud-reconciliation';
import type { WiFiProvCloudReadResult } from '../../model/response.model';
import type { IssuedCloudRegistration } from './cloud-registration-wire';
import type { BleControllerCredential } from './credential-store';

export type InitialNetworkStage = 'preflight' | 'handoff' | 'accepted' | 'wifi' | 'cloud';
export interface InitialNetworkResult extends InitialCloudWifiObservation { checkpoint: 'recorded' | 'unconfirmed' }
export type InitialNetworkPreflightStage = 'checkpoint' | 'carrier' | 'cloud' | 'authority' | 'source' | 'prepare';
export class InitialNetworkPreflightStop extends Error {
  constructor(readonly stage: InitialNetworkPreflightStage) { super('INITIAL_NETWORK_PREFLIGHT_STOP'); }
}

/** Original BLE-only administrator, not the opposite Cloud-to-BLE source.
 * This is a local selection guard; Method 2 still authenticates the exact root. */
export function assertInitialNetworkSourceCredential(admission: InitialNetworkAdmission,
  source: BleControllerCredential | undefined): asserts source is BleControllerCredential {
  const root = admission.expectedRoot;
  if (!source || source.state !== 'active' || (source.source ?? 'enrollment') !== 'enrollment'
    || source.cloudContext || source.keyRotation || source.permissions !== 15
    || source.logicalDeviceId !== admission.sourceLogicalDeviceId
    || base64UrlEncode(source.deviceInstanceId) !== root.deviceInstanceId || source.accessEpoch !== root.accessEpoch
    || base64UrlEncode(source.controllerId) !== root.controllerId || source.credentialVersion !== root.credentialVersion)
    throw Error('INITIAL_CLOUD_NETWORK_BLE_SOURCE_REQUIRED');
}

/** Compare only after the original client has verified the exact committed
 * record. This predicate does not turn an arbitrary projection into proof. */
export function assertInitialNetworkCommittedBinding(admission: InitialNetworkAdmission, issued: IssuedCloudRegistration): void {
  const operation = snapshotInitialNetworkAdmission(admission);
  if (issued.ownerUserId !== operation.ownerUserId || issued.tenantId !== operation.tenantId
    || issued.sourceLogicalDeviceId !== operation.sourceLogicalDeviceId || issued.targetLogicalDeviceId !== operation.targetLogicalDeviceId
    || issued.targetKey.credentialVersion !== operation.cloudCredentialVersion || issued.targetKey.locator !== operation.existingLocator
    || operation.operationId === issued.intentId
    || (Object.keys(operation.expectedRoot) as (keyof typeof operation.expectedRoot)[])
      .some(key => operation.expectedRoot[key] !== issued.expectedRoot[key]))
    throw Error('INITIAL_CLOUD_NETWORK_COMMITTED_ROOT_CHANGED');
}

/** One new network-only owner. No registration, Key operation or replay port. */
export async function runInstalledKeyInitialNetwork(input: {
  admission: InitialNetworkAdmission;
  checkpoints: Pick<InitialNetworkCheckpoints, 'inspect' | 'prepare' | 'markDispatch' | 'markAccepted' | 'markWifiDispatch'
    | 'markWifiResult' | 'markCloudObserved'>;
  direct: Pick<BleDirectClient, 'requestInstalledKeyInitialNetwork'>;
  selectSource(): Promise<BleDirectTarget>;
  checkAuthority(): Promise<void>;
  checkCarrier(): Promise<void>;
  createCarrier(beforeSubmit: () => Promise<void>): InitialCloudWifiCarrierConsumer<InitialCloudWifiCarrierEvidence>;
  cloud: Omit<WiFiProvCloudReadPorts, 'closeLocal'>;
  stage(value: InitialNetworkStage): void;
}): Promise<InitialNetworkResult> {
  const admission = snapshotInitialNetworkAdmission(input.admission);
  const { checkpoints, cloud } = input;
  const deadline = Math.min(admission.expiresAt, Date.now() + 120_000);
  const check = () => { cloud.signal.throwIfAborted(); cloud.assertCurrent(); };
  // Only pre-dispatch steps use this fixed, bounded diagnostic. Never retain
  // an upstream error/body or infer a device outcome from a UI exception.
  const preflight = async <T>(stage: InitialNetworkPreflightStage, work: () => Promise<T>): Promise<T> => {
    try { check(); const value = await work(); check(); return value; }
    catch { throw new InitialNetworkPreflightStop(stage); }
  };
  input.stage('preflight'); check();
  if (await preflight('checkpoint', () => checkpoints.inspect())) throw Error('INITIAL_NETWORK_CHECKPOINT_RECOVERY_REQUIRED');
  await preflight('carrier', () => input.checkCarrier());
  await preflight('cloud', () => cloud.assertCloud());
  await preflight('authority', () => input.checkAuthority());
  const target = await preflight('source', () => input.selectSource());
  await preflight('prepare', () => checkpoints.prepare());
  input.stage('handoff');
  const handoff = await input.direct.requestInstalledKeyInitialNetwork(admission, target, {
    signal: cloud.signal, assertCurrent: check, writeDeadline: deadline,
    beforeWrite: () => checkpoints.markDispatch(),
  });
  try {
    check();
    if (handoff.acceptance.operationId !== admission.operationId || handoff.acceptance.existingLocator !== admission.existingLocator)
      throw Error('INITIAL_CLOUD_NETWORK_ACK_INVALID');
    await checkpoints.markAccepted(); check();
    input.stage('accepted');
    let wifiDispatched = false;
    const carrier = input.createCarrier(async () => {
      check(); await checkpoints.markWifiDispatch(); wifiDispatched = true; check();
    });
    input.stage('wifi');
    const local = await handoff.useWifiCarrier(carrier);
    let recorded = true;
    if (wifiDispatched) {
      const result = local.outcome === 'apply-queued' ? 'accepted' : local.outcome === 'apply-unknown' ? 'unknown' : 'rejected';
      try { await checkpoints.markWifiResult(result); } catch { recorded = false; }
    }
    const attemptedAt = local.attemptedAt;
    if ((local.outcome === 'apply-queued' || local.outcome === 'apply-unknown')
      && (!wifiDispatched || !Number.isSafeInteger(attemptedAt) || (attemptedAt ?? 0) <= 0 || attemptedAt! > Date.now()))
      return { apply: local.outcome, cloud: 'unavailable', checkpoint: recorded ? 'recorded' : 'unconfirmed' };
    input.stage('cloud');
    let observed: WiFiProvCloudReadResult['observation'] | undefined;
    const result = await observeInitialCloudWifi(local.outcome, {
      identity: { logicalDeviceId: admission.targetLogicalDeviceId, credentialVersion: admission.cloudCredentialVersion,
        locator: admission.existingLocator },
      deviceInstanceId: base64UrlDecode(admission.expectedRoot.deviceInstanceId, 16), attemptedAt: attemptedAt ?? 0,
    }, { ...cloud, closeLocal: () => local.closeLocal(), read: async (instance, identity, signal) => {
      const response = await cloud.read(instance, identity, signal);
      if (response.device.state !== 'active' || response.device.cloudEnabled !== true)
        throw Error('WIFIPROV_INITIAL_CLOUD_TARGET_INACTIVE');
      observed = response.observation;
      return response;
    } }, 'metadata-reference');
    if (recorded && result.cloud === 'online' && observed?.kind === 'online') {
      try {
        await checkpoints.markCloudObserved({ issuedAt: observed.issuedAt!, stateUpdatedAt: observed.stateUpdatedAt!,
          observedAt: observed.observedAt });
      } catch { recorded = false; }
    }
    return { ...result, checkpoint: recorded ? 'recorded' : 'unconfirmed' };
  } finally { await handoff.close(); }
}
