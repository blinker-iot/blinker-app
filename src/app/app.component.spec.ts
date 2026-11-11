import { ChangeDetectorRef, ElementRef } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { NavController, Platform } from '@ionic/angular/standalone';

import { AppComponent } from './app.component';
import { AudioService } from './core/services/audio.service';
import { AuthService } from './core/services/auth.service';
import { DataService } from './core/services/data.service';
import { DeviceService } from './core/services/device.service';
import { ImageService } from './core/services/image.service';
import { NetworkService } from './core/services/network.service';
import { NoticeService } from './core/services/notice.service';
import { NtfyService } from './core/services/ntfy.service';
import { TipService } from './core/services/tip.service';
import { ToastService } from './core/services/toast.service';
import { TranslationService } from './core/services/translation.service';
import { UpdateService } from './core/services/update.service';
import { UserService } from './core/services/user.service';
import { ViewService } from './core/services/view.service';
import { MessageService } from './sections/message/message.service';

describe('AppComponent authentication startup', () => {
  it('restores auth before redirecting an unauthenticated development build', async () => {
    const restoreAuth = vi.fn().mockResolvedValue(undefined);
    const initDevice = vi.fn();
    const isLogin = vi.fn().mockReturnValue(false);
    const navigateRoot = vi.fn();
    const userService = { getAllInfo: vi.fn() };
    const initMessages = vi.fn().mockResolvedValue(undefined);
    const app = new AppComponent(
      {} as Platform,
      { swipeEnable: false } as ViewService,
      { init: vi.fn(), isLogin } as unknown as AuthService,
      userService as unknown as UserService,
      {
        init: restoreAuth,
      } as unknown as DataService,
      { init: vi.fn() } as unknown as NoticeService,
      { init: vi.fn() } as unknown as UpdateService,
      { init: vi.fn() } as unknown as NetworkService,
      { navigateRoot } as unknown as NavController,
      { init: initDevice } as unknown as DeviceService,
      { init: vi.fn() } as unknown as ImageService,
      { list: [] } as unknown as ToastService,
      { list: [] } as unknown as TipService,
      { init: vi.fn() } as unknown as TranslationService,
      { init: vi.fn() } as unknown as AudioService,
      { init: vi.fn().mockResolvedValue(undefined) } as unknown as NtfyService,
      { init: initMessages } as unknown as MessageService,
      { detectChanges: vi.fn() } as unknown as ChangeDetectorRef,
    );
    app.audio = { nativeElement: {} } as ElementRef;

    await app.initService();

    expect(restoreAuth).toHaveBeenCalledOnce();
    expect(initMessages).toHaveBeenCalledOnce();
    expect(restoreAuth.mock.invocationCallOrder[0]).toBeLessThan(
      initMessages.mock.invocationCallOrder[0],
    );
    expect(initMessages.mock.invocationCallOrder[0]).toBeLessThan(
      isLogin.mock.invocationCallOrder[0],
    );
    expect(initDevice).toHaveBeenCalledOnce();
    expect(userService.getAllInfo).not.toHaveBeenCalled();
    expect(navigateRoot).toHaveBeenCalledWith('/login');
  });
});

describe('AppComponent read-only child route restoration', () => {
  const child = '/device-manager/fixture/logs';
  beforeEach(() => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    window.history.replaceState(null, '', child);
  });
  afterEach(() => { window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); });

  function startup(restore: Promise<void>) {
    let authenticated = false;
    const isLogin = vi.fn(() => authenticated), navigateRoot = vi.fn();
    const getAllInfo = vi.fn().mockResolvedValue(true);
    const init = () => ({ init: vi.fn() });
    const app = new AppComponent({} as Platform, { swipeEnable: false } as ViewService,
      { ...init(), isLogin } as unknown as AuthService, { getAllInfo } as unknown as UserService,
      { init: vi.fn(() => restore) } as unknown as DataService,
      init() as unknown as NoticeService, init() as unknown as UpdateService, init() as unknown as NetworkService,
      { navigateRoot } as unknown as NavController, init() as unknown as DeviceService,
      init() as unknown as ImageService, { list: [] } as unknown as ToastService, { list: [] } as unknown as TipService,
      init() as unknown as TranslationService, init() as unknown as AudioService,
      { init: vi.fn().mockResolvedValue(undefined) } as unknown as NtfyService,
      { init: vi.fn().mockResolvedValue(undefined) } as unknown as MessageService,
      { detectChanges: vi.fn() } as unknown as ChangeDetectorRef);
    app.audio = { nativeElement: {} } as ElementRef;
    return { app, isLogin, navigateRoot, getAllInfo, authenticate: () => { authenticated = true; } };
  }

  it('does not check or redirect while restoration is pending and preserves the valid child route afterwards', async () => {
    let finish!: () => void;
    const f = startup(new Promise<void>(resolve => { finish = resolve; }));
    const work = f.app.initService(); await Promise.resolve();
    expect(f.isLogin).not.toHaveBeenCalled(); expect(f.navigateRoot).not.toHaveBeenCalled();
    f.authenticate(); finish(); await work;
    expect(f.isLogin).toHaveBeenCalledOnce(); expect(f.getAllInfo).toHaveBeenCalledOnce();
    expect(f.navigateRoot).not.toHaveBeenCalled(); expect(window.location.pathname).toBe(child);
  });

  it('redirects a genuinely empty restored session only after restoration completes', async () => {
    let finish!: () => void;
    const f = startup(new Promise<void>(resolve => { finish = resolve; }));
    const work = f.app.initService(); await Promise.resolve();
    expect(f.navigateRoot).not.toHaveBeenCalled(); finish(); await work;
    expect(f.navigateRoot).toHaveBeenCalledExactlyOnceWith('/login'); expect(f.getAllInfo).not.toHaveBeenCalled();
  });

  it('does not turn a failed inventory read into a login redirect or an automatic second read', async () => {
    const f = startup(Promise.resolve()); f.authenticate(); f.getAllInfo.mockResolvedValue(false);
    await f.app.initService(); await Promise.resolve(); await Promise.resolve();
    expect(f.getAllInfo).toHaveBeenCalledOnce(); expect(f.navigateRoot).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe(child);
  });
});
