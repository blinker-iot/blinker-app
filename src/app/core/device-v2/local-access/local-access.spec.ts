import '@angular/compiler';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { base64UrlEncode } from '../base64url';
import { decodeLocalAccessChallenge, decodeLocalAccessGrant, localAccessNoisePrologue,
  computeLocalAccessPlainProof, encodeLocalAccessPlainProof, decodeLocalAccessPlainProof } from '../../protocol/device-v2/local-access';
import { BleDirectCrypto } from '../ble-direct/crypto';
import { HttpLocalAccessApi, LocalAccessRequest } from './api';
import { LocalAccessPreparationError } from './preparation-error';
import { GatewayHttpError } from '../../model/response.model';
import { ServerInterceptor } from '../../injectable/server.interceptor';
import type { DataService } from '../../services/data.service';
import type { NavController } from '@ionic/angular/standalone';

import { API as apiConfig } from '../../../configs/api.config';
const originalAuthority = apiConfig.BASE_URL;
const originalLocalAccessUrl = apiConfig.DEVICE_V2.LOCAL_ACCESS('wifi-A');
beforeEach(() => {
  vi.spyOn(apiConfig.DEVICE_V2, 'LOCAL_ACCESS').mockImplementation(id => `https://local-access.test/api/v2/devices/${encodeURIComponent(id)}/local-access`);
});
afterEach(() => { Object.assign(apiConfig, { BASE_URL: originalAuthority }); vi.restoreAllMocks(); });

// Shared with MCU Host and Service tests, not production keys or app storage.
const golden = Object.fromEntries(readFileSync(process.env['BLINKER_LOCAL_ACCESS_GOLDEN'] || path.resolve(process.cwd(),
  '../blinker-library/tests/golden/local_access_golden_vectors.properties'), 'utf8')
  .split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split('=')));
const bytes = (key: string) => Uint8Array.from(Buffer.from(golden[key]!, 'hex'));
const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');
function request(): LocalAccessRequest {
  const grant = decodeLocalAccessGrant(bytes('grant'));
  return { securityProfile: 1, recipientLogicalDeviceId: 'wifi-A', targetLogicalDeviceId: '', targetDeviceInstanceId: grant.targetDeviceInstanceId,
    accessEpoch: 0, topologyVersion: 0, callerSessionId: grant.callerSessionId, requestId: new Uint8Array(16).fill(1),
    exactChallenge: bytes('challenge'), permissions: 3, lifetimeMillis: 5000 };
}
function response(changes: Record<string, unknown> = {}, headers = 'private, no-store') {
  return new HttpResponse({ status: 200, headers: new HttpHeaders({ 'Cache-Control': headers }),
    body: { status: 200, data: { contract: 'local-access/2', validForMillis: 5000, exactGrant: base64UrlEncode(bytes('grant')),
      sessionKey: base64UrlEncode(bytes('noise_psk')), ...changes } } });
}
function harness() {
  const context = { accountId: 'account-A', authority: 'https://local-access.test', sessionEpoch: 1 };
  const post = vi.fn().mockReturnValue(of(response()));
  const get = vi.fn().mockReturnValue(of(contextResponse()));
  const api = new HttpLocalAccessApi({ post, get } as unknown as HttpClient, () => context);
  return { context, post, get, api };
}

function contextResponse(changes: Record<string, unknown> = {}, headers = 'private, no-store') {
  return new HttpResponse({ status: 200, headers: new HttpHeaders({ 'Cache-Control': headers }),
    body: { status: 200, data: { contract: 'local-access-context/2', securityProfile: 1, logicalDeviceId: 'wifi-A',
      deviceInstanceId: base64UrlEncode(request().targetDeviceInstanceId), permissions: 3, maximumLifetimeMillis: 300000, ...changes } } });
}

