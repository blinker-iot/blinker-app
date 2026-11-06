import { CapacitorBleControllerCredentialStore, clearBleControllerCredentialSecrets } from './credential-store';
import { sameBytes } from './wire';

type RootCredentials = Pick<CapacitorBleControllerCredentialStore, 'load' | 'invalidateRootReferences'>;
export interface KnownCredentialRootContext {
  cloudCredentialVersion?: number;
  accessEpoch?: number;
  controllerId?: Uint8Array;
}

// Call only after an authoritative, context-matched root version change.
// Network errors, rejected writes and presence observations are not evidence.
export async function invalidateKnownCredentialRoot(credentials: RootCredentials, logicalDeviceId: string,
  assertCurrent: () => void, expected?: KnownCredentialRootContext): Promise<void> {
  assertCurrent();
  let credential;
  try { credential = await credentials.load(logicalDeviceId); }
  catch (error) {
    assertCurrent();
    // The verified root marker already fences all its aliases. This also
    // makes explicit cleanup after an earlier successful invalidation stable.
    if (error instanceof Error && error.message === 'ACCESS_REGISTRATION_ROOT_CONTEXT_CHANGED') return;
    throw error;
  }
  try {
    assertCurrent();
    if (!credential) return;
    if (credential.logicalDeviceId !== logicalDeviceId) throw Error('ACCESS_REGISTRATION_ROOT_CONTEXT_CHANGED');
    // A confirmed replay for an old version cannot invalidate a newer local
    // binding. Compare the original mutation context before touching its root.
    if (expected && ((expected.cloudCredentialVersion !== undefined
      && credential.cloudContext?.credentialVersion !== expected.cloudCredentialVersion)
      || (expected.accessEpoch !== undefined && credential.accessEpoch !== expected.accessEpoch)
      || (expected.controllerId !== undefined && !sameBytes(credential.controllerId, expected.controllerId)))) return;
    if (credential.rootCredentialRef) {
      await credentials.invalidateRootReferences(credential.rootCredentialRef); assertCurrent();
    }
  } finally { if (credential) clearBleControllerCredentialSecrets(credential); }
}
