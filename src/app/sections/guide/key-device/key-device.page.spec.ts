import { Subject } from 'rxjs';

import { GatewayHttpError } from '../../../core/model/response.model';
import { KeyDeviceGuidePage } from './key-device.page';

describe('KeyDeviceGuidePage DeviceKey V2 flow', () => {
  const deviceKey = 'A'.repeat(43);

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((next) => {
      resolve = next;
    });
    return { promise, resolve };
  }

  function createHarness() {
    const authDataChanged = new Subject<void>();
    const dataService = {
      auth: {
        accessToken: 'test-access-token',
      },
      sessionEpoch: 1,
      authDataChanged,
    };
    const deviceService = {
      createDevice: vi.fn(),
      createDeviceKeyV2: vi.fn(),
      revealDeviceKeyV2: vi.fn(),
    };
    const userService = {
      getAllInfo: vi.fn().mockResolvedValue(true),
    };
    const navController = {
      navigateRoot: vi.fn().mockResolvedValue(true),
    };
    const toast = {
      present: vi.fn().mockResolvedValue(undefined),
    };
    const toastController = {
      create: vi.fn().mockResolvedValue(toast),
    };
    const translate = {
      instant: vi.fn((key: string) => key),
    };
    const cd = {
      markForCheck: vi.fn(),
    };
    const page = new KeyDeviceGuidePage(
      dataService as any,
      deviceService as any,
      userService as any,
      navController as any,
      toastController as any,
      translate as any,
      cd as any
    );

    return {
      page,
      dataService,
      deviceService,
      userService,
      navController,
      toastController,
      authDataChanged,
    };
  }

  function createResponse() {
    return {
      status: 201,
      data: {
        device: {
          logicalDeviceId: 'logical/device #1',
          tenantId: 'tenant-1',
          name: 'Desk sensor',
          deviceType: 'diy',
          state: 'active',
          credentialVersion: 1,
          locator: 'A'.repeat(22),
          createdAt: 1,
          updatedAt: 1,
        },
        replayed: false,
      },
    };
  }

  function revealResponse() {
    return {
      status: 200,
      data: {
        logicalDeviceId: 'logical/device #1',
        credentialVersion: 1,
        locator: 'A'.repeat(22),
        deviceKey,
      },
    };
  }

  it('does not create or reveal before the user submits', () => {
    const { page, deviceService } = createHarness();

    page.ionViewWillEnter();

    expect(deviceService.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(deviceService.revealDeviceKeyV2).not.toHaveBeenCalled();
    expect(deviceService.createDevice).not.toHaveBeenCalled();
  });

  it('redirects an unauthenticated user without creating a device', async () => {
    const { page, dataService, deviceService, navController } = createHarness();
    dataService.auth = null as any;

    page.ionViewWillEnter();
    await page.createKeyDevice();

    expect(navController.navigateRoot).toHaveBeenCalledWith('/login');
    expect(deviceService.createDeviceKeyV2).not.toHaveBeenCalled();
    expect(deviceService.revealDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('creates once and reveals with the locked non-secret context', async () => {
    const { page, deviceService, userService } = createHarness();
    deviceService.createDeviceKeyV2.mockResolvedValue(createResponse());
    deviceService.revealDeviceKeyV2.mockResolvedValue(revealResponse());
    page.deviceName = '  Desk sensor  ';

    await page.createKeyDevice();

    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledWith(
      'Desk sensor',
      expect.any(String),
      'diy'
    );
    expect(deviceService.revealDeviceKeyV2).toHaveBeenCalledWith({
      logicalDeviceId: 'logical/device #1',
      credentialVersion: 1,
      locator: 'A'.repeat(22),
    });
    expect(deviceService.createDevice).not.toHaveBeenCalled();
    expect(page.phase).toBe('revealed');
    expect(page.secretKey).toBe(deviceKey);
    expect(userService.getAllInfo).toHaveBeenCalledTimes(1);
  });

  it('retries only reveal with the original logical device context', async () => {
    const { page, deviceService } = createHarness();
    deviceService.createDeviceKeyV2.mockResolvedValue(createResponse());
    deviceService.revealDeviceKeyV2
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(revealResponse());

    await page.createKeyDevice();
    const firstRevealContext =
      deviceService.revealDeviceKeyV2.mock.calls[0][0];

    expect(page.phase).toBe('reveal-failed');
    expect(page.secretKey).toBe('');

    await page.retryReveal();

    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(deviceService.revealDeviceKeyV2).toHaveBeenCalledTimes(2);
    expect(deviceService.revealDeviceKeyV2.mock.calls[1][0]).toEqual(
      firstRevealContext
    );
    expect(page.phase).toBe('revealed');
  });

  it('discards a create response that settles after leaving the page', async () => {
    const { page, deviceService } = createHarness();
    const pendingCreate = deferred<ReturnType<typeof createResponse>>();
    deviceService.createDeviceKeyV2.mockReturnValue(pendingCreate.promise);

    const operation = page.createKeyDevice();
    expect(page.phase).toBe('creating');
    page.ionViewWillLeave();
    pendingCreate.resolve(createResponse());
    await operation;

    expect(page.phase).toBe('idle');
    expect(page.secretKey).toBe('');
    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(deviceService.revealDeviceKeyV2).not.toHaveBeenCalled();
  });

  it('discards a reveal response that settles after leaving the page', async () => {
    const { page, deviceService } = createHarness();
    const pendingReveal = deferred<ReturnType<typeof revealResponse>>();
    deviceService.createDeviceKeyV2.mockResolvedValue(createResponse());
    deviceService.revealDeviceKeyV2.mockReturnValue(pendingReveal.promise);

    const operation = page.createKeyDevice();
    await vi.waitFor(() => {
      expect(deviceService.revealDeviceKeyV2).toHaveBeenCalledTimes(1);
    });
    page.ionViewWillLeave();
    pendingReveal.resolve(revealResponse());
    await operation;

    expect(page.phase).toBe('idle');
    expect(page.secretKey).toBe('');
    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(deviceService.revealDeviceKeyV2).toHaveBeenCalledTimes(1);
  });

  it('discards a reveal response that settles after logout', async () => {
    const {
      page,
      dataService,
      deviceService,
      navController,
      authDataChanged,
    } = createHarness();
    const pendingReveal = deferred<ReturnType<typeof revealResponse>>();
    deviceService.createDeviceKeyV2.mockResolvedValue(createResponse());
    deviceService.revealDeviceKeyV2.mockReturnValue(pendingReveal.promise);

    const operation = page.createKeyDevice();
    await vi.waitFor(() => {
      expect(deviceService.revealDeviceKeyV2).toHaveBeenCalledTimes(1);
    });
    dataService.auth = null as any;
    dataService.sessionEpoch += 1;
    authDataChanged.next();
    pendingReveal.resolve(revealResponse());
    await operation;

    expect(page.phase).toBe('idle');
    expect(page.secretKey).toBe('');
    expect(navController.navigateRoot).toHaveBeenCalledWith('/login');
    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(deviceService.revealDeviceKeyV2).toHaveBeenCalledTimes(1);
  });

  it('keeps the create idempotency key stable for a manual create retry', async () => {
    const { page, deviceService } = createHarness();
    deviceService.createDeviceKeyV2
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(createResponse());
    deviceService.revealDeviceKeyV2.mockResolvedValue(revealResponse());
    page.deviceName = 'Desk sensor';

    await page.createKeyDevice();
    const firstIdempotencyKey =
      deviceService.createDeviceKeyV2.mock.calls[0][1];
    await page.createKeyDevice();

    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(2);
    expect(deviceService.createDeviceKeyV2.mock.calls[1][1]).toBe(
      firstIdempotencyKey
    );
    expect(deviceService.revealDeviceKeyV2).toHaveBeenCalledTimes(1);
  });

  it('does not automatically retry pending Broker allocation and preserves the identity for a manual retry', async () => {
    const { page, deviceService } = createHarness();
    const pending = new GatewayHttpError({
      httpStatus: 503,
      code: 'BROKER_ALLOCATION_PENDING',
      message: 'pending',
    });
    deviceService.createDeviceKeyV2
      .mockRejectedValueOnce(pending)
      .mockResolvedValueOnce(createResponse());
    deviceService.revealDeviceKeyV2.mockResolvedValue(revealResponse());

    await page.createKeyDevice();

    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(deviceService.revealDeviceKeyV2).not.toHaveBeenCalled();
    expect(page.phase).toBe('create-failed');
    expect(page.keyError).toBe('DEVICE_GUIDE.KEY_CREATE_PREPARING_DESCRIPTION');
    const firstIdentity = deviceService.createDeviceKeyV2.mock.calls[0][1];

    await page.createKeyDevice();

    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(2);
    expect(deviceService.createDeviceKeyV2.mock.calls[1][1]).toBe(firstIdentity);
    expect(page.phase).toBe('revealed');
  });

  it('stops a terminal create conflict without submitting create again', async () => {
    const { page, deviceService } = createHarness();
    deviceService.createDeviceKeyV2.mockRejectedValue(
      new GatewayHttpError({
        httpStatus: 409,
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'conflict',
      })
    );

    await page.createKeyDevice();
    await page.createKeyDevice();

    expect(page.phase).toBe('create-blocked');
    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(deviceService.revealDeviceKeyV2).not.toHaveBeenCalled();
    expect(deviceService.createDevice).not.toHaveBeenCalled();
  });

  it.each([
    ['DEVICE_LIMIT_REACHED', 'KEY_DEVICE_LIMIT'],
    ['DEVICE_ENTITLEMENT_INVALID', 'KEY_DEVICE_ENTITLEMENT'],
  ])('explains %s without replaying create or revealing a key', async (code, key) => {
    const { page, deviceService, userService, dataService, navController } = createHarness();
    const originalAuth = dataService.auth;
    deviceService.createDeviceKeyV2.mockRejectedValue(new GatewayHttpError({
      httpStatus: 403, code, message: 'private upstream diagnostic',
      data: { limit: 1, plan: 'unverified-snapshot' },
    }));

    await page.createKeyDevice();
    const idempotencyKey = deviceService.createDeviceKeyV2.mock.calls[0][1];
    await page.createKeyDevice();
    await page.retryReveal();

    expect(page.phase).toBe('create-blocked');
    expect(page.createBlockedTitleKey).toBe(`DEVICE_GUIDE.${key}_TITLE`);
    expect(page.keyError).toBe(`DEVICE_GUIDE.${key}_DESCRIPTION`);
    expect(page.keyError).not.toContain('private upstream diagnostic');
    expect(page.showsCreateForm).toBe(false);
    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect((page as any).idempotencyKey).toBe(idempotencyKey);
    expect(deviceService.revealDeviceKeyV2).not.toHaveBeenCalled();
    expect(deviceService.createDevice).not.toHaveBeenCalled();
    expect(userService.getAllInfo).not.toHaveBeenCalled();
    expect(navController.navigateRoot).not.toHaveBeenCalled();
    expect(dataService.auth).toBe(originalAuth);

    page.ionViewWillLeave();
    expect(page.createBlockedTitleKey).toBe('DEVICE_GUIDE.KEY_CREATE_BLOCKED_TITLE');
    expect(page.phase).toBe('idle');
    page.ngOnDestroy();
  });

  it.each([
    [403, 'DEVICE_OWNER_REQUIRED', 'KEY_CREATE_DENIED'],
    [400, 'DEVICE_LIMIT_REACHED', 'KEY_CREATE_INVALID'],
    [409, 'DEVICE_ENTITLEMENT_INVALID', 'KEY_CREATE_CONFLICT'],
  ])('does not mislabel HTTP %s / %s as an allowance rejection', async (httpStatus, code, key) => {
    const { page, deviceService } = createHarness();
    deviceService.createDeviceKeyV2.mockRejectedValue(new GatewayHttpError({
      httpStatus, code, message: 'private upstream diagnostic',
    }));

    await page.createKeyDevice();

    expect(page.phase).toBe('create-blocked');
    expect(page.createBlockedTitleKey).toBe(`DEVICE_GUIDE.${key}_TITLE`);
    expect(page.keyError).toBe(`DEVICE_GUIDE.${key}_DESCRIPTION`);
    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(deviceService.revealDeviceKeyV2).not.toHaveBeenCalled();
    page.ngOnDestroy();
  });

  it.each([
    [400, 'INVALID_REQUEST', 'KEY_CREATE_INVALID', 'create-blocked'],
    [401, 'AUTH_TOKEN_MISSING', 'KEY_CREATE_AUTH', 'create-blocked'],
    [403, 'AILY_REQUEST_REJECTED', 'KEY_CREATE_DENIED', 'create-blocked'],
    [404, 'HTTP_404', 'KEY_CREATE_ENDPOINT', 'create-blocked'],
    [405, 'METHOD_NOT_ALLOWED', 'KEY_CREATE_ENDPOINT', 'create-blocked'],
    [409, 'IDEMPOTENCY_CONFLICT', 'KEY_CREATE_CONFLICT', 'create-blocked'],
    [409, 'DEVICE_NOT_ACTIVE', 'KEY_CREATE_CONFLICT', 'create-blocked'],
    [410, 'SERVICE_ACCOUNT_DELETED', 'KEY_CREATE_ACCOUNT_UNAVAILABLE', 'create-blocked'],
    [429, 'COMMON_RATE_LIMITED', 'KEY_CREATE_RATE_LIMITED', 'create-failed'],
    [0, 'NETWORK_ERROR', 'KEY_CREATE_NETWORK', 'create-failed'],
    [0, 'GATEWAY_TIMEOUT', 'KEY_CREATE_TIMEOUT', 'create-failed'],
    [500, 'DEVICE_V2_INTERNAL_ERROR', 'KEY_CREATE_SERVICE', 'create-failed'],
    [502, 'AILY_UNAVAILABLE', 'KEY_CREATE_SERVICE', 'create-failed'],
    [503, 'BROKER_UNAVAILABLE', 'KEY_CREATE_SERVICE', 'create-failed'],
    [503, 'DEVICE_V2_UNAVAILABLE', 'KEY_CREATE_SERVICE', 'create-failed'],
    [503, 'BROKER_ALLOCATION_PENDING', 'KEY_CREATE_PREPARING', 'create-failed'],
    [418, 'UNKNOWN_CREATE_CODE', 'KEY_CREATE_BLOCKED', 'create-failed'],
  ])('classifies HTTP %s / %s without automatically repeating create', async (httpStatus, code, key, phase) => {
    const { page, deviceService, dataService, navController } = createHarness();
    const auth = dataService.auth;
    deviceService.createDeviceKeyV2.mockRejectedValue(new GatewayHttpError({
      httpStatus: Number(httpStatus), code: String(code), message: 'private upstream diagnostic',
    }));

    await page.createKeyDevice();
    await page.retryReveal();

    expect(page.phase).toBe(phase);
    expect(page.createBlockedTitleKey).toBe(`DEVICE_GUIDE.${key}_TITLE`);
    expect(page.keyError).toBe(`DEVICE_GUIDE.${key}_DESCRIPTION`);
    expect(page.keyError).not.toContain('private upstream diagnostic');
    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(deviceService.revealDeviceKeyV2).not.toHaveBeenCalled();
    expect(deviceService.createDevice).not.toHaveBeenCalled();
    expect(dataService.auth).toBe(auth);
    expect(navController.navigateRoot).not.toHaveBeenCalled();
    page.ngOnDestroy();
  });

  it('uses a safe unknown-result description for an unexpected failure', async () => {
    const { page, deviceService } = createHarness();
    deviceService.createDeviceKeyV2.mockRejectedValue(new Error('private failure'));

    await page.createKeyDevice();

    expect(page.keyError).toBe('DEVICE_GUIDE.KEY_CREATE_BLOCKED_DESCRIPTION');
    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(deviceService.revealDeviceKeyV2).not.toHaveBeenCalled();
    page.ngOnDestroy();
  });

  it('retains the created device when recent authentication is required without replaying create or reveal', async () => {
    const { page, deviceService, navController, userService, dataService } = createHarness();
    deviceService.createDeviceKeyV2.mockResolvedValue(createResponse());
    deviceService.revealDeviceKeyV2.mockRejectedValue(new GatewayHttpError({
      httpStatus: 403, code: 'DEVICE_KEY_RECENT_AUTH_REQUIRED', message: 'Recent authentication required',
    }));
    const originalAuth = dataService.auth;

    await page.createKeyDevice();
    await page.createKeyDevice();
    await page.retryReveal();

    expect(page.phase).toBe('recent-auth-required');
    expect(page.keyError).toBe('DEVICE_GUIDE.KEY_RECENT_AUTH_DESCRIPTION');
    expect(page.secretKey).toBe('');
    expect(page.showsCreateForm).toBe(false);
    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(deviceService.revealDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(dataService.auth).toBe(originalAuth);
    expect(navController.navigateRoot).not.toHaveBeenCalled();

    await page.finishKeySetup();
    expect(userService.getAllInfo).toHaveBeenCalledTimes(1);
    expect(navController.navigateRoot).toHaveBeenCalledWith('/device/logical%2Fdevice%20%231');
    expect(deviceService.createDevice).not.toHaveBeenCalled();
    page.ngOnDestroy();
  });

  it('blocks step-up unavailable without retrying or falling back', async () => {
    const { page, deviceService } = createHarness();
    deviceService.createDeviceKeyV2.mockResolvedValue(createResponse());
    deviceService.revealDeviceKeyV2.mockRejectedValue(
      new GatewayHttpError({
        httpStatus: 503,
        code: 'DEVICE_KEY_STEP_UP_UNAVAILABLE',
        message: 'step-up unavailable',
      })
    );

    await page.createKeyDevice();
    await page.retryReveal();

    expect(page.phase).toBe('step-up-blocked');
    expect(page.secretKey).toBe('');
    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(deviceService.revealDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(deviceService.createDevice).not.toHaveBeenCalled();
  });

  it('treats terminal reveal responses as blocked without a retry action', async () => {
    const { page, deviceService } = createHarness();
    deviceService.createDeviceKeyV2.mockResolvedValue(createResponse());
    deviceService.revealDeviceKeyV2.mockRejectedValue(
      new GatewayHttpError({
        httpStatus: 404,
        code: 'DEVICE_NOT_FOUND',
        message: 'not found',
      })
    );

    await page.createKeyDevice();
    await page.retryReveal();

    expect(page.phase).toBe('reveal-blocked');
    expect(deviceService.revealDeviceKeyV2).toHaveBeenCalledTimes(1);
    expect(deviceService.createDeviceKeyV2).toHaveBeenCalledTimes(1);
  });

  it('clears the key on leave, completion, logout, and destroy', async () => {
    const leaveHarness = createHarness();
    leaveHarness.deviceService.createDeviceKeyV2.mockResolvedValue(
      createResponse()
    );
    leaveHarness.deviceService.revealDeviceKeyV2.mockResolvedValue(
      revealResponse()
    );
    await leaveHarness.page.createKeyDevice();

    leaveHarness.page.ionViewWillLeave();

    expect(leaveHarness.page.secretKey).toBe('');

    const finishHarness = createHarness();
    finishHarness.deviceService.createDeviceKeyV2.mockResolvedValue(
      createResponse()
    );
    finishHarness.deviceService.revealDeviceKeyV2.mockResolvedValue(
      revealResponse()
    );
    await finishHarness.page.createKeyDevice();

    await finishHarness.page.finishKeySetup();

    expect(finishHarness.page.secretKey).toBe('');
    expect(finishHarness.userService.getAllInfo).toHaveBeenCalledTimes(2);
    expect(finishHarness.navController.navigateRoot).toHaveBeenCalledWith(
      '/device/logical%2Fdevice%20%231'
    );

    const logoutHarness = createHarness();
    logoutHarness.deviceService.createDeviceKeyV2.mockResolvedValue(
      createResponse()
    );
    logoutHarness.deviceService.revealDeviceKeyV2.mockResolvedValue(
      revealResponse()
    );
    await logoutHarness.page.createKeyDevice();
    logoutHarness.dataService.auth = null as any;

    logoutHarness.authDataChanged.next();

    expect(logoutHarness.page.secretKey).toBe('');
    expect(logoutHarness.navController.navigateRoot).toHaveBeenCalledWith(
      '/login'
    );

    const destroyHarness = createHarness();
    destroyHarness.deviceService.createDeviceKeyV2.mockResolvedValue(
      createResponse()
    );
    destroyHarness.deviceService.revealDeviceKeyV2.mockResolvedValue(
      revealResponse()
    );
    await destroyHarness.page.createKeyDevice();

    destroyHarness.page.ngOnDestroy();

    expect(destroyHarness.page.secretKey).toBe('');
  });

  it('clears a revealed key when the authenticated session changes', async () => {
    const {
      page,
      dataService,
      deviceService,
      navController,
      authDataChanged,
    } = createHarness();
    deviceService.createDeviceKeyV2.mockResolvedValue(createResponse());
    deviceService.revealDeviceKeyV2.mockResolvedValue(revealResponse());
    await page.createKeyDevice();
    expect(page.secretKey).toBe(deviceKey);

    dataService.sessionEpoch += 1;
    dataService.auth = { accessToken: 'second-session-token' };
    authDataChanged.next();

    expect(page.phase).toBe('idle');
    expect(page.secretKey).toBe('');
    expect(navController.navigateRoot).not.toHaveBeenCalledWith('/login');
  });

  it('copies a revealed DeviceKey without persisting it', async () => {
    const { page, toastController } = createHarness();
    const clipboardWrite = vi
      .spyOn(page as any, 'writeClipboard')
      .mockResolvedValue(undefined);
    page.phase = 'revealed';
    page.secretKey = deviceKey;

    try {
      await page.copyKey();

      expect(clipboardWrite).toHaveBeenCalledWith(deviceKey);
      expect(toastController.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'DEVICE_GUIDE.KEY_COPIED' })
      );
    } finally {
      clipboardWrite.mockRestore();
    }
  });

  it('keeps the Arduino example aligned with the public Wi-Fi facade', () => {
    const { page } = createHarness();

    expect(page.arduinoExample).toContain('#include <BlinkerWiFi.h>');
    expect(page.arduinoExample).toContain('Blinker.begin(');
    expect(page.arduinoExample).toContain('REPLACE_WITH_DEVICE_KEY');
    expect(page.arduinoExample).not.toContain(deviceKey);
  });

  it('reports a Clipboard failure without clearing the visible key', async () => {
    const { page, toastController } = createHarness();
    const clipboardWrite = vi
      .spyOn(page as any, 'writeClipboard')
      .mockRejectedValue(new Error('denied'));
    page.phase = 'revealed';
    page.secretKey = deviceKey;

    try {
      await page.copyKey();

      expect(page.secretKey).toBe(deviceKey);
      expect(toastController.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'DEVICE_GUIDE.KEY_COPY_FAILED' })
      );
    } finally {
      clipboardWrite.mockRestore();
    }
  });
});