describe('LocalAccess trusted self identity lookup', () => {
  beforeEach(() => { Object.assign(apiConfig, { BASE_URL: 'https://local-access.test' }); });
  it('keeps exact preparation markers through the real production interceptor, without HTTP replay', async () => {
    // Only the backend is a fixture. This exercises HttpClient -> interceptor
    // -> adapter rather than assuming the adapter sees raw HttpErrorResponse.
    vi.mocked(apiConfig.DEVICE_V2.LOCAL_ACCESS).mockReturnValue(originalLocalAccessUrl);
    const h = harness(), signal = new AbortController().signal;
    const backend = { handle: vi.fn() };
    const data = { auth: { accessToken: 'fixture-access', refreshToken: 'fixture-refresh' }, authDataChanged: new Subject() };
    const nav = { navigateRoot: vi.fn() };
    const interceptor = new ServerInterceptor(backend, nav as unknown as NavController, data as unknown as DataService);
    const http = new HttpClient({ handle: req => interceptor.intercept(req, backend) });
    const api = new HttpLocalAccessApi(http, () => h.context);
    for (const [status, code, phase] of [[409, 'LOCAL_ACCESS_HANDOVER_REQUIRED', 'handover'],
      [503, 'LOCAL_ACCESS_SYNC_REQUIRED', 'pending']] as const) {
      backend.handle.mockReturnValue(throwError(() => new HttpErrorResponse({ status, error: { errorCode: code, data: null } })));
      await expect(api.issue(request(), signal)).rejects.toEqual(new LocalAccessPreparationError(phase));
    }
    await expect(api.getContext('wifi-A', signal)).rejects.toEqual(new LocalAccessPreparationError('pending'));
    expect(backend.handle).toHaveBeenCalledTimes(3);
    expect(backend.handle.mock.calls[0]![0].headers.get('Authorization')).toBe('Bearer fixture-access');
    expect(nav.navigateRoot).not.toHaveBeenCalled();
  });
  it('fences normalized errors by type, HTTP status, account and cancellation', async () => {
    const h = harness(), signal = new AbortController().signal;
    for (const error of [new GatewayHttpError({ httpStatus: 503, code: 'LOCAL_ACCESS_HANDOVER_REQUIRED', message: 'wrong status' }),
      new GatewayHttpError({ httpStatus: 409, code: 'LOCAL_ACCESS_SYNC_REQUIRED', message: 'wrong status' }),
      new GatewayHttpError({ httpStatus: 0, code: 'LOCAL_ACCESS_HANDOVER_REQUIRED', message: 'offline' }),
      Object.assign(Error('lookalike'), { httpStatus: 409, code: 'LOCAL_ACCESS_HANDOVER_REQUIRED' })]) {
      h.post.mockReturnValue(throwError(() => error));
      await expect(h.api.issue(request(), signal)).rejects.toBe(error);
    }
    const pending = new Subject<never>(), error = new GatewayHttpError({ httpStatus: 409,
      code: 'LOCAL_ACCESS_HANDOVER_REQUIRED', message: 'handover' });
    h.post.mockReturnValue(pending);
    const changed = expect(h.api.issue(request(), signal)).rejects.toThrow('ACCOUNT_CHANGED');
    h.context.sessionEpoch++; pending.error(error); await changed;
    const owner = new AbortController(), next = new Subject<never>(); h.post.mockReturnValue(next);
    const cancelled = expect(h.api.issue(request(), owner.signal)).rejects.toMatchObject({ name: 'AbortError' });
    owner.abort(); next.error(error); await cancelled; expect(next.observed).toBe(false);
  });
  it('recognizes only exact HTTP preparation failures within the current account', async () => {
    const h = harness(), signal = new AbortController().signal;
    const handover = new HttpErrorResponse({ status: 409, error: { errorCode: 'LOCAL_ACCESS_HANDOVER_REQUIRED' } });
    h.post.mockReturnValue(throwError(() => handover));
    await expect(h.api.issue(request(), signal)).rejects.toEqual(new LocalAccessPreparationError('handover'));
    h.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503, error: { errorCode: 'LOCAL_ACCESS_SYNC_REQUIRED' } })));
    await expect(h.api.getContext('wifi-A', signal)).rejects.toEqual(new LocalAccessPreparationError('pending'));
    for (const error of [new HttpErrorResponse({ status: 503, error: handover.error }),
      Object.assign(Error('untrusted exception'), { status: 409, error: handover.error })]) {
      h.post.mockReturnValue(throwError(() => error));
      await expect(h.api.issue(request(), signal)).rejects.toBe(error);
    }
    const pending = new Subject<never>(); h.post.mockReturnValue(pending);
    const changed = expect(h.api.issue(request(), signal)).rejects.toThrow('ACCOUNT_CHANGED');
    h.context.sessionEpoch++; pending.error(handover); await changed;
  });
  it('gets identity and whole-device permissions from the account authority, not discovery', async () => {
    const h = harness(), context = await h.api.getContext('wifi-A', new AbortController().signal);
    expect(h.get.mock.calls[0]![0]).toBe('https://local-access.test/api/v2/devices/wifi-A/local-access');
    expect(context.deviceInstanceId).toEqual(request().targetDeviceInstanceId); expect(context.permissions).toBe(3);
    expect(h.post).not.toHaveBeenCalled();
    h.get.mockReturnValue(of(contextResponse({ permissions: 1 })));
    expect((await h.api.getContext('wifi-A', new AbortController().signal)).permissions).toBe(1);
  });
  it('rejects cacheable, retargeted, zero identity or overbroad metadata', async () => {
    for (const reply of [contextResponse({}, 'private'), contextResponse({ logicalDeviceId: 'wifi-B' }),
      contextResponse({ deviceInstanceId: base64UrlEncode(new Uint8Array(16)) }), contextResponse({ permissions: 7 }),
      contextResponse({ maximumLifetimeMillis: 300001 }), contextResponse({ contract: 'other' })]) {
      const h = harness(); h.get.mockReturnValue(of(reply));
      await expect(h.api.getContext('wifi-A', new AbortController().signal)).rejects.toThrow();
    }
  });
  it('fences a late response after account change or cancellation', async () => {
    const h = harness(), pending = new Subject<ReturnType<typeof contextResponse>>(); h.get.mockReturnValue(pending);
    const changed = expect(h.api.getContext('wifi-A', new AbortController().signal)).rejects.toThrow('LOCAL_ACCESS_ACCOUNT_CHANGED');
    h.context.sessionEpoch++; pending.next(contextResponse()); await changed;
    const owner = new AbortController();
    const cancelled = expect(h.api.getContext('wifi-A', owner.signal)).rejects.toMatchObject({ name: 'AbortError' });
    owner.abort(); await cancelled; expect(pending.observed).toBe(false);
  });
  it('never queries plaintext or malformed device paths', async () => {
    const h = harness();
    await expect(h.api.getContext('../other', new AbortController().signal)).rejects.toThrow('INVALID');
    Object.assign(apiConfig, { BASE_URL: 'http://local-access.test' });
    await expect(h.api.getContext('wifi-A', new AbortController().signal)).rejects.toThrow('HTTPS_ACCOUNT_REQUIRED');
    expect(h.get).not.toHaveBeenCalled();
  });
});

