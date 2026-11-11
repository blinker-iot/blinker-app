import { describe, expect, it, vi } from 'vitest';
import { base64UrlEncode } from '../ble-direct/wire';
import { runBc5Acceptance } from '../ble-direct/bc5-acceptance-run';
import type { BleDirectTarget } from '../ble-direct/transport';
import type { CloudRegistrationConfirmation, IssuedCloudRegistration } from '../ble-direct/cloud-registration-wire';
import type { WiFiProvCloudReadResult } from '../../model/response.model';
import type { WiFiProvCloudReadPorts } from './wifiprov-cloud-reconciliation';
import { completeInitialCloudWifiHandoff, observeInitialCloudWifi,
  type InitialCloudWifiApply, type InitialCloudWifiCarrierEvidence } from './wifiprov-initial-cloud-observation';

const identity = { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111', credentialVersion: 1,
  locator: 'AQEBAQEBAQEBAQEBAQEBAQ' };
const instance = new Uint8Array(16).fill(1);
const receipt = { identity, deviceInstanceId: instance, attemptedAt: 1000 };

function fixture(issuedAt = 1100) {
  const controller = new AbortController();
  const order: string[] = [];
  const ports: WiFiProvCloudReadPorts = {
    signal: controller.signal, assertCurrent: vi.fn(),
    closeLocal: vi.fn(async () => { order.push('matching-death'); }),
    assertCloud: vi.fn(async () => { order.push('cloud'); }),
    read: vi.fn(async (): Promise<WiFiProvCloudReadResult> => {
      order.push('exact-target');
      return { device: { ...identity, state: 'active', cloudEnabled: true }, observation: {
        kind: 'online', observedAt: 1400, deviceInstanceId: base64UrlEncode(instance), issuedAt, stateUpdatedAt: 1200,
      } };
    }),
  };
  return { controller, ports, order };
}

function composition(f: ReturnType<typeof fixture>, attemptedAt: number | undefined = 1000) {
  const encoded = (size: number, value: number) => base64UrlEncode(new Uint8Array(size).fill(value));
  const issued: IssuedCloudRegistration = {
    contract: 'access-registration-cloud-v2', ownerUserId: 'test-owner', tenantId: 'test-tenant',
    intentId: encoded(16, 2), sourceLogicalDeviceId: 'ble-source', targetLogicalDeviceId: identity.logicalDeviceId,
    clientNonce: encoded(16, 3), state: 'key_issued', expiresAt: 2000,
    expectedRoot: { kind: 'ble-no-cloud-key-v2', deviceInstanceId: encoded(16, 1), accessEpoch: 7,
      controllerId: encoded(16, 4), credentialVersion: 2, adminFingerprint: encoded(32, 5), cloudKey: { state: 'absent' } },
    targetKey: { credentialVersion: 1, locator: identity.locator, issuanceDigest: encoded(32, 6), issuedAt: 900 },
  };
  const confirmation: CloudRegistrationConfirmation = { contract: issued.contract, clientNonce: issued.clientNonce,
    confirmationDigest: encoded(32, 7), receipt: { kind: 'app-verified-initial-cloud-key-v1', authMethod: 2, suite: 1,
      sessionBinding: encoded(16, 8), deviceNonce: encoded(16, 9), result: 'installed', credentialVersion: 1,
      locator: identity.locator, issuanceDigest: issued.targetKey.issuanceDigest, ackDigest: encoded(32, 10) } };
  const carrier = vi.fn(async (): Promise<InitialCloudWifiCarrierEvidence> => ({
    outcome: 'apply-queued', attemptedAt,
    closeLocal: async () => { f.order.push('carrier-proof'); },
  }));
  const submitWifiHandoff = vi.fn(async () => { f.order.push('handoff'); return carrier(); });
  const input = { issued, installation: { confirmation, submitWifiHandoff: submitWifiHandoff as
    unknown as Parameters<typeof completeInitialCloudWifiHandoff>[0]['installation']['submitWifiHandoff'],
  close: vi.fn(async () => undefined) }, commitId: encoded(16, 11), confirm: vi.fn(async () => ({})),
  carrier, cloud: f.ports };
  return { input, submitWifiHandoff };
}

