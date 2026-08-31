import '@angular/compiler';
import {
  HttpClient,
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Ntfy, type NtfyMessage, type NtfyStatus } from 'capacitor-ntfy';
import { BehaviorSubject, Subject } from 'rxjs';

import { API } from '../../configs/api.config';
import { NTFY_CONFIG } from '../../configs/ntfy.config';
import { DataService } from './data.service';
import { NtfyService } from './ntfy.service';

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    setKeyPrefix: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('capacitor-ntfy', () => ({
  Ntfy: {
    addListener: vi.fn(),
    requestNotificationPermission: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    getMessages: vi.fn(),
    clearMessages: vi.fn(),
  },
}));

interface DataServiceDouble {
  auth: { accessToken: string; uuid?: string } | null;
  user: { id?: string };
  sessionEpoch: number;
  authDataChanged: Subject<void>;
  userDataLoader: BehaviorSubject<boolean>;
}

const connectedStatus: NtfyStatus = {
  state: 'connected',
  running: true,
  connected: true,
  batteryOptimizationsIgnored: false,
  notificationPermission: 'granted',
};

const credentials = {
  baseUrl: 'https://ntfy.example.test',
  username: 'subscriber',
  topic: 'private-topic',
  token: 'private-token',
};

describe('NtfyService backend installation', () => {
  let service: NtfyService;
  let httpTesting: HttpTestingController;
  let dataService: DataServiceDouble;
  let messageListener: ((message: NtfyMessage) => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    messageListener = null;
    dataService = {
      auth: { accessToken: 'access-token', uuid: 'account-a' },
      user: { id: 'account-a' },
      sessionEpoch: 1,
      authDataChanged: new Subject<void>(),
      userDataLoader: new BehaviorSubject(true),
    };

    vi.mocked(SecureStorage.setKeyPrefix).mockResolvedValue(undefined);
    vi.mocked(SecureStorage.get).mockResolvedValue(null);
    vi.mocked(SecureStorage.set).mockResolvedValue(undefined);
    vi.mocked(SecureStorage.remove).mockResolvedValue(true);
    vi.mocked(Ntfy.addListener).mockImplementation(async (_event, listener) => {
      messageListener = listener as unknown as (message: NtfyMessage) => void;
      return { remove: vi.fn().mockResolvedValue(undefined) } as PluginListenerHandle;
    });
    vi.mocked(Ntfy.requestNotificationPermission).mockResolvedValue({ state: 'granted' });
    vi.mocked(Ntfy.start).mockResolvedValue(connectedStatus);
    vi.mocked(Ntfy.stop).mockResolvedValue({
      ...connectedStatus,
      state: 'stopped',
      running: false,
      connected: false,
    });
    vi.mocked(Ntfy.getMessages).mockResolvedValue({ messages: [] });
    vi.mocked(Ntfy.clearMessages).mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = new NtfyService(
      TestBed.inject(HttpClient),
      dataService as unknown as DataService,
    );
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    try {
      httpTesting.verify();
    } finally {
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
    }
  });

  it('does nothing outside Android', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');

    await service.init();

    expect(SecureStorage.get).not.toHaveBeenCalled();
    expect(Ntfy.addListener).not.toHaveBeenCalled();
    expect(Ntfy.start).not.toHaveBeenCalled();
  });

  it('replays a provisioning POST with the same body and key, then starts server credentials', async () => {
    vi.useFakeTimers();
    const result = service.ensureInstallation();
    await settle();

    const first = httpTesting.expectOne(API.NOTIFICATION_INSTALLATIONS.COLLECTION);
    const firstBody = first.request.body;
    const firstKey = first.request.headers.get('Idempotency-Key');
    expect(first.request.method).toBe('POST');
    expect(firstBody).toEqual({
      installationId: expect.any(String),
      platform: 'android',
    });
    expect(firstKey).toEqual(expect.any(String));
    first.flush(
      installationEnvelope(202, firstBody.installationId, 'server-installation', 'provisioning'),
      noStoreResponse(202, 'Accepted'),
    );

    await settle();
    await vi.advanceTimersByTimeAsync(NTFY_CONFIG.provisionRetryDelaysMs[0]);
    await settle();
    const replay = httpTesting.expectOne(API.NOTIFICATION_INSTALLATIONS.COLLECTION);
    expect(replay.request.body).toEqual(firstBody);
    expect(replay.request.headers.get('Idempotency-Key')).toBe(firstKey);
    replay.flush(
      installationEnvelope(200, firstBody.installationId, 'server-installation', 'active', credentials),
      noStoreResponse(200, 'OK'),
    );

    await expect(result).resolves.toBe(true);
    expect(Ntfy.start).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: credentials.baseUrl,
      username: credentials.username,
      topics: [credentials.topic],
      token: credentials.token,
      autoStartOnBoot: true,
      foregroundText: NTFY_CONFIG.foregroundText,
    }));
    const saved = vi.mocked(SecureStorage.set).mock.calls.at(-1)?.[1];
    expect(saved).toMatchObject({
      version: 2,
      current: {
        ownerAccountId: 'account-a',
        installationId: firstBody.installationId,
        idempotencyKey: firstKey,
        serverInstallationId: 'server-installation',
        state: 'active',
        ntfy: credentials,
      },
      pendingCleanup: [],
    });
  });

  it('rotates both client identifiers after a 409 conflict', async () => {
    const result = service.ensureInstallation();
    await settle();

    const first = httpTesting.expectOne(API.NOTIFICATION_INSTALLATIONS.COLLECTION);
    const firstId = first.request.body.installationId;
    const firstKey = first.request.headers.get('Idempotency-Key');
    first.flush(
      {
        status: 409,
        errorCode: 'NOTIFICATION_IDEMPOTENCY_CONFLICT',
        errorMessage: 'conflict',
        data: null,
      },
      { status: 409, statusText: 'Conflict' },
    );

    await settle();
    const replacement = httpTesting.expectOne(API.NOTIFICATION_INSTALLATIONS.COLLECTION);
    expect(replacement.request.body.installationId).not.toBe(firstId);
    expect(replacement.request.headers.get('Idempotency-Key')).not.toBe(firstKey);
    replacement.flush(
      installationEnvelope(
        201,
        replacement.request.body.installationId,
        'replacement-server-id',
        'active',
        credentials,
      ),
      noStoreResponse(201, 'Created'),
    );

    await expect(result).resolves.toBe(true);
  });

  it('preserves a different-account cleanup handle while provisioning current credentials', async () => {
    vi.mocked(SecureStorage.get).mockResolvedValue({
      ...storedActiveInstallation(),
      ownerAccountId: 'account-b',
    });
    const result = service.ensureInstallation();
    await settle();

    const request = httpTesting.expectOne(API.NOTIFICATION_INSTALLATIONS.COLLECTION);
    expect(request.request.body.installationId).not.toBe('client-installation');
    expect(request.request.headers.get('Idempotency-Key')).not.toBe('operation-key');
    request.flush(
      installationEnvelope(
        201,
        request.request.body.installationId,
        'new-account-server-id',
        'active',
        credentials,
      ),
      noStoreResponse(201, 'Created'),
    );

    await expect(result).resolves.toBe(true);
    expect(Ntfy.stop).toHaveBeenCalled();
    expect(Ntfy.clearMessages).toHaveBeenCalled();
    const saved = vi.mocked(SecureStorage.set).mock.calls.at(-1)?.[1];
    expect(saved).toMatchObject({
      version: 2,
      current: {
        ownerAccountId: 'account-a',
        serverInstallationId: 'new-account-server-id',
        ntfy: credentials,
      },
      pendingCleanup: [{
        ownerAccountId: 'account-b',
        installationId: 'client-installation',
        idempotencyKey: 'operation-key',
        serverInstallationId: 'server-installation',
      }],
    });
  });

  it('preserves the server id from a stale old-account POST before provisioning the new account', async () => {
    const init = service.init();
    await settle();

    const accountARequest = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.COLLECTION,
    );
    dataService.sessionEpoch += 1;
    dataService.auth = { accessToken: 'account-b-token' };
    dataService.authDataChanged.next();

    accountARequest.flush(
      installationEnvelope(
        201,
        accountARequest.request.body.installationId,
        'account-a-server-id',
        'active',
        credentials,
      ),
      noStoreResponse(201, 'Created'),
    );
    await init;
    await settle();

    expect(Ntfy.start).not.toHaveBeenCalled();
    httpTesting.expectNone(API.NOTIFICATION_INSTALLATIONS.COLLECTION);

    dataService.userDataLoader.next(false);
    dataService.user = { id: 'account-b' };
    dataService.userDataLoader.next(true);
    await settle();

    const accountBRequest = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.COLLECTION,
    );
    expect(accountBRequest.request.body.installationId).not.toBe(
      accountARequest.request.body.installationId,
    );
    const accountBCredentials = {
      ...credentials,
      username: 'account-b-subscriber',
      topic: 'account-b-topic',
      token: 'account-b-token',
    };
    accountBRequest.flush(
      installationEnvelope(
        201,
        accountBRequest.request.body.installationId,
        'account-b-server-id',
        'active',
        accountBCredentials,
      ),
      noStoreResponse(201, 'Created'),
    );
    await settle();

    expect(Ntfy.start).toHaveBeenCalledTimes(1);
    expect(Ntfy.start).toHaveBeenCalledWith(expect.objectContaining({
      username: accountBCredentials.username,
      topics: [accountBCredentials.topic],
      token: accountBCredentials.token,
    }));
    expect(vi.mocked(SecureStorage.set).mock.calls.at(-1)?.[1]).toMatchObject({
      version: 2,
      current: {
        ownerAccountId: 'account-b',
        serverInstallationId: 'account-b-server-id',
        state: 'active',
        ntfy: accountBCredentials,
      },
      pendingCleanup: [{
        ownerAccountId: 'account-a',
        installationId: accountARequest.request.body.installationId,
        idempotencyKey: accountARequest.request.headers.get('Idempotency-Key'),
        serverInstallationId: 'account-a-server-id',
      }],
    });
  });

  it('keeps account A pending after forced expiry while account B provisions normally', async () => {
    vi.mocked(SecureStorage.get).mockResolvedValue(storedActiveInstallation());
    const init = service.init();
    await settle();

    const accountAReplay = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.COLLECTION,
    );
    accountAReplay.flush(
      installationEnvelope(
        200,
        'client-installation',
        'server-installation',
        'active',
        credentials,
      ),
      noStoreResponse(200, 'OK'),
    );
    await init;

    dataService.sessionEpoch += 1;
    dataService.auth = null;
    dataService.authDataChanged.next();
    await settle();

    dataService.sessionEpoch += 1;
    dataService.auth = {
      accessToken: 'account-b-access-token',
      uuid: 'account-b',
    };
    dataService.user = { id: 'account-b' };
    dataService.authDataChanged.next();
    await settle();

    httpTesting.expectNone(
      API.NOTIFICATION_INSTALLATIONS.DETAIL('server-installation'),
    );
    const accountBPost = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.COLLECTION,
    );
    const accountBCredentials = {
      ...credentials,
      username: 'account-b-subscriber',
      topic: 'account-b-topic',
      token: 'account-b-token',
    };
    accountBPost.flush(
      installationEnvelope(
        201,
        accountBPost.request.body.installationId,
        'account-b-server-id',
        'active',
        accountBCredentials,
      ),
      noStoreResponse(201, 'Created'),
    );
    await settle();

    expect(vi.mocked(SecureStorage.set).mock.calls.at(-1)?.[1]).toMatchObject({
      version: 2,
      current: {
        ownerAccountId: 'account-b',
        serverInstallationId: 'account-b-server-id',
        ntfy: accountBCredentials,
      },
      pendingCleanup: [{
        ownerAccountId: 'account-a',
        installationId: 'client-installation',
        idempotencyKey: 'operation-key',
        serverInstallationId: 'server-installation',
      }],
    });
  });

  it('recovers a pending account A server id before deleting and reprovisioning', async () => {
    vi.mocked(SecureStorage.get).mockResolvedValue(storedState(null, [{
      ownerAccountId: 'account-a',
      installationId: 'orphan-client-installation',
      idempotencyKey: 'orphan-operation-key',
    }]));

    const result = service.ensureInstallation();
    await settle();
    const recoveryPost = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.COLLECTION,
    );
    expect(recoveryPost.request.body).toEqual({
      installationId: 'orphan-client-installation',
      platform: 'android',
    });
    expect(recoveryPost.request.headers.get('Idempotency-Key')).toBe(
      'orphan-operation-key',
    );
    recoveryPost.flush(
      installationEnvelope(
        202,
        'orphan-client-installation',
        'orphan-server-installation',
        'provisioning',
      ),
      noStoreResponse(202, 'Accepted'),
    );
    await settle();

    const cleanupDelete = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.DETAIL('orphan-server-installation'),
    );
    cleanupDelete.flush(
      installationEnvelope(
        200,
        'orphan-client-installation',
        'orphan-server-installation',
        'revoked',
      ),
      { status: 200, statusText: 'OK' },
    );
    await settle();

    const replacementPost = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.COLLECTION,
    );
    expect(replacementPost.request.body.installationId).not.toBe(
      'orphan-client-installation',
    );
    replacementPost.flush(
      installationEnvelope(
        201,
        replacementPost.request.body.installationId,
        'replacement-server-installation',
        'active',
        credentials,
      ),
      noStoreResponse(201, 'Created'),
    );

    await expect(result).resolves.toBe(true);
    expect(vi.mocked(SecureStorage.set).mock.calls.at(-1)?.[1]).toMatchObject({
      version: 2,
      current: {
        ownerAccountId: 'account-a',
        serverInstallationId: 'replacement-server-installation',
        ntfy: credentials,
      },
      pendingCleanup: [],
    });
  });

  it('blocks reprovisioning when owned cleanup fails and drops an already-revoked pending record', async () => {
    vi.mocked(SecureStorage.get).mockResolvedValue(storedState(null, [
      {
        ownerAccountId: 'account-a',
        installationId: 'already-revoked-client-installation',
        idempotencyKey: 'already-revoked-operation-key',
      },
      {
        ownerAccountId: 'account-a',
        installationId: 'blocked-client-installation',
        idempotencyKey: 'blocked-operation-key',
        serverInstallationId: 'blocked-server-installation',
      },
    ]));

    const result = service.ensureInstallation();
    await settle();
    const recoveryPost = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.COLLECTION,
    );
    expect(recoveryPost.request.body.installationId).toBe(
      'already-revoked-client-installation',
    );
    recoveryPost.flush(
      {
        status: 409,
        errorCode: 'NOTIFICATION_INSTALLATION_REVOKED',
        errorMessage: 'installation already revoked',
        data: null,
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();

    const cleanupDelete = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.DETAIL('blocked-server-installation'),
    );
    cleanupDelete.flush(
      {
        status: 403,
        errorCode: 'AUTH_FORBIDDEN',
        errorMessage: 'forbidden',
        data: null,
      },
      { status: 403, statusText: 'Forbidden' },
    );

    await expect(result).resolves.toBe(false);
    httpTesting.expectNone(API.NOTIFICATION_INSTALLATIONS.COLLECTION);
    expect(vi.mocked(SecureStorage.set).mock.calls.at(-1)?.[1]).toEqual({
      version: 2,
      current: null,
      pendingCleanup: [{
        ownerAccountId: 'account-a',
        installationId: 'blocked-client-installation',
        idempotencyKey: 'blocked-operation-key',
        serverInstallationId: 'blocked-server-installation',
      }],
    });
  });

  it('emits each business sequence_id once and ignores the ntfy transport id', async () => {
    dataService.auth = null;
    dataService.userDataLoader.next(false);
    const ids: string[] = [];
    service.messageIds$.subscribe((id) => ids.push(id));

    await service.init();
    expect(messageListener).not.toBeNull();
    messageListener?.(message('transport-1', { sequence_id: 'message-1' }));
    messageListener?.(message('transport-2', { sequence_id: 'message-1' }));
    messageListener?.(message('transport-3', { sequence_id: 'message-2' }));
    messageListener?.(message('message-3', {}));

    expect(ids).toEqual(['message-1', 'message-2']);
  });

  it('replays DELETE for revoke_pending and removes the secure record after revoked', async () => {
    vi.useFakeTimers();
    vi.mocked(SecureStorage.get).mockImplementation((key) => Promise.resolve(
      key === NTFY_CONFIG.legacySecureStorageKey
        ? storedActiveInstallation()
        : null,
    ));
    const result = service.revoke();
    await settle();

    const first = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.DETAIL('server-installation'),
    );
    expect(first.request.method).toBe('DELETE');
    first.flush(
      installationEnvelope(202, 'client-installation', 'server-installation', 'revoke_pending'),
      { status: 202, statusText: 'Accepted' },
    );

    await settle();
    await vi.advanceTimersByTimeAsync(NTFY_CONFIG.revokeRetryDelaysMs[0]);
    await settle();
    const replay = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.DETAIL('server-installation'),
    );
    replay.flush(
      installationEnvelope(200, 'client-installation', 'server-installation', 'revoked'),
      { status: 200, statusText: 'OK' },
    );

    await expect(result).resolves.toBe(true);
    expect(Ntfy.stop).toHaveBeenCalled();
    expect(Ntfy.clearMessages).toHaveBeenCalled();
    expect(SecureStorage.remove).toHaveBeenCalledWith(
      NTFY_CONFIG.legacySecureStorageKey,
    );
    expect(SecureStorage.remove).toHaveBeenCalledWith(NTFY_CONFIG.secureStorageKey);
  });

  it.each([
    [
      'unavailable',
      { accessToken: 'access-token' },
      {},
    ],
    [
      'a different account',
      { accessToken: 'account-b-access-token', uuid: 'account-b' },
      { id: 'account-b' },
    ],
  ])('preserves the stored owner when the current account is %s', async (
    _description,
    auth,
    user,
  ) => {
    dataService.auth = auth;
    dataService.user = user;
    vi.mocked(SecureStorage.get).mockResolvedValue(storedActiveInstallation());

    const result = service.revoke();
    await settle();
    httpTesting.expectNone(
      API.NOTIFICATION_INSTALLATIONS.DETAIL('server-installation'),
    );
    httpTesting.expectNone(API.NOTIFICATION_INSTALLATIONS.COLLECTION);

    await expect(result).resolves.toBe(false);
    expect(vi.mocked(SecureStorage.set).mock.calls.at(-1)?.[1]).toEqual({
      version: 2,
      current: null,
      pendingCleanup: [{
        ownerAccountId: 'account-a',
        installationId: 'client-installation',
        idempotencyKey: 'operation-key',
        serverInstallationId: 'server-installation',
      }],
    });
  });

  it('moves an explicit revoke failure to pending cleanup without credentials', async () => {
    vi.mocked(SecureStorage.get).mockResolvedValue(storedActiveInstallation());

    const result = service.revoke();
    await settle();
    const request = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.DETAIL('server-installation'),
    );
    request.flush(
      {
        status: 403,
        errorCode: 'AUTH_FORBIDDEN',
        errorMessage: 'forbidden',
        data: null,
      },
      { status: 403, statusText: 'Forbidden' },
    );

    await expect(result).resolves.toBe(false);
    expect(vi.mocked(SecureStorage.set).mock.calls.at(-1)?.[1]).toEqual({
      version: 2,
      current: null,
      pendingCleanup: [{
        ownerAccountId: 'account-a',
        installationId: 'client-installation',
        idempotencyKey: 'operation-key',
        serverInstallationId: 'server-installation',
      }],
    });
  });

  it('waits for an old-account revoke before persisting the new account', async () => {
    vi.mocked(SecureStorage.get).mockResolvedValue(storedActiveInstallation());
    const revoke = service.revoke();
    await settle();

    const accountADelete = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.DETAIL('server-installation'),
    );
    dataService.sessionEpoch += 1;
    dataService.auth = {
      accessToken: 'account-b-access-token',
      uuid: 'account-b',
    };
    dataService.user = { id: 'account-b' };
    const provisionAccountB = service.ensureInstallation();
    await settle();
    httpTesting.expectNone(API.NOTIFICATION_INSTALLATIONS.COLLECTION);

    accountADelete.flush(
      installationEnvelope(
        200,
        'client-installation',
        'server-installation',
        'revoked',
      ),
      { status: 200, statusText: 'OK' },
    );
    await settle();

    const accountBPost = httpTesting.expectOne(
      API.NOTIFICATION_INSTALLATIONS.COLLECTION,
    );
    const accountBCredentials = {
      ...credentials,
      username: 'account-b-subscriber',
      topic: 'account-b-topic',
      token: 'account-b-token',
    };
    accountBPost.flush(
      installationEnvelope(
        201,
        accountBPost.request.body.installationId,
        'account-b-server-id',
        'active',
        accountBCredentials,
      ),
      noStoreResponse(201, 'Created'),
    );

    await expect(revoke).resolves.toBe(true);
    await expect(provisionAccountB).resolves.toBe(true);
    expect(vi.mocked(SecureStorage.set).mock.calls.at(-1)?.[1]).toMatchObject({
      version: 2,
      current: {
        ownerAccountId: 'account-b',
        serverInstallationId: 'account-b-server-id',
        state: 'active',
        ntfy: accountBCredentials,
      },
      pendingCleanup: [],
    });
  });

  it('does not accept active credentials without Cache-Control no-store', async () => {
    const result = service.ensureInstallation();
    await settle();
    const request = httpTesting.expectOne(API.NOTIFICATION_INSTALLATIONS.COLLECTION);
    request.flush(
      installationEnvelope(
        201,
        request.request.body.installationId,
        'server-installation',
        'active',
        credentials,
      ),
      { status: 201, statusText: 'Created' },
    );

    await expect(result).resolves.toBe(false);
    expect(Ntfy.start).not.toHaveBeenCalled();
  });
});

