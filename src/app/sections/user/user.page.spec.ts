import { Subject } from 'rxjs';
import { GatewayHttpError } from 'src/app/core/model/response.model';
import { UserPage } from './user.page';

interface AlertButtonConfig {
  text?: string;
  handler?: (data?: Record<string, unknown>) => unknown;
}

interface AlertRecord {
  options: {
    header?: string;
    message?: string;
    inputs?: Array<Record<string, unknown>>;
    buttons?: Array<string | AlertButtonConfig>;
  };
  message: string;
  inputs: Array<Record<string, unknown>>;
  present: ReturnType<typeof vi.fn>;
  dismiss: ReturnType<typeof vi.fn>;
}

const deletedAccount = {
  account: {
    accountId: 'user-1',
    tenantId: 'tenant-1',
    status: 'deleted' as const,
    deletedAt: 3,
  },
};

describe('UserPage account cancellation', () => {
  let page: UserPage;
  let alerts: AlertRecord[];
  let authService: {
    loginWithEmailCode: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let userService: {
    requestAccountDeletionCode: ReturnType<typeof vi.fn>;
    cancelBlinkerAccount: ReturnType<typeof vi.fn>;
  };
  let noticeService: {
    showLoading: ReturnType<typeof vi.fn>;
    hideLoading: ReturnType<typeof vi.fn>;
    showToast: ReturnType<typeof vi.fn>;
  };
  let dataService: {
    user: {
      email: string;
      nickname: string;
      avatar: null;
    };
    device: { list: string[] };
    userDataLoader: Subject<boolean>;
  };

  beforeEach(() => {
    alerts = [];
    authService = {
      loginWithEmailCode: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    userService = {
      requestAccountDeletionCode: vi.fn().mockResolvedValue({
        purpose: 'account_deletion',
        expiresIn: 125,
        maskedEmail: 'p***@example.com',
      }),
      cancelBlinkerAccount: vi.fn().mockResolvedValue(deletedAccount),
    };
    noticeService = {
      showLoading: vi.fn().mockResolvedValue(undefined),
      hideLoading: vi.fn().mockResolvedValue(undefined),
      showToast: vi.fn().mockResolvedValue(undefined),
    };
    dataService = {
      user: {
        email: 'person@example.com',
        nickname: 'Person',
        avatar: null,
      },
      device: { list: [] },
      userDataLoader: new Subject<boolean>(),
    };
    const alertCtrl = {
      create: vi.fn().mockImplementation(async (options) => {
        const alert: AlertRecord = {
          options,
          message: String(options.message ?? ''),
          inputs: options.inputs ?? [],
          present: vi.fn().mockResolvedValue(undefined),
          dismiss: vi.fn().mockResolvedValue(undefined),
        };
        alerts.push(alert);
        return alert;
      }),
    };

    page = new UserPage(
      authService as never,
      userService as never,
      alertCtrl as never,
      dataService as never,
      noticeService as never,
    );
    page.ngOnInit();
  });

  afterEach(() => {
    page.ngOnDestroy();
    vi.useRealTimers();
  });

  it('uses server-derived delivery details and expiry for the countdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T00:00:00Z'));
    dataService.user.email = '';
    await page.showCancelAlert();

    expect(alerts[0].options.inputs?.[0]).toMatchObject({
      name: 'code',
      type: 'text',
      placeholder: 'D-123456',
      attributes: { inputmode: 'text', maxlength: 8 },
    });
    await getButton(alerts[0], '发送/重发验证码').handler?.();

    expect(userService.requestAccountDeletionCode).toHaveBeenCalledWith();
    expect(alerts[0].message).toContain('p***@example.com');
    expect(alerts[0].message).toContain('02:05');
    expect(authService.loginWithEmailCode).not.toHaveBeenCalled();
    expect(noticeService.showToast).toHaveBeenCalledWith('codeSent');

    await vi.advanceTimersByTimeAsync(1000);
    expect(alerts[0].message).toContain('02:04');
  });

  it('rejects empty and login-style codes before DELETE', async () => {
    await page.showCancelAlert();
    const confirm = getButton(alerts[0], '确认注销');

    await expect(confirm.handler?.({ code: ' ' })).resolves.toBe(false);
    await expect(confirm.handler?.({ code: '654321' })).resolves.toBe(false);

    expect(noticeService.showToast).toHaveBeenCalledWith(
      '请输入 D- 开头并带 6 位数字的完整注销验证码',
    );
    expect(userService.cancelBlinkerAccount).not.toHaveBeenCalled();
    expect(authService.loginWithEmailCode).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('passes the full D-code and logs out only after DELETE succeeds', async () => {
    const deletion = deferred<typeof deletedAccount>();
    userService.cancelBlinkerAccount.mockReturnValue(deletion.promise);
    await page.showCancelAlert();

    const result = getButton(alerts[0], '确认注销').handler?.({
      code: ' D-123456 ',
    }) as Promise<boolean>;
    await Promise.resolve();

    expect(userService.cancelBlinkerAccount).toHaveBeenCalledWith('D-123456');
    expect(authService.loginWithEmailCode).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();

    deletion.resolve(deletedAccount);
    await expect(result).resolves.toBe(true);
    expect(authService.logout).toHaveBeenCalledOnce();
  });

  it('keeps a failed code for retry and never requests a replacement automatically', async () => {
    userService.cancelBlinkerAccount
      .mockRejectedValueOnce(gatewayError(409, 'ACCOUNT_DELETION_IN_PROGRESS'))
      .mockResolvedValueOnce(deletedAccount);
    await page.showCancelAlert();
    const confirm = getButton(alerts[0], '确认注销');

    await expect(confirm.handler?.({ code: 'D-654321' })).resolves.toBe(false);
    expect(authService.logout).not.toHaveBeenCalled();
    expect(userService.requestAccountDeletionCode).not.toHaveBeenCalled();
    expect(noticeService.showToast).toHaveBeenCalledWith(
      '账号正在注销中，请保留当前验证码并稍后再次确认',
    );

    await expect(confirm.handler?.({ code: ' ' })).resolves.toBe(true);
    expect(userService.cancelBlinkerAccount).toHaveBeenNthCalledWith(
      2,
      'D-654321',
    );
    expect(userService.requestAccountDeletionCode).not.toHaveBeenCalled();
    expect(authService.logout).toHaveBeenCalledOnce();
  });

  it('keeps invalid and expired failures recoverable without clearing the session', async () => {
    userService.cancelBlinkerAccount
      .mockRejectedValueOnce(gatewayError(400, 'ACCOUNT_DELETION_CODE_INVALID'))
      .mockRejectedValueOnce(gatewayError(410, 'ACCOUNT_DELETION_CODE_EXPIRED'))
      .mockResolvedValueOnce(deletedAccount);
    await page.showCancelAlert();
    const confirm = getButton(alerts[0], '确认注销');

    await expect(confirm.handler?.({ code: 'D-111111' })).resolves.toBe(false);
    await expect(confirm.handler?.({ code: 'D-222222' })).resolves.toBe(false);
    expect(authService.logout).not.toHaveBeenCalled();
    expect(userService.requestAccountDeletionCode).not.toHaveBeenCalled();
    expect(noticeService.showToast).toHaveBeenCalledWith(
      '注销验证码错误，请检查 D- 前缀和 6 位数字',
    );
    expect(noticeService.showToast).toHaveBeenCalledWith(
      '注销验证码已过期，请手动重新发送',
    );

    alerts[0].inputs[0]['value'] = 'D-222222';
    userService.requestAccountDeletionCode.mockResolvedValueOnce({
      purpose: 'account_deletion',
      expiresIn: 47,
      maskedEmail: 'n***@example.com',
    });
    await getButton(alerts[0], '发送/重发验证码').handler?.();
    expect(userService.requestAccountDeletionCode).toHaveBeenCalledOnce();
    expect(alerts[0].inputs[0]['value']).toBe('');
    expect(alerts[0].message).toContain('n***@example.com');
    expect(alerts[0].message).toContain('00:47');
    await expect(confirm.handler?.({ code: 'D-333333' })).resolves.toBe(true);
    expect(authService.logout).toHaveBeenCalledOnce();
  });

  it('honors Retry-After before allowing an explicit resend', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T00:00:00Z'));
    userService.requestAccountDeletionCode
      .mockRejectedValueOnce(new GatewayHttpError({
        httpStatus: 429,
        code: 'ACCOUNT_DELETION_CODE_RATE_LIMITED',
        message: 'upstream internal diagnostic',
        retryAfterSeconds: 37,
      }))
      .mockResolvedValueOnce({
        purpose: 'account_deletion',
        expiresIn: 90,
        maskedEmail: 'n***@example.com',
      });
    await page.showCancelAlert();
    const send = getButton(alerts[0], '发送/重发验证码');

    await send.handler?.();
    expect(alerts[0].message).toContain('00:37');
    expect(noticeService.showToast).toHaveBeenCalledWith(
      '请求过于频繁，请在 37 秒后重试',
    );
    expect(noticeService.showToast).not.toHaveBeenCalledWith(
      'upstream internal diagnostic',
    );

    await send.handler?.();
    expect(userService.requestAccountDeletionCode).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(37_000);
    await send.handler?.();
    expect(userService.requestAccountDeletionCode).toHaveBeenCalledTimes(2);
    expect(alerts[0].message).toContain('n***@example.com');
    expect(alerts[0].message).toContain('01:30');
  });

  it('maps every stable deletion error without exposing server diagnostics', async () => {
    const cases = [
      ['AUTH_TOKEN_MISSING', '当前登录状态无法验证，请重新登录后再试'],
      ['INVALID_REQUEST', '注销请求无法处理，请更新应用后重试'],
      ['ACCOUNT_DELETION_CODE_REQUIRED', '请输入完整的注销验证码'],
      ['ACCOUNT_DELETION_CODE_INVALID', '注销验证码错误，请检查 D- 前缀和 6 位数字'],
      [
        'ACCOUNT_DELETION_CODE_PURPOSE_MISMATCH',
        '该验证码不能用于账号注销，请手动重新发送注销验证码',
      ],
      [
        'ACCOUNT_DELETION_CODE_ACCOUNT_MISMATCH',
        '该验证码不属于当前账号，请手动重新发送注销验证码',
      ],
      [
        'ACCOUNT_DELETION_CODE_EMAIL_MISMATCH',
        '该验证码与当前账号邮箱不匹配，请手动重新发送注销验证码',
      ],
      ['ACCOUNT_DELETION_CODE_EXPIRED', '注销验证码已过期，请手动重新发送'],
      ['ACCOUNT_DELETION_CODE_CONSUMED', '注销验证码已使用，请手动重新发送'],
      [
        'ACCOUNT_DELETION_IN_PROGRESS',
        '账号正在注销中，请保留当前验证码并稍后再次确认',
      ],
      [
        'ACCOUNT_DELETION_CODE_RATE_LIMITED',
        '注销验证码请求过于频繁，请稍后重试',
      ],
      ['ACCOUNT_DELETION_EMAIL_UNAVAILABLE', '当前账号邮箱无法用于注销验证'],
      [
        'ACCOUNT_DELETION_EMAIL_DELIVERY_UNAVAILABLE',
        '邮件服务暂时不可用，请稍后重试',
      ],
      ['BODY_TOO_LARGE', '注销请求无法处理，请更新应用后重试'],
    ];
    await page.showCancelAlert();
    const confirm = getButton(alerts[0], '确认注销');

    for (const [code, expectedMessage] of cases) {
      userService.cancelBlinkerAccount.mockRejectedValueOnce(
        new GatewayHttpError({
          httpStatus: 400,
          code,
          message: 'upstream internal diagnostic',
        }),
      );
      await expect(confirm.handler?.({ code: 'D-123456' })).resolves.toBe(false);
      expect(noticeService.showToast).toHaveBeenLastCalledWith(expectedMessage);
    }

    expect(authService.logout).not.toHaveBeenCalled();
    expect(userService.requestAccountDeletionCode).not.toHaveBeenCalled();
    expect(noticeService.showToast).not.toHaveBeenCalledWith(
      'upstream internal diagnostic',
    );
  });

  it('blocks cancellation while the account still has devices', async () => {
    dataService.device.list = ['device-1'];
    await page.showCancelAlert();

    expect(alerts[0].options.header).toBe('暂时无法注销');
    expect(userService.requestAccountDeletionCode).not.toHaveBeenCalled();
    expect(userService.cancelBlinkerAccount).not.toHaveBeenCalled();
    expect(authService.loginWithEmailCode).not.toHaveBeenCalled();
  });
});

function getButton(alert: AlertRecord, text: string): AlertButtonConfig {
  const button = alert.options.buttons?.find(
    (candidate): candidate is AlertButtonConfig =>
      typeof candidate !== 'string' && candidate.text === text,
  );
  if (!button) throw new Error(`Missing alert button: ${text}`);
  return button;
}

function gatewayError(status: number, code: string): GatewayHttpError {
  return new GatewayHttpError({
    httpStatus: status,
    code,
    message: 'upstream internal diagnostic',
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}