describe('LocalAccess canonical contract', () => {
  it('reads the same MCU/Service challenge and grant, including independent Noise domain', () => {
    const challenge = decodeLocalAccessChallenge(bytes('challenge'));
    const grant = decodeLocalAccessGrant(bytes('grant'));
    expect(grant.recipientDeviceInstanceId).toEqual(challenge.recipientDeviceInstanceId);
    expect(grant.receiverSessionId).toEqual(challenge.receiverSessionId);
    expect(grant.challenge).toEqual(challenge.challenge);
    expect(grant.permissions).toBe(3); expect(grant.lifetimeMillis).toBe(5000);
    expect(hex(grant.authenticator)).toBe(golden.authenticator);
    expect(hex(localAccessNoisePrologue())).toBe(golden.noise_prologue);
    const child = decodeLocalAccessGrant(bytes('child_grant'));
    expect(child.targetKind).toBe(2); expect(child.targetLogicalDeviceId).toBe('child-A');
    expect(child.accessEpoch).toBe(7); expect(child.topologyVersion).toBe(9);
  });

  it('rejects every truncated prefix, noncanonical envelope, trailing bytes and unsupported profile', () => {
    for (const [key, decode] of [['challenge', decodeLocalAccessChallenge], ['grant', decodeLocalAccessGrant]] as const) {
      const wire = bytes(key);
      for (let i = 0; i < wire.length; i++) expect(() => decode(wire.slice(0, i))).toThrow();
      expect(() => decode(new Uint8Array([...wire, 0]))).toThrow();
      expect(() => decode(new Uint8Array([0x98, wire[0]! - 0x80, ...wire.slice(1)]))).toThrow();
      wire[1] = 2; expect(() => decode(wire)).toThrow();
    }
    const challenge = bytes('challenge'); challenge[challenge.length - 1] = 3;
    expect(() => decodeLocalAccessChallenge(challenge)).toThrow();
  });
});

