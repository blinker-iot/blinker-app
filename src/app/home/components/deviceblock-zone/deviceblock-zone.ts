import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  DestroyRef,
  AfterViewInit,
  NgZone,
  OnDestroy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UserService } from 'src/app/core/services/user.service';
import { DataService } from 'src/app/core/services/data.service';
import PullToRefresh from 'pulltorefreshjs';
import { DeviceblockListComponent } from '../deviceblock-list/deviceblock-list';
import { DeviceService } from 'src/app/core/services/device.service';
import { GatewaySessionService } from 'src/app/core/gateway/gateway-session.service';

interface RoomSlide {
  roomId: number;
  role: 'current' | 'incoming';
  direction: -1 | 0 | 1;
}

@Component({
  selector: 'deviceblock-zone',
  templateUrl: 'deviceblock-zone.html',
  styleUrls: ['deviceblock-zone.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DeviceblockListComponent],
})
export class DeviceblockZone implements AfterViewInit, OnDestroy {
  refresherEnabled = true;
  swipeEnabled = true;
  slides: RoomSlide[] = [this.createCurrentSlide(-1)];

  private scrollElement?: HTMLElement;
  private currentSlideElement?: HTMLElement;
  private incomingSlideElement?: HTMLElement;
  private incomingDirection: -1 | 1 = 1;
  private pointerStart?: {
    id: number;
    x: number;
    y: number;
    startedAt: number;
    axis: 'pending' | 'horizontal' | 'vertical';
    blocksRefresh: boolean;
  };
  private suppressClickUntil = 0;
  private destroyed = false;
  private viewInitialized = false;
  private isAnimating = false;
  private transitionRoomId: number | null = null;
  private animationFrame?: number;
  private transitionTimer?: number;
  private transitionEndHandler?: (event: TransitionEvent) => void;

  _roomid = -1;

  @Input()
  set roomid(roomid: number) {
    if (!this.viewInitialized || roomid === this._roomid) {
      this._roomid = roomid;
      this.slides = [this.createCurrentSlide(roomid)];
      return;
    }
    if (this.isAnimating && roomid === this.transitionRoomId) return;

    this.abortMotion();
    this.startProgrammaticRoomChange(roomid);
  }

  get roomid() {
    return this._roomid;
  }

  get roomDataList() {
    return this.dataService.room?.list || [];
  }

  @Output() roomidChange: EventEmitter<number> = new EventEmitter();

  @ViewChild('refreshZone', { read: ElementRef, static: false })
  refreshZone: ElementRef;
  @ViewChild('deviceZone', { read: ElementRef, static: false })
  deviceZone: ElementRef<HTMLElement>;

  constructor(
    private deviceService: DeviceService,
    public userService: UserService,
    private dataService: DataService,
    private gatewaySession: GatewaySessionService,
    private cd: ChangeDetectorRef,
    private ngZone: NgZone,
    destroyRef: DestroyRef
  ) {
    this.dataService.userDataLoader
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.cd.markForCheck());
  }

  async ngAfterViewInit() {
    this.viewInitialized = true;
    this.syncSlideElements();
    this.listenForRoomSwipe();

    const ionContent = this.deviceZone.nativeElement.closest('ion-content') as
      | (HTMLElement & { getScrollElement?: () => Promise<HTMLElement> })
      | null;
    this.scrollElement = await ionContent?.getScrollElement?.();
    if (this.destroyed) return;
    this.initRefresh();
  }

  private listenForRoomSwipe() {
    const zone = this.deviceZone.nativeElement;
    this.ngZone.runOutsideAngular(() => {
      zone.addEventListener('pointerdown', this.onPointerDown, { passive: true });
      zone.addEventListener('pointermove', this.onPointerMove, { passive: true });
      zone.addEventListener('pointerup', this.onPointerUp, { passive: true });
      zone.addEventListener('pointercancel', this.onPointerCancel, {
        passive: true,
      });
      zone.addEventListener('click', this.suppressClickAfterSwipe, true);
    });
  }

  private unlistenForRoomSwipe() {
    const zone = this.deviceZone?.nativeElement as HTMLElement | undefined;
    if (!zone) return;
    zone.removeEventListener('pointerdown', this.onPointerDown);
    zone.removeEventListener('pointermove', this.onPointerMove);
    zone.removeEventListener('pointerup', this.onPointerUp);
    zone.removeEventListener('pointercancel', this.onPointerCancel);
    zone.removeEventListener('click', this.suppressClickAfterSwipe, true);
  }

  private onPointerDown = (event: PointerEvent) => {
    if (
      !this.swipeEnabled ||
      this.isAnimating ||
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
      startedAt: event.timeStamp,
      axis: 'pending',
      blocksRefresh,
    };
    if (blocksRefresh) this.refresherEnabled = false;
  };

  private onPointerMove = (event: PointerEvent) => {
    const start = this.pointerStart;
    if (!start || start.id !== event.pointerId || start.axis === 'vertical') {
      return;
    }

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);

    if (start.axis === 'pending') {
      if (Math.max(horizontalDistance, verticalDistance) < 7) return;

      if (verticalDistance > horizontalDistance * 1.15) {
        start.axis = 'vertical';
        if (start.blocksRefresh) this.refresherEnabled = true;
        return;
      }
      if (horizontalDistance <= verticalDistance * 1.15) return;

      start.axis = 'horizontal';
      this.refresherEnabled = false;
    }

    const direction: -1 | 1 = deltaX < 0 ? 1 : -1;
    const targetRoomId = this.getAdjacentRoomId(direction);
    if (targetRoomId === null) {
      this.clearIncomingRoom();
      this.positionSlides(deltaX * 0.22, direction);
      return;
    }

    this.prepareIncomingRoom(targetRoomId, direction);
    this.positionSlides(deltaX, direction);
  };

  private onPointerUp = (event: PointerEvent) => {
    const start = this.pointerStart;
    this.pointerStart = undefined;
    if (start?.blocksRefresh) this.refresherEnabled = true;
    if (!this.swipeEnabled || !start || start.id !== event.pointerId) return;
    if (start.axis !== 'horizontal') return;

    const deltaX = event.clientX - start.x;
    const horizontalDistance = Math.abs(deltaX);
    const elapsed = Math.max(1, event.timeStamp - start.startedAt);
    const velocity = horizontalDistance / elapsed;
    const width = this.deviceZone.nativeElement.clientWidth;
    const threshold = Math.min(72, Math.max(48, width * 0.16));
    const shouldChangeRoom =
      horizontalDistance >= threshold ||
      (horizontalDistance >= 18 && velocity >= 0.42);
    const direction: -1 | 1 = deltaX < 0 ? 1 : -1;
    const targetRoomId = this.getAdjacentRoomId(direction);

    // A normal tap can drift a few pixels on touch screens. Only suppress the
    // synthetic click once the gesture has travelled far enough to be a swipe.
    if (horizontalDistance >= 18) {
      this.suppressClickUntil = Date.now() + 350;
    }
    if (shouldChangeRoom && targetRoomId !== null) {
      this.prepareIncomingRoom(targetRoomId, direction);
      this.animateSlides(direction, targetRoomId);
      return;
    }

    this.animateSlides(direction, null);
  };

  private onPointerCancel = () => {
    const start = this.pointerStart;
    this.pointerStart = undefined;
    if (start?.blocksRefresh) this.refresherEnabled = true;
    if (start?.axis === 'horizontal') {
      const direction = this.incomingDirection;
      this.animateSlides(direction, null);
    }
  };

  private suppressClickAfterSwipe = (event: Event) => {
    if (Date.now() >= this.suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  };

  getRoomName(roomId: number) {
    if (roomId < 0) return undefined;
    return this.roomDataList[roomId];
  }

  private getAdjacentRoomId(direction: -1 | 1): number | null {
    const targetRoomId = this.roomid + direction;
    if (targetRoomId < -1 || targetRoomId >= this.roomDataList.length) {
      return null;
    }
    return targetRoomId;
  }

  private prepareIncomingRoom(roomId: number, direction: -1 | 1) {
    const incomingSlide = this.getIncomingSlide();
    if (
      incomingSlide?.roomId === roomId &&
      incomingSlide.direction === direction
    ) {
      return;
    }

    this.ngZone.run(() => {
      this.incomingDirection = direction;
      this.slides = [
        this.createCurrentSlide(this._roomid),
        { roomId, role: 'incoming', direction },
      ];
      this.cd.detectChanges();
      this.syncSlideElements();
    });
  }

  private clearIncomingRoom() {
    if (!this.getIncomingSlide()) return;
    this.ngZone.run(() => {
      this.slides = [this.createCurrentSlide(this._roomid)];
      this.cd.detectChanges();
      this.syncSlideElements();
    });
  }

  private positionSlides(deltaX: number, direction: -1 | 1) {
    const current = this.currentSlideElement;
    if (!current) return;

    current.style.transform = `translate3d(${deltaX}px, 0, 0)`;
    const incoming = this.incomingSlideElement;
    if (!incoming) return;

    const incomingX =
      direction * this.deviceZone.nativeElement.clientWidth + deltaX;
    incoming.style.transform = `translate3d(${incomingX}px, 0, 0)`;
  }

  private animateSlides(direction: -1 | 1, targetRoomId: number | null) {
    const current = this.currentSlideElement;
    if (!current) return;

    this.isAnimating = true;
    this.transitionRoomId = targetRoomId;
    const duration = this.prefersReducedMotion() ? 1 : 260;
    const transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    current.style.transition = transition;
    if (this.incomingSlideElement) {
      this.incomingSlideElement.style.transition = transition;
    }
    void current.offsetWidth;

    const destination =
      targetRoomId === null
        ? 0
        : -direction * this.deviceZone.nativeElement.clientWidth;
    this.positionSlides(destination, direction);
    this.waitForSlideTransition(duration);
  }

  private waitForSlideTransition(duration: number) {
    this.clearTransitionWait();
    const current = this.currentSlideElement;
    if (!current) return;
    const finish = () => this.finishSlideTransition();
    this.transitionEndHandler = (event: TransitionEvent) => {
      if (event.target === current && event.propertyName === 'transform') {
        finish();
      }
    };
    current.addEventListener('transitionend', this.transitionEndHandler);
    this.transitionTimer = window.setTimeout(finish, duration + 80);
  }

  private finishSlideTransition() {
    if (!this.isAnimating) return;
    const targetRoomId = this.transitionRoomId;
    this.clearTransitionWait();
    this.isAnimating = false;
    this.transitionRoomId = null;

    this.ngZone.run(() => {
      if (targetRoomId !== null) this._roomid = targetRoomId;
      this.slides = [this.createCurrentSlide(this._roomid)];
      this.cd.detectChanges();
      this.syncSlideElements();
      this.clearSlideStyles();
      if (targetRoomId !== null) this.roomidChange.emit(targetRoomId);
    });
  }

  private startProgrammaticRoomChange(roomId: number) {
    const direction: -1 | 1 = roomId > this._roomid ? 1 : -1;
    this.incomingDirection = direction;
    this.slides = [
      this.createCurrentSlide(this._roomid),
      { roomId, role: 'incoming', direction },
    ];
    this.isAnimating = true;
    this.transitionRoomId = roomId;

    this.animationFrame = window.requestAnimationFrame(() => {
      this.animationFrame = undefined;
      if (this.destroyed || this.transitionRoomId !== roomId) return;
      this.syncSlideElements();
      if (!this.incomingSlideElement) {
        this.finishSlideTransition();
        return;
      }

      this.clearSlideStyles();
      this.positionSlides(0, direction);
      void this.currentSlideElement?.offsetWidth;
      this.animationFrame = window.requestAnimationFrame(() => {
        this.animationFrame = undefined;
        if (this.destroyed || this.transitionRoomId !== roomId) return;
        this.animateSlides(direction, roomId);
      });
    });
  }

  private abortMotion() {
    if (typeof this.animationFrame !== 'undefined') {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
    this.clearTransitionWait();
    this.pointerStart = undefined;
    this.isAnimating = false;
    this.transitionRoomId = null;
    this.slides = [this.createCurrentSlide(this._roomid)];
    this.refresherEnabled = true;
    this.clearSlideStyles();
  }

  private clearSlideStyles() {
    const slides = [this.currentSlideElement, this.incomingSlideElement];
    for (const slide of slides) {
      if (!slide) continue;
      slide.style.transition = '';
      slide.style.transform = '';
    }
  }

  private clearTransitionWait() {
    if (typeof this.transitionTimer !== 'undefined') {
      window.clearTimeout(this.transitionTimer);
      this.transitionTimer = undefined;
    }
    if (this.transitionEndHandler && this.currentSlideElement) {
      this.currentSlideElement.removeEventListener(
        'transitionend',
        this.transitionEndHandler
      );
    }
    this.transitionEndHandler = undefined;
  }

  private prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  private createCurrentSlide(roomId: number): RoomSlide {
    return { roomId, role: 'current', direction: 0 };
  }

  private getIncomingSlide() {
    return this.slides.find((slide) => slide.role === 'incoming');
  }

  private syncSlideElements() {
    const zone = this.deviceZone?.nativeElement;
    this.currentSlideElement = zone?.querySelector<HTMLElement>(
      '.room-slide-current'
    );
    this.incomingSlideElement = zone?.querySelector<HTMLElement>(
      '.room-slide-incoming'
    );
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
    if (!this.dataService.auth && !this.gatewaySession.hasSession) return;
    await this.userService.getAllInfo();
    if (!this.gatewaySession.hasSession) {
      this.deviceService.searchLocalDevice();
    }
  }

  destroyRefresh() {
    PullToRefresh.destroyAll();
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.abortMotion();
    this.unlistenForRoomSwipe();
    this.destroyRefresh();
  }

  swipeEnabledChanged(enabled: boolean) {
    this.swipeEnabled = enabled;
    if (!enabled) this.abortMotion();
  }

  refresherEnabledChanged(enabled: boolean) {
    this.refresherEnabled = enabled;
  }
}
