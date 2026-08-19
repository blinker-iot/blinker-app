import { ChangeDetectorRef, ElementRef } from '@angular/core';
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

describe('AppComponent authentication startup', () => {
  it('restores auth before redirecting an unauthenticated development build', async () => {
    const restoreAuth = vi.fn().mockResolvedValue(undefined);
    const isLogin = vi.fn().mockReturnValue(false);
    const navigateRoot = vi.fn();
    const userService = { getAllInfo: vi.fn() };
    const app = new AppComponent(
      {} as Platform,
      { swipeEnable: false } as ViewService,
      { init: vi.fn(), isLogin } as unknown as AuthService,
      userService as unknown as UserService,
      {
        init: restoreAuth,
        loadGuestDevicePreview: vi.fn(),
      } as unknown as DataService,
      { init: vi.fn() } as unknown as NoticeService,
      { init: vi.fn() } as unknown as UpdateService,
      { init: vi.fn() } as unknown as NetworkService,
      { navigateRoot } as unknown as NavController,
      { init: vi.fn() } as unknown as DeviceService,
      { init: vi.fn() } as unknown as ImageService,
      { list: [] } as unknown as ToastService,
      { list: [] } as unknown as TipService,
      { init: vi.fn() } as unknown as TranslationService,
      { init: vi.fn() } as unknown as AudioService,
      { init: vi.fn().mockResolvedValue(undefined) } as unknown as NtfyService,
      { detectChanges: vi.fn() } as unknown as ChangeDetectorRef,
    );
    app.audio = { nativeElement: {} } as ElementRef;

    await app.initService();

    expect(restoreAuth).toHaveBeenCalledOnce();
    expect(restoreAuth.mock.invocationCallOrder[0]).toBeLessThan(
      isLogin.mock.invocationCallOrder[0],
    );
    expect(userService.getAllInfo).not.toHaveBeenCalled();
    expect(navigateRoot).toHaveBeenCalledWith('/login');
  });
});
