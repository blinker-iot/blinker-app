import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { ModalController, NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService } from '@ngx-translate/core';
import { API } from '../../configs/api.config';
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
  return { fixture, page, element, button, http, notice, settle, issuedEmailRequest };
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
});
