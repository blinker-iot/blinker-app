import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';

import { UserService } from 'src/app/core/services/user.service';
import { DataService } from 'src/app/core/services/data.service';
import PullToRefresh from 'pulltorefreshjs';
import { DeviceblockListComponent } from '../deviceblock-list/deviceblock-list';
import { DeviceService } from 'src/app/core/services/device.service';

@Component({
  selector: 'deviceblock-zone',
  templateUrl: 'deviceblock-zone.html',
  styleUrls: ['deviceblock-zone.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [DeviceblockListComponent],
})
export class DeviceblockZone implements AfterViewInit, OnDestroy {
  refresherEnabled = true;
  swipeEnabled = true;
  private scrollElement?: HTMLElement;
  private pointerStart?: {
    id: number;
    x: number;
    y: number;
    blocksRefresh: boolean;
  };
  private suppressClickUntil = 0;
  private destroyed = false;

  _roomid = -1;

  @Input()
  set roomid(roomid) {
    this._roomid = roomid;
  }

  get roomid() {
    return this._roomid;
  }

  get roomDataList() {
    return this.dataService.room?.list || [];
  }

  get selectedRoomName() {
    if (this.roomid < 0) return undefined;
    return this.roomDataList[this.roomid];
  }

  @Output() roomidChange: EventEmitter<number> = new EventEmitter();

  @ViewChild('refreshZone', { read: ElementRef, static: false })
  refreshZone: ElementRef;
  @ViewChild('deviceZone', { read: ElementRef, static: false })
  deviceZone: ElementRef;

  constructor(
    private deviceService: DeviceService,
    public userService: UserService,
    private dataService: DataService
  ) {}

  async ngAfterViewInit() {
    this.listenForRoomSwipe();

    const ionContent = this.deviceZone.nativeElement.closest('ion-content') as
      | (HTMLElement & { getScrollElement?: () => Promise<HTMLElement> })
      | null;
    this.scrollElement = await ionContent?.getScrollElement?.();
    if (this.destroyed) return;
    this.initRefresh();
  }

  private listenForRoomSwipe() {
    const zone = this.deviceZone.nativeElement as HTMLElement;
    zone.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    zone.addEventListener('pointermove', this.onPointerMove, { passive: true });
    zone.addEventListener('pointerup', this.onPointerUp, { passive: true });
    zone.addEventListener('pointercancel', this.resetPointer, { passive: true });
    zone.addEventListener('click', this.suppressClickAfterSwipe, true);
  }

  private unlistenForRoomSwipe() {
    const zone = this.deviceZone?.nativeElement as HTMLElement | undefined;
    if (!zone) return;
    zone.removeEventListener('pointerdown', this.onPointerDown);
    zone.removeEventListener('pointermove', this.onPointerMove);
    zone.removeEventListener('pointerup', this.onPointerUp);
    zone.removeEventListener('pointercancel', this.resetPointer);
    zone.removeEventListener('click', this.suppressClickAfterSwipe, true);
  }

  private onPointerDown = (event: PointerEvent) => {
    if (
      !this.swipeEnabled ||
      !event.isPrimary ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) {
      return;
    }

    const blocksRefresh =
      event.pointerType !== 'mouse' &&
      event.target instanceof Element &&
      !!event.target.closest('.deviceblock');

    this.pointerStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      blocksRefresh,
    };
    if (blocksRefresh) this.refresherEnabled = false;
  };

  private onPointerMove = (event: PointerEvent) => {
    const start = this.pointerStart;
    if (!start?.blocksRefresh || start.id !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaY) < 8 || Math.abs(deltaY) <= Math.abs(deltaX) * 1.25) {
      return;
    }

    // 明确的纵向手势交还给滚动/下拉刷新；长按与横滑继续保持互斥。
    start.blocksRefresh = false;
    this.refresherEnabled = true;
  };

  private onPointerUp = (event: PointerEvent) => {
    const start = this.pointerStart;
    this.pointerStart = undefined;
    if (start?.blocksRefresh) this.refresherEnabled = true;
    if (!this.swipeEnabled || !start || start.id !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const horizontalDistance = Math.abs(deltaX);
    if (horizontalDistance < 48 || horizontalDistance <= Math.abs(deltaY) * 1.25) {
      return;
    }

    this.suppressClickUntil = Date.now() + 350;
    this.changeRoom(deltaX < 0 ? 1 : -1);
  };

  private resetPointer = () => {
    if (this.pointerStart?.blocksRefresh) this.refresherEnabled = true;
    this.pointerStart = undefined;
  };

  private suppressClickAfterSwipe = (event: Event) => {
    if (Date.now() >= this.suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  };

  private changeRoom(offset: -1 | 1) {
    const nextRoomId = Math.max(
      -1,
      Math.min(this.roomDataList.length - 1, this.roomid + offset)
    );
    if (nextRoomId === this.roomid) return;

    this._roomid = nextRoomId;
    this.roomidChange.emit(nextRoomId);
  }

  initRefresh() {
    PullToRefresh.init({
      mainElement: this.refreshZone.nativeElement,
      triggerElement: this.deviceZone.nativeElement,
      instructionsPullToRefresh: ' ',
      instructionsReleaseToRefresh: '释放刷新',
      instructionsRefreshing: '加载中',
      distIgnore: 150,
      refreshTimeout: 1000,
      onInit: ({ ptrElement }) => {
        ptrElement.style.boxShadow = 'none';
        const textElement = ptrElement.querySelector('.ptr--text') as HTMLElement;
        textElement.style.color = 'var(--blinker-text-secondary)';
        textElement.style.fontSize = '11px';
        textElement.style.fontWeight = 'normal';
        textElement.style.opacity = '0.6';
        const iconElement = ptrElement.querySelector('.ptr--icon') as HTMLElement;
        iconElement.style.color = 'var(--blinker-text-secondary)';
        iconElement.style.opacity = '0.6';
      },
      onRefresh: () => {
        this.refresh();
      },
      shouldPullToRefresh: () => {
        return (
          this.refresherEnabled &&
          !!this.scrollElement &&
          this.scrollElement.scrollTop <= 0
        );
      },
    });
    this.refresherEnabled = true;
  }

  async refresh() {
    if (!this.dataService.auth) return;
    await this.userService.getAllInfo();
    this.deviceService.searchLocalDevice();
  }

  destroyRefresh() {
    PullToRefresh.destroyAll();
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.unlistenForRoomSwipe();
    this.destroyRefresh();
  }

  swipeEnabledChanged(enabled: boolean) {
    this.swipeEnabled = enabled;
    if (!enabled) this.resetPointer();
  }

  refresherEnabledChanged(enabled: boolean) {
    this.refresherEnabled = enabled;
  }
}
