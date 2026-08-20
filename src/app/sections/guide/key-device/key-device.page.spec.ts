import { Clipboard } from '@capacitor/clipboard';
import { Subject } from 'rxjs';

import { GatewayHttpError } from '../../../core/model/response.model';
import { KeyDeviceGuidePage } from './key-device.page';

describe('KeyDeviceGuidePage DeviceKey V2 flow', () => {
  const diagnosticKey = 'A'.repeat(43);

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
      navController as any,
      toastController as any,
      translate as any,
      cd as any
    );

    return {
      page,
      dataService,
      deviceService,
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
        deviceKey: diagnosticKey,
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
    const { page, deviceService } = createHarness();
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
    expect(page.secretKey).toBe(diagnosticKey);
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
    expect(finishHarness.navController.navigateRoot).toHaveBeenCalledWith(
      '/guide'
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
    expect(page.secretKey).toBe(diagnosticKey);

    dataService.sessionEpoch += 1;
    dataService.auth = { accessToken: 'second-session-token' };
    authDataChanged.next();

    expect(page.phase).toBe('idle');
    expect(page.secretKey).toBe('');
    expect(navController.navigateRoot).not.toHaveBeenCalledWith('/login');
  });

  it('does not write to Clipboard when diagnostic display is disabled', async () => {
    const { page, toastController } = createHarness();
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(Clipboard, 'write', {
      configurable: true,
      value: clipboardWrite,
    });
    Object.defineProperty(page, 'diagnosticKeyDisplayEnabled', {
      value: false,
    });
    page.phase = 'revealed';
    page.secretKey = diagnosticKey;

    try {
      await page.copyKey();

      expect(clipboardWrite).not.toHaveBeenCalled();
      expect(toastController.create).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(Clipboard, 'write');
    }
  });
});
