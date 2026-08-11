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
import { Router } from '@angular/router';
import Sortable from 'sortablejs';

import { DataService } from 'src/app/core/services/data.service';
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

  private sortable: any;
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
    handle: '.device-drag-handle',
    dataIdAttr: 'data-id',
    onChoose: () => {
      this.suppressNavigationUntil = Number.POSITIVE_INFINITY;
      this.setParentGesturesEnabled(false);
    },
    onStart: () => {
      this.suppressNavigationUntil = Number.POSITIVE_INFINITY;
      this.setParentGesturesEnabled(false);
    },
    onEnd: (event: any) => {
      if (event.oldIndex !== event.newIndex) this.saveDeviceList();
      this.finishSorting();
    },
    onUnchoose: () => this.finishSorting(),
  };

  get deviceDataList(): string[] {
    if (typeof this.roomName === 'undefined') {
      return this.dataService.device?.list || [];
    }
    return this.dataService.room?.dict?.[this.roomName] || [];
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
    private router: Router,
    private dataService: DataService,
    private cd: ChangeDetectorRef,
    destroyRef: DestroyRef
  ) {
    this.dataService.userDataLoader
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.cd.markForCheck());
  }

  ngAfterViewInit() {
    this.sortable = new Sortable(
      this.sortbox.nativeElement,
      this.sortableOptions
    );
  }

  ngOnDestroy() {
    this.sortable?.destroy();
    this.sortable = undefined;
  }

  isWideDevice(deviceId: string) {
    const device = this.deviceDataDict[deviceId];
    if (!device) return false;

    const card = device.config?.card;
    if (card?.layout === 'standard') return false;
    if (card?.layout === 'wide') return true;
    // 宽卡快捷按钮暂时停用，不再因按钮配置自动切换为整行布局。
    // if ((card?.actions?.length || 0) > 0) return true;
    if ((card?.metrics?.length || 0) > 2) return true;

    const numericDataCount = Object.values(device.data || {}).filter(
      (value) => typeof value === 'number' && Number.isFinite(value)
    ).length;
    return numericDataCount > 2;
  }

  gotoDashboard(deviceId: string) {
    if (Date.now() < this.suppressNavigationUntil) return;
    if (!this.deviceDataDict[deviceId]) return;
    void this.router.navigate(getDeviceRoute(deviceId));
  }

  private saveDeviceList() {
    if (!this.sortable) return;

    this.deviceDataList = this.sortable.toArray();
    const userConfig =
      typeof this.roomName === 'undefined'
        ? { deviceList: this.deviceDataList }
        : { roomList: this.dataService.room };

    if (this.dataService.auth) {
      void this.userService.saveUserConfig(userConfig);
    }
  }

  private finishSorting() {
    this.suppressNavigationUntil = Date.now() + 300;
    this.setParentGesturesEnabled(true);
  }

  private setParentGesturesEnabled(enabled: boolean) {
    this.swipeEnabled.emit(enabled);
    this.refresherEnabled.emit(enabled);
  }
}
