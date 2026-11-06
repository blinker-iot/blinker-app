import { base64UrlDecode } from '../base64url';
import { constantTimeEqual } from './crypto';

export const INITIAL_CLOUD_NETWORK_CONTRACT = 'blinker.installed-key-initial-network.v1';
export const INITIAL_CLOUD_NETWORK_BODY_SIZE = 36;

export interface InstalledKeyInitialNetworkOperation {
  contract: typeof INITIAL_CLOUD_NETWORK_CONTRACT;
  operationId: string;
  sourceLogicalDeviceId: string;
  targetLogicalDeviceId: string;
  expectedRoot: {
    deviceInstanceId: string;
    accessEpoch: number;
    controllerId: string;
    credentialVersion: number;
    adminFingerprint: string;
  };
  existingLocator: string;
  expiresAt: number;
}

export interface InstalledKeyInitialNetworkAcceptance {
  operationId: string;
  existingLocator: string;
}

/** Independent network operation, never an issued/committed Key-install intent. */
export function snapshotInstalledKeyInitialNetwork(value: InstalledKeyInitialNetworkOperation): InstalledKeyInitialNetworkOperation {
  const invalid = () => { throw Error('INITIAL_CLOUD_NETWORK_CONTEXT_INVALID'); };
  if (!value || value.contract !== INITIAL_CLOUD_NETWORK_CONTRACT) return invalid();
  const { operationId, sourceLogicalDeviceId, targetLogicalDeviceId, existingLocator, expiresAt } = value;
  const root = value.expectedRoot;
  for (const id of [sourceLogicalDeviceId, targetLogicalDeviceId]) {
    if (typeof id !== 'string' || !id || id.trim() !== id || id.includes('\0') || id.includes('/')
      || new TextEncoder().encode(id).length > 128) invalid();
  }
  if (sourceLogicalDeviceId === targetLogicalDeviceId || !root
    || !Number.isSafeInteger(root.accessEpoch) || root.accessEpoch < 1 || root.accessEpoch > 0xffffffff
    || !Number.isSafeInteger(root.credentialVersion) || root.credentialVersion < 1 || root.credentialVersion > 0xffffffff
    || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) invalid();
  try {
    for (const id of [operationId, existingLocator, root.deviceInstanceId, root.controllerId]) base64UrlDecode(id, 16);
    base64UrlDecode(root.adminFingerprint, 32);
  } catch { invalid(); }
  return { contract: INITIAL_CLOUD_NETWORK_CONTRACT, operationId, sourceLogicalDeviceId, targetLogicalDeviceId,
    existingLocator, expiresAt, expectedRoot: { deviceInstanceId: root.deviceInstanceId, accessEpoch: root.accessEpoch,
      controllerId: root.controllerId, credentialVersion: root.credentialVersion, adminFingerprint: root.adminFingerprint } };
}

export function encodeInitialCloudNetworkHandoff(value: InstalledKeyInitialNetworkOperation): Uint8Array {
  const operation = snapshotInstalledKeyInitialNetwork(value), body = new Uint8Array(INITIAL_CLOUD_NETWORK_BODY_SIZE);
  body.set([0x83, 1, 0x50]); body.set(base64UrlDecode(operation.operationId, 16), 3);
  body[19] = 0x50; body.set(base64UrlDecode(operation.existingLocator, 16), 20);
  return body;
}

/** Only the dedicated, authenticated 0x3C exchange may supply this echo. */
export function confirmInitialCloudNetworkAcceptance(value: InstalledKeyInitialNetworkOperation,
  body: Uint8Array): InstalledKeyInitialNetworkAcceptance {
  const operation = snapshotInstalledKeyInitialNetwork(value);
  if (!(body instanceof Uint8Array) || body.length !== INITIAL_CLOUD_NETWORK_BODY_SIZE
    || body[0] !== 0x83 || body[1] !== 1 || body[2] !== 0x50 || body[19] !== 0x50
    || !constantTimeEqual(body.subarray(3, 19), base64UrlDecode(operation.operationId, 16))
    || !constantTimeEqual(body.subarray(20), base64UrlDecode(operation.existingLocator, 16))) {
    throw Error('INITIAL_CLOUD_NETWORK_ACK_INVALID');
  }
  return { operationId: operation.operationId, existingLocator: operation.existingLocator };
}
