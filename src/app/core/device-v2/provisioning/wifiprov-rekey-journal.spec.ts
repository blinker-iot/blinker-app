import { beforeEach, describe, expect, it, vi } from 'vitest';
import { base64UrlEncode } from '../base64url';
import { applyWiFiProvRekeyEvent, createWiFiProvRekeyCheckpoint, type WiFiProvRekeyScope } from './wifiprov-rekey-checkpoint';
import { CapacitorWiFiProvRekeyJournal } from './wifiprov-rekey-journal';

const mock = vi.hoisted(() => ({ native: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mock.native } }));
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: { getItem: mock.get, setItem: mock.set } }));

const id = (byte: number) => base64UrlEncode(new Uint8Array(16).fill(byte));
const scope: WiFiProvRekeyScope = { authority: 'https://iot.example.test', accountId: 'account-1', region: 'Development',
  logicalDeviceId: 'device_00000000-0000-4000-8000-000000000001', deviceInstanceId: id(1),
  accessEpoch: 1, operationId: id(2), previous: { credentialVersion: 1, locator: id(3) } };

function fixture() {
  const account = { authority: scope.authority, accountId: scope.accountId, sessionEpoch: 1 };
  const journal = new CapacitorWiFiProvRekeyJournal(() => account);
  const prepared = createWiFiProvRekeyCheckpoint(scope, 100);
  const dispatched = applyWiFiProvRekeyEvent(prepared, scope, { kind: 'dispatch', step: 'prepare' }, 101);
  return { account, journal, prepared, dispatched };
}

describe('native rekey dispatch journal', () => {
  const disk = new Map<string, string>();
  beforeEach(() => {
    disk.clear(); mock.native.mockReset().mockReturnValue(true);
    mock.get.mockReset().mockImplementation(async key => disk.get(key) ?? null);
    mock.set.mockReset().mockImplementation(async (key, value) => { disk.set(key, value); });
  });

  it('keeps an exact dispatch across a new instance and rejects stale CAS and a different operation', async () => {
    const { journal, prepared, dispatched } = fixture();
    expect(await journal.load(scope.logicalDeviceId)).toBeUndefined();
    await journal.replace(undefined, prepared);
    await journal.replace(prepared, dispatched);
    expect(await fixture().journal.load(scope.logicalDeviceId)).toEqual(dispatched);
    await expect(journal.replace(prepared, dispatched)).rejects.toThrow('CHECKPOINT_CONFLICT');
    await expect(journal.replace(undefined, createWiFiProvRekeyCheckpoint({ ...scope, operationId: id(4) }, 103)))
      .rejects.toThrow('CHECKPOINT_CONFLICT');
    expect(mock.set).toHaveBeenCalledTimes(2);
  });

  it('does not borrow a journal across owners or write through a changed login epoch', async () => {
    const { journal, account, prepared, dispatched } = fixture();
    await journal.replace(undefined, prepared);
    account.accountId = 'account-2';
    expect(await journal.load(scope.logicalDeviceId)).toBeUndefined();
    await expect(journal.replace(undefined, prepared)).rejects.toThrow('CHECKPOINT_CONFLICT');
    account.accountId = scope.accountId;
    mock.get.mockImplementationOnce(async key => { ++account.sessionEpoch; return disk.get(key) ?? null; });
    await expect(journal.replace(prepared, dispatched)).rejects.toThrow('CHECKPOINT_CONFLICT');
    expect(mock.set).toHaveBeenCalledTimes(1);
  });

  it('rejects concurrent edits, corrupt storage, and an unverified native write', async () => {
    const { journal, prepared } = fixture();
    let finish!: (value: null) => void;
    mock.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = journal.load(scope.logicalDeviceId);
    await expect(journal.replace(undefined, prepared)).rejects.toThrow('CHECKPOINT_CONFLICT');
    finish(null);
    await pending;
    mock.set.mockResolvedValueOnce(undefined);
    await expect(journal.replace(undefined, prepared)).rejects.toThrow('CHECKPOINT_CONFLICT');
    mock.get.mockResolvedValueOnce('x'.repeat(2049));
    await expect(journal.load(scope.logicalDeviceId)).rejects.toThrow('CHECKPOINT_CONFLICT');
  });

  it('has no browser storage fallback and rejects another region', async () => {
    const { journal } = fixture();
    await expect(journal.replace(undefined, createWiFiProvRekeyCheckpoint({ ...scope, region: 'China' }, 100)))
      .rejects.toThrow('CHECKPOINT_CONFLICT');
    mock.native.mockReturnValue(false);
    await expect(journal.load(scope.logicalDeviceId)).rejects.toThrow('SECURE_STORAGE_REQUIRED');
    expect(mock.set).not.toHaveBeenCalled();
  });
});
