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
    requestEmailChangeCode: ReturnType<typeof vi.fn>;
    bindEmail: ReturnType<typeof vi.fn>;
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
      emailIsVirtual: boolean;
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
      requestEmailChangeCode: vi.fn().mockResolvedValue(undefined),
      bindEmail: vi.fn().mockResolvedValue(undefined),
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
        emailIsVirtual: false,
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

  it('offers email changes to both personal and virtual email accounts', () => {
    const emailItem = () => page.profileMenuItems.find((item) => item.id === 'email')!;
    expect(emailItem().disabled).toBe(false);
    page.selectMenuItem(emailItem());
    expect(page.editingEmail).toBe(true);

    dataService.user.emailIsVirtual = true;
    expect(emailItem()).toMatchObject({ value: '虚拟邮箱', disabled: false, showChevron: true });
    page.selectMenuItem(emailItem());
    expect(page.editingEmail).toBe(true);
  });

  it.each([
    ['a1b2c3d4e5f6@v.aily.pro', true],
    ['', false],
  ])('verifies only the new email when replacing %s', async (email, virtual) => {
    dataService.user.emailIsVirtual = virtual;
    dataService.user.email = email;
    page.editingEmail = true;
    page.newEmail = ' Personal@Example.com ';
    await page.sendEmailCode('current');
    expect(userService.requestEmailChangeCode).not.toHaveBeenCalled();
    await page.sendEmailCode();
    expect(userService.requestEmailChangeCode).toHaveBeenCalledWith('personal@example.com');
    expect(noticeService.showToast).toHaveBeenLastCalledWith(
      '验证码已发送至 personal@example.com，请在新邮箱中查收',
    );
    expect(page.emailCodeCountdown).toBe(60);
    await page.sendEmailCode();
    expect(userService.requestEmailChangeCode).toHaveBeenCalledOnce();

    const binding = deferred<void>();
    userService.bindEmail.mockReturnValue(binding.promise);
    page.emailCode = ' 123456 ';
    const result = page.bindEmail();
    expect(userService.bindEmail).toHaveBeenCalledWith('personal@example.com', '123456');
    expect(authService.logout).not.toHaveBeenCalled();
    binding.resolve();
    await result;
    expect(authService.logout).toHaveBeenCalledOnce();
    expect(page.editingEmail).toBe(false);
    expect(noticeService.showToast).toHaveBeenLastCalledWith(
      '邮箱更换成功，请使用新邮箱或微信重新登录',
    );
  });

  it('rejects incomplete input and leaves failed email binding open for retry', async () => {
    dataService.user.emailIsVirtual = true;
    page.editingEmail = true;
    page.newEmail = 'invalid';
    await page.sendEmailCode();
    expect(userService.requestEmailChangeCode).not.toHaveBeenCalled();
    page.newEmail = 'personal@example.com';
    page.emailCode = '123';
    await page.bindEmail();
    expect(userService.bindEmail).not.toHaveBeenCalled();

    userService.bindEmail.mockRejectedValue(new Error('internal diagnostic'));
    page.emailCode = '123456';
    await page.bindEmail();
    expect(page.editingEmail).toBe(true);
    expect(page.emailCode).toBe('123456');
    expect(authService.logout).not.toHaveBeenCalled();
    expect(noticeService.showToast).toHaveBeenLastCalledWith(
      '邮箱更换失败，请检查新邮箱验证码或更换邮箱后重试',
    );
  });

  it('requires both email codes for a personal account and logs out only after success', async () => {
    page.editingEmail = true;
    page.newEmail = 'personal@example.com';
    page.emailCode = '123456';
    await page.bindEmail();
    expect(userService.bindEmail).not.toHaveBeenCalled();
    expect(noticeService.showToast).toHaveBeenLastCalledWith('请输入原邮箱收到的 6 位验证码');

    page.currentEmailCode = ' 654321 ';
    userService.bindEmail.mockRejectedValueOnce(new Error('invalid current code'));
    await page.bindEmail();
    expect(userService.bindEmail).toHaveBeenCalledWith('personal@example.com', '123456', '654321');
    expect(authService.logout).not.toHaveBeenCalled();
    expect(page.editingEmail).toBe(true);
    expect(noticeService.showToast).toHaveBeenLastCalledWith(
      '邮箱更换失败，请检查原邮箱和新邮箱验证码后重试',
    );

    await page.bindEmail();
    expect(authService.logout).toHaveBeenCalledOnce();
    expect(page.editingEmail).toBe(false);
  });

  it('counts down each recipient independently and resets codes when the target email changes', async () => {
    vi.useFakeTimers();
    page.newEmail = 'personal@example.com';
    await page.sendEmailCode('current');
    expect(userService.requestEmailChangeCode).toHaveBeenLastCalledWith('personal@example.com', 'current');
    expect(noticeService.showToast).toHaveBeenLastCalledWith(
      '验证码已发送至 person@example.com，请在原邮箱中查收',
    );
    await vi.advanceTimersByTimeAsync(1000);
    await page.sendEmailCode();
    expect(userService.requestEmailChangeCode).toHaveBeenLastCalledWith('personal@example.com');
    expect(page.currentEmailCodeCountdown).toBe(59);
    expect(page.emailCodeCountdown).toBe(60);
    await page.sendEmailCode('current');
    expect(userService.requestEmailChangeCode).toHaveBeenCalledTimes(2);

    page.currentEmailCode = '654321';
    page.emailCode = '123456';
    page.changeNewEmail('another@example.com');
    expect(page.currentEmailCode).toBe('');
    expect(page.emailCode).toBe('');
    expect(page.currentEmailCodeCountdown).toBe(0);
    expect(page.emailCodeCountdown).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.currentEmailCodeCountdown).toBe(0);
    expect(page.emailCodeCountdown).toBe(0);
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

  it('requires confirmation to delete a virtual account without an email code', async () => {
    dataService.user.emailIsVirtual = true;
    await page.showCancelAlert();

    expect(alerts[0].inputs).toEqual([]);
    expect(alerts[0].message).toBe('注销后相关数据将被永久删除且无法恢复。');
    expect(alerts[0].options.buttons).toEqual([
      expect.objectContaining({ text: '取消', role: 'cancel' }),
      expect.objectContaining({ text: '确认注销', role: 'destructive' }),
    ]);
    await getButton(alerts[0], '取消').handler?.();
    expect(userService.cancelBlinkerAccount).not.toHaveBeenCalled();

    await page.showCancelAlert();
    const deletion = deferred<typeof deletedAccount>();
    userService.cancelBlinkerAccount.mockReturnValue(deletion.promise);
    const confirm = getButton(alerts[1], '确认注销');
    const result = confirm.handler?.() as Promise<boolean>;
    await Promise.resolve();
    await expect(confirm.handler?.()).resolves.toBe(false);

    expect(userService.cancelBlinkerAccount).toHaveBeenCalledExactlyOnceWith();
    expect(userService.requestAccountDeletionCode).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
    deletion.resolve(deletedAccount);
    await expect(result).resolves.toBe(true);
    expect(authService.logout).toHaveBeenCalledOnce();
    expect(noticeService.hideLoading).toHaveBeenCalledOnce();
  });

  it('keeps virtual-account failures retryable without asking users to retain a code', async () => {
    dataService.user.emailIsVirtual = true;
    userService.cancelBlinkerAccount
      .mockRejectedValueOnce(gatewayError(409, 'ACCOUNT_DELETION_IN_PROGRESS'))
      .mockRejectedValueOnce(new Error('internal diagnostic'))
      .mockResolvedValueOnce(deletedAccount);
    await page.showCancelAlert();
    const confirm = getButton(alerts[0], '确认注销');

    await expect(confirm.handler?.()).resolves.toBe(false);
    expect(authService.logout).not.toHaveBeenCalled();
    expect(noticeService.showToast).toHaveBeenLastCalledWith('账号正在注销中，请稍后再次确认');
    await expect(confirm.handler?.()).resolves.toBe(false);
    expect(authService.logout).not.toHaveBeenCalled();
    expect(noticeService.showToast).toHaveBeenLastCalledWith('账号注销暂未完成，请稍后重试');

    await expect(confirm.handler?.()).resolves.toBe(true);
    expect(userService.cancelBlinkerAccount.mock.calls).toEqual([[], [], []]);
    expect(userService.requestAccountDeletionCode).not.toHaveBeenCalled();
    expect(authService.logout).toHaveBeenCalledOnce();
    expect(noticeService.hideLoading).toHaveBeenCalledTimes(3);
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

  it.each([false, true])('blocks cancellation with devices when emailIsVirtual is %s', async (virtual) => {
    dataService.user.emailIsVirtual = virtual;
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
