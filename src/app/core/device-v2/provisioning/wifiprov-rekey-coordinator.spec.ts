import { describe, expect, it, vi } from 'vitest';
import { base64UrlDecode, base64UrlEncode } from '../base64url';
import type { WiFiProvRekeyCheckpoint, WiFiProvRekeyScope } from './wifiprov-rekey-checkpoint';
import { WiFiProvRekeyCoordinator, type WiFiProvRekeyPorts, type WiFiProvRekeyServerState } from './wifiprov-rekey-coordinator';

const bytes = (n: number, size = 16) => new Uint8Array(size).fill(n);
const id = (n: number) => base64UrlEncode(bytes(n));
const scope: WiFiProvRekeyScope = { authority: 'https://example.test', accountId: 'owner', region: 'Development',
  logicalDeviceId: 'device_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', deviceInstanceId: id(1), accessEpoch: 2,
  operationId: id(2), previous: { credentialVersion: 4, locator: id(3) } };
const nextLocator = id(4);
const options = { ssid: ' exact network ', password: 'never-persist-this' };
const meta = (state: WiFiProvRekeyServerState['state']): WiFiProvRekeyServerState => ({ logicalDeviceId: scope.logicalDeviceId,
  operationId: scope.operationId, fromVersion: 4, toVersion: 5, state, ...(state === 'prepared' ? {} : { newLocator: nextLocator }),
  binding: { operationId: scope.operationId, challenge: id(5), instance: scope.deviceInstanceId, accessEpoch: 2, fromVersion: 4, oldLocator: id(3) } });
const failure = Error('synthetic lost response');

function setup() {
  let clock = 100, saved: WiFiProvRekeyCheckpoint | undefined;
  let pageCurrent = true, localCurrent = true;
  const calls: string[] = [], transfer = { iv: bytes(6, 12), box: bytes(7, 48) }, permit = bytes(8, 32);
  const journal = { load: vi.fn(async (_logicalId: string) => saved), replace: vi.fn(async (expected: WiFiProvRekeyCheckpoint | undefined,
    next: WiFiProvRekeyCheckpoint) => {
    if (JSON.stringify(saved) !== JSON.stringify(expected)) throw Error('journal CAS conflict');
    expect(JSON.stringify(next)).not.toContain(options.password);
    saved = JSON.parse(JSON.stringify(next));
  }) };
  const gateway = {
    prepare: vi.fn(async () => { calls.push(`prepare:${saved?.phase}`); return meta('prepared'); }),
    issue: vi.fn(async (_scope, proof: Uint8Array) => {
      calls.push(`issue:${saved?.phase}`); expect(proof).toEqual(bytes(4, 32));
      return { ...meta('key_issued'), transfer };
    }),
    confirm: vi.fn(async (_scope, receipt: Uint8Array) => {
      calls.push(`confirm:${saved?.phase}`); expect([5, 6]).toContain(receipt[0]);
      return { ...meta('committed'), wifiPermit: permit };
    }),
    read: vi.fn(async () => { calls.push(`read:${saved?.phase}`); return meta('key_issued'); }),
  };
  const request = vi.fn(async (endpoint: string, payload: Uint8Array) => {
    expect(endpoint).toBe('blinker-config');
    const op = payload[1];
    calls.push(`op-${op}:${saved?.phase}`);
    const reply = new Uint8Array(op === 7 ? 19 : 51);
    reply.set([2, op, 0]); reply.set(base64UrlDecode(scope.operationId, 16), 3);
    if (op !== 7) reply.fill(op, 19);
    return reply;
  });
  const local = { transport: { request }, assertCurrent: vi.fn(() => { if (!localCurrent) throw Error('local retired'); }),
    authorize: vi.fn(async () => { calls.push(`authorize:${saved?.phase}`); }),
    provision: vi.fn(async (_wifi, checkpoint: WiFiProvRekeyCheckpoint) => {
      expect(checkpoint).toEqual(saved); calls.push(`wifi:${saved?.phase}`); return { success: true };
    }) };
  const ports: WiFiProvRekeyPorts = { journal, gateway, local, assertCurrent: () => { if (!pageCurrent) throw Error('owner changed'); },
    onCommitted: vi.fn(async checkpoint => { expect(checkpoint).toEqual(saved); calls.push(`metadata:${saved?.phase}`); }),
    explicitWiFiRejection: error => error instanceof Error && error.message === 'explicit-auth-rejection', clock: () => ++clock };
  return { coordinator: () => new WiFiProvRekeyCoordinator(ports), gateway, journal, local, request, calls, transfer, permit,
    saved: () => saved, retirePage: () => { pageCurrent = false; }, retireLocal: () => { localCurrent = false; } };
}

