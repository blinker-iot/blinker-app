import { NgZone } from '@angular/core';
import { PlatformLocation } from '@angular/common';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import {
  ActionSheetController, MenuController, ModalController, NavController, Platform,
} from '@ionic/angular/standalone';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { DeviceV2ShareInvitationService } from './device-v2-share-invitation.service';
import { NoticeService } from './notice.service';
import { NtfyService } from './ntfy.service';
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

describe('ViewService app links', () => {
  let service: ViewService;
  let complete: ReturnType<typeof vi.fn>;
  let getAllInfo: ReturnType<typeof vi.fn>;
  let navigateRoot: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let notice: {
    showLoading: ReturnType<typeof vi.fn>;
    hideLoading: ReturnType<typeof vi.fn>;
    showToast: ReturnType<typeof vi.fn>;
  };
  let invitation: { hasPending: boolean; stage: ReturnType<typeof vi.fn> };
  let notificationActions: Subject<string>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(App.getLaunchUrl).mockResolvedValue(undefined);
    complete = vi.fn().mockReturnValue(null);
    getAllInfo = vi.fn().mockResolvedValue(true);
    navigateRoot = vi.fn().mockResolvedValue(true);
    navigate = vi.fn().mockResolvedValue(true);
    notice = {
      showLoading: vi.fn().mockResolvedValue(undefined),
      hideLoading: vi.fn().mockResolvedValue(undefined),
      showToast: vi.fn().mockResolvedValue(undefined),
    };
    invitation = { hasPending: false, stage: vi.fn() };
    notificationActions = new Subject<string>();
    service = new ViewService(
      {} as ActionSheetController,
      { navigateRoot } as unknown as NavController,
      { is: () => false } as unknown as Platform,
      {} as PlatformLocation,
      {} as MenuController,
      { navigate } as unknown as Router,
      {} as ModalController,
      { run: (work: () => unknown) => work() } as unknown as NgZone,
      { completeGithubLogin: complete, isLogin: () => true } as unknown as AuthService,
      { getAllInfo } as unknown as UserService,
      notice as unknown as NoticeService,
      invitation as unknown as DeviceV2ShareInvitationService,
      { notificationActions$: notificationActions.asObservable() } as unknown as NtfyService,
    );
  });

  afterEach(() => {
    notificationActions.complete();
    vi.restoreAllMocks();
  });

  it.each([
    { cold: false, pending: false, destination: '/' },
    { cold: true, pending: false, destination: '/' },
    { cold: false, pending: true, destination: '/share-invitation' },
  ])('completes GitHub login once and resumes the destination: %j', async ({ cold, pending, destination }) => {
    const url = 'tech.diandeng.iot://auth/github?code=test-code&state=test-state';
    vi.mocked(App.getLaunchUrl).mockResolvedValue(cold ? { url } : undefined);
    invitation.hasPending = pending;
    let consumed = false;
    complete.mockImplementation((value?: string) => {
      if (value !== url || consumed) return null;
      consumed = true;
      return Promise.resolve('success');
    });

    await service.checkShortcut();
    if (!cold) appLinks.listener!({ url });
    await new Promise((resolve) => setTimeout(resolve, 0));
    appLinks.listener!({ url });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(App.addListener).toHaveBeenCalledExactlyOnceWith('appUrlOpen', expect.any(Function));
    expect(App.getLaunchUrl).toHaveBeenCalledOnce();
    expect(getAllInfo).toHaveBeenCalledOnce();
    expect(navigateRoot).toHaveBeenCalledExactlyOnceWith(destination);
    expect(notice.showLoading).toHaveBeenCalledOnce();
    expect(notice.hideLoading).toHaveBeenCalledOnce();
    expect(notice.showToast).not.toHaveBeenCalled();
    expect(invitation.stage).not.toHaveBeenCalled();
  });

  it.each([true, false])('stages only a valid share invitation app link (valid: %s)', async (valid) => {
    const url = 'diandeng://share/' + (valid ? 'A'.repeat(43) : 'invalid');
    vi.mocked(App.getLaunchUrl).mockResolvedValue({ url });

    await service.checkShortcut();

    if (valid) {
      expect(invitation.stage).toHaveBeenCalledExactlyOnceWith(url);
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/share-invitation'], { replaceUrl: true });
    } else {
      expect(invitation.stage).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    }
    expect(getAllInfo).not.toHaveBeenCalled();
    expect(navigateRoot).not.toHaveBeenCalled();
  });

  it('opens a message from a native notification tap', async () => {
    await service.checkShortcut();

    notificationActions.next('message-1');

    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/message'], {
      queryParams: { messageId: 'message-1' },
      replaceUrl: true,
    });
  });
});
