import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import Sortable from 'sortablejs';
import { ToastController } from '@ionic/angular/standalone';
import { RoomService, roomErrorMessage } from 'src/app/sections/room/room.service';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceUiPort } from 'src/app/core/device-v2/device-ui.port';
import { UserService } from 'src/app/core/services/user.service';
import { Deviceblock } from '../deviceblock/deviceblock';
import { getDeviceRoute } from './device-navigation';

@Component({
  selector: 'deviceblock-list',
  templateUrl: 'deviceblock-list.html',
  styleUrls: ['deviceblock-list.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Deviceblock],
})

export class DeviceblockListComponent implements AfterViewInit, OnDestroy {
  @Output() swipeEnabled = new EventEmitter<boolean>();
  @Output() refresherEnabled = new EventEmitter<boolean>();
  @Input() roomName?: string;
  @ViewChild('sortbox') sortbox: ElementRef<HTMLElement>;

  private cardRead?: AbortController;
  private appActive = true;
  private viewInitialized = false;
  private sortable: any;
  private isSorting = false;
  private sortingOrder?: string[];
  private suppressNavigationUntil = 0;

  private readonly sortableOptions = {
    animation: 160,
    delay: 450,
    delayOnTouchOnly: false,
    touchStartThreshold: 5,
    fallbackTolerance: 4,
    forceFallback: true,
    fallbackOnBody: true,
    fallbackClass: 'sdrag',
    ghostClass: 'sghost',
    chosenClass: 'schosen',
    dragClass: 'sdrag',
    draggable: '.deviceblock',
    filter: 'button, a, input, select, textarea',
    preventOnFilter: false,
    dataIdAttr: 'data-id',
    onChoose: () => {
      this.sortingOrder = this.deviceDataList;
      this.isSorting = true;
      this.suppressNavigationUntil = Number.POSITIVE_INFINITY;

      this.setParentGesturesEnabled(false);
    },
    onStart: () => {
      // `onChoose` reserves the gesture as soon as the long-press delay ends.
      // Keep this as a fallback in case Sortable changes that event ordering.
      if (!this.isSorting) {
        this.sortingOrder = this.deviceDataList;
        this.isSorting = true;
        this.suppressNavigationUntil = Number.POSITIVE_INFINITY;

        this.setParentGesturesEnabled(false);
      }
    },
    onEnd: (event: any) => {
      if (event.oldIndex !== event.newIndex) {
        const order = this.sortable.toArray();
        const container = this.sortbox.nativeElement;

        // Restore Angular's previous DOM order before it applies the sorted list.
        event.item.remove();
        container.insertBefore(event.item, container.children[event.oldIndex] ?? null);
        void this.saveDeviceList(order);
      }

      this.finishSorting();
    },
    // Sortable emits unchoose before end, including when a press is cancelled.
    onUnchoose: () => queueMicrotask(() => this.finishSorting()),
  };

  get deviceDataList(): string[] {
    if (this.sortingOrder) return this.sortingOrder;

    const list: string[] = typeof this.roomName === 'undefined'
      ? this.dataService.device?.list || []
      : this.dataService.room?.dict?.[this.roomName] || [];

    return list.filter(id => !!this.deviceDataDict[id]).sort((left, right) => (
      Number(this.deviceUi.isOnline(right)) - Number(this.deviceUi.isOnline(left))
    ));
  }

  set deviceDataList(list: string[]) {
    if (typeof this.roomName === 'undefined') {
      if (this.dataService.device) this.dataService.device.list = list;

      return;
    }

    if (this.dataService.room?.dict) {
      this.dataService.room.dict[this.roomName] = list;
    }
  }

  get deviceDataDict() {
    return this.dataService.device?.dict || {};
  }

  constructor(
    private userService: UserService,
    private rooms: RoomService,
    private toast: ToastController,
    private router: Router,
    private dataService: DataService,
    private deviceUi: DeviceUiPort,
    private cd: ChangeDetectorRef,
    destroyRef: DestroyRef
  ) {
    this.dataService.userDataLoader
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        this.cd.markForCheck();
        this.refreshBlePresence();
      });

    this.dataService.deviceDataLoader
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        this.cd.markForCheck();
        this.refreshCardStates();
      });

    this.deviceUi.appActive
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(active => {
        this.appActive = active;

        this.refreshCardStates();
      });

    this.router.events
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(event => {
        if (event instanceof NavigationStart) this.cardRead?.abort();
        if (event instanceof NavigationEnd) this.refreshCardStates();
      });
  }

  ngAfterViewInit() {
    this.viewInitialized = true;

    this.sortable = new Sortable(
      this.sortbox.nativeElement,
      this.sortableOptions
    );

    this.refreshBlePresence();
    this.refreshCardStates();
  }

  ngOnDestroy() {
    this.cardRead?.abort();
    this.sortable?.destroy();

    this.sortable = undefined;
  }

  gotoDashboard(deviceId: string) {
    if (Date.now() < this.suppressNavigationUntil) return;
    if (!this.deviceDataDict[deviceId]) return;

    void this.router.navigate(getDeviceRoute(deviceId));
  }

  private async saveDeviceList(order: string[]): Promise<void> {
    if (!this.sortable) return;

    if (typeof this.roomName === 'undefined') {
      this.deviceDataList = order;

      if (this.dataService.auth) void this.userService.saveUserConfig({ deviceList: order });

      return;
    }

    const revision = this.dataService.roomRevision;
    const draft = structuredClone(this.dataService.room);

    draft.dict[this.roomName] = order;

    this.sortable.option('disabled', true);

    try {
      if (revision === null) throw new Error('区域尚未同步');

      await this.rooms.saveData(draft, revision, this.dataService.sessionEpoch);
    } catch (error) {
      const toast = await this.toast.create({ message: roomErrorMessage(error), duration: 3000 });

      await toast.present();
    } finally {
      this.sortable?.option('disabled', false);
      this.cd.markForCheck();
    }
  }

  private finishSorting() {
    if (!this.isSorting) return;

    this.isSorting = false;
    this.sortingOrder = undefined;
    this.suppressNavigationUntil = Date.now() + 300;

    this.setParentGesturesEnabled(true);
    this.cd.markForCheck();
  }

  private setParentGesturesEnabled(enabled: boolean) {
    this.swipeEnabled.emit(enabled);
    this.refresherEnabled.emit(enabled);
  }

  private refreshCardStates(): void {
    this.cardRead?.abort();

    if (!this.viewInitialized || !this.appActive
      || this.router.url.split(/[?#]/, 1)[0] !== '/home/device') return;

    const controller = new AbortController();

    this.cardRead = controller;

    void this.deviceUi.refreshCardStates(this.deviceDataList, controller.signal)
      .finally(() => {
        if (this.cardRead === controller) this.cardRead = undefined;
      });
  }

  private refreshBlePresence(): void {
    void this.deviceUi.refreshBlePresence(this.deviceDataList).catch(() => undefined);
  }
}