describe('App owner-scoped rekey coordinator', () => {
  it('orders exact local proofs and Gateway CAS before the one authorized WiFi call', async () => {
    const f = setup();
    await expect(f.coordinator().start(scope, options)).resolves.toMatchObject({ phase: 'wifi-accepted', scope,
      next: { credentialVersion: 5, locator: nextLocator } });
    expect(f.calls).toEqual(['prepare:prepare-dispatched', 'authorize:prepare-confirmed', 'op-4:prepare-confirmed',
      'issue:issue-dispatched', 'op-5:install-dispatched', 'confirm:commit-dispatched', 'metadata:committed', 'op-7:committed', 'wifi:wifi-dispatched']);
    expect(f.gateway.issue.mock.calls[0][1].some(Boolean)).toBe(false);
    expect(f.gateway.confirm.mock.calls[0][1].some(Boolean)).toBe(false);
    expect([f.transfer.iv, f.transfer.box, f.permit].every(value => !value.some(Boolean))).toBe(true);
  });

  it('old rooted firmware rejecting the fixed challenge cannot issue, install, confirm or Apply', async () => {
    const f = setup(); f.request.mockResolvedValueOnce(Uint8Array.of(2, 4, 3));
    await expect(f.coordinator().start(scope, options)).rejects.toMatchObject({ code: 'WIFIPROV_REKEY_DEVICE_REJECTED' });
    expect(f.saved()?.phase).toBe('prepare-confirmed');
    expect(f.gateway.issue).not.toHaveBeenCalled(); expect(f.gateway.confirm).not.toHaveBeenCalled(); expect(f.local.provision).not.toHaveBeenCalled();
  });

  it('refuses to send Install when the pre-dispatch journal CAS fails', async () => {
    const f = setup(), replace = f.journal.replace.getMockImplementation()!;
    f.journal.replace.mockImplementation((expected, next) => next.phase === 'install-dispatched'
      ? Promise.reject(failure) : replace(expected, next));
    await expect(f.coordinator().start(scope, options)).rejects.toBe(failure);
    expect(f.saved()?.phase).toBe('issued');
    expect(f.request).toHaveBeenCalledTimes(1); expect(f.local.provision).not.toHaveBeenCalled();
  });

  it('read-only issue recovery only records metadata, not another transfer or Install', async () => {
    const f = setup(); f.gateway.issue.mockRejectedValueOnce(failure);
    await expect(f.coordinator().start(scope, options)).rejects.toBe(failure);
    expect(f.saved()?.phase).toBe('issue-unknown');
    await expect(f.coordinator().reconcile(scope)).resolves.toMatchObject({ phase: 'issued' });
    expect(f.request).toHaveBeenCalledTimes(1);
    await expect(f.coordinator().start(scope, options)).rejects.toThrow('journal CAS conflict');
    expect(f.gateway.issue).toHaveBeenCalledTimes(1); expect(f.local.provision).not.toHaveBeenCalled();
  });

  it('only reads on Install UNKNOWN; explicit continuation reads fresh again before the first commit', async () => {
    const f = setup(), request = f.request.getMockImplementation()!;
    f.request.mockImplementationOnce(request).mockResolvedValueOnce(Uint8Array.of(2, 5, 9));
    await expect(f.coordinator().start(scope, options)).rejects.toMatchObject({ code: 'PROVISIONING_RESULT_UNKNOWN' });
    expect(f.saved()?.phase).toBe('install-unknown');
    await expect(f.coordinator().reconcile(scope)).resolves.toMatchObject({ phase: 'installed' });
    expect(f.gateway.confirm).not.toHaveBeenCalled(); expect(f.local.provision).not.toHaveBeenCalled();
    await expect(f.coordinator().continueInstalled(scope)).resolves.toMatchObject({ phase: 'committed' });
    expect(f.calls.filter(call => call.startsWith('op-5:'))).toEqual([]); // First install used the one mocked UNKNOWN response.
    expect(f.calls.filter(call => call.startsWith('op-6:'))).toHaveLength(2);
    expect(f.gateway.confirm).toHaveBeenCalledTimes(1);
    expect(f.local.provision).not.toHaveBeenCalled();
    expect(f.calls.filter(call => call.startsWith('op-7:'))).toEqual([]);
    expect(f.permit.some(Boolean)).toBe(false);
  });

  it('reconciles a lost commit from Gateway committed state only, never sends 06, permit or WiFi', async () => {
    const f = setup(); f.gateway.confirm.mockRejectedValueOnce(failure);
    await expect(f.coordinator().start(scope, options)).rejects.toBe(failure);
    expect(f.saved()?.phase).toBe('commit-unknown');
    await expect(f.coordinator().reconcile(scope)).resolves.toMatchObject({ phase: 'commit-unknown' });
    await expect(f.coordinator().continueInstalled(scope)).rejects.toMatchObject({ code: 'WIFIPROV_REKEY_UNRESOLVED' });
    f.gateway.read.mockResolvedValueOnce(meta('committed'));
    await expect(f.coordinator().reconcile(scope)).resolves.toMatchObject({ phase: 'committed' });
    expect(f.calls.filter(call => /^op-[67]:/.test(call))).toEqual([]);
    expect(f.gateway.confirm).toHaveBeenCalledTimes(1); expect(f.local.provision).not.toHaveBeenCalled();
  });

  it('blocks WiFi on a stale or malformed commit permit and never asks Gateway for another permit', async () => {
    const f = setup(), request = f.request.getMockImplementation()!;
    f.request.mockImplementationOnce(request).mockImplementationOnce(request).mockResolvedValueOnce(Uint8Array.of(2, 7, 0));
    await expect(f.coordinator().start(scope, options)).rejects.toMatchObject({ code: 'WIFIPROV_REKEY_PROTOCOL_MISMATCH' });
    expect(f.saved()?.phase).toBe('committed');
    await expect(f.coordinator().reconcile(scope)).resolves.toMatchObject({ phase: 'committed' });
    expect(f.gateway.confirm).toHaveBeenCalledTimes(1); expect(f.local.provision).not.toHaveBeenCalled();
  });

  it('retains UNKNOWN or precise WiFi terminal without resending on restart', async () => {
    const f = setup(); f.local.provision.mockRejectedValueOnce(failure);
    await expect(f.coordinator().start(scope, options)).rejects.toBe(failure);
    await expect(f.coordinator().reconcile(scope)).resolves.toMatchObject({ phase: 'wifi-unknown' });
    expect(f.local.provision).toHaveBeenCalledTimes(1);
    const g = setup(); g.local.provision.mockRejectedValueOnce(Error('explicit-auth-rejection'));
    await expect(g.coordinator().start(scope, options)).resolves.toMatchObject({ phase: 'wifi-rejected' });
    const h = setup(); h.local.provision.mockImplementationOnce(async () => { h.retireLocal(); return { success: true }; });
    await expect(h.coordinator().start(scope, options)).resolves.toMatchObject({ phase: 'wifi-accepted' });
  });

  it('a late commit after an account change never publishes metadata or permits WiFi', async () => {
    const f = setup();
    f.gateway.confirm.mockImplementationOnce(async () => { f.retirePage(); return { ...meta('committed'), wifiPermit: f.permit }; });
    await expect(f.coordinator().start(scope, options)).rejects.toThrow('owner changed');
    expect(f.saved()?.phase).toBe('commit-dispatched');
    expect(f.permit.some(Boolean)).toBe(false);
    expect(f.request).toHaveBeenCalledTimes(2); expect(f.local.provision).not.toHaveBeenCalled();
  });
});
