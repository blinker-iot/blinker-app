import { createCipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { Bc5AcceptanceClient, type Bc5AcceptanceAdmission } from './bc5-acceptance-client';
import { CLOUD_REGISTRATION_CONTRACT, confirmInitialCloudKeyAck, type CloudRegistrationCommitRequest,
  type IssuedCloudRegistration } from './cloud-registration-wire';
import { BleDirectCrypto } from './crypto';
import { Bc5InstallCheckpoints, type Bc5CheckpointPort } from './bc5-install-checkpoint';
import type { InitialCloudRegistrationInstallation, InitialCloudRegistrationOwner } from './client';
import type { BleDirectTarget } from './transport';

const bytes = (size: number, value: number) => Buffer.alloc(size, value);
const id = (value: number, size = 16) => bytes(size, value).toString('base64url');
const sha = (...parts: (Buffer | string)[]) => {
  const hash = createHash('sha256'); for (const part of parts) hash.update(part); return hash.digest();
};
const secret = bytes(32, 0x22);
const target = {} as BleDirectTarget; // Real carrier/Method 2 separately covered by cloud-registration-install.spec.
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const reply = (url: string, data: unknown, headers = { 'cache-control': 'no-store', 'content-type': 'application/json' }) => {
  const response = new Response(JSON.stringify({ status: 200, data }), { status: 200, headers });
  Object.defineProperty(response, 'url', { value: url });
  return response;
};

function harness() {
  const scope: Bc5AcceptanceAdmission = { origin: 'https://private-bc5.example.test', intentId: id(1),
    ownerUserId: 'test-owner', tenantId: 'test-tenant', sourceLogicalDeviceId: 'test-ble-source',
    region: 'Development', expiresAt: Date.now() + 150_000 };
  const expectedRoot = { kind: 'ble-no-cloud-key-v2', deviceInstanceId: id(2), accessEpoch: 7,
    controllerId: id(3), credentialVersion: 2, adminFingerprint: id(4, 32), cloudKey: { state: 'absent' } };
  const targetLogicalDeviceId = 'test-cloud-target';
  const clientNonce = id(5), issuedAt = Date.now(), expiresAt = issuedAt + 110_000;
  const locator = sha('blinker/device-key/locator/v1\0', secret).subarray(0, 16).toString('base64url');
  const issuanceDigest = sha(JSON.stringify(['blinker.access-registration-cloud.issuance.v2', scope.ownerUserId, scope.tenantId,
    scope.intentId, scope.sourceLogicalDeviceId, targetLogicalDeviceId,
    [expectedRoot.kind, expectedRoot.deviceInstanceId, expectedRoot.accessEpoch, expectedRoot.controllerId,
      expectedRoot.credentialVersion, expectedRoot.adminFingerprint, expectedRoot.cloudKey.state], clientNonce, 1, locator])).toString('base64url');
  const prepared = { contract: CLOUD_REGISTRATION_CONTRACT, intentId: scope.intentId, sourceLogicalDeviceId: scope.sourceLogicalDeviceId,
    targetLogicalDeviceId, registrationProduct: 'cloud', materialOwnerLogicalDeviceId: scope.sourceLogicalDeviceId,
    expectedRoot, clientNonce, expiresAt, state: 'prepared', quotaState: 'reserved', replayed: false };
  const issued = { ...prepared, state: 'key_issued', quotaState: 'held', targetKey: { credentialVersion: 1, locator, issuanceDigest, issuedAt } };
  const committed = { ...issued, state: 'committed', quotaState: 'consumed', rootBindingId: id(6), bindingRevision: 1,
    committedAt: issuedAt, device: { logicalDeviceId: targetLogicalDeviceId, tenantId: scope.tenantId, registrationProduct: 'cloud',
      state: 'active', cloudEnabled: true, credentialVersion: 1 } };
  const preflight = { intentId: scope.intentId, sourceLogicalDeviceId: scope.sourceLogicalDeviceId,
    serverSourceEligible: true, physicalStoreVerified: false };
  const session = { token: 'test-auth-token', accountId: scope.ownerUserId, region: scope.region };
  const check = vi.fn(() => undefined), abort = new AbortController();
  let transferAdjustment: 'none' | 'tamper' | 'other-intent' | 'wrong-key' = 'none';
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    const action = url.split('/').at(-1);
    if (action === 'preflight') return reply(url, preflight);
    if (action === 'prepare') return reply(url, prepared);
    if (action === 'issue') return reply(url, issued);
    if (action === 'read' || action === 'commit') return reply(url, committed);
    if (action === 'mark-unknown') return reply(url, { ...issued, state: 'install_unknown' });
    if (action === 'cancel') return reply(url, { ...prepared, state: 'cancelled' });
    if (action !== 'key') throw Error('unexpected action');
    const { recipientPublicKey } = JSON.parse(String(init.body));
    const sender = generateKeyPairSync('x25519'), senderPublicKey = sender.publicKey.export({ format: 'der', type: 'spki' })
      .subarray(-32).toString('base64url');
    const recipient = createPublicKey({ format: 'der', type: 'spki', key: Buffer.concat([
      Buffer.from('302a300506032b656e032100', 'hex'), Buffer.from(recipientPublicKey, 'base64url'),
    ]) });
    const domain = 'blinker.access-registration-bc5-key.v1';
    const aad = Buffer.from(JSON.stringify([domain, transferAdjustment === 'other-intent' ? id(23) : scope.intentId,
      recipientPublicKey, senderPublicKey]));
    const shared = diffieHellman({ privateKey: sender.privateKey, publicKey: recipient });
    const key = Buffer.from(hkdfSync('sha256', shared, sha(aad), domain, 32)), nonce = bytes(12, 0x07);
    const encrypt = createCipheriv('aes-256-gcm', key, nonce);
    encrypt.setAAD(aad);
    const ciphertext = Buffer.concat([encrypt.update(transferAdjustment === 'wrong-key' ? bytes(32, 0x24) : secret),
      encrypt.final(), encrypt.getAuthTag()]);
    if (transferAdjustment === 'tamper') ciphertext[0] ^= 1;
    return reply(url, { issued: { ...issued, ownerUserId: scope.ownerUserId, tenantId: scope.tenantId },
      transfer: { contract: 'access-registration-bc5-key-v1', senderPublicKey,
        nonce: nonce.toString('base64url'), ciphertext: ciphertext.toString('base64url') } });
  });
  const disk = new Map<string, string>();
  const storageKey = ({ scope, intentId }: { scope: string; intentId: string }) => `${scope}:${intentId}`;
  const port = {
    read: vi.fn<Bc5CheckpointPort['read']>(async key => ({ encoded: disk.get(storageKey(key)) ?? null })),
    compareAndSet: vi.fn<Bc5CheckpointPort['compareAndSet']>(async input => {
      const key = storageKey(input);
      if ((disk.get(key) ?? null) !== input.expected) return { applied: false };
      disk.set(key, input.encoded); return { applied: true };
    }),
  };
  const newClient = (admission = scope) => new Bc5AcceptanceClient(admission, () => session, check, fetcher, undefined, port);
  const client = newClient();
  const close = vi.fn(async () => undefined), radioWrite = vi.fn();
  const installInitialCloudRegistrationKey = vi.fn(async (metadata: IssuedCloudRegistration, _key: Uint8Array, _target: BleDirectTarget,
    owner: InitialCloudRegistrationOwner) => {
    await owner.beforeWrite(); owner.signal.throwIfAborted(); owner.assertCurrent(); radioWrite();
    const ack = Uint8Array.of(0x83, 1, 0x50, ...bytes(16, 1), 0x50, ...Buffer.from(metadata.targetKey.locator, 'base64url'));
    const confirmation = await confirmInitialCloudKeyAck(new BleDirectCrypto(), metadata, bytes(16, 8), bytes(16, 9), ack);
    return { close, confirmation } as unknown as InitialCloudRegistrationInstallation;
  });
  const direct = { installInitialCloudRegistrationKey };
  const start = async () => { await client.preflight(abort.signal); await client.prepare(abort.signal); return client.issue(abort.signal); };
  return { scope, session, check, abort, fetcher, client, newClient, start, issued, preflight, committed, disk, port, direct, close, radioWrite,
    install: () => client.installIssuedKey(direct, target, abort.signal),
    adjust(value: typeof transferAdjustment) { transferAdjustment = value; } };
}

