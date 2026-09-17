import '@angular/compiler';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { GatewayHttpError } from '../model/response.model';
import { API, isGatewayUrl } from '../../configs/api.config';
import {
  MigrationCleanupPreview, MigrationPreview, MigrationTarget, MigrationTask,
  SelfHostedServerConfig, SelfHostedServerService,
} from './self-hosted-server.service';

describe('SelfHostedServerService', () => {
  let service: SelfHostedServerService;
  let http: HttpTestingController;
  const enabled: SelfHostedServerConfig = {
    state: 'enabled', serverUrl: 'https://broker.example.com/', keyConfigured: true,
    lastVerifiedAt: 1234, lastErrorCode: null,
  };

  const task: MigrationTask = {
    id: '123', status: 'queued', source: { kind: 'managed' },
    target: { kind: 'self_hosted', serverUrl: enabled.serverUrl! },
    serviceState: 'source', errorCode: null,
    cleanup: { state: 'none', side: null }, updatedAt: 1234,
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
  it('previews managed or self-hosted targets without changing configuration', async () => {
    const targets: MigrationTarget[] = [
      { kind: 'self_hosted', serverUrl: enabled.serverUrl!, serverKey: ' test-key ' },
      { kind: 'managed' },
    ];
    for (const target of targets) {
      const preview: MigrationPreview = {
        action: 'migrate', previewRevision: 'a'.repeat(64), deviceCount: 3,
        target: target.kind === 'managed' ? target : { kind: 'self_hosted', serverUrl: target.serverUrl },
      };
      const result = service.previewMigration(target);
      const request = http.expectOne(API.ACCOUNT.SELF_HOSTED_MIGRATION + '/preview');
      expect(isGatewayUrl(request.request.url)).toBe(true);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ target });
      request.flush({ status: 200, data: preview });
      expect(await result).toEqual(preview);
    }
  });

  it('sends the revision and preserves the caller idempotency key on replay', async () => {
    const target = { kind: 'self_hosted' as const, serverUrl: enabled.serverUrl! };
    const expectedRevision = 'b'.repeat(64);
    for (const status of [202, 200]) {
      const result = service.startMigration(target, expectedRevision, 'same-confirmation-id');
      const request = http.expectOne(API.ACCOUNT.SELF_HOSTED_MIGRATION);
      expect(isGatewayUrl(request.request.url)).toBe(true);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ target, expectedRevision });
      expect(request.request.headers.get('Idempotency-Key')).toBe('same-confirmation-id');
      request.flush({ status, data: task }, { status, statusText: status === 202 ? 'Accepted' : 'OK' });
      expect(await result).toEqual(task);
    }
  });

  it('recovers the latest task or requests an exact string ID using only taskId', async () => {
    const absent = service.getMigration();
    const latestRequest = http.expectOne(API.ACCOUNT.SELF_HOSTED_MIGRATION);
    expect(latestRequest.request.method).toBe('GET');
    expect(latestRequest.request.params.keys()).toEqual([]);
    latestRequest.flush({ status: 200, data: null });
    expect(await absent).toBeNull();

    const exact = service.getMigration(task.id);
    const exactRequest = http.expectOne(API.ACCOUNT.SELF_HOSTED_MIGRATION + '?taskId=' + task.id);
    expect(isGatewayUrl(exactRequest.request.url)).toBe(true);
    expect(exactRequest.request.method).toBe('GET');
    expect(exactRequest.request.params.keys()).toEqual(['taskId']);
    expect(exactRequest.request.params.get('taskId')).toBe(task.id);
    exactRequest.flush({ status: 200, data: task });
    expect(await exact).toEqual(task);
  });

  it('previews and confirms only the identified migration copy', async () => {
    const cleanup: MigrationCleanupPreview = {
      taskId: task.id, side: 'source', endpoint: { kind: 'managed' },
      deviceCount: 3, recoverability: 'not_guaranteed', cleanupRevision: 'c'.repeat(64),
    };
    const preview = service.previewCleanup(task.id);
    const previewRequest = http.expectOne(API.ACCOUNT.SELF_HOSTED_MIGRATION + '/' + task.id + '/cleanup/preview');
    expect(isGatewayUrl(previewRequest.request.url)).toBe(true);
    expect(previewRequest.request.method).toBe('POST');
    expect(previewRequest.request.body).toEqual({});
    previewRequest.flush({ status: 200, data: cleanup });
    expect(await preview).toEqual(cleanup);

    const confirmation = service.confirmCleanup(task.id, cleanup.cleanupRevision);
    const confirmationRequest = http.expectOne(API.ACCOUNT.SELF_HOSTED_MIGRATION + '/' + task.id + '/cleanup');
    expect(isGatewayUrl(confirmationRequest.request.url)).toBe(true);
    expect(confirmationRequest.request.method).toBe('POST');
    expect(confirmationRequest.request.body).toEqual({ expectedRevision: cleanup.cleanupRevision });
    const processing = { ...task, status: 'completed', cleanup: { state: 'processing', side: 'source' } };
    confirmationRequest.flush({ status: 202, data: processing }, { status: 202, statusText: 'Accepted' });
    expect(await confirmation).toEqual(processing);
  });

  it('preserves Gateway error identity and cleanup information for the caller', async () => {
    const error = new GatewayHttpError({
      httpStatus: 409, code: 'SELF_HOSTED_SERVER_MIGRATION_TARGET_NOT_EMPTY',
      message: 'Target contains data', data: { cleanupTaskId: task.id },
    });
    const failed = new SelfHostedServerService({
      post: () => throwError(() => error),
    } as unknown as HttpClient);
    await expect(failed.previewMigration({ kind: 'managed' })).rejects.toBe(error);
  });

  it('does not interpret a failed progress query as an absent task', async () => {
    const result = service.getMigration();
    const assertion = expect(result).rejects.toMatchObject({
      status: 503, error: { errorCode: 'SELF_HOSTED_SERVER_MIGRATION_UNAVAILABLE' },
    });
    http.expectOne(API.ACCOUNT.SELF_HOSTED_MIGRATION).flush({
      errorCode: 'SELF_HOSTED_SERVER_MIGRATION_UNAVAILABLE',
    }, { status: 503, statusText: 'Unavailable' });
    await assertion;
  });

});
