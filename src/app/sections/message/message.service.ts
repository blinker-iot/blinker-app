import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API } from 'src/app/configs/api.config';
import {
  AilyResponse,
  GatewayHttpError,
} from 'src/app/core/model/response.model';
import { AppVisibilityService } from 'src/app/core/services/app-visibility.service';
import { DataService } from 'src/app/core/services/data.service';
import { NtfyService } from 'src/app/core/services/ntfy.service';
import {
  MessageDeleteResult,
  MessageItem,
  MessageListFilters,
  MessageMarkAllReadResult,
  MessagePage,
  MessageReadResult,
  UnreadSummary,
} from './message.model';

interface RequestContext {
  sessionEpoch: number;
  generation: number;
}

@Injectable({ providedIn: 'root' })
export class MessageService {
  private currentItems: MessageItem[] = [];
  private currentSummary: UnreadSummary = this.emptySummary();
  private currentNextCursor: string | null = null;
  private currentFilters: MessageListFilters = { limit: 15 };
  private loaded = false;
  private firstPageLoading = false;
  private nextPageLoading = false;
  private currentErrorMessage: string | null = null;

  private observedSessionEpoch: number;
  private generation = 0;
  private listRequestId = 0;
  private summaryRequestId = 0;
  private initialized = false;
  private lifecycleRefreshQueued = false;

  constructor(
    private readonly http: HttpClient,
    private readonly dataService: DataService,
    private readonly appVisibility: AppVisibilityService,
    private readonly ntfyService: NtfyService,
  ) {
    this.observedSessionEpoch = this.dataService.sessionEpoch;
    this.observeLifecycle();
  }

  get items(): readonly MessageItem[] {
    this.syncSession();
    return this.currentItems;
  }

  get summary(): Readonly<UnreadSummary> {
    this.syncSession();
    return this.currentSummary;
  }

  get nextCursor(): string | null {
    this.syncSession();
    return this.currentNextCursor;
  }

  get hasLoaded(): boolean {
    this.syncSession();
    return this.loaded;
  }

  get loading(): boolean {
    this.syncSession();
    return this.firstPageLoading;
  }

  get loadingMore(): boolean {
    this.syncSession();
    return this.nextPageLoading;
  }

  get errorMessage(): string | null {
    this.syncSession();
    return this.currentErrorMessage;
  }

  get unreadTotal(): number {
    return this.summary.total;
  }

  get hasMore(): boolean {
    return this.nextCursor !== null;
  }

  async init(): Promise<void> {
    this.syncSession();
    if (this.initialized) return;
    this.initialized = true;
    if (!this.canRefreshInBackground()) return;
    await this.loadFirst();
  }

  async loadFirst(filters: MessageListFilters = this.currentFilters): Promise<void> {
    this.syncSession();
    if (!this.dataService.auth) return;

    const normalizedFilters = this.normalizeFilters(filters);
    const context = this.requestContext();
    const listRequestId = ++this.listRequestId;
    const summaryRequestId = ++this.summaryRequestId;
    this.firstPageLoading = true;
    this.currentErrorMessage = null;

    try {
      const [pageResponse, summaryResponse] = await Promise.all([
        firstValueFrom(this.http.get<AilyResponse<MessagePage>>(
          API.MESSAGE.COLLECTION,
          { params: this.listParams(normalizedFilters) },
        )),
        firstValueFrom(this.http.get<AilyResponse<UnreadSummary>>(
          API.MESSAGE.UNREAD_SUMMARY,
        )),
      ]);
      if (!this.isCurrent(context)
        || listRequestId !== this.listRequestId
        || summaryRequestId !== this.summaryRequestId) return;

      const page = this.responseData(pageResponse);
      this.currentItems = this.dedupe([], page.items);
      this.currentNextCursor = page.nextCursor;
      this.currentSummary = this.responseData(summaryResponse);
      this.currentFilters = normalizedFilters;
      this.loaded = true;
    } catch (error) {
      if (!this.isCurrent(context)
        || listRequestId !== this.listRequestId
        || summaryRequestId !== this.summaryRequestId) return;
      this.currentErrorMessage = this.errorMessageFor(error);
      throw error;
    } finally {
      if (this.isCurrent(context) && listRequestId === this.listRequestId) {
        this.firstPageLoading = false;
      }
    }
  }