describe('restricted BC5 acceptance transport', () => {
  async function originalCheckpoint(f: ReturnType<typeof harness>, armed = true) {
    const checkpoint = new Bc5InstallCheckpoints(f.scope, f.check, f.port);
    await checkpoint.reserve({ ...f.issued, ownerUserId: f.scope.ownerUserId,
      tenantId: f.scope.tenantId } as IssuedCloudRegistration, id(17));
    if (armed) await checkpoint.arm(id(17));
    return [...f.disk.values()][0];
  }

  it('uses only the new exact committed route and original armed checkpoint', async () => {
    const f = harness(), original = await originalCheckpoint(f);
    const url = `${f.scope.origin}/api/v2/internal/bc5-committed/${f.scope.intentId}`;
    f.fetcher.mockImplementationOnce(async () => reply(url, { commitId: id(17), committed: f.committed }));
    const client = f.newClient({ ...f.scope, expiresAt: Date.now() - 1 });
    expect(await client.readExactCommitted(f.abort.signal)).toMatchObject({ authoritativeCommitId: id(17), committed: f.committed });
    expect(f.fetcher).toHaveBeenCalledExactlyOnceWith(url, expect.objectContaining({ method: 'POST', cache: 'no-store',
      redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', body: JSON.stringify({ commitId: id(17) }),
      headers: expect.objectContaining({ 'X-Blinker-Contract': 'access-registration-bc5-committed-v1',
        Authorization: 'Bearer test-auth-token', 'x-region': 'Development' }) }));
    await expect(client.readExactCommitted(f.abort.signal)).rejects.toThrow('ATTEMPT_CONSUMED');
    expect(f.fetcher).toHaveBeenCalledOnce(); expect([...f.disk.values()]).toEqual([original]);
    expect(f.radioWrite).not.toHaveBeenCalled();
  });

  it('does not contact any route for missing or unarmed checkpoint', async () => {
    const f = harness();
    await expect(f.client.readExactCommitted(f.abort.signal)).rejects.toThrow('COMMIT_REQUIRED');
    await originalCheckpoint(f, false);
    await expect(f.client.readExactCommitted(f.abort.signal)).rejects.toThrow('COMMIT_REQUIRED');
    expect(f.fetcher).not.toHaveBeenCalled();
  });

  it.each(['wrong-commit', 'extra-fields', 'unknown', 'different-target', 'unavailable'] as const)(
    'fails closed without a fallback for %s', async change => {
      const f = harness(), original = await originalCheckpoint(f);
      f.fetcher.mockImplementationOnce(async url => {
        if (change === 'unavailable') throw Error('offline');
        const committed = { ...f.committed };
        if (change === 'unknown') committed.state = 'install_unknown';
        if (change === 'different-target') committed.targetLogicalDeviceId = 'different-card';
        return reply(url, { commitId: change === 'wrong-commit' ? id(18) : id(17), committed,
          ...(change === 'extra-fields' ? { extra: true } : {}) });
      });
      await expect(f.client.readExactCommitted(f.abort.signal)).rejects.toThrow();
      expect(f.fetcher).toHaveBeenCalledOnce(); expect([...f.disk.values()]).toEqual([original]);
      expect(f.radioWrite).not.toHaveBeenCalled();
    });

  it('uses the private exact scope and same-authority X25519 transfer; wipes the loan before awaiting BLE', async () => {
    const f = harness(), issued = await f.start();
    let observed: Uint8Array | undefined;
    const install = f.direct.installInitialCloudRegistrationKey.getMockImplementation()!;
    f.direct.installInitialCloudRegistrationKey.mockImplementationOnce(async (metadata, key, peer, owner) => {
      observed = key;
      expect(Buffer.from(key)).toEqual(secret);
      await Promise.resolve();
      expect(key).toEqual(new Uint8Array(32));
      return install(metadata, key, peer, owner);
    });
    const installed = await f.install();
    expect(observed).toEqual(new Uint8Array(32));
    const confirmation = installed.installation.confirmation;
    const request: CloudRegistrationCommitRequest = { ownerUserId: f.scope.ownerUserId, tenantId: f.scope.tenantId,
      intentId: f.scope.intentId, commitId: installed.commitId, ...confirmation };
    await expect(f.client.commit({ ...request, commitId: id(10) }, f.abort.signal)).rejects.toThrow('BC5_ACCEPTANCE_CONFIRMATION_INVALID');
    await expect(f.client.commit({ ...request, confirmationDigest: id(10, 32) }, f.abort.signal))
      .rejects.toThrow('BC5_ACCEPTANCE_CONFIRMATION_INVALID');
    await expect(f.client.commit(request, f.abort.signal)).resolves.toEqual(f.committed);
    expect(f.fetcher.mock.calls.map(([url]) => url)).toEqual(['preflight', 'prepare', 'issue', 'key', 'commit']
      .map(action => `${f.scope.origin}/api/v2/internal/bc5/${f.scope.intentId}/${action}`));
    for (const [, init] of f.fetcher.mock.calls) expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error',
      cache: 'no-store', headers: { Authorization: 'Bearer test-auth-token', 'x-region': 'Development',
        'X-Blinker-Contract': 'access-registration-bc5-v1' } });
    const keyBody = JSON.parse(String(f.fetcher.mock.calls[3][1].body));
    expect(Object.keys(keyBody)).toEqual(['recipientPublicKey']); expect(Buffer.from(keyBody.recipientPublicKey, 'base64url')).toHaveLength(32);
    const commitBody = JSON.parse(String(f.fetcher.mock.calls[4][1].body));
    expect(commitBody).toEqual({ commitId: request.commitId, ...confirmation });
    expect(JSON.stringify(f.fetcher.mock.calls)).not.toContain(secret.toString('base64url'));
  });

  it('rejects a wrong AEAD binding, altered ciphertext, or validly encrypted wrong Key without a resend', async () => {
    for (const alteration of ['other-intent', 'tamper', 'wrong-key'] as const) {
      const f = harness(); await f.start(); f.adjust(alteration);
      await expect(f.install()).rejects.toThrow('BC5_ACCEPTANCE_RESPONSE_INVALID');
      expect(f.direct.installInitialCloudRegistrationKey).not.toHaveBeenCalled();
      await expect(f.install()).rejects.toThrow('BC5_CHECKPOINT_RECOVERY_REQUIRED');
      expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith('/key'))).toHaveLength(1);
    }
  });

  it('rejects arbitrary origins, account change, wrong preflight identity and stale headers', async () => {
    const f = harness();
    for (const origin of ['http://private-bc5.example.test', f.scope.origin + '/other', 'https://user@private-bc5.example.test']) {
      expect(() => new Bc5AcceptanceClient({ ...f.scope, origin }, () => f.session, f.check, f.fetcher))
        .toThrow('BC5_ACCEPTANCE_ADMISSION_INVALID');
    }
    f.session.region = 'China';
    await expect(f.client.preflight(f.abort.signal)).rejects.toThrow('BC5_ACCEPTANCE_ACCOUNT_CHANGED');
    expect(f.fetcher).not.toHaveBeenCalled(); f.session.region = 'Development';
    f.fetcher.mockImplementationOnce(async url => reply(url, { ...f.preflight, intentId: id(28) }));
    await expect(f.client.preflight(f.abort.signal)).rejects.toThrow('BC5_ACCEPTANCE_RESPONSE_INVALID');
    await expect(f.client.prepare(f.abort.signal)).rejects.toThrow('BC5_ACCEPTANCE_PREFLIGHT_REQUIRED');
    f.fetcher.mockImplementationOnce(async url => reply(url, f.preflight, { 'cache-control': 'public', 'content-type': 'application/json' }));
    await expect(f.client.preflight(f.abort.signal)).rejects.toThrow('BC5_ACCEPTANCE_RESPONSE_INVALID');
    f.fetcher.mockImplementationOnce(async url => reply(url.replace('private-bc5', 'foreign'), f.preflight));
    await expect(f.client.preflight(f.abort.signal)).rejects.toThrow('BC5_ACCEPTANCE_RESPONSE_INVALID');
    f.fetcher.mockImplementationOnce(async url => reply(url, { oversized: 'x'.repeat(9000) }));
    await expect(f.client.preflight(f.abort.signal)).rejects.toThrow('BC5_ACCEPTANCE_RESPONSE_INVALID');
  });

  it('keeps uncertain prepare consumed and permits only explicit same-intent read afterward', async () => {
    const f = harness(); await f.client.preflight(f.abort.signal);
    f.fetcher.mockRejectedValueOnce(Error('private HTTP response details'));
    await expect(f.client.prepare(f.abort.signal)).rejects.toThrow(/^BC5_ACCEPTANCE_REQUEST_UNCONFIRMED$/);
    await expect(f.client.prepare(f.abort.signal)).rejects.toThrow('BC5_ACCEPTANCE_ATTEMPT_CONSUMED');
    await expect(f.client.read(f.abort.signal)).resolves.toEqual(f.committed);
    expect(f.fetcher.mock.calls.map(([url]) => url.split('/').at(-1))).toEqual(['preflight', 'prepare', 'read']);
  });

  it('rejects late region change, changed immutable root and a secret-shaped ledger projection', async () => {
    const changed = harness();
    changed.fetcher.mockImplementationOnce(async url => {
      changed.session.region = 'China'; return reply(url, changed.preflight);
    });
    await expect(changed.client.preflight(changed.abort.signal)).rejects.toThrow('BC5_ACCEPTANCE_ACCOUNT_CHANGED');
    const root = harness(); await root.client.preflight(root.abort.signal); await root.client.prepare(root.abort.signal);
    root.fetcher.mockImplementationOnce(async url => reply(url, { ...root.issued,
      expectedRoot: { ...root.issued.expectedRoot, accessEpoch: 9 } }));
    await expect(root.client.issue(root.abort.signal)).rejects.toThrow('BC5_ACCEPTANCE_RESPONSE_INVALID');
    const ledger = harness();
    ledger.fetcher.mockImplementationOnce(async url => reply(url, { ...ledger.committed, deviceKey: 'not-a-public-field' }));
    await expect(ledger.client.read(ledger.abort.signal)).rejects.toThrow('BC5_ACCEPTANCE_RESPONSE_INVALID');
  });
});

