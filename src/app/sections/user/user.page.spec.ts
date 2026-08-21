import { Subject } from 'rxjs';
import { UserPage } from './user.page';

interface AlertButtonConfig {
  text?: string;
  handler?: (data?: Record<string, unknown>) => unknown;
}

interface AlertRecord {
  options: {
    header?: string;
    inputs?: Array<Record<string, unknown>>;
    buttons?: Array<string | AlertButtonConfig>;
  };
  present: ReturnType<typeof vi.fn>;
  dismiss: ReturnType<typeof vi.fn>;
}

describe('UserPage account cancellation', () => {
  let page: UserPage;
  let alerts: AlertRecord[];
  let authService: {
    sendEmailCode: ReturnType<typeof vi.fn>;
    loginWithEmailCode: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let userService: {
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
      sendEmailCode: vi.fn().mockResolvedValue(true),
      loginWithEmailCode: vi.fn().mockResolvedValue(true),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    userService = {
      cancelBlinkerAccount: vi.fn().mockResolvedValue(true),
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
  });

  it('sends the verification code to the current account email', async () => {
    await page.showCancelAlert();

    expect(alerts[0].options.inputs?.[0]).toMatchObject({
      name: 'code',
      type: 'text',
    });
    await getButton(alerts[0], '获取验证码').handler?.();

    expect(authService.sendEmailCode).toHaveBeenCalledWith(
      'person@example.com',
    );
    expect(noticeService.showToast).toHaveBeenCalledWith('codeSent');
  });

  it('keeps the alert open and does not delete for an empty code', async () => {
    await page.showCancelAlert();
    const result = await getButton(alerts[0], '确认注销').handler?.({
      code: ' ',
    });

    expect(result).toBe(false);
    expect(noticeService.showToast).toHaveBeenCalledWith('needVerifyCode');
    expect(authService.loginWithEmailCode).not.toHaveBeenCalled();
    expect(userService.cancelBlinkerAccount).not.toHaveBeenCalled();
  });

  it('reauthenticates with the email code before deleting the account', async () => {
    await page.showCancelAlert();
    const result = await getButton(alerts[0], '确认注销').handler?.({
      code: ' 654321 ',
    });

    expect(authService.loginWithEmailCode).toHaveBeenCalledWith(
      'person@example.com',
      '654321',
    );
    expect(userService.cancelBlinkerAccount).toHaveBeenCalledOnce();
    expect(authService.logout).toHaveBeenCalledOnce();
    expect(result).toBe(true);
  });

  it('does not delete or log out when email verification fails', async () => {
    authService.loginWithEmailCode.mockResolvedValue(false);
    await page.showCancelAlert();
    const result = await getButton(alerts[0], '确认注销').handler?.({
      code: '654321',
    });

    expect(result).toBe(false);
    expect(userService.cancelBlinkerAccount).not.toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
    expect(noticeService.showToast).toHaveBeenCalledWith(
      '邮箱验证码错误或已过期',
    );
  });

  it('does not log out when account deletion fails', async () => {
    userService.cancelBlinkerAccount.mockResolvedValue(false);
    await page.showCancelAlert();
    const result = await getButton(alerts[0], '确认注销').handler?.({
      code: '654321',
    });

    expect(result).toBe(false);
    expect(authService.logout).not.toHaveBeenCalled();
    expect(noticeService.showToast).toHaveBeenCalledWith(
      '账号注销失败，请稍后重试',
    );
  });

  it('blocks cancellation while the account still has devices', async () => {
    dataService.device.list = ['device-1'];
    await page.showCancelAlert();

    expect(alerts[0].options.header).toBe('暂时无法注销');
    expect(authService.sendEmailCode).not.toHaveBeenCalled();
    expect(authService.loginWithEmailCode).not.toHaveBeenCalled();
    expect(userService.cancelBlinkerAccount).not.toHaveBeenCalled();
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