  async loadMore(): Promise<void> {
    this.syncSession();
    const cursor = this.currentNextCursor;
    if (!this.dataService.auth || !cursor || this.firstPageLoading
      || this.nextPageLoading) return;

    const context = this.requestContext();
    const requestId = ++this.listRequestId;
    this.nextPageLoading = true;
    this.currentErrorMessage = null;

    try {
      const response = await firstValueFrom(this.http.get<AilyResponse<MessagePage>>(
        API.MESSAGE.COLLECTION,
        { params: this.listParams(this.currentFilters, cursor) },
      ));
      if (!this.isCurrent(context) || requestId !== this.listRequestId) return;

      const page = this.responseData(response);
      this.currentItems = this.dedupe(this.currentItems, page.items);
      this.currentNextCursor = page.nextCursor;
    } catch (error) {
      if (!this.isCurrent(context) || requestId !== this.listRequestId) return;
      if (this.errorCode(error) === 'MESSAGE_CURSOR_INVALID') {
        this.currentNextCursor = null;
        this.nextPageLoading = false;
        await this.loadFirst(this.currentFilters);
        return;
      }
      this.currentErrorMessage = this.errorMessageFor(error);
      throw error;
    } finally {
      if (this.isCurrent(context) && requestId === this.listRequestId) {
        this.nextPageLoading = false;
      }
    }
  }

  refresh(): Promise<void> {
    return this.loadFirst(this.currentFilters);
  }

  async getMessage(messageId: string): Promise<MessageItem | null> {
    this.syncSession();
    if (!this.dataService.auth) return null;
    const context = this.requestContext();
    this.currentErrorMessage = null;

    try {
      const response = await firstValueFrom(this.http.get<AilyResponse<MessageItem>>(
        API.MESSAGE.DETAIL(messageId),
      ));
      if (!this.isCurrent(context)) return null;
      const item = this.responseData(response);
      this.replaceLocalItem(item);
      return item;
    } catch (error) {
      if (!this.isCurrent(context)) return null;
      if (this.errorCode(error) === 'MESSAGE_NOT_FOUND') {
        this.removeLocalItem(messageId);
        this.invalidateEarlierStateRequests();
        await this.bestEffortUnreadSummary();
        return null;
      }
      this.currentErrorMessage = this.errorMessageFor(error);
      throw error;
    }
  }

  async markRead(messageId: string): Promise<MessageReadResult | null> {
    this.syncSession();
    if (!this.dataService.auth) return null;
    const context = this.requestContext();
    this.currentErrorMessage = null;

    try {
      const response = await firstValueFrom(this.http.post<AilyResponse<MessageReadResult>>(
        API.MESSAGE.READ(messageId),
        null,
      ));
      if (!this.isCurrent(context)) return null;
      const result = this.responseData(response);
      const item = this.currentItems.find(value => value.id === messageId);
      const wasUnread = item?.unread === true;
      if (item) {
        this.currentItems = this.currentItems.map(value => value.id === messageId
          ? { ...value, readAt: result.readAt, unread: false }
          : value);
      }
      if (wasUnread) this.decrementUnread(item.category);
      this.invalidateEarlierStateRequests();
      await this.bestEffortUnreadSummary();
      return this.isCurrent(context) ? result : null;
    } catch (error) {
      if (!this.isCurrent(context)) return null;
      if (this.errorCode(error) === 'MESSAGE_NOT_FOUND') {
        this.removeLocalItem(messageId);
        this.invalidateEarlierStateRequests();
        await this.bestEffortUnreadSummary();
        return null;
      }
      this.currentErrorMessage = this.errorMessageFor(error);
      throw error;
    }
  }

  async markAllRead(): Promise<MessageMarkAllReadResult | null> {
    this.syncSession();
    if (!this.dataService.auth) return null;
    const snapshot = await this.refreshUnreadSummary();
    if (!snapshot) return null;
    const beforeCursor = snapshot.beforeCursor;
    if (!beforeCursor) {
      if (this.loaded) await this.refresh();
      return null;
    }

    const context = this.requestContext();
    this.currentErrorMessage = null;
    try {
      const response = await firstValueFrom(
        this.http.post<AilyResponse<MessageMarkAllReadResult>>(
          API.MESSAGE.MARK_ALL_READ,
          { beforeCursor },
        ),
      );
      if (!this.isCurrent(context)) return null;
      const result = this.responseData(response);
      this.invalidateEarlierStateRequests();
      try {
        if (this.loaded) await this.refresh();
        else await this.refreshUnreadSummary();
      } catch {
        // The mutation succeeded. Keep its result and expose the refresh error in state.
      }
      return this.isCurrent(context) ? result : null;
    } catch (error) {
      if (!this.isCurrent(context)) return null;
      this.currentErrorMessage = this.errorMessageFor(error);
      throw error;
    }
  }