describe('BC5 native checkpoint ordering and cold read', () => {
  it('admits only one live attempt and waits for disk acknowledgement before Key loan and radio write', async () => {
    const f = harness(); await f.start();
    const write = f.port.compareAndSet.getMockImplementation()!;
    const first = deferred(), second = deferred();
    const reserved = deferred(), armed = deferred();
    f.port.compareAndSet.mockImplementation(async input => {
      const result = await write(input);
      if (!result.applied) return result;
      if (input.expected === null) { reserved.resolve(); await first.promise; }
      else { armed.resolve(); await second.promise; }
      return result;
    });
    const live = f.install();
    await reserved.promise;
    expect(f.fetcher.mock.calls.some(([url]) => url.endsWith('/key'))).toBe(false);
    await expect(f.install()).rejects.toThrow('BC5_CHECKPOINT_RECOVERY_REQUIRED');
    first.resolve(); await armed.promise;
    expect(f.radioWrite).not.toHaveBeenCalled();
    second.resolve(); await live;
    expect(f.radioWrite).toHaveBeenCalledOnce();
    const encoded = [...f.disk.values()][0];
    expect(Object.keys(JSON.parse(encoded))).toEqual(['version', 'issued', 'commitId', 'recordedAt', 'armedAt']);
    expect(encoded).not.toMatch(/sessionBinding|receipt|test-auth-token|controllerSecret|password/);
    expect(encoded).not.toContain(secret.toString('base64url'));
  });

  it('blocks radio if durable arm fails or the original owner/window dies while storage settles', async () => {
    for (const reason of ['disk', 'account', 'deadline', 'cancel'] as const) {
      const f = harness(); await f.start();
      const write = f.port.compareAndSet.getMockImplementation()!;
      const clock = vi.spyOn(Date, 'now');
      f.port.compareAndSet.mockImplementation(async input => {
        const result = await write(input);
        if (input.expected !== null) {
          if (reason === 'disk') throw Error('BC5_CHECKPOINT_STORAGE_FAILED');
          if (reason === 'account') f.session.accountId = 'different-account';
          if (reason === 'deadline') clock.mockReturnValue(f.scope.expiresAt);
          if (reason === 'cancel') f.abort.abort();
        }
        return result;
      });
      try { await expect(f.install()).rejects.toThrow(); }
      finally { clock.mockRestore(); }
      expect(f.radioWrite).not.toHaveBeenCalled();
      expect(f.disk.size).toBe(1);
      expect(f.fetcher.mock.calls.map(([url]) => url.split('/').at(-1))).toEqual(['preflight', 'prepare', 'issue', 'key']);
    }
  });

  it('reopens only the original record for explicit read, retaining evidence on mismatch or 404', async () => {
    const f = harness(); await f.start(); await f.install();
    f.fetcher.mockClear(); f.port.compareAndSet.mockClear();
    const recovery = f.newClient({ ...f.scope, expiresAt: Date.now() - 1 });
    const changedScope = f.newClient({ ...f.scope, tenantId: 'different-tenant' });
    await expect(changedScope.recoverInstall(f.abort.signal)).resolves.toBe('no-local-checkpoint');
    f.session.accountId = 'different-account';
    await expect(recovery.recoverInstall(f.abort.signal)).rejects.toThrow('BC5_ACCEPTANCE_ACCOUNT_CHANGED');
    expect(f.fetcher).not.toHaveBeenCalled(); f.session.accountId = f.scope.ownerUserId;
    const inspectCommitted = vi.fn(async () => undefined);
    f.fetcher.mockImplementationOnce(async url => reply(url, { ...f.issued, state: 'install_unknown' }));
    await expect(recovery.recoverInstall(f.abort.signal, inspectCommitted)).resolves.toBe('installation-unconfirmed');
    expect(inspectCommitted).not.toHaveBeenCalled();
    f.fetcher.mockImplementationOnce(async url => reply(url, { ...f.issued, targetKey: { ...f.issued.targetKey, issuanceDigest: id(22, 32) } }));
    await expect(recovery.recoverInstall(f.abort.signal)).rejects.toThrow('BC5_ACCEPTANCE_RESPONSE_INVALID');
    f.fetcher.mockImplementationOnce(async () => new Response(null, { status: 404 }));
    await expect(recovery.recoverInstall(f.abort.signal)).rejects.toThrow();
    f.fetcher.mockImplementationOnce(async url => reply(url, { ...f.committed, device: { ...f.committed.device, state: 'deleted' } }));
    await expect(recovery.recoverInstall(f.abort.signal)).rejects.toThrow('CLOUD_REGISTRATION_COMMIT_MISMATCH');
    await expect(recovery.recoverInstall(f.abort.signal, inspectCommitted)).resolves.toBe('activation-confirmed');
    expect(inspectCommitted).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ intentId: f.scope.intentId,
      sourceLogicalDeviceId: f.scope.sourceLogicalDeviceId }), f.committed);
    expect(f.fetcher.mock.calls.map(([url]) => url.split('/').at(-1))).toEqual(Array(5).fill('read'));
    expect(f.port.compareAndSet).not.toHaveBeenCalled(); expect(f.disk.size).toBe(1);
  });

  it('rejects a damaged checkpoint without issuing any network request or clearing it', async () => {
    const f = harness(); await f.start(); await f.install(); f.fetcher.mockClear();
    const [key, encoded] = [...f.disk.entries()][0];
    const damaged = JSON.stringify({ ...JSON.parse(encoded), receipt: {} });
    f.disk.set(key, damaged);
    await expect(f.newClient().recoverInstall(f.abort.signal)).rejects.toThrow('BC5_CHECKPOINT_CORRUPT');
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.disk.get(key)).toBe(damaged);
  });

  it('fails cold preflight without calling Gateway when the native store is unavailable or the same attempt exists', async () => {
    const f = harness();
    f.port.read.mockRejectedValueOnce(Error('BC5_CHECKPOINT_STORE_UNAVAILABLE'));
    await expect(f.client.preflight(f.abort.signal)).rejects.toThrow('BC5_CHECKPOINT_STORE_UNAVAILABLE');
    expect(f.fetcher).not.toHaveBeenCalled();
    await f.start(); await f.install(); f.fetcher.mockClear();
    await expect(f.newClient().preflight(f.abort.signal)).rejects.toThrow('BC5_CHECKPOINT_RECOVERY_REQUIRED');
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});
