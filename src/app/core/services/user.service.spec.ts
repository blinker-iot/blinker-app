import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API } from 'src/app/configs/api.config';
import { sha256 } from '../functions/func';
import { DataService } from './data.service';
import { NoticeService } from './notice.service';
import { UserService } from './user.service';

describe('UserService API contracts', () => {
  let service: UserService;
  let dataService: DataService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        UserService,
        DataService,
        {
          provide: NoticeService,
          useValue: { hideLoading: vi.fn().mockResolvedValue(undefined) },
        },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(UserService);
    dataService = TestBed.inject(DataService);
    httpTesting = TestBed.inject(HttpTestingController);
    dataService.auth = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'bearer',
      uuid: 'legacy-uuid',
      token: 'legacy-token',
    };
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
  });

  it('loads the V2 device inventory without Legacy JSON subresource requests', async () => {
    const deviceId = 'device_1234567890abcdef';
    const loading = service.getAllInfo();

    httpTesting.expectOne(API.AUTH.ME).flush({
      status: 200,
      data: {
        id: 'user-1',
        nickname: 'Person',
        email: 'person@example.com',
        phone: null,
        avatar: null,
        subscription_plan: {
          name: 'pro',
          display_name: 'Pro',
          service_tier: 'shared',
          subscription_id: null,
          status: 'active',
          end_date: null,
        },
        permissions: [],
        rbac_permissions: [],
        entitlements: {},
      },
    });
    httpTesting.expectOne(API.DEVICE_V2.LIST).flush({
      status: 200,
      data: { devices: [
        {
          logicalDeviceId: deviceId,
          tenantId: 'tenant-1',
          name: 'Sensor',
          deviceType: 'diy',
          state: 'active',
          credentialVersion: 1,
          locator: 'AQIDBA',
          createdAt: 1,
          updatedAt: 2,
        },
      ] },
    });
    httpTesting.expectOne(API.DEVICE_V2.RECEIVED_SHARES).flush({
      status: 200,
      data: { devices: [{
        logicalDeviceId: 'device_shared',
        name: 'Shared lamp',
        deviceType: 'diy',
        share: {
          shareId: 'share-1',
          role: 'viewer',
          commandEndpointKeys: null,
          version: 1,
          state: 'active',
          createdAt: 1,
          updatedAt: 1,
          revokedAt: null,
        },
      }] },
    });

    await expect(loading).resolves.toBe(true);
    expect(dataService.user.id).toBe('user-1');
    expect(dataService.device.list).toEqual([deviceId, 'device_shared']);
    expect(dataService.device.dict['device_shared'].config.isShared).toBe(true);
    expect(dataService.device.dict['device_shared'].data.canCommand).toBe(false);
  });

  it('saves the existing user configuration through the legacy API', async () => {
    const config = { deviceList: ['device-2', 'device-1'] };
    const saving = service.saveUserConfig(config);
    const request = httpTesting.expectOne(
      (candidate) => candidate.url === API.USER.SAVE_CONFIG,
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      uuid: 'legacy-uuid',
      token: 'legacy-token',
      userConf: JSON.stringify(config),
    });
    request.flush({ message: 1000, detail: null });

    await expect(saving).resolves.toBe(true);
  });

  it('keeps password and profile changes on their legacy endpoints', async () => {
    const passwordChange = service.changePassword('old-pass', 'new-pass');
    const passwordRequest = httpTesting.expectOne(
      (candidate) => candidate.url === API.USER.CHANGE_PASSWORD,
    );
    expect(passwordRequest.request.method).toBe('GET');
    expect(passwordRequest.request.params.get('uuid')).toBe('legacy-uuid');
    expect(passwordRequest.request.params.get('token')).toBe('legacy-token');
    expect(passwordRequest.request.params.get('oldPassword')).toBe(
      sha256('old-pass').toString(),
    );
    expect(passwordRequest.request.params.get('newPassword')).toBe(
      sha256('new-pass').toString(),
    );
    passwordRequest.flush({ message: 1000, detail: null });
    await expect(passwordChange).resolves.toBe(true);

    const profileChange = service.changeProfile('New name');
    const profileRequest = httpTesting.expectOne(
      (candidate) => candidate.url === API.USER.CHANGE_PROFILE,
    );
    expect(profileRequest.request.method).toBe('GET');
    expect(profileRequest.request.params.get('uuid')).toBe('legacy-uuid');
    expect(profileRequest.request.params.get('token')).toBe('legacy-token');
    expect(profileRequest.request.params.get('username')).toBe('New name');
    profileRequest.flush({ message: 1000, detail: null });
    await expect(profileChange).resolves.toBe(true);
  });

  it('keeps the original avatar-upload guard and request shape', async () => {
    const uploading = service.uploadAvatar(new Blob(['avatar']));

    if (!service.avatarUploadConfigured) {
      await expect(uploading).resolves.toBe(false);
      return;
    }

    const request = httpTesting.expectOne(API.USER.UPLOAD_AVATAR);
    expect(request.request.method).toBe('POST');
    const body = request.request.body as FormData;
    expect(body.get('uuid')).toBe('legacy-uuid');
    expect(body.get('token')).toBe('legacy-token');
    request.flush({ message: 1000, detail: null });
    await expect(uploading).resolves.toBe(true);
  });

  it('keeps cancelAccount(password) on the legacy endpoint', async () => {
    const cancellation = service.cancelAccount('account-password');
    const request = httpTesting.expectOne(
      (candidate) => candidate.url === API.USER.CANCEL_ACCOUNT,
    );

    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('uuid')).toBe('legacy-uuid');
    expect(request.request.params.get('token')).toBe('legacy-token');
    expect(request.request.params.get('password')).toBe(
      sha256('account-password').toString(),
    );
    httpTesting.expectNone(
      (candidate) => candidate.url === API.ACCOUNT.ROOT,
    );
    request.flush({ message: 1000, detail: null });

    await expect(cancellation).resolves.toBe(true);
  });

  it('requests an account-deletion code with an exact empty body', async () => {
    const codeInfo = service.requestAccountDeletionCode();
    const request = httpTesting.expectOne(API.ACCOUNT.DELETION_CODE);

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(Object.keys(request.request.body)).toEqual([]);
    httpTesting.expectNone(API.AUTH.EMAIL_CODE);
    httpTesting.expectNone(API.AUTH.EMAIL_LOGIN);
    request.flush({
      status: 200,
      errorCode: null,
      errorMessage: null,
      data: {
        purpose: 'account_deletion',
        expiresIn: 125,
        maskedEmail: 'p***@example.com',
      },
    });

    await expect(codeInfo).resolves.toEqual({
      purpose: 'account_deletion',
      expiresIn: 125,
      maskedEmail: 'p***@example.com',
    });
  });

  it('sends the complete D-code and leaves local cleanup to logout after 200', async () => {
    const clearData = vi.spyOn(dataService, 'clearBlinkerData');
    const expireAuth = vi.spyOn(dataService.authDataExpire, 'next');
    const cancellation = service.cancelBlinkerAccount('D-123456');
    const request = httpTesting.expectOne(API.ACCOUNT.ROOT);

    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ code: 'D-123456' });
    httpTesting.expectNone(API.AUTH.EMAIL_LOGIN);
    request.flush({
      account: {
        accountId: 'user-1',
        tenantId: 'tenant-1',
        status: 'deleted',
        deletedAt: 3,
      },
    });

    await expect(cancellation).resolves.toEqual({
      account: {
        accountId: 'user-1',
        tenantId: 'tenant-1',
        status: 'deleted',
        deletedAt: 3,
      },
    });
    expect(clearData).not.toHaveBeenCalled();
    expect(expireAuth).not.toHaveBeenCalled();
    expect(dataService.auth?.accessToken).toBe('access-token');
  });

  it('rejects a login-style six-digit code without sending a DELETE', async () => {
    await expect(service.cancelBlinkerAccount('123456')).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_CODE_INVALID',
    });
    httpTesting.expectNone(API.ACCOUNT.ROOT);
  });

  it('does not accept a deleted body from a non-200 DELETE response', async () => {
    const cancellation = service.cancelBlinkerAccount('D-123456');
    httpTesting.expectOne(API.ACCOUNT.ROOT).flush(
      {
        account: {
          accountId: 'user-1',
          tenantId: 'tenant-1',
          status: 'deleted',
          deletedAt: 3,
        },
      },
      { status: 202, statusText: 'Accepted' },
    );

    await expect(cancellation).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_RESPONSE_INVALID',
    });
    expect(dataService.auth?.accessToken).toBe('access-token');
  });

  it('preserves the session and permits retrying the same DELETE after failure', async () => {
    const clearData = vi.spyOn(dataService, 'clearBlinkerData');
    const expireAuth = vi.spyOn(dataService.authDataExpire, 'next');
    const firstAttempt = service.cancelBlinkerAccount('D-654321');
    httpTesting.expectOne(API.ACCOUNT.ROOT).flush(
      {
        status: 409,
        errorCode: 'ACCOUNT_DELETION_IN_PROGRESS',
        errorMessage: 'internal cleanup detail',
      },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(firstAttempt).rejects.toMatchObject({ status: 409 });
    expect(clearData).not.toHaveBeenCalled();
    expect(expireAuth).not.toHaveBeenCalled();
    expect(dataService.auth?.accessToken).toBe('access-token');

    const retry = service.cancelBlinkerAccount('D-654321');
    const retryRequest = httpTesting.expectOne(API.ACCOUNT.ROOT);
    expect(retryRequest.request.body).toEqual({ code: 'D-654321' });
    retryRequest.flush({
      account: {
        accountId: 'user-1',
        tenantId: 'tenant-1',
        status: 'deleted',
        deletedAt: 4,
      },
    });

    await expect(retry).resolves.toMatchObject({
      account: { status: 'deleted' },
    });
  });
});
