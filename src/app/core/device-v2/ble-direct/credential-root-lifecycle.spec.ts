import { describe, expect, it, vi } from 'vitest';
import { invalidateKnownCredentialRoot } from './credential-root-lifecycle';

function fixture(rootCredentialRef: string | undefined = 'root') {
  const credential = { logicalDeviceId: 'card', rootCredentialRef, controllerSecret: new Uint8Array(32).fill(3),
    presenceKeys: [{ key: new Uint8Array(16).fill(4) }] };
  const store = { load: vi.fn(async () => credential), invalidateRootReferences: vi.fn(async () => ['card', 'other-card']) };
  return { credential, store };
}

describe('authoritative root change lifecycle', () => {
  it('invalidates the one shared root, not just a single logical card, and clears temporary secret copies', async () => {
    const f = fixture();
    await invalidateKnownCredentialRoot(f.store as any, 'card', () => undefined);
    expect(f.store.invalidateRootReferences).toHaveBeenCalledExactlyOnceWith('root');
    expect(f.credential.controllerSecret.some(Boolean)).toBe(false);
    expect(f.credential.presenceKeys[0].key.some(Boolean)).toBe(false);
  });
  it('preserves the old inline lifecycle without inventing a shared-root identifier', async () => {
    const f = fixture(undefined); f.credential.rootCredentialRef = undefined;
    await invalidateKnownCredentialRoot(f.store as any, 'card', () => undefined);
    expect(f.store.invalidateRootReferences).not.toHaveBeenCalled();
  });
  it('does not mutate the root if account ownership changed during the credential read', async () => {
    const f = fixture(); let current = true;
    f.store.load.mockImplementationOnce(async () => { current = false; return f.credential; });
    await expect(invalidateKnownCredentialRoot(f.store as any, 'card', () => {
      if (!current) throw Error('ACCOUNT_CHANGED');
    })).rejects.toThrow('ACCOUNT_CHANGED');
    expect(f.store.invalidateRootReferences).not.toHaveBeenCalled();
    expect(f.credential.controllerSecret.some(Boolean)).toBe(false);
  });
  it('treats an existing stale marker as idempotent but does not relabel ordinary storage failures', async () => {
    const f = fixture();
    f.store.load.mockRejectedValueOnce(Error('ACCESS_REGISTRATION_ROOT_CONTEXT_CHANGED'));
    await invalidateKnownCredentialRoot(f.store as any, 'card', () => undefined);
    f.store.load.mockRejectedValueOnce(Error('disk'));
    await expect(invalidateKnownCredentialRoot(f.store as any, 'card', () => undefined)).rejects.toThrow('disk');
    expect(f.store.invalidateRootReferences).not.toHaveBeenCalled();
  });
  it('rejects a mismatched card instead of touching an unrelated root', async () => {
    const f = fixture();
    await expect(invalidateKnownCredentialRoot(f.store as any, 'another', () => undefined)).rejects.toThrow('ROOT_CONTEXT_CHANGED');
    expect(f.store.invalidateRootReferences).not.toHaveBeenCalled();
  });
  it('does not invalidate a newer local binding when an older root operation is replayed', async () => {
    const f = fixture(); Object.assign(f.credential, { cloudContext: { credentialVersion: 3 }, accessEpoch: 2,
      controllerId: new Uint8Array(16).fill(2) });
    await invalidateKnownCredentialRoot(f.store as any, 'card', () => undefined, { cloudCredentialVersion: 2 });
    expect(f.store.invalidateRootReferences).not.toHaveBeenCalled();
    await invalidateKnownCredentialRoot(f.store as any, 'card', () => undefined, { accessEpoch: 1 });
    expect(f.store.invalidateRootReferences).not.toHaveBeenCalled();
    await invalidateKnownCredentialRoot(f.store as any, 'card', () => undefined, { accessEpoch: 2,
      controllerId: new Uint8Array(16).fill(2), cloudCredentialVersion: 3 });
    expect(f.store.invalidateRootReferences).toHaveBeenCalledExactlyOnceWith('root');
  });
});
