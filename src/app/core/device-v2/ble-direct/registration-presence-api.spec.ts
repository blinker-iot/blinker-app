import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { API, isGatewayUrl } from '../../../configs/api.config';
import { GATEWAY_NO_AUTH_REPLAY } from '../../injectable/server.interceptor';
import { HttpRegistrationPresenceApi } from './registration-presence-api';
import { RegistrationPresenceBinding, registrationPresenceReference, validateRegistrationPresenceBinding } from './registration-presence-contract';
import { BleDirectCrypto } from './crypto';
import { base64UrlEncode } from './wire';
import { logicalDevicePeerId } from '../../protocol/device-v2';
const id = 'ble_AgICAgICAgICAgICAgICAg', source = 'device_11111111-1111-4111-8111-111111111111';
const b64 = (size: number, value: number) => base64UrlEncode(new Uint8Array(size).fill(value));
async function binding(): Promise<RegistrationPresenceBinding> {
  return { contract: 'access-registration-presence-v1', logicalDeviceId: id, rootBindingId: b64(16, 6), bindingRevision: 1,
    expectedRoot: { deviceInstanceId: b64(16, 1), accessEpoch: 1, controllerId: b64(16, 2), credentialVersion: 1,
      adminFingerprint: b64(32, 3), cloudCredentialVersion: 1 }, materialOwnerLogicalDeviceId: source, canWritePresence: false,
    keys: [{ state: 'current', accessEpoch: 1, version: 1, key: b64(16, 9),
      keyDigest: base64UrlEncode(await new BleDirectCrypto().sha256(new Uint8Array(16).fill(9))) }] };
}
describe('registered presence read-only HTTP contract', () => {
  it('accepts the Cloud registration server opaque ID as metadata without inventing a Direct peer', async () => {
    // Same construction as access-registration-cloud-repository.prepare().
    const cloudId = `device_${Buffer.alloc(16, 7).toString('base64url')}`;
    const value = { ...await binding(), logicalDeviceId: cloudId };
    const get = vi.fn((_url: string, _options: any) => of(new HttpResponse({ status: 200,
      headers: new HttpHeaders({ 'Cache-Control': 'private, no-store' }), body: { status: 200, data: value } })));
    const result = await new HttpRegistrationPresenceApi({ get } as any).read(cloudId, new AbortController().signal);
    expect(result).toEqual(value);
    expect(get).toHaveBeenCalledExactlyOnceWith(API.DEVICE_V2.ACCESS_REGISTRATION_PRESENCE(cloudId), expect.any(Object));
    expect(get.mock.calls[0][1].context.get(GATEWAY_NO_AUTH_REPLAY)).toBe(true);
    const url = API.DEVICE_V2.ACCESS_REGISTRATION_PRESENCE(cloudId);
    expect(isGatewayUrl(url)).toBe(true);
    for (const invalid of [url + '?owner=other', url + '/extra', url.replace(API.BASE_URL, 'https://other.example.test'),
      url.replace(cloudId, cloudId + '='), url.replace(cloudId, 'device_AAAAAAAAAAAAAAAAAAAAAA')]) {
      expect(isGatewayUrl(invalid)).toBe(false);
    }
    expect(() => logicalDevicePeerId(cloudId)).toThrow();
  });
  it('accepts opaque material-owner metadata without treating an alias as a Presence writer', async () => {
    const ownerId = `device_${Buffer.alloc(16, 4).toString('base64url')}`;
    const value = { ...await binding(), materialOwnerLogicalDeviceId: ownerId };
    expect(await validateRegistrationPresenceBinding(value)).toEqual(value);
    expect(registrationPresenceReference(value)).toEqual({ rootBindingId: value.rootBindingId,
      bindingRevision: value.bindingRevision, materialOwnerLogicalDeviceId: ownerId, canWritePresence: false });
    await expect(validateRegistrationPresenceBinding({ ...value, canWritePresence: true })).rejects.toThrow('PRESENCE_INVALID');
    expect(() => logicalDevicePeerId(ownerId)).toThrow();
  });
  it('does not start HTTP for malformed metadata IDs and does not attach gateway credentials to their URLs', async () => {
    const get = vi.fn();
    const api = new HttpRegistrationPresenceApi({ get } as any);
    const valid = `device_${Buffer.alloc(16, 7).toString('base64url')}`;
    for (const id of [valid + '=', valid + '\n', valid + '/extra', valid + '?x=y', valid.slice(0, -1) + 'R',
      'device_AAAAAAAAAAAAAAAAAAAAAA', 'ble_AAAAAAAAAAAAAAAAAAAAAA']) {
      await expect(api.read(id, new AbortController().signal)).rejects.toMatchObject({ reason: 'schema' });
      expect(isGatewayUrl(API.DEVICE_V2.ACCESS_REGISTRATION_PRESENCE(id))).toBe(false);
    }
    expect(get).not.toHaveBeenCalled();
  });
  it('uses the original authenticated private URL, no auth replay, and exact binding/digest checks', async () => {
    const value = await binding(), get = vi.fn((_url: string, _options: any) => of(new HttpResponse({
      status: 200, headers: new HttpHeaders({ 'Cache-Control': 'private, no-store' }), body: { status: 200, data: value } })));
    const result = await new HttpRegistrationPresenceApi({ get } as any).read(id, new AbortController().signal);
    expect(result).toEqual(value); expect(get).toHaveBeenCalledOnce();
    expect(get.mock.calls[0][0]).toBe(API.DEVICE_V2.ACCESS_REGISTRATION_PRESENCE(id));
    expect(get.mock.calls[0][1].context.get(GATEWAY_NO_AUTH_REPLAY)).toBe(true);
    expect(isGatewayUrl(get.mock.calls[0][0])).toBe(true);
    expect(isGatewayUrl(get.mock.calls[0][0] + '?owner=other')).toBe(false);
  });
  it('rejects cacheable material, wrong card and arbitrary contract fields without retry', async () => {
    const value = await binding();
    for (const [cache, data, reason] of [['private', value, 'no-store'], ['no-store', { ...value, logicalDeviceId: source }, 'envelope'],
      ['no-store', { ...value, owner: 'other' }, 'schema'],
      ['no-store', { ...value, expectedRoot: { ...value.expectedRoot, controllerId: 'invalid' } }, 'schema'],
      ['no-store', { ...value, keys: [{ ...value.keys[0], keyDigest: b64(32, 12) }] }, 'key-digest']] as const) {
      const get = vi.fn(() => of(new HttpResponse({ status: 200,
        headers: new HttpHeaders({ 'Cache-Control': cache }), body: { status: 200, data } })));
      await expect(new HttpRegistrationPresenceApi({ get } as any).read(id, new AbortController().signal))
        .rejects.toMatchObject({ reason, message: 'ACCESS_REGISTRATION_PRESENCE_INVALID' });
      expect(get).toHaveBeenCalledOnce();
    }
  });

  it('distinguishes local validator failure from an invalid digest without carrying the raw cause', async () => {
    const value = await binding();
    const sha = vi.spyOn(BleDirectCrypto.prototype, 'sha256').mockRejectedValueOnce(new Error('private crypto error'));
    try {
      const get = vi.fn(() => of(new HttpResponse({ status: 200,
        headers: new HttpHeaders({ 'Cache-Control': 'private, no-store' }), body: { status: 200, data: value } })));
      await expect(new HttpRegistrationPresenceApi({ get } as any).read(id, new AbortController().signal))
        .rejects.toMatchObject({ reason: 'validation', message: 'ACCESS_REGISTRATION_PRESENCE_INVALID' });
      expect(get).toHaveBeenCalledOnce();
    } finally { sha.mockRestore(); }
  });
  it('rejects alias write claims, duplicate versions and digest mismatch before returning a binding', async () => {
    const value = await binding();
    for (const data of [{ ...value, canWritePresence: true }, { ...value, keys: [value.keys[0], value.keys[0]] },
      { ...value, keys: [{ ...value.keys[0], keyDigest: b64(32, 12) }] }]) {
      await expect(validateRegistrationPresenceBinding(data)).rejects.toThrow('PRESENCE_INVALID');
    }
  });
  it('cancels the only read and never makes a request for a pre-aborted operation', async () => {
    let unsubscribed = false;
    const get = vi.fn(() => new Observable(() => () => { unsubscribed = true; }));
    const api = new HttpRegistrationPresenceApi({ get } as any), abort = new AbortController();
    const reading = api.read(id, abort.signal); abort.abort(); await expect(reading).rejects.toThrow();
    expect(unsubscribed).toBe(true); expect(get).toHaveBeenCalledOnce();
    await expect(api.read(id, abort.signal)).rejects.toThrow(); expect(get).toHaveBeenCalledOnce();
  });
  it('snapshots authority context before asynchronous digest validation', async () => {
    const value = await binding(), original = structuredClone(value), crypto = new BleDirectCrypto();
    let release!: (value: Uint8Array) => void;
    vi.spyOn(crypto, 'sha256').mockImplementationOnce(() => new Promise(done => { release = done; }));
    const validating = validateRegistrationPresenceBinding(value, crypto);
    value.logicalDeviceId = source; value.rootBindingId = b64(16, 10); value.canWritePresence = true;
    release(new Uint8Array(Buffer.from(original.keys[0].keyDigest, 'base64url')));
    expect(await validating).toEqual(original);
  });
});
