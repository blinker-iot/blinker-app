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
  querySelector: (selector: string) => HTMLElement | null;
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
    logout: ReturnType<typeof vi.fn>;
  };
  let userService: {
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
      logout: vi.fn().mockResolvedValue(undefined),
    };
    userService = {
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
        const message = document.createElement('div');
        message.className = 'alert-message';
        message.textContent = String(options.message ?? '');
        const alert: AlertRecord = {
          options,
          message: String(options.message ?? ''),
          inputs: options.inputs ?? [],
          querySelector: (selector) => message.matches(selector) ? message : null,
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

  it.each([false, true])('requires typed confirmation when emailIsVirtual is %s', async (virtual) => {
    dataService.user.emailIsVirtual = virtual;
    await page.showCancelAlert();

    expect(alerts[0].options.inputs).toEqual([
      expect.objectContaining({ name: 'confirmation', type: 'text', placeholder: '确认注销' }),
    ]);
    expect(alerts[0].message).toContain('永久删除且无法恢复');
    expect(alerts[0].message).toContain('请输入“确认注销”');
    expect(alerts[0].options.buttons).toEqual([
      expect.objectContaining({ text: '取消', role: 'cancel' }),
      expect.objectContaining({ text: '确认注销', role: 'destructive' }),
    ]);
    await expect(getButton(alerts[0], '确认注销').handler?.()).resolves.toBe(false);
    expect(noticeService.showToast).toHaveBeenCalledWith('请输入“确认注销”以确认注销账号');
    await getButton(alerts[0], '取消').handler?.();
    expect(userService.cancelBlinkerAccount).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('rejects text that does not exactly match the confirmation phrase', async () => {
    await page.showCancelAlert();

    await expect(getButton(alerts[0], '确认注销').handler?.({
      confirmation: '确认注销账号',
    })).resolves.toBe(false);

    expect(noticeService.showToast).toHaveBeenCalledWith('请输入“确认注销”以确认注销账号');
    expect(userService.cancelBlinkerAccount).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('deletes once after the correct phrase and logs out only after success', async () => {
    const deletion = deferred<typeof deletedAccount>();
    userService.cancelBlinkerAccount.mockReturnValue(deletion.promise);
    await page.showCancelAlert();
    const confirm = getButton(alerts[0], '确认注销');
    const result = confirm.handler?.({ confirmation: ' 确认注销 ' }) as Promise<boolean>;
    await Promise.resolve();
    await expect(confirm.handler?.({ confirmation: '确认注销' })).resolves.toBe(false);

    expect(userService.cancelBlinkerAccount).toHaveBeenCalledExactlyOnceWith();
    expect(authService.logout).not.toHaveBeenCalled();
    deletion.resolve(deletedAccount);
    await expect(result).resolves.toBe(true);
    expect(authService.logout).toHaveBeenCalledOnce();
    expect(noticeService.hideLoading).toHaveBeenCalledOnce();
  });

  it('keeps failed deletion open for retry and maps errors without exposing diagnostics', async () => {
    const cases = [
      { error: gatewayError(401, 'AUTH_TOKEN_MISSING'), message: '当前登录状态无法验证，请重新登录后再试' },
      { error: gatewayError(400, 'INVALID_REQUEST'), message: '注销请求无法处理，请更新应用后重试' },
      { error: gatewayError(409, 'ACCOUNT_DELETION_IN_PROGRESS'), message: '账号正在注销中，请稍后再次确认' },
      { error: gatewayError(413, 'BODY_TOO_LARGE'), message: '注销请求无法处理，请更新应用后重试' },
      { error: new Error('internal diagnostic'), message: '账号注销暂未完成，请稍后重试' },
    ];
    await page.showCancelAlert();
    const confirm = getButton(alerts[0], '确认注销');
    alerts[0].inputs[0]['value'] = '确认注销';

    for (const { error, message } of cases) {
      userService.cancelBlinkerAccount.mockRejectedValueOnce(error);
      await expect(confirm.handler?.({ confirmation: '确认注销' })).resolves.toBe(false);
      expect(noticeService.showToast).toHaveBeenLastCalledWith(message);
      expect(authService.logout).not.toHaveBeenCalled();
      expect(alerts[0].inputs[0]['value']).toBe('确认注销');
    }

    alerts[0].inputs[0]['value'] = '';
    await expect(confirm.handler?.({ confirmation: '' })).resolves.toBe(false);
    expect(userService.cancelBlinkerAccount).toHaveBeenCalledTimes(cases.length);
    await expect(confirm.handler?.({ confirmation: '确认注销' })).resolves.toBe(true);
    expect(authService.logout).toHaveBeenCalledOnce();
    expect(noticeService.hideLoading).toHaveBeenCalledTimes(cases.length + 1);
  });

  it('blocks cancellation while the account still has devices', async () => {
    dataService.device.list = ['device-1'];
    await page.showCancelAlert();

    expect(alerts[0].options.header).toBe('暂时无法注销');
    expect(alerts[0].options.buttons).toEqual(['知道了']);
    expect(alerts[0].inputs).toEqual([]);
    expect(userService.cancelBlinkerAccount).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
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
