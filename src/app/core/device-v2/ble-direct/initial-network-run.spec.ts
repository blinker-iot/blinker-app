import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WiFiProvCloudReadResult } from '../../model/response.model';
import type { InitialCloudWifiApply } from '../provisioning/wifiprov-initial-cloud-observation';
import type { Bc5CheckpointPort } from './bc5-install-checkpoint';
import type { InitialCloudNetworkOwner, InstalledKeyInitialNetworkHandoff } from './client';
import type { InitialCloudWifiCarrierConsumer, InitialCloudWifiCarrierUse } from './cloud-registration-carrier';
import type { IssuedCloudRegistration } from './cloud-registration-wire';
import { BleDirectCrypto } from './crypto';
import { INITIAL_CLOUD_NETWORK_CONTRACT } from './initial-cloud-network-wire';
import { InitialNetworkCheckpoints, type InitialNetworkAdmission } from './initial-network-checkpoint';
import { InitialNetworkPreflightStop, assertInitialNetworkCommittedBinding, assertInitialNetworkSourceCredential,
  runInstalledKeyInitialNetwork } from './initial-network-run';
import type { BleControllerCredential } from './credential-store';
import type { BleDirectTarget } from './transport';

type Input = Parameters<typeof runInstalledKeyInitialNetwork>[0];
const id = (value: number, size = 16) => Buffer.alloc(size, value).toString('base64url');
const clock = 1_800_000_000_000;
const crypto = new BleDirectCrypto(webcrypto as Crypto);
afterEach(() => vi.restoreAllMocks());

