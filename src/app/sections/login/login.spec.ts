import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { ModalController, NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { API } from '../../configs/api.config';
import { AppVisibilityService } from '../../core/services/app-visibility.service';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { DeviceV2ShareInvitationService } from '../../core/services/device-v2-share-invitation.service';
import { NoticeService } from '../../core/services/notice.service';
import { NtfyService } from '../../core/services/ntfy.service';
import { UserService } from '../../core/services/user.service';
import { LoginPage } from './login';

vi.mock('altcha-lib/v1', () => ({
  solveChallenge: vi.fn(() => ({
    promise: Promise.resolve({ number: 7, took: 1 }),
    controller: new AbortController(),
  })),
}));

// Real LoginPage template and AuthService; every HTTP request stays in the
// Angular testing backend. Manual detectChanges verifies the template contract,
// not Android/NgZone/Ionic cached-route behavior or actual email delivery.
async function render() {
  const active = new BehaviorSubject(true);
  const notice = {
    showLoading: vi.fn().mockResolvedValue(undefined),
    hideLoading: vi.fn().mockResolvedValue(undefined),
    showToast: vi.fn().mockResolvedValue(undefined),
  };
  await TestBed.configureTestingModule({
    imports: [LoginPage],
    providers: [
      provideRouter([]), provideIonicAngular({ animated: false }), provideTranslateService(),
      provideHttpClient(), provideHttpClientTesting(), AuthService,
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: DataService, useValue: { auth: null } },
      { provide: UserService, useValue: { getAllInfo: vi.fn() } },
      { provide: NoticeService, useValue: notice },
      { provide: NtfyService, useValue: { revoke: vi.fn() } },
      { provide: NavController, useValue: { navigateRoot: vi.fn(), navigateForward: vi.fn() } },
      { provide: ModalController, useValue: { create: vi.fn() } },
      { provide: DeviceV2ShareInvitationService, useValue: { hasPending: false } },
      { provide: AppVisibilityService, useValue: { active } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(LoginPage), page = fixture.componentInstance;
  fixture.detectChanges(); await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const email = element.querySelector<HTMLInputElement>('input[name="email"]')!;
  email.value = 'offline@example.invalid'; email.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges(); await fixture.whenStable();
  const button = element.querySelector<HTMLButtonElement>('.send-code-btn')!;
  const http = TestBed.inject(HttpTestingController);
  vi.useFakeTimers();
  // Ionic can cache this component instead of destroying it on navigation.
  // The optional call permits the same behavioral regression on the old page.
  (page as any).ionViewWillEnter?.();
  async function settle() {
    // Bounded promise turns: loading, ALTCHA, HttpClient and toast continuations.
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
    if (!fixture.componentRef.hostView.destroyed) fixture.detectChanges();
  }
  async function issuedEmailRequest() {
    await settle();
    const challenge = http.expectOne(API.AUTH.ALTCHA_CHALLENGE);
    expect(challenge.request.method).toBe('GET');
    challenge.flush({ algorithm: 'SHA-256', challenge: 'challenge', maxnumber: 100,
      salt: 'salt', signature: 'signature' });
    await settle();
    const request = http.expectOne(API.AUTH.EMAIL_CODE);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.email).toBe('offline@example.invalid');
    return request;
  }
  return { fixture, page, element, button, http, notice, active, settle, issuedEmailRequest };
}

describe('Login email-code production template and lifecycle', () => {
  afterEach(() => {
    try { TestBed.inject(HttpTestingController).verify(); }
    finally {
      TestBed.resetTestingModule();
      // A failed lifecycle regression must not leak its fake interval to peers.
      if (vi.isFakeTimers()) vi.clearAllTimers();
      vi.useRealTimers(); vi.restoreAllMocks();
    }
  });

  it('renders 60 seconds after success, blocks cooldown clicks and becomes available at zero', async () => {
    const f = await render();
    const interval = vi.spyOn(globalThis, 'setInterval');
    expect(f.button.disabled).toBe(false);
    f.button.click();
    const request = await f.issuedEmailRequest();
    request.flush({ status: 200, data: null }); await f.settle();
    expect(f.page.countdown).toBe(60);
    expect(f.button.textContent!.trim()).toBe('60s');
    expect(f.button.disabled).toBe(true);
    expect(interval).toHaveBeenCalledTimes(1);
    expect(f.notice.showToast).toHaveBeenCalledWith('codeSent');
    f.button.click(); await f.settle();
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
    await vi.advanceTimersByTimeAsync(1000); f.fixture.detectChanges();
    expect(f.page.countdown).toBe(59); expect(f.button.textContent!.trim()).toBe('59s');
    await vi.advanceTimersByTimeAsync(59000); f.fixture.detectChanges();
    expect(f.page.countdown).toBe(0); expect(f.button.disabled).toBe(false);
    expect(f.button.textContent).not.toMatch(/\d+s/);
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.page.countdown).toBe(0);
  });

  it('keeps a failed send available and can succeed on a fresh user retry', async () => {
    const f = await render(), interval = vi.spyOn(globalThis, 'setInterval');
    f.button.click();
    const failed = await f.issuedEmailRequest();
    failed.flush({ status: 503 }, { status: 503, statusText: 'Unavailable' }); await f.settle();
    expect(f.page.countdown).toBe(0); expect(f.button.disabled).toBe(false);
    expect(f.notice.showToast).toHaveBeenCalledWith('sendCodeFailed');
    expect(interval).not.toHaveBeenCalled();
    f.button.click();
    const retry = await f.issuedEmailRequest();
    retry.flush({ status: 200, data: null }); await f.settle();
    expect(f.page.countdown).toBe(60); expect(f.button.disabled).toBe(true);
    expect(interval).toHaveBeenCalledTimes(1);
  });

  it('does not treat an HTTP 200 with rejected application status as a successful send', async () => {
    const f = await render();
    f.button.click();
    const request = await f.issuedEmailRequest();
    request.flush({ status: 400, data: null }); await f.settle();
    expect(f.page.countdown).toBe(0); expect(f.button.disabled).toBe(false);
    expect(f.notice.showToast).toHaveBeenCalledWith('sendCodeFailed');
  });

  it('releases the active timer when the login component is destroyed', async () => {
    const f = await render(), interval = vi.spyOn(globalThis, 'setInterval');
    const clear = vi.spyOn(globalThis, 'clearInterval');
    f.button.click();
    const request = await f.issuedEmailRequest();
    request.flush({ status: 200, data: null }); await f.settle();
    const handle = interval.mock.results[0].value;
    f.fixture.destroy();
    expect(clear).toHaveBeenCalledWith(handle);
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.page.countdown).toBe(60);
  });

  // Keep both UI fences separate from AuthService's shared HTTP promise: a
  // single transport request must not create duplicate or post-destroy timers.
  it('starts only one timer for pending duplicate clicks coalesced into one real Auth request', async () => {
    const f = await render(), interval = vi.spyOn(globalThis, 'setInterval');
    f.button.click(); f.button.click();
    const request = await f.issuedEmailRequest();
    request.flush({ status: 200, data: null }); await f.settle();
    expect(f.notice.showLoading).toHaveBeenCalledTimes(1);
    expect(interval).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); f.fixture.detectChanges();
    expect(f.page.countdown).toBe(59);
  });

  it('does not start a late countdown after the login component was destroyed during the send', async () => {
    const f = await render(), interval = vi.spyOn(globalThis, 'setInterval');
    f.button.click();
    const request = await f.issuedEmailRequest();
    f.fixture.destroy();
    request.flush({ status: 200, data: null }); await f.settle();
    expect(interval).not.toHaveBeenCalled();
    expect(f.page.countdown).toBe(0);
  });

  it('does not begin Auth HTTP after destruction while the loading overlay is pending', async () => {
    const f = await render(), interval = vi.spyOn(globalThis, 'setInterval');
    let presented!: () => void;
    f.notice.showLoading.mockImplementationOnce(() => new Promise<void>(resolve => { presented = resolve; }));
    f.button.click(); await f.settle();
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
    f.fixture.destroy(); presented(); await f.settle();
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
    expect(f.notice.hideLoading).toHaveBeenCalledTimes(1);
    expect(interval).not.toHaveBeenCalled(); expect(f.page.countdown).toBe(0);
  });

  it('rejects an invalid address in the real form without requesting a challenge or starting a timer', async () => {
    const f = await render(), interval = vi.spyOn(globalThis, 'setInterval');
    const input = f.element.querySelector<HTMLInputElement>('input[name="email"]')!;
    input.value = 'invalid-address'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await f.settle(); f.button.click(); await f.settle();
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
    expect(f.notice.showLoading).not.toHaveBeenCalled();
    expect(f.notice.showToast).toHaveBeenCalledWith('needValidEmail');
    expect(interval).not.toHaveBeenCalled(); expect(f.page.countdown).toBe(0);
  });

  it('D6 expires after a 65 second clock jump even when only one interval callback runs', async () => {
    const f = await render();
    f.button.click();
    const request = await f.issuedEmailRequest();
    request.flush({ status: 200, data: null }); await f.settle();
    expect(f.page.countdown).toBe(60);
    // setSystemTime changes elapsed time without dispatching 65 queued ticks.
    vi.setSystemTime(Date.now() + 65000);
    await vi.advanceTimersByTimeAsync(1000); f.fixture.detectChanges();
    expect(f.page.countdown).toBe(0);
    expect(f.button.disabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
  });

  it('D6 releases the cached page timer and resumes the original remaining cooldown once', async () => {
    const f = await render();
    f.button.click();
    const request = await f.issuedEmailRequest();
    request.flush({ status: 200, data: null }); await f.settle();
    const sentAt = Date.now();
    (f.page as any).ionViewWillLeave?.();
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(sentAt + 30000);
    (f.page as any).ionViewWillEnter?.(); await f.settle();
    expect(f.page.countdown).toBe(30);
    expect(f.button.textContent!.trim()).toBe('30s');
    expect(f.button.disabled).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    (f.page as any).ionViewWillEnter?.(); await f.settle();
    expect(vi.getTimerCount()).toBe(1);
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
  });

  it('D6 returns to an expired cached page with no timer and no automatic send', async () => {
    const f = await render();
    f.button.click();
    const request = await f.issuedEmailRequest();
    request.flush({ status: 200, data: null }); await f.settle();
    (f.page as any).ionViewWillLeave?.();
    vi.setSystemTime(Date.now() + 65000);
    (f.page as any).ionViewWillEnter?.(); await f.settle();
    expect(f.page.countdown).toBe(0);
    expect(f.button.disabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
  });

  it('D6 stops background ticking and recalculates the cooldown on foreground recovery', async () => {
    const f = await render();
    f.button.click();
    const request = await f.issuedEmailRequest();
    request.flush({ status: 200, data: null }); await f.settle();
    const sentAt = Date.now();
    f.active.next(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(sentAt + 25000);
    f.active.next(true); await f.settle();
    expect(f.page.countdown).toBe(35);
    expect(vi.getTimerCount()).toBe(1);
    f.active.next(false);
    vi.setSystemTime(sentAt + 65000);
    f.active.next(true); await f.settle();
    expect(f.page.countdown).toBe(0);
    expect(f.button.disabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
  });

  it.each(['cached-page', 'background'])('D6 retains a late accepted send while %s without restarting a hidden timer', async hidden => {
    const f = await render();
    f.button.click();
    const request = await f.issuedEmailRequest();
    if (hidden === 'cached-page') (f.page as any).ionViewWillLeave?.();
    else f.active.next(false);
    request.flush({ status: 200, data: null }); await f.settle();
    const acceptedAt = Date.now();
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(acceptedAt + 20000);
    if (hidden === 'cached-page') (f.page as any).ionViewWillEnter?.();
    else f.active.next(true);
    await f.settle();
    expect(f.page.countdown).toBe(40);
    expect(f.button.disabled).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
  });

  it('D6 foreground events cannot revive a cached page and duplicate entry owns only one timer', async () => {
    const f = await render();
    f.button.click();
    const request = await f.issuedEmailRequest();
    request.flush({ status: 200, data: null }); await f.settle();
    const acceptedAt = Date.now();
    (f.page as any).ionViewWillLeave?.();
    vi.setSystemTime(acceptedAt + 20000);
    f.active.next(false); f.active.next(true); f.active.next(true);
    await f.settle();
    expect(vi.getTimerCount()).toBe(0);
    (f.page as any).ionViewWillEnter?.();
    f.active.next(true); (f.page as any).ionViewWillEnter?.(); await f.settle();
    expect(f.page.countdown).toBe(40);
    expect(vi.getTimerCount()).toBe(1);
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
  });

  it.each(['cached-page', 'background'])('D6 does not start Auth HTTP when %s while loading is pending', async hidden => {
    const f = await render();
    let presented!: () => void;
    f.notice.showLoading.mockImplementationOnce(() => new Promise<void>(resolve => { presented = resolve; }));
    f.button.click(); await f.settle();
    if (hidden === 'cached-page') (f.page as any).ionViewWillLeave?.();
    else f.active.next(false);
    presented(); await f.settle();
    expect(f.notice.hideLoading).toHaveBeenCalledTimes(1);
    expect(f.notice.showToast).not.toHaveBeenCalled();
    expect(f.page.countdown).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
    if (hidden === 'cached-page') (f.page as any).ionViewWillEnter?.();
    else f.active.next(true);
    await f.settle();
    expect(f.button.disabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
  });

  it('D6 starts the cooldown at accepted HTTP response rather than delayed loading dismissal', async () => {
    const f = await render();
    let dismissed!: () => void;
    f.notice.hideLoading.mockImplementationOnce(() => new Promise<void>(resolve => { dismissed = resolve; }));
    f.button.click();
    const request = await f.issuedEmailRequest();
    request.flush({ status: 200, data: null }); await f.settle();
    expect(f.page.countdown).toBe(60);
    vi.setSystemTime(Date.now() + 20000);
    dismissed(); await f.settle();
    await vi.advanceTimersByTimeAsync(1000); f.fixture.detectChanges();
    expect(f.page.countdown).toBe(39);
    expect(f.button.textContent!.trim()).toBe('39s');
    expect(vi.getTimerCount()).toBe(1);
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
  });

  it('D6 unsubscribes from visibility on destruction and never revives its timer', async () => {
    const f = await render();
    f.button.click();
    const request = await f.issuedEmailRequest();
    request.flush({ status: 200, data: null }); await f.settle();
    expect(f.active.observers.length).toBe(1);
    f.fixture.destroy();
    expect(f.active.observers.length).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(Date.now() + 65000);
    f.active.next(false); f.active.next(true);
    expect(vi.getTimerCount()).toBe(0);
    f.http.expectNone(API.AUTH.ALTCHA_CHALLENGE); f.http.expectNone(API.AUTH.EMAIL_CODE);
  });
});
