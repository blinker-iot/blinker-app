import 'zone.js';

import { provideZoneChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  type ParamMap,
  provideRouter,
} from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import {
  InfiniteScrollCustomEvent,
  RefresherCustomEvent,
} from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';

import { MessageItem } from './message.model';
import { MessagePage } from './message.page';
import { MessageService } from './message.service';
import { TabProfileComponent } from '../../home/components/tab-profile/tab-profile';

describe('MessagePage', () => {
  let fixture: ComponentFixture<MessagePage>;
  let page: MessagePage;
  let service: ReturnType<typeof createMessageService>;
  let queryParamMap: BehaviorSubject<ParamMap>;

  beforeEach(async () => {
    service = createMessageService();
    queryParamMap = new BehaviorSubject(convertToParamMap({}));

    await TestBed.configureTestingModule({
      imports: [MessagePage],
      providers: [
        provideZoneChangeDetection(),
        provideIonicAngular(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap },
        },
        { provide: MessageService, useValue: service },
      ],
    }).compileComponents();

  });

  function createFixture(beforeDetect?: () => void): void {
    fixture = TestBed.createComponent(MessagePage);
    page = fixture.componentInstance;
    beforeDetect?.();
    fixture.detectChanges();
  }

  it('loads the first page after initializing an empty state', async () => {
    service.hasLoaded = false;
    createFixture();

    await vi.waitFor(() => {
      expect(service.init).toHaveBeenCalled();
      expect(service.loadFirst).toHaveBeenCalled();
    });
  });

  it('renders server content and falls back safely for unknown message types', () => {
    service.items = [
      message({
        id: 'share-1',
        type: 'share.accepted',
        category: 'device_sharing',
        title: '设备共享已接受',
        body: '你的设备共享邀请已被接受。',
      }),
      message({
        id: 'future-1',
        type: 'future.type',
        category: 'future_category',
        title: '服务端未知类型标题',
        body: '服务端未知类型正文',
      }),
    ];
    service.summary.categories = {
      device_sharing: 2,
      future_category: 7,
    };
    createFixture();

    const element = fixture.nativeElement as HTMLElement;
    const categories = Array.from(
      element.querySelectorAll<HTMLElement>('.message-category')
    ).map((node) => node.textContent?.trim());
    expect(categories).toEqual(['分享', '消息']);
    expect(element.textContent).toContain('设备共享已接受');
    expect(element.textContent).toContain('服务端未知类型正文');
    expect(element.querySelector('time')?.textContent).toContain('08-28');
    expect(element.querySelector('.category-unread-badge')?.textContent)
      .toContain('分享 2');
  });

  it('distinguishes loading, retryable error, and empty states', async () => {
    service.items = [];
    service.hasLoaded = false;
    service.loading = true;
    createFixture();
    expect(
      fixture.nativeElement.querySelector('[data-testid="message-loading"]')
    ).not.toBeNull();

    fixture.destroy();
    service.loading = false;
    service.errorMessage = '消息服务暂时不可用，请稍后重试。';
    createFixture();
    const retry = fixture.nativeElement.querySelector(
      '[data-testid="message-error"] button'
    ) as HTMLButtonElement;
    expect(retry).not.toBeNull();
    retry.click();
    await vi.waitFor(() => expect(service.loadFirst).toHaveBeenCalled());

    fixture.destroy();
    service.errorMessage = null;
    service.hasLoaded = true;
    createFixture();
    expect(
      fixture.nativeElement.querySelector('[data-testid="message-empty"]')
    ).not.toBeNull();
  });

  it('loads detail and marks an unread message before displaying it as read', async () => {
    const item = message({ id: 'message-1', unread: true, readAt: null });
    service.items = [item];
    service.getMessage.mockResolvedValue(item);
    service.markRead.mockResolvedValue({ id: item.id, readAt: 1_777_000_000_000 });
    createFixture();

    await page.openMessage(item);

    expect(service.getMessage).toHaveBeenCalledWith(item.id);
    expect(service.markRead).toHaveBeenCalledWith(item.id);
    expect(service.getMessage.mock.invocationCallOrder[0]).toBeLessThan(
      service.markRead.mock.invocationCallOrder[0]
    );
    expect(page.detailItem).toMatchObject({
      id: item.id,
      unread: false,
      readAt: 1_777_000_000_000,
    });
  });

  it('opens the pushed business message id without requiring it in the list', async () => {
    const item = message({ id: 'pushed-message', unread: false, readAt: 100 });
    service.getMessage.mockResolvedValue(item);
    queryParamMap.next(convertToParamMap({ messageId: item.id }));
    createFixture();

    await vi.waitFor(() => {
      expect(service.getMessage).toHaveBeenCalledWith(item.id);
      expect(page.detailItem).toEqual(item);
    });
    expect(service.markRead).not.toHaveBeenCalled();
  });

  it('uses service-side snapshot semantics for mark all read', async () => {
    service.unreadTotal = 3;
    createFixture();

    await page.markAllRead();

    expect(service.markAllRead).toHaveBeenCalledOnce();
    expect(page.markingAllRead).toBe(false);
  });

  it('completes refresh and disables infinite scroll at the final cursor', async () => {
    createFixture();
    const refreshTarget = {
      complete: vi.fn().mockResolvedValue(undefined),
    };
    await page.refreshMessages({ target: refreshTarget } as unknown as RefresherCustomEvent);
    expect(service.refresh).toHaveBeenCalledOnce();
    expect(refreshTarget.complete).toHaveBeenCalledOnce();

    service.hasMore = true;
    service.loadMore.mockImplementation(async () => {
      service.hasMore = false;
    });
    const infiniteTarget = {
      complete: vi.fn().mockResolvedValue(undefined),
      disabled: false,
    };
    await page.loadMoreMessages({
      target: infiniteTarget,
    } as unknown as InfiniteScrollCustomEvent);

    expect(service.loadMore).toHaveBeenCalledOnce();
    expect(infiniteTarget.complete).toHaveBeenCalledOnce();
    expect(infiniteTarget.disabled).toBe(true);
  });

  it('removes a stale 404 detail without retrying delete', async () => {
    const item = message({ id: 'missing-message' });
    service.items = [item];
    service.deleteMessage.mockImplementation(async () => {
      service.items = [];
      return null;
    });
    createFixture(() => {
      page.detailItem = item;
    });

    await page.deleteMessage(item);

    expect(service.deleteMessage).toHaveBeenCalledOnce();
    expect(page.detailItem).toBeNull();
    expect(page.actionError).toContain('已不可用');
  });

  it('shows a delete failure inside an open detail', async () => {
    const item = message({ id: 'detail-message' });
    service.items = [item];
    service.errorMessage = '消息服务暂时不可用，请稍后重试。';
    service.deleteMessage.mockRejectedValue(new Error('network failure'));
    createFixture(() => {
      page.detailItem = item;
    });

    await page.deleteMessage(item);

    expect(page.detailItem).toBe(item);
    expect(page.detailError).toBe(service.errorMessage);

    fixture.destroy();
    createFixture(() => {
      page.detailItem = item;
      page.detailError = service.errorMessage || '';
    });
    expect(fixture.nativeElement.textContent).toContain(service.errorMessage);
  });
});

