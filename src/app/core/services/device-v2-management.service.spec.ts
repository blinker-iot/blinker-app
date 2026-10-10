import { of } from 'rxjs';
import { DeviceV2ManagementService } from './device-v2-management.service';
import { API, isGatewayUrl } from '../../configs/api.config';
import { base64UrlEncode } from '../device-v2/ble-direct/wire';

describe('Device V2 exact owner state lookup', () => {
  const id = 'device_11111111-1111-4111-8111-111111111111';
  it('accepts only a 200 exact owner state, never absence or an arbitrary response as deletion', async () => {
    for (const state of ['active', 'deleted', null, 'revoked']) {
      const http = { get: vi.fn(() => of({ status: 200, body: { status: 200, data: { logicalDeviceId: id, state } } })) };
      const result = new DeviceV2ManagementService(http as any).readDeviceStateV2(id);
      if (state === 'active' || state === 'deleted') await expect(result).resolves.toBe(state);
      else await expect(result).rejects.toThrow();
    }
    for (const value of [{ status: 404, data: { logicalDeviceId: id, state: 'deleted' } },
      { status: 200, data: { logicalDeviceId: 'other', state: 'deleted' } }]) {
      const http = { get: vi.fn(() => of({ status: value.status, body: value })) };
      await expect(new DeviceV2ManagementService(http as any).readDeviceStateV2(id)).rejects.toThrow();
    }
  });
});

describe('Device V2 removal contract', () => {
  const id = 'device_11111111-1111-4111-8111-111111111111';
  const body = (pending = true) => ({ status: pending ? 202 : 200, data: {
    logicalDeviceId: id, state: 'deleted', deletedAt: 1234, cloudAuthorization: 'revoked',
    brokerCleanupPending: pending, realtimeRefreshPending: false, localAccess: 'not_confirmed',
  } });
  function service(value: any, status = value?.status) {
    const http = { delete: vi.fn((_url: string, _options: unknown) => of({ status, body: value })) };
    return { client: new DeviceV2ManagementService(http as any), http };
  }
  it('distinguishes accepted cleanup from completed cloud cleanup, never local reset', async () => {
    for (const pending of [true, false]) {
      const value = body(pending), { client, http } = service(value);
      expect(await client.deleteDeviceV2(id)).toEqual(value);
      expect(http.delete.mock.calls[0][0]).toContain(id);
    }
  });
  it('rejects empty, wrong-target, false-complete and malformed deletion receipts', async () => {
    const invalid = [null, { ...body(), status: 200 },
      { ...body(), data: { ...body().data, logicalDeviceId: id + '-other' } },
      { ...body(), data: { ...body().data, localAccess: 'cleared' } },
      { ...body(), data: { ...body().data, cloudAuthorization: 'active' } },
      { ...body(), data: { ...body().data, deletedAt: -1 } },
      { ...body(), data: { ...body().data, brokerCleanupPending: 'yes' } }];
    for (const value of invalid) await expect(service(value).client.deleteDeviceV2(id)).rejects.toThrow();
    await expect(service(body(), 204).client.deleteDeviceV2(id)).rejects.toThrow();
  });
});

