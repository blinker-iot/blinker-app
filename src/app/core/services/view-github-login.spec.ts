import { NgZone } from '@angular/core';
import { PlatformLocation } from '@angular/common';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import {
  ActionSheetController, MenuController, ModalController, NavController, Platform,
} from '@ionic/angular/standalone';
import { AuthService } from './auth.service';
import { NoticeService } from './notice.service';
import { UserService } from './user.service';
import { ViewService } from './view.service';

const appLinks = vi.hoisted(() => ({ listener: null as ((event: { url: string }) => void) | null }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (_event: string, listener: (event: { url: string }) => void) => {
      appLinks.listener = listener;
      return { remove: vi.fn().mockResolvedValue(undefined) };
    }),
    getLaunchUrl: vi.fn(),
  },
}));
vi.mock('capacitor-android-shortcuts', () => ({
  AndroidShortcuts: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) },
}));

describe('ViewService GitHub app links', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([false, true])('loads and navigates once through the shared callback path (cold: %s)', async (cold) => {
    vi.clearAllMocks();
    localStorage.clear();
    const url = 'tech.diandeng.iot://auth/github?code=test-code&state=test-state';
    vi.mocked(App.getLaunchUrl).mockResolvedValue(cold ? { url } : undefined);
    let consumed = false;
    const complete = vi.fn((value?: string) => {
      if (value !== url || consumed) return null;
      consumed = true;
      return Promise.resolve('success');
    });
    const getAllInfo = vi.fn().mockResolvedValue(true);
    const navigateRoot = vi.fn().mockResolvedValue(true);
    const notice = {
      showLoading: vi.fn().mockResolvedValue(undefined),
      hideLoading: vi.fn().mockResolvedValue(undefined),
      showToast: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ViewService(
      {} as ActionSheetController,
      { navigateRoot } as unknown as NavController,
      { is: () => false } as unknown as Platform,
      {} as PlatformLocation,
      {} as MenuController,
      { navigate: vi.fn() } as unknown as Router,
      {} as ModalController,
      { run: (work: () => unknown) => work() } as unknown as NgZone,
      { completeGithubLogin: complete, isLogin: () => true } as unknown as AuthService,
      { getAllInfo } as unknown as UserService,
      notice as unknown as NoticeService,
    );

    await service.checkShortcut();
    if (!cold) appLinks.listener!({ url });
    await new Promise((resolve) => setTimeout(resolve, 0));
    appLinks.listener!({ url });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(App.addListener).toHaveBeenCalledExactlyOnceWith('appUrlOpen', expect.any(Function));
    expect(App.getLaunchUrl).toHaveBeenCalledOnce();
    expect(getAllInfo).toHaveBeenCalledOnce();
    expect(navigateRoot).toHaveBeenCalledExactlyOnceWith('/');
    expect(notice.showLoading).toHaveBeenCalledOnce();
    expect(notice.hideLoading).toHaveBeenCalledOnce();
    expect(notice.showToast).not.toHaveBeenCalled();
  });
});
