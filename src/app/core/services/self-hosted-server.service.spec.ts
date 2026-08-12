import {
  SELF_HOSTED_SERVER_STORAGE_KEY,
  SelfHostedServerService,
} from './self-hosted-server.service';

describe('SelfHostedServerService', () => {
  let service: SelfHostedServerService;

  beforeEach(() => {
    localStorage.clear();
    service = new SelfHostedServerService();
  });

  it('saves and restores an independent server configuration', () => {
    service.saveConfig('https://server.example.com/', 'secret-key');

    expect(service.getConfig()).toEqual({
      address: 'https://server.example.com',
      key: 'secret-key',
    });
  });

  it('supports websocket server addresses', () => {
    expect(service.normalizeAddress('wss://server.example.com/socket/')).toBe(
      'wss://server.example.com/socket',
    );
  });

  it('rejects incomplete or unsupported addresses', () => {
    expect(service.normalizeAddress('server.example.com')).toBeNull();
    expect(service.normalizeAddress('ftp://server.example.com')).toBeNull();
  });

  it('ignores malformed persisted data and can clear saved configuration', () => {
    localStorage.setItem(SELF_HOSTED_SERVER_STORAGE_KEY, '{not-json');
    expect(service.getConfig()).toBeNull();

    service.saveConfig('http://192.168.1.10:8080', 'local-key');
    service.clearConfig();
    expect(service.getConfig()).toBeNull();
  });
});