describe('Direct Admin metadata contract', () => {
  const id = 'device_11111111-1111-4111-8111-111111111111';
  const controller = new Uint8Array(16).fill(1), fingerprint = new Uint8Array(32).fill(2);
  const record = { logicalDeviceId: id, accessEpoch: 1, credentialVersion: 1,
    controllerId: base64UrlEncode(controller), replayed: false };
  function harness(data: any, status = 201, cache = 'no-store') {
    const result = { status, body: { status, data }, headers: { get: () => cache } };
    const http = { put: vi.fn(() => of(result)), patch: vi.fn(() => of(result)), get: vi.fn(() => of(result)) };
    return { client: new DeviceV2ManagementService(http as any), http };
  }
  it('uses the account gateway route and sends only the three non-secret metadata fields', async () => {
    const h = harness(record);
    await h.client.registerDirectAdminV2(id, controller, fingerprint);
    expect(isGatewayUrl(API.DEVICE_V2.DIRECT_ADMIN(id))).toBe(true);
    const [url, body] = h.http.put.mock.calls[0] as unknown as [string, object];
    expect(url).toBe(API.DEVICE_V2.DIRECT_ADMIN(id));
    expect(body).toEqual({ controllerId: base64UrlEncode(controller), credentialVersion: 1,
      fingerprint: base64UrlEncode(fingerprint) });
    await expect(harness({ ...record, replayed: true }, 200).client.registerDirectAdminV2(id, controller, fingerprint))
      .resolves.toMatchObject({ replayed: true });
  });
  it('validates no-store, exact context and create/replay status', async () => {
    for (const value of [null, { ...record, accessEpoch: 0 }, { ...record, controllerId: 'bad' },
      { ...record, logicalDeviceId: 'other' }, { ...record, credentialVersion: 2 }, { ...record, replayed: true }]) {
      await expect(harness(value).client.registerDirectAdminV2(id, controller, fingerprint)).rejects.toThrow();
    }
    await expect(harness(record, 201, 'public').client.registerDirectAdminV2(id, controller, fingerprint)).rejects.toThrow();
    await expect(harness(record).client.registerDirectAdminV2(id, new Uint8Array(16), fingerprint)).rejects.toThrow();
  });
  it('reads nullable owner metadata, never treats malformed or unavailable reads as empty', async () => {
    await expect(harness({ record }, 200).client.getDirectAdminV2(id)).resolves.toMatchObject({ logicalDeviceId: id });
    await expect(harness({ record: null }, 200).client.getDirectAdminV2(id)).resolves.toBeNull();
    await expect(harness({}, 200).client.getDirectAdminV2(id)).rejects.toThrow();
    await expect(harness({ record: null }, 201).client.getDirectAdminV2(id)).rejects.toThrow();
    await expect(harness({ record: null }, 200, 'public').client.getDirectAdminV2(id)).rejects.toThrow();
  });
  const reset = () => ({ operationId: base64UrlEncode(new Uint8Array(16).fill(3)),
    deviceInstanceId: base64UrlEncode(new Uint8Array(16).fill(4)), expectedAccessEpoch: 1,
    expectedControllerId: base64UrlEncode(new Uint8Array(16).fill(5)), cloudCredentialVersion: 2,
    controllerId: record.controllerId, credentialVersion: 1 as const, fingerprint: base64UrlEncode(fingerprint) });
  it('replaces only by explicit CAS metadata and strips any extra secret fields', async () => {
    const h = harness({ ...record, accessEpoch: 2 });
    await h.client.resetDirectAdminV2(id, { ...reset(), controllerSecret: 'never-send' } as any);
    const [url, body] = h.http.patch.mock.calls[0] as unknown as [string, object];
    expect(url).toBe(API.DEVICE_V2.DIRECT_ADMIN(id));
    expect(body).toEqual(reset());
    expect(h.http.put).not.toHaveBeenCalled();
    await expect(harness({ ...record, accessEpoch: 2, replayed: true }, 200).client.resetDirectAdminV2(id, reset()))
      .resolves.toMatchObject({ accessEpoch: 2, replayed: true });
  });
  it('rejects exhausted/stale generations and invalid reset identifiers before HTTP', async () => {
    for (const patch of [{ operationId: 'invalid' }, { deviceInstanceId: base64UrlEncode(new Uint8Array(16)) },
      { expectedControllerId: record.controllerId }, { expectedAccessEpoch: 0xffffffff },
      { expectedAccessEpoch: 0 }, { cloudCredentialVersion: 1 }, { cloudCredentialVersion: 0x100000000 },
      { credentialVersion: 2 }]) {
      const h = harness({ ...record, accessEpoch: 2 });
      await expect(h.client.resetDirectAdminV2(id, { ...reset(), ...patch } as any)).rejects.toThrow();
      expect(h.http.patch).not.toHaveBeenCalled();
    }
  });
  it('requires the exact next epoch, owner target and response replay semantics', async () => {
    for (const data of [record, { ...record, accessEpoch: 3 }, { ...record, accessEpoch: 2, logicalDeviceId: 'other' },
      { ...record, accessEpoch: 2, replayed: true }]) {
      await expect(harness(data).client.resetDirectAdminV2(id, reset())).rejects.toThrow();
    }
    await expect(harness({ ...record, accessEpoch: 2 }, 201, 'public').client.resetDirectAdminV2(id, reset())).rejects.toThrow();
  });
});
