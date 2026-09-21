import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  InfiniteScrollCustomEvent,
  IonicModule,
  RefresherCustomEvent,
} from '@ionic/angular';
import { Subscription } from 'rxjs';

import { normalizeMessageId } from 'src/app/core/services/message-deep-link';
import { DeviceV2ShareInvitationService } from 'src/app/core/services/device-v2-share-invitation.service';
import { MessageItem } from './message.model';
import { MessageService } from './message.service';

@Component({
  selector: 'app-message',
  templateUrl: './message.page.html',
  styleUrls: ['./message.page.scss'],
  standalone: true,
  // MessageService exposes mutable state; match the existing profile badge.
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [DatePipe, IonicModule, RouterModule],
})
export class MessagePage implements OnInit, OnDestroy {
  private currentDetail: MessageItem | null = null;
  private detailEpoch = -1;
  private destroyed = false;
  openingInvitation = false;
  get detailItem(): MessageItem | null {
    return this.detailEpoch === this.messageService.sessionEpoch ? this.currentDetail : null;
  }
  set detailItem(item: MessageItem | null) {
    this.currentDetail = item;
    this.detailEpoch = this.messageService.sessionEpoch;
  }
  detailLoading = false;
  detailError = '';
  actionError = '';
  markingAllRead = false;
  deletingMessageId: string | null = null;

  private detailRequestId = 0;
  private routeMessageId: string | null = null;
  private routeSubscription: Subscription | null = null;

  constructor(
    public readonly messageService: MessageService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly invitationFlow: DeviceV2ShareInvitationService,
  ) {}

  get messages(): readonly MessageItem[] {
    return this.messageService.items;
  }

  get unreadTotal(): number {
    return this.messageService.unreadTotal;
  }

  get sharingUnreadCount(): number {
    return this.messageService.summary.categories['device_sharing'] || 0;
  }

  get initialLoading(): boolean {
    return this.messageService.loading && this.messages.length === 0;
  }

  get pageError(): string {
    return this.messageService.errorMessage || this.actionError;
  }