function fixture(opaqueTarget = false) {
  let now = clock, outcome: InitialCloudWifiApply = 'apply-queued', stale = false;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const admission: InitialNetworkAdmission = { contract: INITIAL_CLOUD_NETWORK_CONTRACT,
    operationId: id(1), sourceLogicalDeviceId: `ble_${id(2)}`,
    targetLogicalDeviceId: opaqueTarget ? `device_${id(3)}` : 'device_33333333-3333-4333-8333-333333333333',
    expectedRoot: { deviceInstanceId: id(4), accessEpoch: 5, controllerId: id(6), credentialVersion: 7,
      adminFingerprint: id(8, 32) }, existingLocator: id(9), expiresAt: clock + 120_000,
    origin: 'https://initial-network.example.test', region: 'Development', tenantId: 'test-tenant',
    ownerUserId: 'test-owner', cloudCredentialVersion: 1 };
  const issued: IssuedCloudRegistration = { contract: 'access-registration-cloud-v2', intentId: id(10),
    ownerUserId: admission.ownerUserId, tenantId: admission.tenantId,
    sourceLogicalDeviceId: admission.sourceLogicalDeviceId, targetLogicalDeviceId: admission.targetLogicalDeviceId,
    clientNonce: id(11), state: 'key_issued', expiresAt: clock - 1,
    expectedRoot: { ...admission.expectedRoot, kind: 'ble-no-cloud-key-v2', cloudKey: { state: 'absent' } },
    targetKey: { credentialVersion: 1, locator: admission.existingLocator, issuanceDigest: id(12, 32), issuedAt: clock - 60_000 } };
  const events: string[] = [], disk = new Map<string, string>();
  let failPhase: string | undefined;
  const port: Bc5CheckpointPort = {
    async read(key) { events.push('checkpoint-read'); return { encoded: disk.get(`${key.scope}:${key.intentId}`) ?? null }; },
    async compareAndSet(input) {
      const value = JSON.parse(input.encoded), phase = value.cloudObservedAt ? 'cloud-observed' : value.phase;
      events.push(`cas:${phase}`);
      if (phase === failPhase) throw Error('SIMULATED_CAS_FAILURE');
      const key = `${input.scope}:${input.intentId}`;
      if ((disk.get(key) ?? null) !== input.expected) return { applied: false };
      disk.set(key, input.encoded);
      return { applied: true };
    },
  };
  const stop = new AbortController();
  const assertCurrent = () => stop.signal.throwIfAborted();
  const createCheckpoints = () => new InitialNetworkCheckpoints(admission, assertCurrent, port, crypto, () => now);
  const checkpoints = createCheckpoints();
  const localClose = vi.fn(async () => { events.push('matching-local-close'); });
  const close = vi.fn(async () => { events.push('handoff-close'); });
  const carrierUse: InitialCloudWifiCarrierUse = { ssid: 'SIMULATED-CARRIER', passphrase: new Uint8Array(32),
    proofOfPossession: new Uint8Array(32), expiresAt: admission.expiresAt, signal: stop.signal, assertCurrent };
  const handoff: InstalledKeyInitialNetworkHandoff = {
    acceptance: { operationId: admission.operationId, existingLocator: admission.existingLocator },
    async useWifiCarrier<T>(consumer: InitialCloudWifiCarrierConsumer<T>): Promise<T> {
      events.push('use-carrier'); return consumer(carrierUse);
    },
    close,
  };
  // Only the sequencing port is mocked. These tokens are NOT real radio
  // frames, Method 2 authentication, a native ACK or a server commit proof.
  const request = vi.fn(async (_operation: Parameters<Input['direct']['requestInstalledKeyInitialNetwork']>[0],
    _target: BleDirectTarget, owner: InitialCloudNetworkOwner) => {
    await owner.beforeWrite(); events.push('simulated-0x3B');
    events.push('simulated-0x3C'); return handoff;
  });
  const read = vi.fn(async (): Promise<WiFiProvCloudReadResult> => {
    events.push('cloud-read');
    const attemptedAt = now; now += 3;
    return { device: { logicalDeviceId: admission.targetLogicalDeviceId, credentialVersion: admission.cloudCredentialVersion,
      locator: admission.existingLocator, state: 'active', cloudEnabled: true }, observation: {
      kind: 'online', deviceInstanceId: admission.expectedRoot.deviceInstanceId,
      issuedAt: stale ? attemptedAt - 1 : attemptedAt + 1, stateUpdatedAt: attemptedAt + 2, observedAt: now,
    } };
  });
  const input: Input = {
    admission, checkpoints, direct: { requestInstalledKeyInitialNetwork: request },
    selectSource: vi.fn(async () => { events.push('select-source'); return {} as BleDirectTarget; }),
    checkCarrier: vi.fn(async () => { events.push('carrier-preflight'); }),
    checkAuthority: vi.fn(async () => { events.push('committed-root-check'); assertInitialNetworkCommittedBinding(admission, issued); }),
    createCarrier: vi.fn(beforeSubmit => async () => {
      await beforeSubmit(); events.push('simulated-native-submit');
      return { outcome, attemptedAt: now, closeLocal: localClose };
    }),
    cloud: { signal: stop.signal, assertCurrent,
      assertCloud: vi.fn(async () => { events.push('cloud-available'); }), read },
    stage: vi.fn(),
  };
  return { admission, issued, events, disk, port, checkpoints, createCheckpoints, stop, input, handoff, request, read,
    localClose, close, setOutcome: (value: InitialCloudWifiApply) => { outcome = value; },
    fail: (phase: string) => { failPhase = phase; }, setStale: () => { stale = true; }, run: () => runInstalledKeyInitialNetwork(input) };
}