function installationEnvelope(
  status: number,
  installationId: string,
  serverId: string,
  state: 'provisioning' | 'active' | 'revoke_pending' | 'revoked',
  ntfy?: typeof credentials,
) {
  return {
    status,
    data: {
      installation: {
        id: serverId,
        installationId,
        platform: 'android',
        state,
      },
      ...(ntfy ? { ntfy } : {}),
    },
  };
}

function noStoreResponse(status: number, statusText: string) {
  return {
    status,
    statusText,
    headers: { 'Cache-Control': 'no-store' },
  };
}

function storedActiveInstallation() {
  return {
    version: 1,
    ownerAccountId: 'account-a',
    installationId: 'client-installation',
    idempotencyKey: 'operation-key',
    serverInstallationId: 'server-installation',
    state: 'active',
    ntfy: credentials,
  };
}

function storedState(
  current: ReturnType<typeof storedActiveInstallation> | null,
  pendingCleanup: Array<{
    ownerAccountId: string;
    installationId: string;
    idempotencyKey: string;
    serverInstallationId?: string;
  }>,
) {
  return {
    version: 2,
    current: current ? {
      ownerAccountId: current.ownerAccountId,
      installationId: current.installationId,
      idempotencyKey: current.idempotencyKey,
      serverInstallationId: current.serverInstallationId,
      state: current.state,
      ntfy: current.ntfy,
    } : null,
    pendingCleanup,
  };
}

function message(id: string, raw: Record<string, unknown>): NtfyMessage {
  return {
    id,
    time: 1,
    event: 'message',
    topic: 'private-topic',
    raw,
  };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 32; index += 1) await Promise.resolve();
}