  ngOnInit(): void {
    const initialization = this.initialize();
    this.routeSubscription = this.route.queryParamMap.subscribe(params => {
      const messageId = normalizeMessageId(params.get('messageId'));
      if (messageId === this.routeMessageId) return;

      const previousMessageId = this.routeMessageId;
      this.routeMessageId = messageId;
      if (!messageId) {
        if (previousMessageId) this.resetDetail();
        return;
      }
      void initialization.then(() => this.openMessageById(messageId));
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resetDetail();
    this.routeSubscription?.unsubscribe();
  }

  private async initialize(): Promise<void> {
    try {
      await this.messageService.init();
    } catch {
      // The service exposes a stable UI-safe error; the page renders it below.
      return;
    }
    if (!this.messageService.hasLoaded && !this.messageService.loading) {
      await this.loadFirst();
    }
  }

  async loadFirst(): Promise<void> {
    this.actionError = '';
    try {
      await this.messageService.loadFirst();
    } catch {
      if (!this.messageService.errorMessage) {
        this.actionError = '消息加载失败，请稍后重试';
      }
    }
  }

  async refreshMessages(event: RefresherCustomEvent): Promise<void> {
    this.actionError = '';
    try {
      await this.messageService.refresh();
    } catch {
      if (!this.messageService.errorMessage) {
        this.actionError = '刷新失败，请稍后重试';
      }
    } finally {
      await event.target.complete();
    }
  }

  async loadMoreMessages(event: InfiniteScrollCustomEvent): Promise<void> {
    if (!this.messageService.hasMore || this.messageService.loadingMore) {
      event.target.disabled = !this.messageService.hasMore;
      await event.target.complete();
      return;
    }

    try {
      await this.messageService.loadMore();
    } catch {
      if (!this.messageService.errorMessage) {
        this.actionError = '加载更多消息失败，请稍后重试';
      }
    } finally {
      event.target.disabled = !this.messageService.hasMore;
      await event.target.complete();
    }
  }

  async openMessage(message: MessageItem): Promise<void> {
    await this.openMessageDetail(message.id, message);
  }

  async openMessageById(messageId: string): Promise<void> {
    const item = this.messages.find(message => message.id === messageId) || null;
    await this.openMessageDetail(messageId, item);
  }

  private async openMessageDetail(
    messageId: string,
    initialItem: MessageItem | null,
  ): Promise<void> {
    if (this.destroyed) return;
    const epoch = this.messageService.sessionEpoch;
    const requestId = ++this.detailRequestId;
    this.detailItem = initialItem;
    this.detailLoading = true;
    this.detailError = '';
    this.actionError = '';

    try {
      const detail = await this.messageService.getMessage(messageId);
      if (!this.currentRequest(requestId, epoch)) return;
      if (!detail) {
        this.closeDetail();
        this.actionError = '该消息已不可用，列表已更新';
        return;
      }

      this.detailItem = detail;
      if (!detail.unread) return;

      const readResult = await this.messageService.markRead(detail.id);
      if (!this.currentRequest(requestId, epoch)) return;
      if (!readResult) {
        this.closeDetail();
        this.actionError = '该消息已不可用，列表已更新';
        return;
      }

      this.detailItem = {
        ...detail,
        readAt: readResult.readAt,
        unread: false,
      };
    } catch {
      if (this.currentRequest(requestId, epoch)) {
        this.detailError =
          this.messageService.errorMessage ||
          '消息详情加载失败，请稍后重试';
      }
    } finally {
      if (this.currentRequest(requestId, epoch)) {
        this.detailLoading = false;
      }
    }
  }

  retryDetail(): void {
    if (this.detailItem) void this.openMessage(this.detailItem);
  }

  async openInvitation(): Promise<void> {
    const item = this.detailItem;
    if (this.openingInvitation || this.detailLoading || this.detailError || !item?.action || this.destroyed) return;
    const request = this.detailRequestId, epoch = this.messageService.sessionEpoch;
    this.openingInvitation = true;
    try {
      // Re-read authenticated detail: the invite may have been revoked since it
      // appeared. The shared confirmation flow performs its own preview next.
      const current = await this.messageService.getMessage(item.id);
      if (!this.currentRequest(request, epoch)) return;
      if (!current?.action || !this.invitationFlow.stageDirected(current.action.invitationId)) {
        this.detailError = '该邀请已不可操作，请到“分享给我的”查看当前状态';
        return;
      }
      await this.router.navigateByUrl('/share-invitation');
    } catch {
      if (this.currentRequest(request, epoch)) this.detailError = '邀请加载失败，请重试';
    } finally { this.openingInvitation = false; }
  }

  private currentRequest(request: number, epoch: number): boolean {
    return !this.destroyed && request === this.detailRequestId && epoch === this.messageService.sessionEpoch;
  }

  closeDetail(): void {
    const hadRouteMessage = this.routeMessageId !== null;
    this.routeMessageId = null;
    this.resetDetail();
    if (hadRouteMessage) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { messageId: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  private resetDetail(): void {
    this.detailRequestId += 1;
    this.detailItem = null;
    this.detailLoading = false;
    this.detailError = '';
  }

  async markAllRead(): Promise<void> {
    if (this.markingAllRead || this.unreadTotal === 0) return;

    this.markingAllRead = true;
    this.actionError = '';
    try {
      await this.messageService.markAllRead();
    } catch {
      this.actionError =
        this.messageService.errorMessage ||
        '全部已读操作失败，请稍后重试';
    } finally {
      this.markingAllRead = false;
    }
  }

  async deleteMessage(message: MessageItem, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (this.deletingMessageId) return;

    this.deletingMessageId = message.id;
    this.actionError = '';
    try {
      const result = await this.messageService.deleteMessage(message.id);
      if (this.detailItem?.id === message.id) this.closeDetail();
      if (!result) {
        this.actionError = '该消息已不可用，列表已更新';
      }
    } catch {
      const errorMessage =
        this.messageService.errorMessage ||
        '删除失败，请稍后重试';
      if (this.detailItem?.id === message.id) {
        this.detailError = errorMessage;
      } else {
        this.actionError = errorMessage;
      }
    } finally {
      this.deletingMessageId = null;
    }
  }

  categoryLabel(message: MessageItem): string {
    return message.category === 'device_sharing' ? '分享' : '消息';
  }

  categoryTone(message: MessageItem): 'sharing' | 'generic' {
    return message.category === 'device_sharing' ? 'sharing' : 'generic';
  }

  categoryIcon(message: MessageItem): string {
    return message.category === 'device_sharing'
      ? 'fa-light fa-share-nodes'
      : 'fa-light fa-envelope';
  }

  isDeleting(message: MessageItem): boolean {
    return this.deletingMessageId === message.id;
  }
}