describe('TabProfileComponent message badge', () => {
  it('initializes messages and hides zero while capping large unread counts', async () => {
    const messageService = {
      unreadTotal: 0,
      init: vi.fn().mockResolvedValue(undefined),
    };
    const profile = new TabProfileComponent(
      {} as never,
      {} as never,
      {} as never,
      { instant: (key: string) => key } as never,
      {} as never,
      messageService as never,
    );

    profile.ngOnInit();
    await Promise.resolve();
    expect(messageService.init).toHaveBeenCalledOnce();
    expect(profile.showUnreadMessageBadge).toBe(false);

    messageService.unreadTotal = 7;
    expect(profile.showUnreadMessageBadge).toBe(true);
    expect(profile.unreadMessageBadge).toBe('7');

    messageService.unreadTotal = 100;
    expect(profile.unreadMessageBadge).toBe('99+');
  });
});

function message(overrides: Partial<MessageItem> = {}): MessageItem {
  return {
    id: 'message-1',
    type: 'share.accepted',
    category: 'device_sharing',
    title: '设备共享已接受',
    body: '你的设备共享邀请已被接受。',
    createdAt: Date.UTC(2026, 7, 28, 12),
    visibleAt: Date.UTC(2026, 7, 28, 12),
    expiresAt: null,
    readAt: null,
    unread: true,
    ...overrides,
  };
}

function createMessageService() {
  return {
    items: [] as MessageItem[],
    summary: { total: 0, categories: {}, beforeCursor: null },
    unreadTotal: 0,
    hasMore: false,
    hasLoaded: true,
    loading: false,
    loadingMore: false,
    errorMessage: null as string | null,
    init: vi.fn().mockResolvedValue(undefined),
    loadFirst: vi.fn().mockResolvedValue(undefined),
    loadMore: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    getMessage: vi.fn().mockResolvedValue(null),
    markRead: vi.fn().mockResolvedValue(null),
    markAllRead: vi.fn().mockResolvedValue(null),
    deleteMessage: vi.fn().mockResolvedValue(null),
  };
}
