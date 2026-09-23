import { AlertController, LoadingController, ToastController } from '@ionic/angular/standalone';
import { NoticeService } from './notice.service';
import { TipService } from './tip.service';

describe('NoticeService WeChat binding loading', () => {
  const overlay = () => ({
    present: vi.fn().mockResolvedValue(undefined),
    dismiss: vi.fn().mockResolvedValue(undefined),
  });
  let service: NoticeService;
  let emailLoading: ReturnType<typeof overlay>;
  let bindingLoading: ReturnType<typeof overlay>;
  let createLoading: ReturnType<typeof vi.fn>;
  let createToast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    emailLoading = overlay();
    bindingLoading = overlay();
    createLoading = vi.fn()
      .mockResolvedValueOnce(emailLoading)
      .mockResolvedValueOnce(bindingLoading);
    createToast = vi.fn().mockResolvedValue({ present: vi.fn() });
    service = new NoticeService(
      { create: createToast } as unknown as ToastController,
      { create: createLoading } as unknown as LoadingController,
      {} as AlertController,
      {} as TipService,
    );
  });

  afterEach(() => vi.useRealTimers());

  it('clears the email timer and keeps waiting for WeChat beyond ten seconds', async () => {
    await service.showLoading('login');
    await vi.advanceTimersByTimeAsync(5000);
    await service.hideLoading();
    expect(service.loadTimer).toBeUndefined();

    await service.showLoading('wechatBinding');
    await vi.advanceTimersByTimeAsync(15000);

    expect(createLoading).toHaveBeenLastCalledWith({ message: '等待微信授权...' });
    expect(bindingLoading.present).toHaveBeenCalledOnce();
    expect(bindingLoading.dismiss).not.toHaveBeenCalled();
    expect(createToast).not.toHaveBeenCalled();
    await service.hideLoading();
    expect(bindingLoading.dismiss).toHaveBeenCalledOnce();
  });

  it('waits for the previous overlay to dismiss before creating the binding overlay', async () => {
    await service.showLoading('login');
    let finishDismiss!: () => void;
    emailLoading.dismiss.mockReturnValue(new Promise<void>((resolve) => {
      finishDismiss = resolve;
    }));

    const waiting = service.showLoading('wechatBinding');
    await Promise.resolve();
    expect(createLoading).toHaveBeenCalledOnce();

    finishDismiss();
    await waiting;
    expect(createLoading).toHaveBeenCalledTimes(2);
    expect(bindingLoading.present).toHaveBeenCalledOnce();
  });
});
