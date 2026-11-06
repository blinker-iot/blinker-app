import { describe, expect, it, vi } from 'vitest';
import { base64UrlEncode } from '../base64url';
import type { WiFiProvRekeyScope } from './wifiprov-rekey-checkpoint';
import { HttpWiFiProvRekeyGateway } from './wifiprov-rekey-gateway';

const bytes = (n: number, size = 16) => new Uint8Array(size).fill(n);
const id = (n: number, size = 16) => base64UrlEncode(bytes(n, size));
const scope: WiFiProvRekeyScope = { authority: 'https://example.test', accountId: 'owner', region: 'Development',
  logicalDeviceId: 'device_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', deviceInstanceId: id(1), accessEpoch: 2,
  operationId: id(2), previous: { credentialVersion: 4, locator: id(3) } };
const base = { logicalDeviceId: scope.logicalDeviceId, operationId: scope.operationId, fromVersion: 4, toVersion: 5 };
const binding = { operationId: scope.operationId, challenge: id(9), instance: scope.deviceInstanceId,
  accessEpoch: 2, fromVersion: 4, oldLocator: scope.previous.locator };
const prepared = { ...base, state: 'prepared', prepareExpiresAt: 500, binding };
const issued = { ...base, state: 'key_issued', newLocator: id(4), issuedAt: 300 };
const committed = { ...issued, state: 'committed', committedAt: 400 };
const transfer = { iv: id(5, 12), box: id(6, 48) };
const auth = { accountId: 'owner', region: 'Development', token: 'synthetic-access-token' };

function response(url: string, data: unknown, cacheControl = 'private, no-store', status = 200) {
  const result = new Response(JSON.stringify({ status, data }), { status, headers: { 'Cache-Control': cacheControl } });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}

function setup(data?: unknown) {
  let session = { ...auth };
  const stop = new AbortController();
  const fetcher = vi.fn(async (url: string, _options?: RequestInit) => response(url, data));
  const gateway = new HttpWiFiProvRekeyGateway(scope.authority, () => session, stop.signal, () => undefined, fetcher as typeof fetch);
  return { gateway, fetcher, abort: () => stop.abort(), changeAccount: () => { session = { ...session, accountId: 'other' }; } };
}

