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

  it('hydrates the app model from /auth/me, /devices and the device subresources', async () => {
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
    httpTesting.expectOne(API.DEVICE.LIST).flush({
      devices: [
        {
          deviceId,
          tenantId: 'tenant-1',
          name: 'Sensor',
          deviceType: 'diy',
          status: 'active',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    httpTesting.expectOne(API.DEVICE.CONFIG(deviceId)).flush({
      config: { customName: 'Bedroom sensor' },
    });
    httpTesting.expectOne(API.DEVICE.STATUS(deviceId)).flush({
      device: { deviceId, status: 'active' },
      status: { mqttOnline: true },
      brokerStatus: 'online',
    });
    httpTesting.expectOne(API.DEVICE.DATA(deviceId)).flush({
      device: { deviceId },
      data: {
        protocol: 'json',
        receivedAt: 3,
        sourceClientId: deviceId,
        data: { temperature: 22.5 },
      },
    });

    await expect(loading).resolves.toBe(true);
    expect(dataService.user.id).toBe('user-1');
    expect(dataService.device.list).toEqual([deviceId]);
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

  it('deletes a device through the managed device endpoint', async () => {
    const deviceId = 'device_1234567890abcdef';
    const deletion = service.delDevice({ id: deviceId });
    const request = httpTesting.expectOne(API.DEVICE.DETAIL(deviceId));

    expect(request.request.method).toBe('DELETE');
    request.flush({ device: { deviceId } });

    await expect(deletion).resolves.toBe(true);
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

  it('exposes managed account deletion only through cancelBlinkerAccount()', async () => {
    const cancellation = service.cancelBlinkerAccount();
    const request = httpTesting.expectOne(API.ACCOUNT.ROOT);

    expect(request.request.method).toBe('DELETE');
    request.flush({
      account: {
        accountId: 'user-1',
        tenantId: 'tenant-1',
        status: 'deleted',
        deletedAt: 3,
      },
    });

    await expect(cancellation).resolves.toBe(true);
  });
});
