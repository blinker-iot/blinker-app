import 'zone.js';
import { ApplicationRef, NgZone, provideZoneChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { DataService } from '../core/services/data.service';
import { DeviceV2ShareInvitationService } from '../core/services/device-v2-share-invitation.service';
import { FeedbackPage } from './feedback/feedback.component';
import { FeedbackService, FeedbackSubmitResult } from './feedback/feedback.service';
import { MessageItem } from './message/message.model';
import { MessagePage } from './message/message.page';
import { MessageService } from './message/message.service';

// Exercise the production templates and their existing handlers. All submissions,
// read/delete actions and account changes below use local doubles, never a user
// session, network service, or the native application storage.
const draftKey = 'blinker_feedback_draft';
const unrelatedKey = 'ui36:unrelated-test-preference';
const exactDraft = () => ({
  feedbackType: 'feature', title: '  本地模板标题  ',
  content: '  仅用于本地模板回归的完整问题描述  ', email: '  fixture@example.invalid  ',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function type(fixture: ComponentFixture<unknown>, field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
}

function submit(element: HTMLElement) {
  element.querySelector<HTMLFormElement>('form.feedback-form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

async function submitAndRender(f: { fixture: ComponentFixture<FeedbackPage>; page: FeedbackPage; element: HTMLElement }) {
  // A locally resolved service promise must settle before checking its rendered
  // branch, just as the existing Zone-based feedback regression does.
  const submitted = vi.spyOn(f.page, 'submit');
  TestBed.inject(NgZone).run(() => submit(f.element));
  await submitted.mock.results[0].value;
  TestBed.inject(ApplicationRef).tick();
  await f.fixture.whenStable();
  submitted.mockRestore();
}

async function renderFeedback(draft: ReturnType<typeof exactDraft> | null = exactDraft()) {
  if (draft) localStorage.setItem(draftKey, JSON.stringify(draft));
  else localStorage.removeItem(draftKey);
  const feedback = { newFeedback: vi.fn<(...args: any[]) => Promise<FeedbackSubmitResult | null>>() };
  const navigation = { navigateBack: vi.fn(async () => true) };
  await TestBed.configureTestingModule({ imports: [FeedbackPage], providers: [
    provideZoneChangeDetection(), provideRouter([]), provideIonicAngular({ animated: false }), provideTranslateService(),
    { provide: FeedbackService, useValue: feedback }, { provide: DataService, useValue: {} },
    { provide: NavController, useValue: navigation },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(FeedbackPage);
  fixture.autoDetectChanges(); await fixture.whenStable();
  return { fixture, page: fixture.componentInstance, element: fixture.nativeElement as HTMLElement, feedback, navigation };
}

function message(overrides: Partial<MessageItem> = {}): MessageItem {
  return { id: 'ui36-local-message', type: 'share.accepted', category: 'device_sharing',
    title: '本地模板消息标题', body: '仅用于本地模板回归的消息正文',
    createdAt: Date.UTC(2026, 9, 24, 10), visibleAt: Date.UTC(2026, 9, 24, 10),
    expiresAt: null, readAt: null, unread: true, ...overrides };
}

function messageService() {
  return { sessionEpoch: 1, items: [] as MessageItem[],
    summary: { total: 0, categories: {} as Record<string, number>, beforeCursor: null },
    unreadTotal: 0, hasMore: false, hasLoaded: true, loading: false, loadingMore: false,
    errorMessage: null as string | null,
    init: vi.fn(async () => undefined), loadFirst: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined), loadMore: vi.fn(async () => undefined),
    getMessage: vi.fn<(...args: any[]) => Promise<MessageItem | null>>(async () => null),
    markRead: vi.fn<(...args: any[]) => Promise<{ id: string; readAt: number } | null>>(async () => null),
    markAllRead: vi.fn<(...args: any[]) => Promise<unknown>>(async () => null),
    deleteMessage: vi.fn<(...args: any[]) => Promise<unknown>>(async () => null),
  };
}

async function renderMessages(prepare?: (service: ReturnType<typeof messageService>) => void) {
  const service = messageService(); prepare?.(service);
  const invitation = { stageDirected: vi.fn(), accept: vi.fn() };
  await TestBed.configureTestingModule({ imports: [MessagePage], providers: [
    provideZoneChangeDetection(), provideRouter([]), provideIonicAngular({ animated: false }),
    { provide: ActivatedRoute, useValue: { queryParamMap: new BehaviorSubject(convertToParamMap({})) } },
    { provide: MessageService, useValue: service },
    { provide: DeviceV2ShareInvitationService, useValue: invitation },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(MessagePage);
  fixture.autoDetectChanges(); await fixture.whenStable();
  return { fixture, page: fixture.componentInstance, element: fixture.nativeElement as HTMLElement, service, invitation };
}

describe('UI36 feedback production template preserves local draft and submission contracts', () => {
  let savedDraft: string | null, savedUnrelated: string | null;
  beforeEach(() => {
    savedDraft = localStorage.getItem(draftKey);
    savedUnrelated = localStorage.getItem(unrelatedKey);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    for (const [key, value] of [[draftKey, savedDraft], [unrelatedKey, savedUnrelated]] as const) {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    }
  });

  it('restores the exact draft into labeled fields and announces the existing character limits', async () => {
    const f = await renderFeedback(), draft = exactDraft();
    expect(f.element.querySelector<HTMLInputElement>('#feedback-title')?.value).toBe(draft.title);
    expect(f.element.querySelector<HTMLTextAreaElement>('#feedback-content')?.value).toBe(draft.content);
    // Native email inputs sanitize surrounding whitespace on display; loading
    // the existing draft must not rewrite the backing model or stored bytes.
    expect(f.element.querySelector<HTMLInputElement>('#feedback-email')?.value).toBe(draft.email.trim());
    expect(f.page.email).toBe(draft.email);
    expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual(draft);
    expect(f.element.querySelector('#feedback-title-count')?.textContent).toContain(`${draft.title.length}/80`);
    expect(f.element.querySelector('#feedback-content-count')?.textContent).toContain(`${draft.content.length}/2000`);
    for (const id of ['feedback-type-heading', 'feedback-content-heading']) {
      expect(f.element.querySelector(`#${id}`)?.tagName).toBe('H2');
    }
    expect(f.element.querySelectorAll('.type-option[aria-checked="true"]')).toHaveLength(1);
    expect(f.element.querySelector('.type-option[aria-checked="true"]')?.textContent).toContain('功能建议');
    expect(f.element.querySelector('ion-back-button')?.getAttribute('defaultHref')).toBe('/home/profile');
    expect(f.feedback.newFeedback).not.toHaveBeenCalled();
  });

  it('saves native NgModel edits and type selection only as the exact local draft', async () => {
    const f = await renderFeedback();
    const title = '  切换类型仍保留标题  ', content = '  保留空格与完整的未提交问题描述  ', email = '  edit@example.invalid  ';
    await type(f.fixture, f.element.querySelector<HTMLInputElement>('#feedback-title')!, title);
    await type(f.fixture, f.element.querySelector<HTMLTextAreaElement>('#feedback-content')!, content);
    await type(f.fixture, f.element.querySelector<HTMLInputElement>('#feedback-email')!, email);
    f.element.querySelectorAll<HTMLButtonElement>('.type-option')[1].click(); await f.fixture.whenStable();
    expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual({ feedbackType: 'account', title, content, email: email.trim() });
    expect(f.element.querySelector('.type-option[aria-checked="true"]')?.textContent).toContain('账户问题');
    expect(f.feedback.newFeedback).not.toHaveBeenCalled();
  });

  it('renders local validation without clearing input or invoking the submit service', async () => {
    const f = await renderFeedback();
    await type(f.fixture, f.element.querySelector<HTMLInputElement>('#feedback-title')!, '   ');
    submit(f.element); await f.fixture.whenStable();
    expect(f.element.querySelector('[role="alert"]')?.textContent).toContain('请填写反馈标题');
    expect(f.element.querySelector<HTMLInputElement>('#feedback-title')?.value).toBe('   ');
    await type(f.fixture, f.element.querySelector<HTMLInputElement>('#feedback-title')!, exactDraft().title);
    await type(f.fixture, f.element.querySelector<HTMLTextAreaElement>('#feedback-content')!, '不足十字');
    submit(f.element); await f.fixture.whenStable();
    expect(f.element.querySelector('[role="alert"]')?.textContent).toContain('至少需要 10 个字');
    expect(JSON.parse(localStorage.getItem(draftKey)!).content).toBe('不足十字');
    expect(f.feedback.newFeedback).not.toHaveBeenCalled();
  });

  it('keeps the full draft on a false response and allows the existing explicit retry', async () => {
    const f = await renderFeedback();
    f.feedback.newFeedback.mockResolvedValue(null);
    await submitAndRender(f);
    await vi.waitFor(() => expect(f.element.querySelector('[role="alert"]')?.textContent).toContain('提交失败'));
    expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual(exactDraft());
    expect(f.element.querySelector<HTMLInputElement>('#feedback-title')?.value).toBe(exactDraft().title);
    f.feedback.newFeedback.mockResolvedValue({ status: 'complete', feedbackId: 36 });
    await submitAndRender(f);
    await vi.waitFor(() => expect(f.element.querySelector('.success-card')).not.toBeNull());
    expect(f.feedback.newFeedback).toHaveBeenCalledTimes(2);
    expect(f.feedback.newFeedback.mock.calls[1][0]).toEqual({ title: exactDraft().title.trim(),
      content: exactDraft().content.trim(), email: exactDraft().email.trim(), label: 'feature' });
  });

  it('renders a rejected request as retryable while keeping the local values unchanged', async () => {
    const f = await renderFeedback();
    f.feedback.newFeedback.mockRejectedValue(new Error('LOCAL_FIXTURE_failure'));
    await submitAndRender(f);
    await vi.waitFor(() => expect(f.element.querySelector('[role="alert"]')?.textContent).toContain('网络连接异常'));
    expect(f.element.querySelector<HTMLTextAreaElement>('#feedback-content')?.value).toBe(exactDraft().content);
    expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual(exactDraft());
    expect(f.element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });

  it('exposes busy state and disables every editable field, type choice and submit control until settlement', async () => {
    const f = await renderFeedback(), pending = deferred<FeedbackSubmitResult | null>();
    f.feedback.newFeedback.mockReturnValue(pending.promise);
    const submitting = vi.spyOn(f.page, 'submit');
    submit(f.element);
    await vi.waitFor(() => expect(f.element.querySelector('form')?.getAttribute('aria-busy')).toBe('true'));
    for (const field of f.element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('input, textarea, .type-option, button[type="submit"]')) {
      expect(field.disabled).toBe(true);
    }
    // This checks browser-disabled controls, not a programmatic submit guard.
    f.element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(f.feedback.newFeedback).toHaveBeenCalledTimes(1);
    TestBed.inject(NgZone).run(() => pending.resolve(null));
    await submitting.mock.results[0].value;
    TestBed.inject(ApplicationRef).tick();
    await vi.waitFor(() => expect(f.element.querySelector('form')?.getAttribute('aria-busy')).toBe('false'));
    expect(f.element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });

  for (const status of ['complete', 'partial'] as const) {
    it(`treats ${status} as accepted, clears only this draft and offers the existing return action`, async () => {
      const f = await renderFeedback();
      localStorage.setItem(unrelatedKey, 'LOCAL_FIXTURE_keep');
      f.feedback.newFeedback.mockResolvedValue({ status, feedbackId: 36 });
      await submitAndRender(f);
      await vi.waitFor(() => expect(f.element.querySelector('.success-card')).not.toBeNull());
      expect(f.element.querySelector('.feedback-form')).toBeNull();
      expect(localStorage.getItem(draftKey)).toBeNull();
      expect(localStorage.getItem(unrelatedKey)).toBe('LOCAL_FIXTURE_keep');
      expect(f.feedback.newFeedback).toHaveBeenCalledTimes(1);
      f.element.querySelector<HTMLButtonElement>('.success-action')!.click(); await f.fixture.whenStable();
      expect(f.navigation.navigateBack).toHaveBeenCalledWith('/home/profile');
      f.fixture.destroy();
      expect(localStorage.getItem(draftKey)).toBeNull();
    });
  }
});

describe('UI36 message production template preserves list, detail and session boundaries', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the existing loading state without exposing an empty state or making write calls', async () => {
    const f = await renderMessages(service => { service.loading = true; service.hasLoaded = false; });
    expect(f.element.querySelector('[data-testid="message-loading"]')).not.toBeNull();
    expect(f.element.querySelector('[data-testid="message-empty"]')).toBeNull();
    expect(f.service.loadFirst).not.toHaveBeenCalled();
    expect(f.service.markAllRead).not.toHaveBeenCalled();
    expect(f.service.markRead).not.toHaveBeenCalled();
    expect(f.service.deleteMessage).not.toHaveBeenCalled();
  });

  it('shows a settled empty list and disables mark-all without fabricating content or pages', async () => {
    const f = await renderMessages();
    expect(f.element.querySelector('[data-testid="message-empty"]')?.textContent).toContain('暂无消息');
    expect(f.element.querySelector('.message-item')).toBeNull();
    expect((f.element.querySelector('.header-action') as any).disabled).toBe(true);
    expect((f.element.querySelector('ion-infinite-scroll') as any).disabled).toBe(true);
    expect(f.service.getMessage).not.toHaveBeenCalled();
    expect(f.service.markAllRead).not.toHaveBeenCalled();
  });

  it('retries an initial read failure through the template and replaces it with authenticated local result', async () => {
    const f = await renderMessages(service => { service.errorMessage = 'LOCAL_FIXTURE_消息读取暂不可用'; });
    f.service.loadFirst.mockImplementation(async () => {
      f.service.errorMessage = null; f.service.items = [message()];
    });
    f.element.querySelector<HTMLButtonElement>('[data-testid="message-error"] button')!.click();
    await vi.waitFor(() => expect(f.element.querySelectorAll('.message-item')).toHaveLength(1));
    expect(f.service.loadFirst).toHaveBeenCalledTimes(1);
    expect(f.element.querySelector('[data-testid="message-error"]')).toBeNull();
    expect(f.service.markRead).not.toHaveBeenCalled();
  });

  it('retains loaded messages on a later read failure, keeps categories and offers only the existing read retry', async () => {
    const known = message(), future = message({ id: 'ui36-future', category: 'future', unread: false, readAt: 100 });
    const f = await renderMessages(service => {
      service.items = [known, future]; service.errorMessage = 'LOCAL_FIXTURE_刷新失败';
      service.unreadTotal = 1; service.summary.categories['device_sharing'] = 1;
    });
    expect(f.element.querySelectorAll('.message-item')).toHaveLength(2);
    expect(f.element.querySelectorAll('.message-open')[0].getAttribute('aria-label')).toContain('未读');
    expect(f.element.querySelectorAll('.message-open')[1].getAttribute('aria-label')).toContain('已读');
    expect(Array.from(f.element.querySelectorAll('.message-category')).map(node => node.textContent?.trim())).toEqual(['分享', '消息']);
    expect(f.element.querySelector('.category-unread-badge')?.textContent).toContain('分享 1');
    expect(f.element.querySelector('[data-testid="message-error"]')).toBeNull();
    f.element.querySelector<HTMLButtonElement>('.status-banner--error button')!.click();
    await vi.waitFor(() => expect(f.service.loadFirst).toHaveBeenCalledTimes(1));
    expect(f.service.items).toEqual([known, future]);
    expect(f.service.markRead).not.toHaveBeenCalled(); expect(f.service.deleteMessage).not.toHaveBeenCalled();
  });

  it('keeps a failed detail visible and retries from its local template without changing read state', async () => {
    const item = message({ unread: false, readAt: 100 });
    const f = await renderMessages(service => { service.items = [item]; });
    const opening = vi.spyOn(f.page, 'openMessage');
    f.service.getMessage.mockRejectedValueOnce(new Error('LOCAL_FIXTURE_detail'));
    TestBed.inject(NgZone).run(() => f.element.querySelector<HTMLButtonElement>('.message-open')!.click());
    await opening.mock.results[0].value;
    TestBed.inject(ApplicationRef).tick();
    await vi.waitFor(() => expect(f.element.querySelector('.status-banner--error')?.textContent).toContain('详情加载失败'));
    expect(f.element.querySelector('.message-detail-card')?.textContent).toContain(item.body);
    f.service.getMessage.mockResolvedValue(item);
    TestBed.inject(NgZone).run(() => f.element.querySelector<HTMLButtonElement>('.status-banner--error button')!.click());
    await opening.mock.results[1].value;
    TestBed.inject(ApplicationRef).tick();
    await vi.waitFor(() => expect(f.service.getMessage).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(f.element.querySelector('.status-banner--error')).toBeNull());
    expect(f.element.querySelector('.detail-status')?.textContent).toContain('已读');
    expect(f.service.markRead).not.toHaveBeenCalled();
  });

  it('keeps detail busy until an unread result is marked through the existing service response', async () => {
    const item = message(), read = deferred<{ id: string; readAt: number } | null>();
    const f = await renderMessages(service => { service.items = [item]; service.getMessage.mockResolvedValue(item); service.markRead.mockReturnValue(read.promise); });
    const opening = vi.spyOn(f.page, 'openMessage');
    f.element.querySelector<HTMLButtonElement>('.message-open')!.click();
    await vi.waitFor(() => expect(f.service.markRead).toHaveBeenCalledWith(item.id));
    expect(f.element.querySelector('[data-testid="message-detail-loading"]')).not.toBeNull();
    expect(f.element.querySelector('.message-detail-card')).toBeNull();
    TestBed.inject(NgZone).run(() => read.resolve({ id: item.id, readAt: 200 }));
    await opening.mock.results[0].value;
    TestBed.inject(ApplicationRef).tick();
    await vi.waitFor(() => expect(f.element.querySelector('.detail-status')?.textContent).toContain('已读'));
    expect(f.page.detailItem?.readAt).toBe(200);
    expect(f.service.getMessage.mock.invocationCallOrder[0]).toBeLessThan(f.service.markRead.mock.invocationCallOrder[0]);
  });

  it('isolates a late unread detail after session change without marking the old account message', async () => {
    const item = message(), pending = deferred<MessageItem | null>();
    const f = await renderMessages(service => { service.items = [item]; service.getMessage.mockReturnValue(pending.promise); });
    f.element.querySelector<HTMLButtonElement>('.message-open')!.click();
    await vi.waitFor(() => expect(f.service.getMessage).toHaveBeenCalledTimes(1));
    f.service.sessionEpoch += 1; f.service.items = [];
    pending.resolve(item); await f.fixture.whenStable();
    expect(f.page.detailItem).toBeNull();
    expect(f.element.querySelector('.message-detail-card')).toBeNull();
    expect(f.service.markRead).not.toHaveBeenCalled();
    expect(f.invitation.stageDirected).not.toHaveBeenCalled();
  });

  it('disables busy mark-all/delete template actions and retains the item after a local deletion failure', async () => {
    const item = message(), marking = deferred<unknown>(), deleting = deferred<unknown>();
    const f = await renderMessages(service => { service.items = [item]; service.unreadTotal = 1; service.markAllRead.mockReturnValue(marking.promise); service.deleteMessage.mockReturnValue(deleting.promise); });
    const markingAll = vi.spyOn(f.page, 'markAllRead'), deletingMessage = vi.spyOn(f.page, 'deleteMessage');
    TestBed.inject(NgZone).run(() => f.element.querySelector('.header-action')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true })));
    TestBed.inject(ApplicationRef).tick();
    await vi.waitFor(() => expect((f.element.querySelector('.header-action') as any).disabled).toBe(true));
    expect(f.page.markingAllRead).toBe(true);
    expect(f.element.querySelector('.header-action ion-spinner')).not.toBeNull();
    TestBed.inject(NgZone).run(() => marking.resolve(null));
    await markingAll.mock.results[0].value;
    TestBed.inject(ApplicationRef).tick();
    await vi.waitFor(() => expect((f.element.querySelector('.header-action') as any).disabled).toBe(false));
    TestBed.inject(NgZone).run(() => f.element.querySelector<HTMLButtonElement>('.delete-action')!.click());
    TestBed.inject(ApplicationRef).tick();
    await vi.waitFor(() => expect(f.element.querySelector<HTMLButtonElement>('.delete-action')?.disabled).toBe(true));
    expect(f.page.deletingMessageId).toBe(item.id);
    expect(f.element.querySelector('.delete-action ion-spinner')).not.toBeNull();
    expect(f.service.getMessage).not.toHaveBeenCalled();
    TestBed.inject(NgZone).run(() => deleting.reject(new Error('LOCAL_FIXTURE_delete_failure')));
    await deletingMessage.mock.results[0].value;
    TestBed.inject(ApplicationRef).tick();
    await vi.waitFor(() => expect(f.element.querySelector<HTMLButtonElement>('.delete-action')?.disabled).toBe(false));
    expect(f.page.deletingMessageId).toBeNull();
    expect(f.element.querySelectorAll('.message-item')).toHaveLength(1);
    expect(f.element.querySelector('.status-banner')?.textContent).toContain('删除失败');
    expect(f.element.querySelector<HTMLButtonElement>('.delete-action')?.disabled).toBe(false);
    expect(f.service.deleteMessage).toHaveBeenCalledTimes(1);
  });
});
