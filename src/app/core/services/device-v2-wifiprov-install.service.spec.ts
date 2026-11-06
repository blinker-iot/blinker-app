import '@angular/compiler';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { API } from '../../configs/api.config';
import { base64UrlEncode } from '../device-v2/base64url';
import { GATEWAY_NO_AUTH_REPLAY } from '../injectable/server.interceptor';
import { DeviceV2ManagementService } from './device-v2-management.service';

const instance = new Uint8Array(16).fill(2), deviceInstanceId = base64UrlEncode(instance), requestId = 'wifiprov-' + '12'.repeat(16);
const recipientPublicKey = base64UrlEncode(new Uint8Array(32).fill(3)), nameDigest = 'ab'.repeat(32);
const statusRequest = { requestId, deviceInstanceId, recipientPublicKey, nameDigest };
const device = { logicalDeviceId: 'device_11111111-1111-4111-8111-111111111111', credentialVersion: 1,
  locator: base64UrlEncode(new Uint8Array(16).fill(4)) };
const reply = (data: unknown, cache = 'private, no-store') => new HttpResponse({ status: 200,
  headers: new HttpHeaders({ 'Cache-Control': cache }), body: { status: 200, data } });

function fixture() {
  const get = vi.fn((_url: string, _options: any) => of(reply({ state: 'created', device })));
  const post = vi.fn((_url: string, _body: any, _options: any) => throwError(() => Error('fixture response lost')));
  return { service: new DeviceV2ManagementService({ get, post } as unknown as HttpClient), get, post };
}

describe('ordinary WiFiProv installation authority HTTP', () => {
  it('GET projects only the same four public selectors, never refreshes auth or writes', async () => {
    const f = fixture(), controller = new AbortController();
    await expect(f.service.readWiFiProvInstallationStatusV2(statusRequest, controller.signal)).resolves.toEqual({ state: 'created', device });
    const [url, options] = f.get.mock.calls[0];
    expect(url).toBe(API.DEVICE_V2.INSTALL_STATUS); expect(options.params).toEqual(statusRequest);
    expect(options.headers).toEqual({ 'X-Blinker-Contract': 'provisioning-install-v1' });
    expect(options.context.get(GATEWAY_NO_AUTH_REPLAY)).toBe(true); expect(f.post).not.toHaveBeenCalled();
    for (const state of ['absent', 'unavailable']) {
      f.get.mockReturnValueOnce(of(reply({ state })));
      await expect(f.service.readWiFiProvInstallationStatusV2(statusRequest, controller.signal)).resolves.toEqual({ state });
    }
    expect(f.get).toHaveBeenCalledTimes(3);
  });

  it('rejects cacheable, malformed or over-projected responses without another GET', async () => {
    const f = fixture(), controller = new AbortController();
    for (const response of [reply({ state: 'created', device }, 'private'), reply({ state: 'created', device: { ...device, deviceKey: 'synthetic' } }),
      reply({ state: 'created', device: { ...device, credentialVersion: 2 } }), reply({ state: 'absent', installationTransfer: {} })]) {
      f.get.mockReturnValueOnce(of(response));
      await expect(f.service.readWiFiProvInstallationStatusV2(statusRequest, controller.signal)).rejects.toThrow();
    }
    controller.abort();
    await expect(f.service.readWiFiProvInstallationStatusV2(statusRequest, controller.signal)).rejects.toThrow();
    expect(f.get).toHaveBeenCalledTimes(4); expect(f.post).not.toHaveBeenCalled();
  });

  it('POST has no side effect before the public recipient durable callback and fails without retry', async () => {
    const f = fixture();
    let allow!: () => void;
    const ready = new Promise<void>(resolve => { allow = resolve; });
    const persist = vi.fn(async (_recipient: string) => ready);
    const work = f.service.createDeviceForWiFiProvInstallV2(' Device ', requestId, instance, persist);
    const failure = expect(work).rejects.toThrow('fixture response lost');
    try {
      await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
      expect(f.post).not.toHaveBeenCalled();
    } finally { allow(); }
    await failure;
    expect(f.post).toHaveBeenCalledOnce();
    const [url, body, options] = f.post.mock.calls[0];
    expect(url).toBe(API.DEVICE_V2.CREATE);
    expect(body).toEqual({ name: 'Device', deviceType: 'diy', deviceInstanceId, recipientPublicKey: persist.mock.calls[0][0] });
    expect(options.headers).toEqual({ 'Idempotency-Key': requestId, 'X-Blinker-Contract': 'provisioning-install-v1' });
    expect(options.context.get(GATEWAY_NO_AUTH_REPLAY)).toBe(true);
  });

  it('native durable failure or abort during it sends no HTTP', async () => {
    const f = fixture(), controller = new AbortController();
    await expect(f.service.createDeviceForWiFiProvInstallV2('Device', requestId, instance, async () => { throw Error('not durable'); }))
      .rejects.toThrow('not durable');
    await expect(f.service.createDeviceForWiFiProvInstallV2('Device', requestId, instance, async () => controller.abort(), controller.signal))
      .rejects.toThrow();
    expect(f.post).not.toHaveBeenCalled(); expect(f.get).not.toHaveBeenCalled();
  });
});