describe('LocalAccess HTTPS material ownership', () => {
  it('consumes explicit Plain context and material without treating discovery as policy', async () => {
    const h = harness(), grant = decodeLocalAccessGrant(bytes('plain_grant'));
    h.get.mockReturnValue(of(contextResponse({ securityProfile: 2 })));
    expect((await h.api.getContext('wifi-A', new AbortController().signal)).securityProfile).toBe(2);
    h.post.mockReturnValue(of(response({ exactGrant: base64UrlEncode(bytes('plain_grant')),
      sessionKey: base64UrlEncode(bytes('plain_session_key')), validForMillis: 900 })));
    const material = await h.api.issue({ ...request(), securityProfile: 2, exactChallenge: bytes('plain_challenge'),
      targetDeviceInstanceId: grant.targetDeviceInstanceId, callerSessionId: grant.callerSessionId }, new AbortController().signal);
    expect(material.grant.securityProfile).toBe(2); expect(material.validForMillis).toBe(900);
    expect(hex(material.sessionKey)).toBe(golden.plain_session_key); material.clear();
  });
  beforeEach(() => { Object.assign(apiConfig, { BASE_URL: 'https://local-access.test' }); });

  it('keeps Noise HTTP policy explicit when the codec understands Plain', async () => {
    const h = harness();
    await expect(h.api.issue({ ...request(), exactChallenge: bytes('plain_challenge') }, new AbortController().signal))
      .rejects.toThrow('LOCAL_ACCESS_PROFILE_MISMATCH');
    expect(h.post).not.toHaveBeenCalled();
    h.post.mockReturnValue(of(response({ exactGrant: base64UrlEncode(bytes('plain_grant')) })));
    await expect(h.api.issue(request(), new AbortController().signal)).rejects.toThrow('LOCAL_ACCESS_GRANT_MISMATCH');
  });

  it('matches Plain directional proofs using only injected WebCrypto HMAC', async () => {
    const challenge = decodeLocalAccessChallenge(bytes('plain_challenge'));
    const grant = decodeLocalAccessGrant(bytes('plain_grant'));
    expect(challenge.securityProfile).toBe(2); expect(grant.securityProfile).toBe(2);
    expect(hex(grant.authenticator)).toBe(golden.plain_authenticator);
    const crypto = new BleDirectCrypto();
    for (const [kind, name] of [[8, 'plain_caller_proof'], [9, 'plain_recipient_proof']] as const) {
      const proof = await computeLocalAccessPlainProof(crypto, bytes('plain_session_key'), grant.authenticator, kind);
      expect(hex(encodeLocalAccessPlainProof(kind, proof))).toBe(golden[name]);
      expect(decodeLocalAccessPlainProof(bytes(name), kind)).toEqual(proof);
      expect(() => decodeLocalAccessPlainProof(bytes(name), kind === 8 ? 9 : 8)).toThrow();
      for (let n = 0; n < 37; n++) expect(() => decodeLocalAccessPlainProof(bytes(name).slice(0, n), kind)).toThrow();
      expect(() => decodeLocalAccessPlainProof(new Uint8Array([...bytes(name), 0]), kind)).toThrow();
      expect(() => decodeLocalAccessPlainProof(new Uint8Array([0x98, 3, ...bytes(name).slice(1)]), kind)).toThrow();
    }
    await expect(computeLocalAccessPlainProof(crypto, bytes('plain_session_key'), grant.authenticator, 10)).rejects.toThrow();
  });

  it('uses strict public request fields and returns only temporary caller material', async () => {
    const h = harness(), material = await h.api.issue(request(), new AbortController().signal);
    expect(h.post.mock.calls[0]![0]).toBe('https://local-access.test/api/v2/devices/wifi-A/local-access');
    expect(Object.keys(h.post.mock.calls[0]![1]).sort()).toEqual([
      'contract', 'requestId', 'callerSessionId', 'exactChallenge', 'targetLogicalDeviceId', 'permissions', 'lifetimeMillis'].sort());
    expect(hex(material.exactGrant)).toBe(golden.grant); expect(hex(material.sessionKey)).toBe(golden.noise_psk);
    material.clear(); expect(material.sessionKey.every(value => value === 0)).toBe(true);
    material.clear();
    const child = decodeLocalAccessGrant(bytes('child_grant'));
    h.post.mockReturnValue(of(response({ exactGrant: base64UrlEncode(bytes('child_grant')),
      sessionKey: base64UrlEncode(bytes('child_noise_psk')) })));
    const childInput = { ...request(), targetLogicalDeviceId: 'child-A', accessEpoch: 7, topologyVersion: 9,
      targetDeviceInstanceId: child.targetDeviceInstanceId };
    const childMaterial = await h.api.issue(childInput, new AbortController().signal);
    expect(hex(childMaterial.sessionKey)).toBe(golden.child_noise_psk); childMaterial.clear();
    await expect(h.api.issue({ ...childInput, targetLogicalDeviceId: 'child-B' }, new AbortController().signal))
      .rejects.toThrow('LOCAL_ACCESS_GRANT_MISMATCH');
  });

  it.each(['accountId', 'sessionEpoch', 'authority'] as const)('rejects changed %s while awaiting HTTPS', async field => {
    const h = harness(), pending = new Subject<ReturnType<typeof response>>(); h.post.mockReturnValue(pending);
    const result = h.api.issue(request(), new AbortController().signal);
    const rejected = expect(result).rejects.toThrow('LOCAL_ACCESS_ACCOUNT_CHANGED');
    if (field === 'sessionEpoch') h.context.sessionEpoch++;
    else h.context[field] += '-changed';
    pending.next(response()); await rejected;
  });

  it('cancels an in-flight HTTP request and ignores late responses', async () => {
    const h = harness(), pending = new Subject<ReturnType<typeof response>>(); h.post.mockReturnValue(pending);
    const controller = new AbortController(), result = h.api.issue(request(), controller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); pending.next(response()); await rejected;
    expect(pending.observed).toBe(false);
    await expect(h.api.issue(request(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.post).toHaveBeenCalledOnce();
  });

  it('snapshots mutable request arrays, so later caller edits cannot retarget the response', async () => {
    const h = harness(), input = request(), pending = new Subject<ReturnType<typeof response>>(); h.post.mockReturnValue(pending);
    const result = h.api.issue(input, new AbortController().signal);
    input.callerSessionId.fill(0); input.targetDeviceInstanceId.fill(0); input.exactChallenge.fill(0);
    pending.next(response()); (await result).clear();
  });

  it.each(['caller', 'challenge', 'permissions', 'lifetime'] as const)('rejects a grant for a different %s', async field => {
    const h = harness(), input = request();
    if (field === 'caller') input.callerSessionId[0]! ^= 1;
    if (field === 'challenge') input.exactChallenge[5]! ^= 1;
    if (field === 'permissions') input.permissions = 1;
    if (field === 'lifetime') { input.lifetimeMillis = 1000; h.post.mockReturnValue(of(response({ validForMillis: 1000 }))); }
    // Keep self target consistent with the changed challenge, then reject the
    // unrelated grant from the response (rather than only local input checks).
    if (field === 'challenge') input.targetDeviceInstanceId = decodeLocalAccessChallenge(input.exactChallenge).recipientDeviceInstanceId;
    await expect(h.api.issue(input, new AbortController().signal)).rejects.toThrow('LOCAL_ACCESS_GRANT_MISMATCH');
  });

  it('refuses malformed, cacheable or oversized responses', async () => {
    for (const reply of [response({}, 'private'), response({ contract: 'other' }), response({ contract: 'local-access/1' }),
      response({ validForMillis: 0 }), response({ validForMillis: 5001 }), response({ validForMillis: NaN }),
      response({ exactGrant: 'a'.repeat(364) }), response({ sessionKey: 'a'.repeat(44) }), response({ sessionKey: '!'.repeat(43) })]) {
      const h = harness(); h.post.mockReturnValue(of(reply));
      await expect(h.api.issue(request(), new AbortController().signal)).rejects.toThrow();
    }
  });

  it('refuses plaintext authority, invalid scopes and zero IDs before making an HTTP request', async () => {
    const h = harness(); Object.assign(apiConfig, { BASE_URL: 'http://local-access.test' });
    await expect(h.api.issue(request(), new AbortController().signal)).rejects.toThrow('LOCAL_ACCESS_HTTPS_ACCOUNT_REQUIRED');
    Object.assign(apiConfig, { BASE_URL: 'https://local-access.test' });
    for (const changes of [{ accessEpoch: 1 }, { requestId: new Uint8Array(16) },
      { targetLogicalDeviceId: 'child-A', accessEpoch: 1, topologyVersion: 0 }]) {
      await expect(h.api.issue({ ...request(), ...changes }, new AbortController().signal)).rejects.toThrow('LOCAL_ACCESS_REQUEST_INVALID');
    }
    expect(h.post).not.toHaveBeenCalled();
  });
});
