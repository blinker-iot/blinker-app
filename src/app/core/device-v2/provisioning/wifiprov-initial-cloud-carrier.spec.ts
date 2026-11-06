import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { InitialCloudWifiCarrierUse } from '../ble-direct/cloud-registration-carrier';
import { WiFiProvCloudBoundary } from './wifiprov-cloud-boundary';
import { assertInitialCloudWifiProvAvailable, createInitialCloudWifiProvConsumer,
  InitialCloudWifiContinuation } from './wifiprov-initial-cloud-carrier';

const scopeOwner = (session = '4af0631b-6360-43e5-91f8-2381b97efd70') => ({ kind: 'isolated-softap', version: 1, session });
const mismatch = scopeOwner('4af0631b-6360-43e5-91f8-2381b97efd71');
const candidateSsid = 'BLK-a1b2c3d4e5f6a789';
const asBytes = (value: string) => new TextEncoder().encode(value);

function fixture() {
  const boundary = new WiFiProvCloudBoundary(), abort = new AbortController();
  const owner = scopeOwner(), proof = 'a'.repeat(32), passphrase = 'b'.repeat(32);
  const device = { name: candidateSsid, transport: 'softap', security: 1, localOwner: owner, capabilities: [] };
  const client = {
    getCapabilities: vi.fn(async () => ({ softApProvisioning: true, softApInitialCloudWifiOnly: true })),
    checkPermissions: vi.fn(async (_options: unknown) => ({ location: 'granted', nearbyWifi: 'granted' })),
    getProvisioningNetworkState: vi.fn(async () => ({ softApAttempted: false })),
    createDevice: vi.fn(async (_options: unknown) => ({ ...device, connected: false })),
    connect: vi.fn(async (_options: unknown) => ({ ...device, connected: true })),
    submitInitialCloudWifi: vi.fn(async (_options: unknown) => ({ outcome: 'apply-queued', localOwner: owner })),
    closeInitialCloudWifi: vi.fn(async ({ candidateId }: { candidateId: string }): Promise<unknown> => (
      { candidateId, release: 'binder-death', localOwner: owner }
    )),
  };
  const use: InitialCloudWifiCarrierUse = { ssid: candidateSsid, passphrase: asBytes(passphrase), proofOfPossession: asBytes(proof),
    expiresAt: Date.now() + 60_000, signal: abort.signal, assertCurrent: () => abort.signal.throwIfAborted() };
  const assertForeground = vi.fn(() => undefined);
  const create = (continuation?: Parameters<typeof createInitialCloudWifiProvConsumer>[4]) =>
    createInitialCloudWifiProvConsumer(client as never, { ssid: 'fixture-home', password: 'fixture-pass' },
      assertForeground, boundary, continuation);
  return { boundary, abort, client, use, create, assertForeground, owner, proof, passphrase, device };
}