describe('initial Cloud candidate completion', () => {
  it('requires explicit metadata mode before a real opaque Cloud target can reach the read port', async () => {
    const opaque = { ...identity, logicalDeviceId: 'device_' + base64UrlEncode(new Uint8Array(16).fill(7)) };
    const scoped = { ...receipt, identity: opaque }, strict = fixture();
    await expect(observeInitialCloudWifi('apply-unknown', scoped, strict.ports))
      .resolves.toEqual({ apply: 'apply-unknown', cloud: 'unavailable' });
    expect(strict.ports.read).not.toHaveBeenCalled(); expect(strict.order).toEqual([]);

    const f = fixture(), value = await f.ports.read(instance, identity, f.ports.signal);
    vi.mocked(f.ports.read).mockClear().mockResolvedValue({ ...value, device: { ...value.device, ...opaque } });
    f.order.length = 0;
    await expect(observeInitialCloudWifi('apply-unknown', scoped, f.ports, 'metadata-reference'))
      .resolves.toEqual({ apply: 'apply-unknown', cloud: 'online' });
    expect(f.order).toEqual(['matching-death', 'cloud']);
    expect(f.ports.read).toHaveBeenCalledExactlyOnceWith(instance, opaque, f.ports.signal);
  });

  it('metadata mode keeps UNKNOWN when the Cloud session is not strictly newer', async () => {
    const f = fixture(1000);
    await expect(observeInitialCloudWifi('apply-unknown', receipt, f.ports, 'metadata-reference'))
      .resolves.toEqual({ apply: 'apply-unknown', cloud: 'unconfirmed' });
    expect(f.ports.read).toHaveBeenCalledOnce();
  });

  it('keeps Apply queued separate from a session issued before this attempt', async () => {
    const f = fixture(999);
    await expect(observeInitialCloudWifi('apply-queued', receipt, f.ports)).resolves.toEqual({
      apply: 'apply-queued', cloud: 'unconfirmed',
    });
    expect(f.order).toEqual(['matching-death', 'cloud', 'exact-target']);
  });

  it('reads fresh Cloud once after release without changing UNKNOWN', async () => {
    const f = fixture();
    await expect(observeInitialCloudWifi('apply-unknown', receipt, f.ports)).resolves.toEqual({
      apply: 'apply-unknown', cloud: 'online',
    });
    expect(f.ports.read).toHaveBeenCalledExactlyOnceWith(instance, identity, f.ports.signal);
  });

  it.each(['closeLocal', 'assertCloud', 'read'] as const)('stops without retry on %s failure', async operation => {
    const f = fixture();
    vi.mocked(f.ports[operation]).mockRejectedValue(Error('private upstream error'));
    await expect(observeInitialCloudWifi('apply-queued', receipt, f.ports)).resolves.toEqual({
      apply: 'apply-queued', cloud: 'unavailable',
    });
    expect(f.ports.read).toHaveBeenCalledTimes(operation === 'read' ? 1 : 0);
  });

  it('does not query for known no-Apply or substitute a boolean receipt', async () => {
    const f = fixture();
    for (const apply of ['set-unconfirmed', 'apply-not-sent', 'not-sent'] as const)
      await expect(observeInitialCloudWifi(apply, receipt, f.ports)).resolves.toEqual({ apply, cloud: 'not-checked' });
    await expect(observeInitialCloudWifi(true as unknown as InitialCloudWifiApply, receipt, f.ports))
      .rejects.toThrow('WIFIPROV_INITIAL_CLOUD_APPLY_INVALID');
    expect(f.order).toEqual([]);
  });

  it('never starts a Cloud read after cancellation', async () => {
    const f = fixture();
    f.controller.abort();
    await expect(observeInitialCloudWifi('apply-unknown', receipt, f.ports)).resolves.toEqual({
      apply: 'apply-unknown', cloud: 'cancelled',
    });
    expect(f.order).toEqual([]);
  });

  it('will not publish an inactive Cloud target even with fresh online metadata', async () => {
    const f = fixture();
    const response = await f.ports.read(instance, identity, f.ports.signal);
    const invalid = { ...response, device: { ...response.device, cloudEnabled: false } };
    vi.mocked(f.ports.read).mockClear().mockResolvedValue(invalid as unknown as WiFiProvCloudReadResult);
    await expect(observeInitialCloudWifi('apply-queued', receipt, f.ports)).resolves.toEqual({
      apply: 'apply-queued', cloud: 'unavailable',
    });
    expect(f.ports.read).toHaveBeenCalledOnce();
  });

  it('composes the original handoff with the carrier proof and an exact issued-target read', async () => {
    const f = fixture(), c = composition(f);
    await expect(completeInitialCloudWifiHandoff(c.input)).resolves.toEqual({ apply: 'apply-queued', cloud: 'online' });
    expect(c.submitWifiHandoff).toHaveBeenCalledExactlyOnceWith(c.input.commitId, c.input.confirm, c.input.carrier);
    expect(f.order).toEqual(['handoff', 'carrier-proof', 'cloud', 'exact-target']);
    expect(f.ports.closeLocal).not.toHaveBeenCalled();
  });

  it('will not consume a mismatched installation or use an observation without a credible attempt timestamp', async () => {
    const f = fixture(), c = composition(f, 899);
    await expect(completeInitialCloudWifiHandoff(c.input)).resolves.toEqual({ apply: 'apply-queued', cloud: 'unavailable' });
    expect(f.ports.read).not.toHaveBeenCalled();
    c.input.installation.confirmation.receipt.issuanceDigest = c.input.installation.confirmation.confirmationDigest;
    await expect(completeInitialCloudWifiHandoff(c.input)).rejects.toThrow('WIFIPROV_INITIAL_CLOUD_TARGET_CHANGED');
    expect(c.submitWifiHandoff).toHaveBeenCalledOnce();
  });

  it('does not expose a no-Apply result to a new Cloud account generation', async () => {
    const f = fixture(), c = composition(f);
    c.submitWifiHandoff.mockImplementationOnce(async () => {
      vi.mocked(f.ports.assertCurrent).mockImplementation(() => { throw Error('account changed'); });
      return { outcome: 'not-sent', closeLocal: async () => undefined };
    });
    await expect(completeInitialCloudWifiHandoff(c.input)).rejects.toThrow('account changed');
    expect(f.ports.read).not.toHaveBeenCalled();
  });
});