describe('installed-Key initial-network one-shot coordinator (mock ports only)', () => {
  it('accepts the original BLE-only Admin instead of requiring the opposite Cloud-to-BLE source', () => {
    const { admission } = fixture();
    const source: BleControllerCredential = { source: 'enrollment', state: 'active',
      logicalDeviceId: admission.sourceLogicalDeviceId, deviceInstanceId: new Uint8Array(16).fill(4), accessEpoch: 5,
      controllerId: new Uint8Array(16).fill(6), controllerSecret: new Uint8Array(32).fill(31),
      credentialVersion: 7, permissions: 15, intentId: new Uint8Array(16).fill(32),
      commitId: new Uint8Array(16).fill(33), receipt: new Uint8Array(32).fill(34) };
    expect(() => assertInitialNetworkSourceCredential(admission, source)).not.toThrow();
    // Persisted legacy enrollment uses the same default as the original BC-5 path.
    expect(() => assertInitialNetworkSourceCredential(admission, { ...source, source: undefined })).not.toThrow();
    expect(() => assertInitialNetworkSourceCredential(admission, undefined)).toThrow('BLE_SOURCE_REQUIRED');
    for (const patch of [
      { source: 'wifiprov' }, { source: 'access-registration' }, { state: 'pending' }, { permissions: 7 },
      { cloudContext: { credentialVersion: 1, locator: id(9) } },
      { keyRotation: { phase: 'prepared' } }, { logicalDeviceId: `ble_${id(40)}` },
      { deviceInstanceId: new Uint8Array(16).fill(41) }, { accessEpoch: 42 },
      { controllerId: new Uint8Array(16).fill(43) }, { credentialVersion: 44 },
    ]) expect(() => assertInitialNetworkSourceCredential(admission, { ...source, ...patch } as BleControllerCredential))
      .toThrow('BLE_SOURCE_REQUIRED');
  });

  it('retains a fixed pre-dispatch stop stage without retaining a raw error or sending a frame', async () => {
    for (const stage of ['authority', 'source'] as const) {
      const f = fixture();
      const failed = async () => { throw Error('DO_NOT_LOG_RAW_ERROR_BODY'); };
      if (stage === 'authority') f.input.checkAuthority = failed;
      else f.input.selectSource = failed;
      const error = await f.run().catch(error => error);
      expect(error).toBeInstanceOf(InitialNetworkPreflightStop);
      expect(error.stage).toBe(stage);
      expect(error.message).toBe('INITIAL_NETWORK_PREFLIGHT_STOP');
      expect(error.cause).toBeUndefined();
      expect(f.request).not.toHaveBeenCalled();
      expect(f.input.createCarrier).not.toHaveBeenCalled();
      expect(f.disk.size).toBe(0);
    }
  });

  it('awaits each durable marker before simulated handoff and native submission, then reads only after matching release', async () => {
    const f = fixture();
    await expect(f.run()).resolves.toEqual({ apply: 'apply-queued', cloud: 'online', checkpoint: 'recorded' });
    expect(f.events).toEqual(['checkpoint-read', 'carrier-preflight', 'cloud-available', 'committed-root-check', 'select-source',
      'cas:prepared', 'cas:dispatched', 'simulated-0x3B', 'simulated-0x3C', 'cas:accepted', 'use-carrier',
      'cas:wifi-dispatched', 'simulated-native-submit', 'cas:wifi-accepted', 'matching-local-close', 'cloud-available',
      'cloud-read', 'cas:cloud-observed', 'handoff-close']);
    expect(f.request).toHaveBeenCalledOnce(); expect(f.read).toHaveBeenCalledOnce(); expect(f.close).toHaveBeenCalledOnce();
    expect(f.read).toHaveBeenCalledExactlyOnceWith(new Uint8Array(16).fill(4), {
      logicalDeviceId: f.admission.targetLogicalDeviceId, credentialVersion: 1, locator: f.admission.existingLocator,
    }, f.stop.signal);
  });

  it('can read the original opaque Cloud logical identity without treating it as a Direct routing ID', async () => {
    const f = fixture(true);
    await expect(f.run()).resolves.toEqual({ apply: 'apply-queued', cloud: 'online', checkpoint: 'recorded' });
    expect(f.read).toHaveBeenCalledOnce();
    expect((await f.checkpoints.inspect())?.cloudObservedAt).toBeDefined();
  });

  it('compares the exact original five-root tuple, target, locator, version and distinct new operation', () => {
    const f = fixture();
    expect(() => assertInitialNetworkCommittedBinding(f.admission, f.issued)).not.toThrow();
    const roots = { deviceInstanceId: id(20), accessEpoch: 21, controllerId: id(22), credentialVersion: 23,
      adminFingerprint: id(24, 32) };
    for (const [key, value] of Object.entries(roots)) {
      const changed = structuredClone(f.issued);
      Object.assign(changed.expectedRoot, { [key]: value });
      expect(() => assertInitialNetworkCommittedBinding(f.admission, changed)).toThrow('COMMITTED_ROOT_CHANGED');
    }
    for (const patch of [
      { targetLogicalDeviceId: `device_${id(25)}` }, { sourceLogicalDeviceId: `ble_${id(26)}` },
      { ownerUserId: 'another-owner' }, { tenantId: 'another-tenant' }, { intentId: f.admission.operationId },
      { targetKey: { ...f.issued.targetKey, locator: id(27) } },
      { targetKey: { ...f.issued.targetKey, credentialVersion: 2 } },
    ]) expect(() => assertInitialNetworkCommittedBinding(f.admission, { ...f.issued, ...patch } as IssuedCloudRegistration))
      .toThrow('COMMITTED_ROOT_CHANGED');
    // Expired original metadata may be read; it is not a revived install intent.
    expect(f.issued.expiresAt).toBeLessThan(Date.now());
  });

  it('never re-enters an existing checkpoint, including prepared before any dispatch', async () => {
    const f = fixture(); await f.checkpoints.prepare();
    f.events.length = 0; f.input.checkpoints = f.createCheckpoints();
    await expect(f.run()).rejects.toThrow('RECOVERY_REQUIRED');
    expect(f.events).toEqual(['checkpoint-read']);
    expect(f.input.checkCarrier).not.toHaveBeenCalled(); expect(f.request).not.toHaveBeenCalled();
    expect(f.input.createCarrier).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
  });

  it.each(['dispatched', 'accepted', 'wifi-dispatched'])('does not enter the native submit after %s CAS failure', async phase => {
    const f = fixture(); f.fail(phase);
    await expect(f.run()).rejects.toThrow('WRITE_UNCONFIRMED');
    expect(f.events).not.toContain('simulated-native-submit');
    expect(f.events.includes('simulated-0x3B')).toBe(phase !== 'dispatched');
    expect(f.events.includes('cas:accepted')).toBe(phase !== 'dispatched');
    expect(f.read).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledTimes(phase === 'dispatched' ? 0 : 1);
    if (phase !== 'wifi-dispatched') expect(f.input.createCarrier).not.toHaveBeenCalled();
  });

  it('rejects a mismatched simulated 3C before accepted CAS or WiFi and releases the handoff', async () => {
    const f = fixture(); f.handoff.acceptance.operationId = id(28);
    await expect(f.run()).rejects.toThrow('ACK_INVALID');
    expect(f.events).not.toContain('cas:accepted'); expect(f.events).not.toContain('simulated-native-submit');
    expect(f.input.createCarrier).not.toHaveBeenCalled(); expect(f.close).toHaveBeenCalledOnce();
  });

  it('retains accepted WiFi when its local journal fails and never rolls back or resubmits it', async () => {
    const f = fixture(); f.fail('wifi-accepted');
    await expect(f.run()).resolves.toEqual({ apply: 'apply-queued', cloud: 'online', checkpoint: 'unconfirmed' });
    expect(f.events.filter(value => value === 'simulated-native-submit')).toHaveLength(1);
    expect(f.events).not.toContain('cas:cloud-observed');
    expect(f.request).toHaveBeenCalledOnce(); expect(f.read).toHaveBeenCalledOnce(); expect(f.close).toHaveBeenCalledOnce();
    expect((await f.checkpoints.inspect())?.phase).toBe('wifi-dispatched');
  });

  it('does not confirm Cloud using a session issued before the native attempt', async () => {
    const f = fixture(); f.setStale();
    await expect(f.run()).resolves.toEqual({ apply: 'apply-queued', cloud: 'unconfirmed', checkpoint: 'recorded' });
    expect(f.events).not.toContain('cas:cloud-observed');
    expect((await f.checkpoints.inspect())?.cloudObservedAt).toBeUndefined();
    expect(f.read).toHaveBeenCalledOnce();
  });

  it('keeps WiFi UNKNOWN independent from Cloud online and recovery inspection cannot replay the operation', async () => {
    const f = fixture(); f.setOutcome('apply-unknown');
    await expect(f.run()).resolves.toEqual({ apply: 'apply-unknown', cloud: 'online', checkpoint: 'recorded' });
    const before = f.events.length;
    const recovered = f.createCheckpoints();
    expect((await recovered.inspect())?.phase).toBe('wifi-unknown');
    f.input.checkpoints = recovered;
    await expect(f.run()).rejects.toThrow('RECOVERY_REQUIRED');
    expect(f.events.slice(before)).toEqual(['checkpoint-read', 'checkpoint-read']);
    expect(f.events.filter(value => value === 'simulated-native-submit')).toHaveLength(1);
    expect(f.request).toHaveBeenCalledOnce(); expect(f.read).toHaveBeenCalledOnce();
  });
});