  async deleteMessage(messageId: string): Promise<MessageDeleteResult | null> {
    this.syncSession();
    if (!this.dataService.auth) return null;
    const context = this.requestContext();
    this.currentErrorMessage = null;

    try {
      const response = await firstValueFrom(this.http.delete<AilyResponse<MessageDeleteResult>>(
        API.MESSAGE.DETAIL(messageId),
      ));
      if (!this.isCurrent(context)) return null;
      const result = this.responseData(response);
      this.removeLocalItem(messageId);
      this.invalidateEarlierStateRequests();
      await this.bestEffortUnreadSummary();
      return this.isCurrent(context) ? result : null;
    } catch (error) {
      if (!this.isCurrent(context)) return null;
      if (this.errorCode(error) === 'MESSAGE_NOT_FOUND') {
        this.removeLocalItem(messageId);
        this.invalidateEarlierStateRequests();
        await this.bestEffortUnreadSummary();
        return null;
      }
      this.currentErrorMessage = this.errorMessageFor(error);
      throw error;
    }
  }

  reset(): void {
    this.generation += 1;
    this.listRequestId += 1;
    this.summaryRequestId += 1;
    this.observedSessionEpoch = this.dataService.sessionEpoch;
    this.currentItems = [];
    this.currentSummary = this.emptySummary();
    this.currentNextCursor = null;
    this.currentFilters = { limit: 15 };
    this.loaded = false;
    this.firstPageLoading = false;
    this.nextPageLoading = false;
    this.currentErrorMessage = null;
  }

  private observeLifecycle(): void {
    let subscriptionsReady = false;
    this.dataService.authDataExpire.subscribe(() => {
      this.reset();
    });
    this.dataService.userDataLoader.subscribe(loaded => {
      if (!subscriptionsReady) return;
      this.syncSession();
      if (loaded) this.queueLifecycleRefresh();
    });
    this.appVisibility.active.subscribe(active => {
      if (subscriptionsReady && active) this.queueLifecycleRefresh();
    });
    this.ntfyService.messageIds$.subscribe(() => {
      if (subscriptionsReady) this.queueLifecycleRefresh();
    });
    subscriptionsReady = true;
  }

  private queueLifecycleRefresh(): void {
    if (!this.initialized || this.lifecycleRefreshQueued) return;
    this.lifecycleRefreshQueued = true;
    queueMicrotask(() => {
      this.lifecycleRefreshQueued = false;
      this.syncSession();
      if (!this.canRefreshInBackground()) return;
      const refresh = this.loaded ? this.refresh() : this.refreshUnreadSummary();
      void refresh.catch(() => undefined);
    });
  }

  private async refreshUnreadSummary(): Promise<UnreadSummary | null> {
    this.syncSession();
    if (!this.dataService.auth) return null;
    const context = this.requestContext();
    const requestId = ++this.summaryRequestId;
    this.currentErrorMessage = null;
    try {
      const response = await firstValueFrom(this.http.get<AilyResponse<UnreadSummary>>(
        API.MESSAGE.UNREAD_SUMMARY,
      ));
      if (!this.isCurrent(context) || requestId !== this.summaryRequestId) return null;
      const summary = this.responseData(response);
      this.currentSummary = summary;
      return summary;
    } catch (error) {
      if (!this.isCurrent(context) || requestId !== this.summaryRequestId) return null;
      this.currentErrorMessage = this.errorMessageFor(error);
      throw error;
    }
  }

  private async bestEffortUnreadSummary(): Promise<void> {
    try {
      await this.refreshUnreadSummary();
    } catch {
      // The mutation already succeeded; errorMessage exposes the refresh failure.
    }
  }

  private syncSession(): void {
    if (this.observedSessionEpoch !== this.dataService.sessionEpoch) this.reset();
  }

  private requestContext(): RequestContext {
    return {
      sessionEpoch: this.dataService.sessionEpoch,
      generation: this.generation,
    };
  }

