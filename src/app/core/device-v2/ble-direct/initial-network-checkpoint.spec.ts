import { createHash, webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Bc5CheckpointPort } from './bc5-install-checkpoint';
import { BleDirectCrypto } from './crypto';
import { INITIAL_CLOUD_NETWORK_CONTRACT } from './initial-cloud-network-wire';
import { INITIAL_NETWORK_CHECKPOINT_NAMESPACE, InitialNetworkCheckpoints, snapshotInitialNetworkAdmission,
  type InitialNetworkAdmission } from './initial-network-checkpoint';

const id = (value: number, size = 16) => Buffer.alloc(size, value).toString('base64url');
const crypto = new BleDirectCrypto(webcrypto as Crypto);
const scope = (admission: InitialNetworkAdmission, namespace = INITIAL_NETWORK_CHECKPOINT_NAMESPACE) =>
  createHash('sha256').update(JSON.stringify([namespace, admission.origin, admission.region,
    admission.tenantId, admission.ownerUserId])).digest('base64url');
function admission(): InitialNetworkAdmission {
  return { contract: INITIAL_CLOUD_NETWORK_CONTRACT, operationId: id(1), sourceLogicalDeviceId: `ble_${id(2)}`,
    targetLogicalDeviceId: `device_${id(3)}`, expectedRoot: { deviceInstanceId: id(4), accessEpoch: 5,
      controllerId: id(6), credentialVersion: 7, adminFingerprint: id(8, 32) }, existingLocator: id(9),
    expiresAt: 1_800_000_600_000, origin: 'https://network-private.example.test', region: 'Development',
    tenantId: 'tenant-test', ownerUserId: 'owner-test', cloudCredentialVersion: 1 };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
class MemoryPort implements Bc5CheckpointPort {
  readonly values = new Map<string, string>();
  readonly reads: Array<{ scope: string; intentId: string }> = [];
  readonly writes: Array<{ scope: string; intentId: string; expected: string | null; encoded: string }> = [];
  failAfterApply = false;
  result: boolean | undefined = true;
  gate?: ReturnType<typeof deferred>;
  async read(key: { scope: string; intentId: string }): Promise<{ encoded: string | null }> {
    this.reads.push({ ...key });
    return { encoded: this.values.get(`${key.scope}:${key.intentId}`) ?? null };
  }
  async compareAndSet(input: { scope: string; intentId: string; expected: string | null; encoded: string }): Promise<{ applied: boolean }> {
    this.writes.push({ ...input });
    await this.gate?.promise;
    const key = `${input.scope}:${input.intentId}`;
    if ((this.values.get(key) ?? null) !== input.expected || this.result === false) return { applied: false };
    if (this.result === true) this.values.set(key, input.encoded);
    if (this.failAfterApply) throw Error('checked disk commit unavailable');
    return { applied: this.result as boolean };
  }
}
function harness() {
  const context = admission(), port = new MemoryPort();
  let now = 1_800_000_000_000, current = true;
  const guard = () => { if (!current) throw Error('ACCOUNT_OR_OWNER_CANCELLED'); };
  const create = (value = context) => new InitialNetworkCheckpoints(value, guard, port, crypto, () => now);
  return { context, port, create, tick: (ms = 1) => now += ms, setNow: (value: number) => { now = value; },
    cancel: () => { current = false; }, now: () => now };
}

describe('installed-Key initial-network checked checkpoints', () => {
  it('snapshots the wire operation without accepting extra or secret-shaped data', () => {
    const value = admission(), snapshot = snapshotInitialNetworkAdmission(value);
    value.expectedRoot.accessEpoch = 99;
    expect(snapshot.expectedRoot.accessEpoch).toBe(5);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.expectedRoot)).toBe(true);
    for (const altered of [
      { ...admission(), secret: 'forbidden' }, { ...admission(), locator: id(9) },
      { ...admission(), operationId: id(0) }, { ...admission(), operationId: `${id(1)}=` },
      { ...admission(), origin: 'http://network-private.example.test' },
      { ...admission(), origin: 'https://network-private.example.test/path' },
      { ...admission(), cloudCredentialVersion: 0 },
      { ...admission(), expectedRoot: { ...admission().expectedRoot, binding: 'forbidden' } },
    ]) expect(() => snapshotInitialNetworkAdmission(altered)).toThrow('INITIAL_NETWORK_CHECKPOINT_INVALID');
    const getter = { ...admission() };
    Object.defineProperty(getter, 'ownerUserId', { enumerable: true, get() { throw Error('must not call'); } });
    expect(() => snapshotInitialNetworkAdmission(getter)).toThrow('INITIAL_NETWORK_CHECKPOINT_INVALID');
  });

  it('uses an independent native scope and never reads or modifies the old BC5 record', async () => {
    const h = harness(), checkpoint = h.create();
    const oldKey = `${scope(h.context, 'blinker.bc5-checkpoint.v1')}:${h.context.operationId}`;
    h.port.values.set(oldKey, 'original opaque BC5 record');
    const prepared = await checkpoint.prepare();
    expect(prepared.phase).toBe('prepared');
    expect(await checkpoint.inspect()).toEqual(prepared);
    expect(h.port.writes[0]).toMatchObject({ scope: scope(h.context), intentId: h.context.operationId, expected: null });
    expect(h.port.reads).toEqual([{ scope: scope(h.context), intentId: h.context.operationId }]);
    expect(h.port.values.get(oldKey)).toBe('original opaque BC5 record');
    expect(Object.keys(JSON.parse(h.port.writes[0].encoded))).toEqual([
      'version', 'purpose', 'admission', 'phase', 'createdAt', 'updatedAt',
    ]);
  });

  it('separates acceptance, WiFi result and fresh Cloud observation without rewriting an unknown receipt', async () => {
    const h = harness(), checkpoint = h.create();
    await checkpoint.prepare(); h.tick(); await checkpoint.markDispatch();
    h.tick(); await checkpoint.markAccepted();
    expect((await checkpoint.inspect())?.wifiDispatchedAt).toBeUndefined();
    h.tick(); await checkpoint.markWifiDispatch();
    const dispatchedAt = h.now();
    h.tick(); await checkpoint.markWifiResult('unknown');
    h.tick(3); await checkpoint.markCloudObserved({ issuedAt: dispatchedAt + 1,
      stateUpdatedAt: dispatchedAt + 2, observedAt: dispatchedAt + 3 });
    const result = await checkpoint.inspect();
    expect(result).toMatchObject({ phase: 'wifi-unknown', wifiDispatchedAt: dispatchedAt,
      cloudIssuedAt: dispatchedAt + 1, cloudStateUpdatedAt: dispatchedAt + 2, cloudObservedAt: dispatchedAt + 3 });
    await expect(checkpoint.markWifiDispatch()).rejects.toThrow('PHASE_CONFLICT');
    await expect(checkpoint.markDispatch()).rejects.toThrow('PHASE_CONFLICT');
    expect(h.port.writes).toHaveLength(6);
  });

  it('can record Cloud observation before a later accepted WiFi result, but cannot contradict it with rejection', async () => {
    const h = harness(), checkpoint = h.create();
    await checkpoint.prepare(); await checkpoint.markDispatch(); await checkpoint.markAccepted(); await checkpoint.markWifiDispatch();
    const issuedAt = h.tick(); h.tick();
    await checkpoint.markCloudObserved({ issuedAt, stateUpdatedAt: h.now(), observedAt: h.now() });
    await expect(checkpoint.markWifiResult('rejected')).rejects.toThrow('PHASE_CONFLICT');
    await checkpoint.markWifiResult('accepted');
    expect(await checkpoint.inspect()).toMatchObject({ phase: 'wifi-accepted', cloudIssuedAt: issuedAt });
  });

  it('makes recovered prepared and dispatched checkpoints read-only, including through a new instance', async () => {
    for (const dispatched of [false, true]) {
      const h = harness(), writer = h.create();
      await writer.prepare();
      if (dispatched) await writer.markDispatch();
      const recovered = h.create();
      expect((await recovered.inspect())?.phase).toBe(dispatched ? 'dispatched' : 'prepared');
      const count = h.port.writes.length;
      await expect(recovered.markDispatch()).rejects.toThrow('RECOVERY_REQUIRED');
      await expect(recovered.markAccepted()).rejects.toThrow('RECOVERY_REQUIRED');
      expect(h.port.writes).toHaveLength(count);
      await expect(recovered.prepare()).rejects.toThrow('RECOVERY_REQUIRED');
      expect(h.port.writes).toHaveLength(count);
      expect((await recovered.inspect())?.phase).toBe(dispatched ? 'dispatched' : 'prepared');
    }
  });

  it('does not permit dispatch until its exact CAS has completed durably', async () => {
    const h = harness(), checkpoint = h.create();
    await checkpoint.prepare();
    const gate = deferred(); h.port.gate = gate;
    let sent = false;
    const dispatch = (async () => { await checkpoint.markDispatch(); sent = true; })();
    await Promise.resolve(); await Promise.resolve();
    expect(sent).toBe(false);
    await expect(checkpoint.markDispatch()).rejects.toThrow('RECOVERY_REQUIRED');
    gate.resolve(); await dispatch;
    expect(sent).toBe(true);
    expect((await checkpoint.inspect())?.phase).toBe('dispatched');
  });

  it('locks the live writer after a false, malformed or failed-after-apply CAS and does not retry', async () => {
    for (const mode of ['false', 'unconfirmed', 'applied-throw'] as const) {
      const h = harness(), checkpoint = h.create();
      await checkpoint.prepare();
      if (mode === 'false') h.port.result = false;
      if (mode === 'unconfirmed') h.port.result = undefined;
      if (mode === 'applied-throw') h.port.failAfterApply = true;
      await expect(checkpoint.markDispatch()).rejects.toThrow(mode === 'false' ? 'RECOVERY_REQUIRED' : 'WRITE_UNCONFIRMED');
      h.port.result = true; h.port.failAfterApply = false;
      const count = h.port.writes.length;
      await expect(checkpoint.markDispatch()).rejects.toThrow('RECOVERY_REQUIRED');
      await expect(checkpoint.markAccepted()).rejects.toThrow('RECOVERY_REQUIRED');
      expect(h.port.writes).toHaveLength(count);
      expect((await checkpoint.inspect())?.phase).toBe(mode === 'applied-throw' ? 'dispatched' : 'prepared');
    }
  });

  it('keeps an expired checkpoint inspectable but cannot dispatch or confirm after deadline or clock rollback', async () => {
    const h = harness(), checkpoint = h.create();
    await checkpoint.prepare();
    h.setNow(h.context.expiresAt);
    await expect(checkpoint.markDispatch()).rejects.toThrow('WINDOW_CLOSED');
    expect((await checkpoint.inspect())?.phase).toBe('prepared');
    expect(h.port.writes).toHaveLength(1);
    h.setNow(1_800_000_000_001); // Returning the clock cannot reopen an expired owner.
    await expect(checkpoint.markDispatch()).rejects.toThrow('RECOVERY_REQUIRED');
    expect(h.port.writes).toHaveLength(1);
    const rollback = harness(), fresh = rollback.create(); await fresh.prepare();
    rollback.setNow(1_799_999_999_999);
    await expect(fresh.markDispatch()).rejects.toThrow('WINDOW_CLOSED');
    rollback.setNow(1_800_000_000_001);
    await expect(fresh.markDispatch()).rejects.toThrow('RECOVERY_REQUIRED');
    expect(rollback.port.writes).toHaveLength(1);
  });

  it('does not write after owner/account cancellation during scope hashing or CAS completion', async () => {
    const h = harness(), checkpoint = h.create();
    const preparing = checkpoint.prepare();
    h.cancel();
    await expect(preparing).rejects.toThrow('ACCOUNT_OR_OWNER_CANCELLED');
    expect(h.port.writes).toHaveLength(0);

    const active = harness(), writer = active.create(); await writer.prepare();
    const gate = deferred(); active.port.gate = gate;
    const dispatch = writer.markDispatch();
    await Promise.resolve(); await Promise.resolve();
    active.cancel(); gate.resolve();
    await expect(dispatch).rejects.toThrow('ACCOUNT_OR_OWNER_CANCELLED');
    const count = active.port.writes.length;
    await expect(writer.markAccepted()).rejects.toThrow('ACCOUNT_OR_OWNER_CANCELLED');
    expect(active.port.writes).toHaveLength(count);
  });

  it('fails closed on damaged, extra-field or cross-context records instead of treating them as absent', async () => {
    const h = harness(), checkpoint = h.create(); await checkpoint.prepare();
    const key = `${scope(h.context)}:${h.context.operationId}`, raw = h.port.values.get(key)!;
    for (const broken of ['{', raw.replace('"version":1', '"version":1,"version":1'),
      raw.replace('"phase":"prepared"', '"phase":"dispatched"'),
      raw.replace('"ownerUserId":"owner-test"', '"ownerUserId":"other-owner"'),
      raw.replace('"version":1', '"sessionBinding":"forbidden","version":1')]) {
      h.port.values.set(key, broken);
      await expect(h.create().inspect()).rejects.toThrow('CHECKPOINT_INVALID');
    }
    expect(h.port.writes).toHaveLength(1);
  });

  it('rejects stale Cloud evidence and receipt-to-Cloud conflation without another CAS', async () => {
    const h = harness(), checkpoint = h.create();
    await checkpoint.prepare(); await checkpoint.markDispatch(); await checkpoint.markAccepted();
    await expect(checkpoint.markCloudObserved({ issuedAt: h.now(), stateUpdatedAt: h.now(), observedAt: h.now() }))
      .rejects.toThrow('PHASE_CONFLICT');
    await checkpoint.markWifiDispatch(); const dispatched = h.now(); h.tick(3);
    await expect(checkpoint.markCloudObserved({ issuedAt: dispatched, stateUpdatedAt: h.now(), observedAt: h.now() }))
      .rejects.toThrow('CHECKPOINT_INVALID');
    await expect(checkpoint.markCloudObserved({ issuedAt: dispatched + 1, stateUpdatedAt: dispatched + 2, observedAt: h.now() + 1 }))
      .rejects.toThrow('CHECKPOINT_INVALID');
    await checkpoint.markWifiResult('rejected');
    await expect(checkpoint.markCloudObserved({ issuedAt: dispatched + 1, stateUpdatedAt: dispatched + 2, observedAt: h.now() }))
      .rejects.toThrow('PHASE_CONFLICT');
    expect(h.port.writes).toHaveLength(5);
  });
});