describe('BC5 one-shot entry', () => {
  function entry() {
    const f = fixture(), { input } = composition(f);
    const target = {} as BleDirectTarget;
    const installIssuedKey = vi.fn(async () => input);
    const commit = vi.fn(async () => { f.order.push('activation-confirmed'); return {}; });
    const authority = { preflight: vi.fn(async () => { f.order.push('server-preflight'); }),
      prepare: vi.fn(async () => { f.order.push('prepare'); }), issue: vi.fn(async () => input.issued), installIssuedKey, commit };
    const stage = vi.fn();
    const run = () => runBc5Acceptance({ authority, cloud: f.ports, stage,
      direct: { installInitialCloudRegistrationKey: vi.fn() },
      checkCarrier: async () => { f.order.push('carrier-preflight'); },
      selectSource: async () => { f.order.push('source'); return target; }, carrier: input.carrier });
    return { f, input, authority, stage, run, target };
  }

  it('checks both real ports before issue, then closes after the exact target observation', async () => {
    const { f, input, authority, stage, run, target } = entry();
    vi.mocked(input.installation.submitWifiHandoff).mockImplementationOnce((async (commitId, confirm, useCarrier) => {
      expect(commitId).toBe(input.commitId);
      await confirm({ ...input.installation.confirmation, ownerUserId: input.issued.ownerUserId, tenantId: input.issued.tenantId,
        intentId: input.issued.intentId, commitId }, f.ports.signal);
      f.order.push('explicit-handoff');
      return useCarrier({} as never);
    }) as typeof input.installation.submitWifiHandoff);
    await expect(run()).resolves.toEqual({ apply: 'apply-queued', cloud: 'online' });
    expect(f.order).toEqual(['carrier-preflight', 'server-preflight', 'source', 'cloud', 'prepare', 'activation-confirmed',
      'explicit-handoff', 'carrier-proof', 'cloud', 'exact-target']);
    expect(authority.installIssuedKey).toHaveBeenCalledExactlyOnceWith(expect.anything(), target, f.ports.signal);
    expect(stage.mock.calls.flat()).toEqual(['preflight', 'install', 'activation', 'wifi']);
    expect(input.installation.close).toHaveBeenCalledOnce();
  });

  it('never prepares with an uncleared Local owner or continues after a retired install', async () => {
    const offline = entry(); vi.mocked(offline.f.ports.assertCloud).mockRejectedValueOnce(Error('local owner'));
    await expect(offline.run()).rejects.toThrow('local owner'); expect(offline.authority.prepare).not.toHaveBeenCalled();
    const cancelled = entry();
    cancelled.authority.installIssuedKey.mockImplementationOnce(async () => { cancelled.f.controller.abort(); return cancelled.input; });
    await expect(cancelled.run()).rejects.toThrow();
    expect(cancelled.input.installation.submitWifiHandoff).not.toHaveBeenCalled();
    expect(cancelled.input.installation.close).toHaveBeenCalledOnce();
  });
});