  private isCurrent(context: RequestContext): boolean {
    if (context.sessionEpoch !== this.dataService.sessionEpoch) {
      this.syncSession();
      return false;
    }
    return context.generation === this.generation;
  }

  private canRefreshInBackground(): boolean {
    return !!this.dataService.auth
      && this.dataService.userDataLoader.value
      && this.appVisibility.active.value;
  }

  private normalizeFilters(filters: MessageListFilters): MessageListFilters {
    const limit = filters.limit ?? 15;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error('Message list limit must be an integer from 1 to 50.');
    }
    if (filters.unread !== undefined && typeof filters.unread !== 'boolean') {
      throw new Error('Message unread filter must be a boolean.');
    }
    const category = filters.category?.trim();
    if (filters.category !== undefined
      && (!category || category.length > 32 || !/^[a-z0-9_]+$/.test(category))) {
      throw new Error('Message category filter is invalid.');
    }
    return {
      ...(category ? { category } : {}),
      ...(filters.unread !== undefined ? { unread: filters.unread } : {}),
      limit,
    };
  }

  private listParams(filters: MessageListFilters, cursor?: string): HttpParams {
    let params = new HttpParams().set('limit', String(filters.limit ?? 15));
    if (filters.category !== undefined) params = params.set('category', filters.category);
    if (filters.unread !== undefined) params = params.set('unread', String(filters.unread));
    if (cursor) params = params.set('cursor', cursor);
    return params;
  }

  private responseData<T>(response: AilyResponse<T>): T {
    return response.data;
  }

  private dedupe(existing: readonly MessageItem[], incoming: readonly MessageItem[]): MessageItem[] {
    const merged = [...existing];
    const indexes = new Map(merged.map((item, index) => [item.id, index]));
    for (const item of incoming) {
      const index = indexes.get(item.id);
      if (index === undefined) {
        indexes.set(item.id, merged.length);
        merged.push(item);
      } else {
        merged[index] = item;
      }
    }
    return merged;
  }

  private replaceLocalItem(item: MessageItem): void {
    if (!this.currentItems.some(value => value.id === item.id)) return;
    this.currentItems = this.currentItems.map(value => value.id === item.id ? item : value);
  }

  private removeLocalItem(messageId: string): void {
    const item = this.currentItems.find(value => value.id === messageId);
    this.currentItems = this.currentItems.filter(value => value.id !== messageId);
    if (item?.unread) this.decrementUnread(item.category);
  }

  private decrementUnread(category: string): void {
    const categories = { ...this.currentSummary.categories };
    const categoryTotal = Math.max(0, (categories[category] || 0) - 1);
    if (categoryTotal === 0) delete categories[category];
    else categories[category] = categoryTotal;
    this.currentSummary = {
      ...this.currentSummary,
      total: Math.max(0, this.currentSummary.total - 1),
      categories,
    };
  }

  private invalidateEarlierStateRequests(): void {
    this.listRequestId += 1;
    this.summaryRequestId += 1;
    this.firstPageLoading = false;
    this.nextPageLoading = false;
  }

  private errorCode(error: unknown): string | null {
    if (error instanceof GatewayHttpError) return error.code;
    if (!(error instanceof HttpErrorResponse)
      || !error.error || typeof error.error !== 'object') return null;
    const body = error.error as Record<string, unknown>;
    const code = body['errorCode'] ?? body['code'];
    return typeof code === 'string' ? code : null;
  }

  private errorMessageFor(error: unknown): string {
    const code = this.errorCode(error);
    const status = error instanceof GatewayHttpError
      ? error.httpStatus
      : error instanceof HttpErrorResponse
        ? error.status
        : 0;
    if (status === 401 || status === 403) return '登录状态已失效，请重新登录。';
    if (status === 429) return '请求过于频繁，请稍后重试。';
    if (status === 0 && error instanceof HttpErrorResponse) {
      return '网络连接失败，请检查网络后重试。';
    }
    if (code === 'MESSAGE_INVALID_INPUT'
      || code === 'MESSAGE_INVALID_LIMIT'
      || code === 'MESSAGE_CURSOR_INVALID'
      || status === 405
      || status === 413) {
      return '消息请求暂时无法处理，请更新应用后重试。';
    }
    return '消息服务暂时不可用，请稍后重试。';
  }

  private emptySummary(): UnreadSummary {
    return { total: 0, categories: {}, beforeCursor: null };
  }
}