describe('opt-in initial Cloud SoftAP worker', () => {
  it('projects only connect timeout tokens and cannot change a clean no-submit outcome when its sink throws', async () => {
    for (const sinkThrows of [false, true]) {
      const f = fixture(), beforeSubmit = vi.fn(async () => {});
      const diagnostic = vi.fn(() => { if (sinkThrows) throw Error('private sink detail'); });
      f.client.connect.mockRejectedValueOnce(Object.assign(Error('private upstream arguments'), { code: 'WIFIPROV_CONNECT_TIMEOUT' }));
      const consume = f.create({ gate: new InitialCloudWifiContinuation(() => {}), assertContext: () => {}, beforeSubmit, diagnostic });
      await expect(consume(f.use)).resolves.toMatchObject({ outcome: 'not-sent' });
      expect(diagnostic.mock.calls).toEqual([['connect', 'timeout']]);
      expect(f.client.connect).toHaveBeenCalledOnce(); expect(beforeSubmit).not.toHaveBeenCalled();
      expect(f.client.submitInitialCloudWifi).not.toHaveBeenCalled(); expect(f.client.closeInitialCloudWifi).toHaveBeenCalledOnce();
      expect(f.boundary.blocked).toBe(false);
      await expect(consume(f.use)).rejects.toThrow('WIFIPROV_INITIAL_CLOUD_CONSUMED');
      expect(diagnostic).toHaveBeenCalledOnce(); expect(f.client.connect).toHaveBeenCalledOnce();
    }
  });

  it('uses exact existing codes only and never forwards upstream messages, causes or arguments', async () => {
    const cases = [
      ['create', 'WIFIPROV_WORKER_BIND_TIMEOUT', 'timeout'],
      ['connect', 'WIFIPROV_OPERATION_CANCELLED', 'cancelled'],
      ['connect', 'BLE_DIRECT_APP_INACTIVE', 'foreground'],
      ['connect', 'WIFIPROV_OWNER_NOT_CURRENT', 'owner'],
      ['connect', 'WIFIPROV_CONNECT_TIMEOUT_private', 'unclassified'],
      ['submit', 'WIFIPROV_RESPONSE_UNCONFIRMED', 'receipt'],
      ['checkpoint', 'INITIAL_NETWORK_CHECKPOINT_WRITE_UNCONFIRMED', 'checkpoint'],
    ] as const;
    for (const [stage, code, reason] of cases) {
      const f = fixture(), diagnostic = vi.fn();
      const error = Object.assign(Error('private message with arguments'), { code, cause: { private: 'not projected' } });
      const beforeSubmit = vi.fn(async () => { if (stage === 'checkpoint') throw error; });
      if (stage === 'create') f.client.createDevice.mockRejectedValueOnce(error);
      else if (stage === 'connect') f.client.connect.mockRejectedValueOnce(error);
      else if (stage === 'submit') f.client.submitInitialCloudWifi.mockRejectedValueOnce(error);
      const result = await f.create({ gate: new InitialCloudWifiContinuation(() => {}), assertContext: () => {}, beforeSubmit, diagnostic })(f.use);
      expect(result.outcome).toBe(stage === 'submit' ? 'apply-unknown' : 'not-sent');
      expect(diagnostic.mock.calls).toEqual([[stage === 'checkpoint' ? 'submit' : stage, reason]]);
      expect(f.client.submitInitialCloudWifi).toHaveBeenCalledTimes(stage === 'submit' ? 1 : 0);
      expect(f.client.closeInitialCloudWifi).toHaveBeenCalledOnce(); expect(f.boundary.blocked).toBe(false);
    }
  });

  it('reports at most one inner stop plus one unconfirmed close without changing the release fence', async () => {
    for (const sinkThrows of [false, true]) {
      const f = fixture(), diagnostic = vi.fn(() => { if (sinkThrows) throw Error('private sink detail'); });
      f.client.connect.mockRejectedValueOnce(Object.assign(Error('private connect detail'), { code: 'WIFIPROV_CONNECT_TIMEOUT' }));
      f.client.closeInitialCloudWifi.mockRejectedValueOnce(Error('private close detail'));
      await expect(f.create({ gate: new InitialCloudWifiContinuation(() => {}), assertContext: () => {}, diagnostic })(f.use))
        .rejects.toThrow('WIFIPROV_CLOSE_UNCONFIRMED');
      expect(diagnostic.mock.calls).toEqual([['connect', 'timeout'], ['close', 'release-unconfirmed']]);
      expect(f.client.connect).toHaveBeenCalledOnce(); expect(f.client.submitInitialCloudWifi).not.toHaveBeenCalled();
      expect(f.client.closeInitialCloudWifi).toHaveBeenCalledOnce(); expect(f.boundary.blocked).toBe(true);
    }
  });

  it('keeps the old default diagnostic-free and does not inspect its exception', async () => {
    const f = fixture(), readCode = vi.fn(() => 'WIFIPROV_CONNECT_TIMEOUT');
    const error = Object.defineProperty({}, 'code', { get: readCode });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      f.client.connect.mockRejectedValueOnce(error);
      await expect(f.create()(f.use)).resolves.toMatchObject({ outcome: 'not-sent' });
      expect(readCode).not.toHaveBeenCalled(); expect(warning).not.toHaveBeenCalled();
      expect(f.client.submitInitialCloudWifi).not.toHaveBeenCalled(); expect(f.client.closeInitialCloudWifi).toHaveBeenCalledOnce();
      expect(f.boundary.blocked).toBe(false);
    } finally { warning.mockRestore(); }
  });

  it('opts in only the private initial-network Service carrier, not ordinary BC5', () => {
    const source = readFileSync(new URL('../../services/device-v2-ble.service.ts', import.meta.url), 'utf8');
    const start = source.indexOf('\n  runInstalledKeyInitialNetwork('), end = source.indexOf('\n  inspectInstalledKeyInitialNetwork(');
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const marker = "diagnostic: (phase, reason) => console.warn('INITIAL_NETWORK_WIFI_STOP', phase, reason)";
    expect(source.slice(start, end)).toContain(marker);
    expect(source.split('INITIAL_NETWORK_WIFI_STOP')).toHaveLength(2);
    expect(source.slice(0, start)).not.toContain('diagnostic:');
  });

  it('settles the optional dispatch CAS before one native submit; uncertainty never submits', async () => {
    for (const confirmed of [false, true]) {
      const f = fixture();
      let durable = false;
      const beforeSubmit = vi.fn(async () => {
        await Promise.resolve();
        if (!confirmed) throw Error('WRITE_UNCONFIRMED');
        durable = true;
      });
      f.client.submitInitialCloudWifi.mockImplementationOnce(async () => {
        expect(durable).toBe(true);
        return { outcome: 'apply-queued', localOwner: f.owner };
      });
      const consume = f.create({ gate: new InitialCloudWifiContinuation(() => undefined),
        assertContext: () => f.abort.signal.throwIfAborted(), beforeSubmit });
      const result = await consume(f.use);
      expect(result.outcome).toBe(confirmed ? 'apply-queued' : 'not-sent');
      expect(beforeSubmit).toHaveBeenCalledOnce();
      expect(f.client.submitInitialCloudWifi).toHaveBeenCalledTimes(confirmed ? 1 : 0);
      expect(f.client.closeInitialCloudWifi).toHaveBeenCalledOnce();
      expect(f.boundary.blocked).toBe(false);
      await expect(consume(f.use)).rejects.toThrow('WIFIPROV_INITIAL_CLOUD_CONSUMED');
    }
  });

  it('retains only the original connect over pause; foreground return never sends without an explicit confirmation', async () => {
    const f = fixture(), waiting = vi.fn(), gate = new InitialCloudWifiContinuation(waiting);
    const assertContext = () => f.use.signal.throwIfAborted();
    let foreground = true, connected!: () => void;
    f.assertForeground.mockImplementation(() => { if (!foreground) throw Error('BACKGROUND'); });
    f.client.connect.mockImplementationOnce(() => new Promise(resolve => {
      connected = () => resolve({ ...f.device, connected: true });
    }));
    const pending = f.create({ gate, assertContext })(f.use);
    expect(gate.pause()).toBe(false);
    await vi.waitFor(() => expect(f.client.connect).toHaveBeenCalledOnce());
    expect(gate.pause()).toBe(true); foreground = false;
    gate.continue(); // An early click cannot prepay the later explicit action.
    connected(); await vi.waitFor(() => expect(waiting).toHaveBeenCalledWith(true));
    expect(f.boundary.blocked).toBe(true); expect(f.client.submitInitialCloudWifi).not.toHaveBeenCalled();
    foreground = true;
    await Promise.resolve();
    expect(f.client.submitInitialCloudWifi).not.toHaveBeenCalled();
    gate.continue(); gate.continue();
    await expect(pending).resolves.toMatchObject({ outcome: 'apply-queued' });
    expect(f.client.connect).toHaveBeenCalledOnce(); expect(f.client.submitInitialCloudWifi).toHaveBeenCalledOnce();
    expect(f.client.closeInitialCloudWifi).toHaveBeenCalledOnce(); expect(f.boundary.blocked).toBe(false);
  });

  it('does not let a background confirmation or true stop reuse the retained result', async () => {
    for (const stop of [false, true]) {
      const f = fixture(), waiting = vi.fn(), gate = new InitialCloudWifiContinuation(waiting);
      let foreground = true, connected!: () => void;
      f.assertForeground.mockImplementation(() => { if (!foreground) throw Error('BACKGROUND'); });
      f.client.connect.mockImplementationOnce(() => new Promise(resolve => {
        connected = () => resolve({ ...f.device, connected: true });
      }));
      const pending = expect(f.create({ gate, assertContext: () => f.use.signal.throwIfAborted() })(f.use)).rejects.toThrow();
      await vi.waitFor(() => expect(f.client.connect).toHaveBeenCalledOnce());
      expect(gate.pause()).toBe(true); foreground = false;
      connected(); await vi.waitFor(() => expect(waiting).toHaveBeenCalledWith(true));
      if (stop) f.abort.abort(); else gate.continue();
      await pending;
      foreground = true; gate.continue();
      expect(f.client.submitInitialCloudWifi).not.toHaveBeenCalled();
      expect(f.client.closeInitialCloudWifi).toHaveBeenCalledOnce(); expect(f.boundary.blocked).toBe(false);
    }
  });

  it('never offers confirmation for a late connect result from a different native owner', async () => {
    const f = fixture(), waiting = vi.fn(), gate = new InitialCloudWifiContinuation(waiting);
    let connected!: () => void;
    f.client.connect.mockImplementationOnce(() => new Promise(resolve => {
      connected = () => resolve({ ...f.device, connected: true, localOwner: mismatch });
    }));
    const pending = f.create({ gate, assertContext: () => undefined })(f.use);
    await vi.waitFor(() => expect(f.client.connect).toHaveBeenCalledOnce());
    expect(gate.pause()).toBe(true); connected();
    await expect(pending).resolves.toMatchObject({ outcome: 'not-sent' });
    expect(waiting).not.toHaveBeenCalledWith(true); expect(f.client.submitInitialCloudWifi).not.toHaveBeenCalled();
    expect(f.client.closeInitialCloudWifi).toHaveBeenCalledOnce();
  });

  it('provides read-only cold preflight and rechecks prerequisites at actual native entry', async () => {
    const f = fixture(), preflight = () => assertInitialCloudWifiProvAvailable(f.client as never, f.use.signal,
      f.assertForeground, f.boundary);
    await expect(preflight()).resolves.toBeUndefined();
    expect(f.boundary.blocked).toBe(false); expect(f.client.createDevice).not.toHaveBeenCalled();
    f.client.checkPermissions.mockResolvedValueOnce({ location: 'denied', nearbyWifi: 'granted' });
    await expect(f.create()(f.use)).rejects.toThrow('WIFIPROV_PERMISSION_REQUIRED');
    expect(f.client.createDevice).not.toHaveBeenCalled();
    const lease = f.boundary.enter();
    await expect(preflight()).rejects.toThrow('WIFIPROV_CLOUD_BOUNDARY_BUSY');
    expect(f.client.getCapabilities).toHaveBeenCalledTimes(2);
    await lease.retire(async () => undefined);
  });

  it('isolates once, correlates native create/connect/submit/close and exposes Apply queued only after matching death', async () => {
    const f = fixture(), consume = f.create();
    let retire!: () => void;
    f.client.closeInitialCloudWifi.mockImplementationOnce(({ candidateId }) => new Promise(resolve => {
      retire = () => resolve({ candidateId, release: 'binder-death', localOwner: f.owner });
    }));
    const pending = consume(f.use);
    await vi.waitFor(() => expect(f.client.closeInitialCloudWifi).toHaveBeenCalledOnce());
    expect(f.boundary.blocked).toBe(true);
    const request = f.client.createDevice.mock.calls[0][0] as { candidateId: string; remainingMs: number };
    expect(request.candidateId).toMatch(/^[0-9a-f-]{36}$/);
    expect(request.remainingMs).toBeGreaterThan(0); expect(request.remainingMs).toBeLessThanOrEqual(60_000);
    expect(request).toMatchObject({ name: candidateSsid, transport: 'softap', security: 1, softApPurpose: 'blinker-initial-cloud',
      pop: f.proof, softApPassword: f.passphrase, expiresAt: f.use.expiresAt });
    expect(f.client.checkPermissions).toHaveBeenCalledExactlyOnceWith({ transport: 'softap', softApConnectionMode: 'system-connected' });
    expect(f.client.connect).toHaveBeenCalledExactlyOnceWith({ softApConnectionMode: 'sdk-managed', candidateId: request.candidateId });
    expect(f.client.submitInitialCloudWifi).toHaveBeenCalledExactlyOnceWith({ candidateId: request.candidateId,
      ssid: 'fixture-home', password: 'fixture-pass' });
    expect(f.client.closeInitialCloudWifi).toHaveBeenCalledExactlyOnceWith({ candidateId: request.candidateId });
    retire();
    const result = await pending;
    expect(result).toMatchObject({ outcome: 'apply-queued', attemptedAt: expect.any(Number) });
    await result.closeLocal();
    expect(f.client.closeInitialCloudWifi).toHaveBeenCalledOnce();
    expect(f.boundary.blocked).toBe(false); expect(f.client.getProvisioningNetworkState).toHaveBeenCalledTimes(2);
    await expect(consume(f.use)).rejects.toThrow('WIFIPROV_INITIAL_CLOUD_CONSUMED');
    expect(f.client.submitInitialCloudWifi).toHaveBeenCalledOnce();
  });

  it('never falls back without the opted-in native capability, exact owner or foreground', async () => {
    const unsupported = fixture();
    unsupported.client.getCapabilities.mockResolvedValueOnce({ softApProvisioning: true, softApInitialCloudWifiOnly: false });
    await expect(unsupported.create()(unsupported.use)).rejects.toThrow('WIFIPROV_INITIAL_CLOUD_UNSUPPORTED');
    expect(unsupported.client.createDevice).not.toHaveBeenCalled();
    const noPermission = fixture();
    noPermission.client.checkPermissions.mockResolvedValueOnce({ location: 'denied', nearbyWifi: 'granted' });
    await expect(noPermission.create()(noPermission.use)).rejects.toThrow('WIFIPROV_PERMISSION_REQUIRED');
    expect(noPermission.client.createDevice).not.toHaveBeenCalled();
    const swapped = fixture();
    swapped.client.connect.mockResolvedValueOnce({ ...swapped.device, connected: true, localOwner: mismatch });
    const swappedResult = await swapped.create()(swapped.use);
    expect(swappedResult.outcome).toBe('not-sent'); expect(swappedResult.attemptedAt).toBeUndefined();
    expect(swapped.client.submitInitialCloudWifi).not.toHaveBeenCalled(); expect(swapped.boundary.blocked).toBe(false);
    const hidden = fixture();
    hidden.client.connect.mockImplementationOnce(async () => {
      hidden.assertForeground.mockImplementation(() => { throw Error('BACKGROUND'); });
      return { ...hidden.device, connected: true };
    });
    await expect(hidden.create()(hidden.use)).rejects.toThrow('BACKGROUND');
    expect(hidden.client.submitInitialCloudWifi).not.toHaveBeenCalled(); expect(hidden.boundary.blocked).toBe(false);
  });

  it('preserves native no-Apply outcomes and treats malformed/foreign/rejected receipts as possibly sent', async () => {
    for (const outcome of ['set-unconfirmed', 'apply-not-sent', 'not-sent', 'apply-unknown']) {
      const f = fixture(); f.client.submitInitialCloudWifi.mockResolvedValueOnce({ outcome, localOwner: f.owner });
      await expect(f.create()(f.use)).resolves.toMatchObject({ outcome, attemptedAt: expect.any(Number) });
      expect(f.client.submitInitialCloudWifi).toHaveBeenCalledOnce();
    }
    for (const receipt of [{ outcome: 'connected', localOwner: scopeOwner() }, { outcome: 'apply-queued', localOwner: mismatch }]) {
      const f = fixture(); f.client.submitInitialCloudWifi.mockResolvedValueOnce(receipt);
      await expect(f.create()(f.use)).resolves.toMatchObject({ outcome: 'apply-unknown' });
      expect(f.client.submitInitialCloudWifi).toHaveBeenCalledOnce();
    }
    const rejected = fixture(); rejected.client.submitInitialCloudWifi.mockRejectedValueOnce(Error('private payload'));
    await expect(rejected.create()(rejected.use)).resolves.toMatchObject({ outcome: 'apply-unknown' });
    expect(rejected.client.submitInitialCloudWifi).toHaveBeenCalledOnce();
  });

  it('keeps the Cloud boundary fenced on wrong death proof or old sticky main-process hazard', async () => {
    for (const altered of [{ release: 'not-started' }, { localOwner: mismatch }, { candidateId: crypto.randomUUID() }]) {
      const f = fixture();
      f.client.closeInitialCloudWifi.mockImplementationOnce(async ({ candidateId }) => ({ candidateId,
        release: 'binder-death', localOwner: f.owner, ...altered }));
      await expect(f.create()(f.use)).rejects.toThrow('WIFIPROV_CLOSE_UNCONFIRMED');
      expect(f.boundary.blocked).toBe(true); expect(f.client.closeInitialCloudWifi).toHaveBeenCalledOnce();
    }
    const hazard = fixture();
    hazard.client.getProvisioningNetworkState.mockResolvedValueOnce({ softApAttempted: true });
    await expect(hazard.create()(hazard.use)).rejects.toThrow('WIFIPROV_CLOSE_UNCONFIRMED');
    expect(hazard.client.createDevice).not.toHaveBeenCalled();
    const late = fixture();
    late.client.getProvisioningNetworkState.mockResolvedValueOnce({ softApAttempted: false }).mockResolvedValueOnce({ softApAttempted: true });
    await expect(late.create()(late.use)).rejects.toThrow('WIFIPROV_CLOSE_UNCONFIRMED');
    expect(late.boundary.blocked).toBe(true);
  });

  it('closes a cancelled startup by its own candidate ID and never advances a late result', async () => {
    const f = fixture();
    let failCreate!: () => void;
    f.client.createDevice.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      failCreate = () => reject(Error('late startup outcome'));
    }));
    f.client.closeInitialCloudWifi.mockImplementationOnce(async ({ candidateId }) => ({ candidateId, release: 'not-started' }));
    const pending = expect(f.create()(f.use)).rejects.toThrow();
    await vi.waitFor(() => expect(f.client.createDevice).toHaveBeenCalledOnce());
    expect(f.boundary.blocked).toBe(true);
    f.abort.abort();
    await vi.waitFor(() => expect(f.client.closeInitialCloudWifi).toHaveBeenCalledOnce());
    failCreate(); await pending;
    expect(f.client.connect).not.toHaveBeenCalled(); expect(f.client.submitInitialCloudWifi).not.toHaveBeenCalled();
    expect(f.boundary.blocked).toBe(false);
  });

  it('retires a local lease without native close only when no create was invoked', async () => {
    const f = fixture();
    f.boundary.subscribe(blocked => { if (blocked) f.abort.abort(); });
    await expect(f.create()(f.use)).rejects.toThrow();
    expect(f.client.createDevice).not.toHaveBeenCalled(); expect(f.client.closeInitialCloudWifi).not.toHaveBeenCalled();
    expect(f.boundary.blocked).toBe(false);
    const malformed = fixture(); malformed.use.passphrase.fill(0);
    await expect(malformed.create()(malformed.use)).resolves.toMatchObject({ outcome: 'not-sent' });
    expect(malformed.client.createDevice).not.toHaveBeenCalled(); expect(malformed.client.closeInitialCloudWifi).not.toHaveBeenCalled();
    expect(malformed.boundary.blocked).toBe(false);
  });
});