describe('private Development WiFiProv rekey HTTPS adapter', () => {
  it('invokes the default WebView fetch with its global receiver', async () => {
    const fetcher = vi.fn(async function (this: unknown, url: string) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return response(url, prepared);
    });
    vi.stubGlobal('fetch', fetcher);
    try {
      const gateway = new HttpWiFiProvRekeyGateway(scope.authority, () => auth, new AbortController().signal, () => undefined);
      await expect(gateway.prepare(scope)).resolves.toMatchObject({ state: 'prepared', binding });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });

  it('uses the one admitted op, existing active bearer and exact Gateway request/response projections', async () => {
    const f = setup();
    const replies = [prepared, { ...issued, transfer }, { ...committed, wifiPermit: id(7, 32) }, { ...committed, binding }];
    f.fetcher.mockImplementation(async url => response(url, replies.shift()));
    await expect(f.gateway.prepare(scope)).resolves.toMatchObject({ ...base, binding, state: 'prepared' });
    await expect(f.gateway.issue(scope, bytes(7, 32))).resolves.toMatchObject({ ...base, state: 'key_issued',
      transfer: { iv: bytes(5, 12), box: bytes(6, 48) } });
    await expect(f.gateway.confirm(scope, bytes(8, 32))).resolves.toMatchObject({ ...base, state: 'committed', wifiPermit: bytes(7, 32) });
    await expect(f.gateway.read(scope)).resolves.toEqual({ ...base, state: 'committed', binding, newLocator: id(4) });
    expect(f.fetcher.mock.calls.map(([url]) => url)).toEqual(['prepare', 'issue', 'confirm', 'read']
      .map(action => `${scope.authority}/api/v2/internal/wifiprov-rekey/${scope.operationId}/${action}`));
    expect(f.fetcher.mock.calls.map(([, request]) => JSON.parse(request!.body as string))).toEqual([
      { logicalDeviceId: scope.logicalDeviceId, instance: scope.deviceInstanceId, accessEpoch: 2, fromVersion: 4, oldLocator: scope.previous.locator },
      { logicalDeviceId: scope.logicalDeviceId, proof: id(7, 32) }, { logicalDeviceId: scope.logicalDeviceId, receipt: id(8, 32) },
      { logicalDeviceId: scope.logicalDeviceId },
    ]);
    for (const [, request] of f.fetcher.mock.calls) {
      expect(request).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit',
        headers: { Authorization: `Bearer ${auth.token}`, 'X-Region': 'Development', 'X-Blinker-Contract': 'wifiprov-rekey-v1' } });
    }
  });

  it.each([{ ...committed, binding, wifiPermit: id(7, 32) }, { ...committed, binding, deviceKey: 'synthetic' },
    { ...committed, binding, operationId: id(8) }, { ...committed, binding: { ...binding, instance: id(8) } }, committed])
  ('rejects unbound or over-projected read results', async data => {
    const f = setup(data);
    await expect(f.gateway.read(scope)).rejects.toMatchObject({ code: 'WIFIPROV_REKEY_RESPONSE_INVALID' });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });

  it('allows absent read-only state, never treats a cacheable or redirected response as evidence', async () => {
    const f = setup(null);
    await expect(f.gateway.read(scope)).resolves.toBeNull();
    f.fetcher.mockImplementationOnce(async url => response(url, prepared, 'private, max-age=60'));
    await expect(f.gateway.prepare(scope)).rejects.toMatchObject({ code: 'WIFIPROV_REKEY_GATEWAY_UNAVAILABLE' });
    f.fetcher.mockImplementationOnce(async () => response('https://other.test/', prepared));
    await expect(f.gateway.prepare(scope)).rejects.toMatchObject({ code: 'WIFIPROV_REKEY_GATEWAY_UNAVAILABLE' });
    expect(f.fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not reauthenticate, replay 401 or continue under a different account', async () => {
    const f = setup();
    f.fetcher.mockImplementationOnce(async url => response(url, null, 'no-store', 401));
    await expect(f.gateway.prepare(scope)).rejects.toMatchObject({ code: 'WIFIPROV_REKEY_GATEWAY_UNAVAILABLE' });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    f.fetcher.mockImplementationOnce(async url => { f.changeAccount(); return response(url, prepared); });
    await expect(f.gateway.prepare(scope)).rejects.toMatchObject({ code: 'WIFIPROV_REKEY_ACCOUNT_CHANGED' });
    await expect(f.gateway.read(scope)).rejects.toMatchObject({ code: 'WIFIPROV_REKEY_ACCOUNT_CHANGED' });
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });

  it('never crosses authority, region or foreground; bounds response bytes', async () => {
    const f = setup();
    await expect(f.gateway.read({ ...scope, authority: 'https://wrong.test' })).rejects.toMatchObject({ code: 'WIFIPROV_REKEY_ACCOUNT_CHANGED' });
    await expect(f.gateway.read({ ...scope, region: 'China' })).rejects.toMatchObject({ code: 'WIFIPROV_REKEY_ACCOUNT_CHANGED' });
    expect(f.fetcher).not.toHaveBeenCalled();
    f.fetcher.mockImplementationOnce(async url => response(url, 'z'.repeat(4100)));
    await expect(f.gateway.read(scope)).rejects.toMatchObject({ code: 'WIFIPROV_REKEY_RESPONSE_INVALID' });
    f.abort();
    await expect(f.gateway.read(scope)).rejects.toMatchObject({ code: 'WIFIPROV_OPERATION_CANCELLED' });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
});
