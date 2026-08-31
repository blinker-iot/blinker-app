import '@angular/compiler';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { API, isGatewayUrl } from 'src/app/configs/api.config';
import { AppVisibilityService } from 'src/app/core/services/app-visibility.service';
import { DataService } from 'src/app/core/services/data.service';
import { NtfyService } from 'src/app/core/services/ntfy.service';
import { MessageItem, MessagePage, UnreadSummary } from './message.model';
import { MessageService } from './message.service';

describe('MessageService', () => {
  let service: MessageService;
  let httpTesting: HttpTestingController;
  let dataService: {
    auth: Record<string, string> | null;
    sessionEpoch: number;
    authDataExpire: Subject<boolean>;
    userDataLoader: BehaviorSubject<boolean>;
  };
  let appVisibility: { active: BehaviorSubject<boolean> };
  let ntfyMessageIds: Subject<string>;

  beforeEach(() => {
    dataService = {
      auth: {
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        tokenType: 'Bearer',
      },
      sessionEpoch: 1,
      authDataExpire: new Subject<boolean>(),
      userDataLoader: new BehaviorSubject(true),
    };
    appVisibility = { active: new BehaviorSubject(true) };
    ntfyMessageIds = new Subject<string>();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = new MessageService(
      TestBed.inject(HttpClient),
      dataService as unknown as DataService,
      appVisibility as unknown as AppVisibilityService,
      { messageIds$: ntfyMessageIds } as unknown as NtfyService,
    );
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('loads the first page and summary with the V2 filter contract', async () => {
    const pending = service.loadFirst({
      category: 'device_sharing',
      unread: true,
      limit: 2,
    });

    const listRequest = httpTesting.expectOne(request =>
      request.url === API.MESSAGE.COLLECTION
    );
    expect(listRequest.request.method).toBe('GET');
    expect(listRequest.request.params.keys().sort()).toEqual([
      'category',
      'limit',
      'unread',
    ]);
    expect(listRequest.request.params.get('category')).toBe('device_sharing');
    expect(listRequest.request.params.get('unread')).toBe('true');
    expect(listRequest.request.params.get('limit')).toBe('2');
    expect(listRequest.request.params.has('uuid')).toBe(false);
    expect(listRequest.request.params.has('token')).toBe(false);
    expect(listRequest.request.params.has('page')).toBe(false);

    const summaryRequest = httpTesting.expectOne(API.MESSAGE.UNREAD_SUMMARY);
    expect(summaryRequest.request.method).toBe('GET');
    listRequest.flush(envelope<MessagePage>({
      items: [message('message-1')],
      nextCursor: 'next-1',
    }));
    summaryRequest.flush(envelope<UnreadSummary>({
      total: 1,
      categories: { device_sharing: 1 },
      beforeCursor: 'before-1',
    }));

    await pending;
    expect(service.items.map(item => item.id)).toEqual(['message-1']);
    expect(service.unreadTotal).toBe(1);
    expect(service.nextCursor).toBe('next-1');
    expect(service.hasMore).toBe(true);
    expect(service.hasLoaded).toBe(true);
    expect(service.loading).toBe(false);

    expect(isGatewayUrl(API.MESSAGE.COLLECTION)).toBe(true);
    expect(isGatewayUrl(API.MESSAGE.DETAIL('id/with/slash'))).toBe(true);
    expect(isGatewayUrl(API.MESSAGE.READ('message-1'))).toBe(true);
    expect(isGatewayUrl(API.MESSAGE.MARK_ALL_READ)).toBe(true);
    expect(isGatewayUrl(API.NOTIFICATION_INSTALLATIONS.COLLECTION)).toBe(true);
    expect(isGatewayUrl(API.NOTIFICATION_INSTALLATIONS.DETAIL('install/1'))).toBe(true);
  });

  it('rejects filters that the Gateway cannot accept before sending a request', async () => {
    await expect(service.loadFirst({ category: 'a'.repeat(33) })).rejects.toThrow(
      'Message category filter is invalid.',
    );
    await expect(service.loadFirst({ limit: 51 })).rejects.toThrow(
      'Message list limit must be an integer from 1 to 50.',
    );
  });

  it('passes the opaque cursor and dedupes appended pages by message id', async () => {
    const first = service.loadFirst({ limit: 2 });
    flushFirstPage(
      [message('message-1'), message('message-2', { title: 'old title' })],
      'opaque-cursor',
      { total: 2, categories: { device_sharing: 2 }, beforeCursor: 'before-1' },
    );
    await first;

    const more = service.loadMore();
    const request = httpTesting.expectOne(value =>
      value.url === API.MESSAGE.COLLECTION
      && value.params.get('cursor') === 'opaque-cursor'
    );
    expect(request.request.params.get('limit')).toBe('2');
    request.flush(envelope<MessagePage>({
      items: [
        message('message-2', { title: 'new title' }),
        message('message-3'),
      ],
      nextCursor: null,
    }));
    await more;

    expect(service.items.map(item => item.id)).toEqual([
      'message-1',
      'message-2',
      'message-3',
    ]);
    expect(service.items[1].title).toBe('new title');
    expect(service.hasMore).toBe(false);
    expect(service.loadingMore).toBe(false);
  });

  it('uses detail, read, and delete endpoints and converges local state', async () => {
    const first = service.loadFirst();
    flushFirstPage(
      [message('message-1'), message('message-2')],
      null,
      { total: 2, categories: { device_sharing: 2 }, beforeCursor: 'before-1' },
    );
    await first;

    const detailPending = service.getMessage('message-1');
    const detailRequest = httpTesting.expectOne(API.MESSAGE.DETAIL('message-1'));
    expect(detailRequest.request.method).toBe('GET');
    detailRequest.flush(envelope(message('message-1', { body: 'detail body' })));
    await expect(detailPending).resolves.toMatchObject({ body: 'detail body' });

    const readPending = service.markRead('message-1');
    const readRequest = httpTesting.expectOne(API.MESSAGE.READ('message-1'));
    expect(readRequest.request.method).toBe('POST');
    expect(readRequest.request.body).toBeNull();
    readRequest.flush(envelope({ id: 'message-1', readAt: 100 }));
    await settleAsync();
    httpTesting.expectOne(API.MESSAGE.UNREAD_SUMMARY).flush(
      envelope<UnreadSummary>({
        total: 1,
        categories: { device_sharing: 1 },
        beforeCursor: 'before-2',
      }),
    );
    await expect(readPending).resolves.toEqual({ id: 'message-1', readAt: 100 });
    expect(service.items[0]).toMatchObject({ readAt: 100, unread: false });
    expect(service.unreadTotal).toBe(1);

    const deletePending = service.deleteMessage('message-2');
    const deleteRequest = httpTesting.expectOne(API.MESSAGE.DETAIL('message-2'));
    expect(deleteRequest.request.method).toBe('DELETE');
    deleteRequest.flush(envelope({ id: 'message-2', deletedAt: 200 }));
    await settleAsync();
    httpTesting.expectOne(API.MESSAGE.UNREAD_SUMMARY).flush(
      envelope<UnreadSummary>({ total: 0, categories: {}, beforeCursor: null }),
    );
    await expect(deletePending).resolves.toEqual({ id: 'message-2', deletedAt: 200 });
    expect(service.items.map(item => item.id)).toEqual(['message-1']);
    expect(service.unreadTotal).toBe(0);
  });

  it('uses the summary snapshot for mark-all and refreshes newer messages', async () => {
    const first = service.loadFirst();
    flushFirstPage(
      [message('old-message')],
      null,
      { total: 1, categories: { device_sharing: 1 }, beforeCursor: 'snapshot-1' },
    );
    await first;

    const pending = service.markAllRead();
    const snapshotRequest = httpTesting.expectOne(API.MESSAGE.UNREAD_SUMMARY);
    snapshotRequest.flush(envelope<UnreadSummary>({
      total: 1,
      categories: { device_sharing: 1 },
      beforeCursor: 'live-snapshot',
    }));
    await settleAsync();
    const markAllRequest = httpTesting.expectOne(API.MESSAGE.MARK_ALL_READ);
    expect(markAllRequest.request.method).toBe('POST');
    expect(markAllRequest.request.body).toEqual({ beforeCursor: 'live-snapshot' });
    markAllRequest.flush(envelope({ marked: 1, readAt: 300 }));
    await settleAsync();

    flushFirstPage(
      [
        message('new-message'),
        message('old-message', { unread: false, readAt: 300 }),
      ],
      null,
      { total: 1, categories: { device_sharing: 1 }, beforeCursor: 'snapshot-2' },
    );
    await expect(pending).resolves.toEqual({ marked: 1, readAt: 300 });
    expect(service.items[0]).toMatchObject({ id: 'new-message', unread: true });
    expect(service.unreadTotal).toBe(1);
    expect(service.summary.beforeCursor).toBe('snapshot-2');
  });

  it('drops stale responses after an account switch', async () => {
    const stalePending = service.loadFirst();
    const staleList = httpTesting.expectOne(request =>
      request.url === API.MESSAGE.COLLECTION
    );
    const staleSummary = httpTesting.expectOne(API.MESSAGE.UNREAD_SUMMARY);

    dataService.sessionEpoch += 1;
    dataService.auth = {
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      tokenType: 'Bearer',
    };
    dataService.authDataExpire.next(true);
    staleList.flush(envelope<MessagePage>({
      items: [message('old-account-message')],
      nextCursor: 'old-cursor',
    }));
    staleSummary.flush(envelope<UnreadSummary>({
      total: 1,
      categories: { device_sharing: 1 },
      beforeCursor: 'old-before',
    }));
    await stalePending;
    expect(service.items).toEqual([]);
    expect(service.unreadTotal).toBe(0);
    expect(service.nextCursor).toBeNull();

    const currentPending = service.loadFirst();
    flushFirstPage(
      [message('new-account-message')],
      null,
      { total: 1, categories: { device_sharing: 1 }, beforeCursor: 'new-before' },
    );
    await currentPending;
    expect(service.items.map(item => item.id)).toEqual(['new-account-message']);
  });

  it('recovers an invalid pagination cursor from the first page', async () => {
    const first = service.loadFirst();
    flushFirstPage(
      [message('message-1')],
      'invalid-cursor',
      { total: 1, categories: { device_sharing: 1 }, beforeCursor: 'before-1' },
    );
    await first;

    const pending = service.loadMore();
    const invalidRequest = httpTesting.expectOne(request =>
      request.url === API.MESSAGE.COLLECTION
      && request.params.get('cursor') === 'invalid-cursor'
    );
    invalidRequest.flush(
      {
        status: 400,
        errorCode: 'MESSAGE_CURSOR_INVALID',
        errorMessage: 'cursor is invalid',
        data: null,
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await settleAsync();

    const retryList = httpTesting.expectOne(request =>
      request.url === API.MESSAGE.COLLECTION && !request.params.has('cursor')
    );
    const retrySummary = httpTesting.expectOne(API.MESSAGE.UNREAD_SUMMARY);
    retryList.flush(envelope<MessagePage>({
      items: [message('message-2')],
      nextCursor: null,
    }));
    retrySummary.flush(envelope<UnreadSummary>({
      total: 1,
      categories: { device_sharing: 1 },
      beforeCursor: 'before-2',
    }));
    await pending;
    expect(service.items.map(item => item.id)).toEqual(['message-2']);
    expect(service.errorMessage).toBeNull();
  });

  it('converges MESSAGE_NOT_FOUND and never exposes server diagnostics', async () => {
    const first = service.loadFirst();
    flushFirstPage(
      [message('message-1')],
      null,
      { total: 1, categories: { device_sharing: 1 }, beforeCursor: 'before-1' },
    );
    await first;

    const detailPending = service.getMessage('message-1');
    httpTesting.expectOne(API.MESSAGE.DETAIL('message-1')).flush(
      {
        status: 404,
        errorCode: 'MESSAGE_NOT_FOUND',
        errorMessage: 'internal resource details',
        data: null,
      },
      { status: 404, statusText: 'Not Found' },
    );
    await settleAsync();
    httpTesting.expectOne(API.MESSAGE.UNREAD_SUMMARY).flush(
      envelope<UnreadSummary>({ total: 0, categories: {}, beforeCursor: null }),
    );
    await expect(detailPending).resolves.toBeNull();
    expect(service.items).toEqual([]);
    expect(service.errorMessage).toBeNull();

    const failedRefresh = service.loadFirst();
    const listRequest = httpTesting.expectOne(request =>
      request.url === API.MESSAGE.COLLECTION
    );
    const summaryRequest = httpTesting.expectOne(API.MESSAGE.UNREAD_SUMMARY);
    listRequest.flush(
      {
        status: 503,
        errorCode: 'AILY_UNAVAILABLE',
        errorMessage: 'sensitive upstream diagnostic',
        data: null,
      },
      { status: 503, statusText: 'Service Unavailable' },
    );
    summaryRequest.flush(envelope<UnreadSummary>({
      total: 0,
      categories: {},
      beforeCursor: null,
    }));
    await expect(failedRefresh).rejects.toBeTruthy();
    expect(service.errorMessage).toBe('消息服务暂时不可用，请稍后重试。');
    expect(service.errorMessage).not.toContain('upstream');
  });

  it.each(['read', 'delete'] as const)(
    'returns null when the account changes during a successful %s summary refresh',
    async operation => {
      const first = service.loadFirst();
      flushFirstPage(
        [message('message-1')],
        null,
        { total: 1, categories: { device_sharing: 1 }, beforeCursor: 'before-1' },
      );
      await first;

      const pending = operation === 'read'
        ? service.markRead('message-1')
        : service.deleteMessage('message-1');
      const mutation = httpTesting.expectOne(operation === 'read'
        ? API.MESSAGE.READ('message-1')
        : API.MESSAGE.DETAIL('message-1'));
      expect(mutation.request.method).toBe(operation === 'read' ? 'POST' : 'DELETE');
      mutation.flush(envelope(operation === 'read'
        ? { id: 'message-1', readAt: 100 }
        : { id: 'message-1', deletedAt: 100 }));
      await settleAsync();
      const oldSummary = httpTesting.expectOne(API.MESSAGE.UNREAD_SUMMARY);

      dataService.sessionEpoch += 1;
      dataService.auth = {
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        tokenType: 'Bearer',
      };
      dataService.authDataExpire.next(true);
      oldSummary.flush(envelope<UnreadSummary>({
        total: 0,
        categories: {},
        beforeCursor: null,
      }));

      await expect(pending).resolves.toBeNull();
      expect(service.items).toEqual([]);
      expect(service.unreadTotal).toBe(0);
    },
  );

  it('loads list and summary when initialized before the user becomes ready', async () => {
    dataService.auth = null;
    dataService.userDataLoader.next(false);
    await service.init();

    dataService.sessionEpoch += 1;
    dataService.auth = {
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      tokenType: 'Bearer',
    };
    dataService.authDataExpire.next(true);
    dataService.userDataLoader.next(true);
    await settleAsync();

    flushFirstPage(
      [message('message-after-login')],
      null,
      { total: 1, categories: { device_sharing: 1 }, beforeCursor: 'before-1' },
    );
    await settleAsync();

    expect(service.hasLoaded).toBe(true);
    expect(service.items.map(item => item.id)).toEqual(['message-after-login']);
    expect(service.unreadTotal).toBe(1);
  });

  it('refreshes loaded state on foreground recovery and ntfy message ids', async () => {
    const initialized = service.init();
    flushFirstPage(
      [message('message-1')],
      null,
      { total: 1, categories: { device_sharing: 1 }, beforeCursor: 'before-1' },
    );
    await initialized;

    appVisibility.active.next(false);
    appVisibility.active.next(true);
    await settleAsync();
    flushFirstPage(
      [message('message-2')],
      null,
      { total: 1, categories: { device_sharing: 1 }, beforeCursor: 'before-2' },
    );
    await settleAsync();
    expect(service.items.map(item => item.id)).toEqual(['message-2']);

    ntfyMessageIds.next('message-3');
    await settleAsync();
    flushFirstPage(
      [message('message-3')],
      null,
      { total: 1, categories: { device_sharing: 1 }, beforeCursor: 'before-3' },
    );
    await settleAsync();
    expect(service.items.map(item => item.id)).toEqual(['message-3']);
  });

  function flushFirstPage(
    items: MessageItem[],
    nextCursor: string | null,
    summary: UnreadSummary,
  ): void {
    const listRequest = httpTesting.expectOne(request =>
      request.url === API.MESSAGE.COLLECTION
    );
    const summaryRequest = httpTesting.expectOne(API.MESSAGE.UNREAD_SUMMARY);
    listRequest.flush(envelope<MessagePage>({ items, nextCursor }));
    summaryRequest.flush(envelope(summary));
  }
});

function envelope<T>(data: T): { status: number; data: T } {
  return { status: 200, data };
}

function settleAsync(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function message(id: string, overrides: Partial<MessageItem> = {}): MessageItem {
  return {
    id,
    type: 'share.accepted',
    category: 'device_sharing',
    title: `title-${id}`,
    body: `body-${id}`,
    createdAt: 1,
    visibleAt: 1,
    expiresAt: null,
    readAt: null,
    unread: true,
    ...overrides,
  };
}
