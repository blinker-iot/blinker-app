import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavController, ToastController, provideIonicAngular } from '@ionic/angular/standalone';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { GatewayHttpError } from '../../../core/model/response.model';
import { DataService } from '../../../core/services/data.service';
import { DeviceV2ManagementService } from '../../../core/services/device-v2-management.service';
import { UserService } from '../../../core/services/user.service';
import { KeyDeviceGuidePage } from './key-device.page';

describe('DeviceKey recovery production template', () => {
  afterEach(() => TestBed.resetTestingModule());

  it.each([
    [403, 'DEVICE_LIMIT_REACHED', 'KEY_DEVICE_LIMIT', '设备额度已用满', '请核对当前设备额度后再试。', true],
    [403, 'DEVICE_ENTITLEMENT_INVALID', 'KEY_DEVICE_ENTITLEMENT', '暂时无法确认设备创建权益', '请稍后重试或联系管理员核对权益。', true],
    [400, 'INVALID_REQUEST', 'KEY_CREATE_INVALID', '设备信息有误', '请检查设备名称。', true],
    [401, 'AUTH_TOKEN_MISSING', 'KEY_CREATE_AUTH', '登录状态已失效', '请重新登录后再试。', true],
    [403, 'AILY_REQUEST_REJECTED', 'KEY_CREATE_DENIED', '暂时无法创建设备', '请联系管理员核对账号权限。', true],
    [409, 'IDEMPOTENCY_CONFLICT', 'KEY_CREATE_CONFLICT', '设备创建请求发生冲突', '请返回设备列表确认当前状态。', true],
    [404, 'HTTP_404', 'KEY_CREATE_ENDPOINT', '当前服务不支持设备创建', '请检查当前内测环境。', true],
    [410, 'SERVICE_ACCOUNT_DELETED', 'KEY_CREATE_ACCOUNT_UNAVAILABLE', '当前账号不可用', '请重新登录或联系管理员。', true],
    [429, 'COMMON_RATE_LIMITED', 'KEY_CREATE_RATE_LIMITED', '', '操作过于频繁，请稍后手动重试。', false],
    [0, 'GATEWAY_TIMEOUT', 'KEY_CREATE_TIMEOUT', '', '请求超时，请先检查设备列表。', false],
    [0, 'NETWORK_ERROR', 'KEY_CREATE_NETWORK', '', '网络异常，请先检查设备列表。', false],
    [503, 'BROKER_ALLOCATION_PENDING', 'KEY_CREATE_PREPARING', '', '设备通道准备中，请先检查设备列表。', false],
    [503, 'DEVICE_V2_UNAVAILABLE', 'KEY_CREATE_SERVICE', '', '服务暂不可用，请先检查设备列表。', false],
    [418, 'UNKNOWN_CREATE_CODE', 'KEY_CREATE_BLOCKED', '', '暂未收到有效确认，请先检查设备列表。', false],
  ])('renders HTTP %s / %s without automatic retry or raw diagnostics', async (httpStatus, code, key, title, description, blocked) => {
    const management = {
      createDeviceKeyV2: vi.fn().mockRejectedValue(new GatewayHttpError({
        httpStatus: Number(httpStatus), code: String(code), message: 'private upstream diagnostic',
      })),
      revealDeviceKeyV2: vi.fn(),
    };
    await TestBed.configureTestingModule({ imports: [KeyDeviceGuidePage], providers: [
      provideRouter([]), provideIonicAngular({ animated: false }), provideTranslateService(),
      { provide: DataService, useValue: { auth: { accessToken: 'fixture-token' }, sessionEpoch: 1, authDataChanged: new Subject<void>() } },
      { provide: DeviceV2ManagementService, useValue: management },
      { provide: UserService, useValue: { getAllInfo: vi.fn() } },
      { provide: NavController, useValue: {} },
      { provide: ToastController, useValue: {} },
    ] }).compileComponents();
    const translation = TestBed.inject(TranslateService);
    translation.setTranslation('zh-test', { DEVICE_GUIDE: {
      [`${key}_TITLE`]: title, [`${key}_DESCRIPTION`]: description,
    } });
    translation.use('zh-test');
    const fixture = TestBed.createComponent(KeyDeviceGuidePage);
    fixture.autoDetectChanges();

    await fixture.componentInstance.createKeyDevice();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const alert = element.querySelector<HTMLElement>('[role="alert"]')!;
    if (blocked) {
      expect(alert.querySelector('h1')?.textContent).toBe(title);
      expect(alert.querySelector('p')?.textContent).toBe(description);
      expect(alert.querySelector('button')).toBeNull();
      expect(element.querySelector('form')).toBeNull();
    } else {
      expect(alert.textContent).toContain(description);
      expect(element.querySelector('form')).not.toBeNull();
    }
    expect(alert.textContent).not.toContain('设备创建已终止');
    expect(alert.textContent).not.toContain('private upstream diagnostic');
    expect(management.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(management.revealDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('offers the retained device, not create/reveal replay, when recent login is required', async () => {
    const management = {
      createDeviceKeyV2: vi.fn().mockResolvedValue({ data: { device: {
        logicalDeviceId: 'device_a', credentialVersion: 1, locator: 'fixture-locator',
      } } }),
      revealDeviceKeyV2: vi.fn().mockRejectedValue(new GatewayHttpError({
        httpStatus: 403, code: 'DEVICE_KEY_RECENT_AUTH_REQUIRED', message: 'Recent login required',
      })),
    };
    const nav = { navigateRoot: vi.fn(async () => true) };
    await TestBed.configureTestingModule({ imports: [KeyDeviceGuidePage], providers: [
      provideRouter([]), provideIonicAngular({ animated: false }), provideTranslateService(),
      { provide: DataService, useValue: { auth: { accessToken: 'fixture-token' }, sessionEpoch: 1, authDataChanged: new Subject<void>() } },
      { provide: DeviceV2ManagementService, useValue: management },
      { provide: UserService, useValue: { getAllInfo: vi.fn(async () => true) } },
      { provide: NavController, useValue: nav },
      { provide: ToastController, useValue: {} },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(KeyDeviceGuidePage);
    fixture.autoDetectChanges();
    await fixture.componentInstance.createKeyDevice();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('form')).toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('DEVICE_GUIDE.KEY_RECENT_AUTH_DESCRIPTION');
    const button = element.querySelector<HTMLButtonElement>('.flow-status button')!;
    expect(button.textContent).toContain('DEVICE_GUIDE.KEY_OPEN_DEVICE');
    button.click(); await fixture.whenStable();
    expect(nav.navigateRoot).toHaveBeenCalledWith('/device/device_a');
    expect(management.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(management.revealDeviceKeyV2).toHaveBeenCalledTimes(1);
  });
});
