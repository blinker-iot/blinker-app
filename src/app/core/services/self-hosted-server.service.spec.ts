import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API, isGatewayUrl } from '../../configs/api.config';
import { SelfHostedServerConfig, SelfHostedServerService } from './self-hosted-server.service';

describe('SelfHostedServerService', () => {
  let service: SelfHostedServerService;
  let http: HttpTestingController;
  const enabled: SelfHostedServerConfig = {
    state: 'enabled', serverUrl: 'https://broker.example.com/', keyConfigured: true,
    lastVerifiedAt: 1234, lastErrorCode: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    localStorage.setItem('blinker:self-hosted-server-config', JSON.stringify({
      address: 'https://legacy.example.com', key: 'legacy-test-key',
    }));
    service = TestBed.inject(SelfHostedServerService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the authenticated Gateway configuration without a saved secret', async () => {
    expect(localStorage.getItem('blinker:self-hosted-server-config')).toBeNull();
    expect(isGatewayUrl(API.ACCOUNT.SELF_HOSTED_SERVER)).toBe(true);
    const result = service.getConfig();
    const request = http.expectOne(API.ACCOUNT.SELF_HOSTED_SERVER);
    expect(request.request.method).toBe('GET');
    request.flush({ status: 200, data: enabled });
    expect(await result).toEqual(enabled);
  });

  it('omits a retained key and submits an HTTP address with an explicitly supplied key', async () => {
    const retained = service.saveConfig(enabled.serverUrl!);
    const first = http.expectOne(API.ACCOUNT.SELF_HOSTED_SERVER);
    expect(first.request.method).toBe('PUT');
    expect(first.request.body).toEqual({ serverUrl: enabled.serverUrl });
    first.flush({ status: 200, data: enabled });
    await retained;

    const httpAddress = 'http://broker.example.com:8080/base/';
    const updated = service.saveConfig(httpAddress, ' key with spaces ');
    const second = http.expectOne(API.ACCOUNT.SELF_HOSTED_SERVER);
    expect(second.request.body).toEqual({ serverUrl: httpAddress, serverKey: ' key with spaces ' });
    second.flush({ status: 200, data: { ...enabled, serverUrl: httpAddress } });
    expect((await updated).serverUrl).toBe(httpAddress);
  });

  it('preserves a failed clear as a Gateway error', async () => {
    const result = service.clearConfig();
    const assertion = expect(result).rejects.toMatchObject({
      status: 409, error: { errorCode: 'SELF_HOSTED_SERVER_HAS_DEVICES' },
    });
    const request = http.expectOne(API.ACCOUNT.SELF_HOSTED_SERVER);
    expect(request.request.method).toBe('DELETE');
    request.flush({ errorCode: 'SELF_HOSTED_SERVER_HAS_DEVICES' }, {
      status: 409, statusText: 'Conflict',
    });
    await assertion;
  });

  it('normalizes HTTP and HTTPS without removing credentials, query or fragment', () => {
    expect(service.normalizeAddress(' https://broker.example.com/base ')).toBe('https://broker.example.com/base/');
    expect(service.normalizeAddress('http://Broker.Example.com:80/base')).toBe('http://broker.example.com/base/');
    expect(service.normalizeAddress('http://broker.example.com:8080/base')).toBe('http://broker.example.com:8080/base/');
    for (const url of ['ftp://broker.example.com', 'ws://broker.example.com', 'wss://broker.example.com',
      'http://user:pass@broker.example.com', 'http://broker.example.com/?key=value',
      'http://broker.example.com/#section',
      'broker.example.com', 'https://user:pass@broker.example.com',
      'https://broker.example.com/?key=value', 'https://broker.example.com/#section']) {
      expect(service.normalizeAddress(url)).toBeNull();
    }
  });
});
