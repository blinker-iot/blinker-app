import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonicModule, NavController } from '@ionic/angular';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';
import { RoomListComponent } from '../room-list/room-list';
import { DeviceblockZone } from '../deviceblock-zone/deviceblock-zone';
import { DataService } from '../../../core/services/data.service';
import { DeviceUiPort } from '../../../core/device-v2/device-ui.port';

@Component({
  selector: 'tab-device',
  templateUrl: 'tab-device.html',
  styleUrls: ['tab-device.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonicModule,
    RouterModule,
    TranslatePipe,
    RoomListComponent,
    DeviceblockZone,
  ],
})

export class TabDeviceComponent implements OnInit {
  private _roomid = -1;
  private addMenuLayoutFrame?: number;

  @ViewChild('deviceAddMenuTrigger', { read: ElementRef })
  private deviceAddMenuTrigger?: ElementRef<HTMLElement>;

  @ViewChild('deviceAddMenu', { read: ElementRef })
  private deviceAddMenu?: ElementRef<HTMLIonPopoverElement>;

  @Input()
  set roomid(roomid: number) {
    this._roomid = roomid;
  }

  get roomid() {
    return this._roomid;
  }

  @Output() roomidChange = new EventEmitter<number>();

  get deviceNum() {
    return this.dataService.device?.list?.length || 0;
  }

  constructor(
    private dataService: DataService,
    private router: Router,
    private navController: NavController,
    private deviceUi: DeviceUiPort,
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => {
      if (typeof this.addMenuLayoutFrame !== 'undefined') {
        window.cancelAnimationFrame(this.addMenuLayoutFrame);
      }
    });
  }

  ngOnInit() {
    this.dataService.userDataLoader
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this._roomid >= (this.dataService.room?.list?.length ?? 0)) {
          this.onRoomidChange(-1);
        }

        this.cd.markForCheck();
      });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        if (event.urlAfterRedirects.split(/[?#]/, 1)[0] !== '/home/device') return;

        void this.deviceUi.refreshBlePresence(
          this.dataService.device?.list ?? [],
        ).catch(() => undefined);
      });
  }

  onRoomidChange(value: number) {
    this._roomid = value;

    this.roomidChange.emit(value);
    this.cd.markForCheck();
  }

  async openAddPage(url: '/guide' | '/room-manager'): Promise<void> {
    await this.dismissAddMenu();

    await this.navController.navigateForward(url, {
      state: url === '/room-manager' ? { backHref: '/home/device' } : undefined,
    });
  }

  private async dismissAddMenu(): Promise<void> {
    await this.deviceAddMenu?.nativeElement.dismiss();
  }

  scheduleAddMenuPosition(): void {
    if (typeof window === 'undefined') return;

    if (typeof this.addMenuLayoutFrame !== 'undefined') {
      window.cancelAnimationFrame(this.addMenuLayoutFrame);
    }

    this.addMenuLayoutFrame = window.requestAnimationFrame(() => {
      this.addMenuLayoutFrame = undefined;

      const popover = this.deviceAddMenu?.nativeElement;
      const root = popover?.shadowRoot;
      const menu = root?.querySelector<HTMLElement>('.popover-content');
      const trigger = this.deviceAddMenuTrigger?.nativeElement;

      if (!popover || !menu || !trigger) {
        return;
      }

      popover.style.setProperty('--offset-x', '0px');
      popover.style.setProperty('--offset-y', '0px');

      const menuRect = menu.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const visualViewport = window.visualViewport;
      const viewportLeft = visualViewport?.offsetLeft ?? 0;

      const viewportRight =
        viewportLeft + (visualViewport?.width ?? window.innerWidth);

      const viewportTop = visualViewport?.offsetTop ?? 0;

      const viewportBottom =
        viewportTop + (visualViewport?.height ?? window.innerHeight);

      const appRect = trigger.closest('ion-app')?.getBoundingClientRect();
      const edgeInset = 12;

      const minLeft =
        Math.max(viewportLeft, appRect?.left ?? viewportLeft) + edgeInset;

      const maxRight =
        Math.min(viewportRight, appRect?.right ?? viewportRight) - edgeInset;

      const minTop =
        Math.max(viewportTop, appRect?.top ?? viewportTop) + edgeInset;

      const maxBottom =
        Math.min(viewportBottom, appRect?.bottom ?? viewportBottom) - edgeInset;

      let offsetX = 0;

      if (menuRect.right > maxRight) {
        offsetX = maxRight - menuRect.right;
      }

      if (menuRect.left + offsetX < minLeft) {
        offsetX += minLeft - (menuRect.left + offsetX);
      }

      popover.style.setProperty('--offset-x', `${offsetX}px`);

      const preferredTop = triggerRect.bottom + 10;
      const maxTop = maxBottom - menuRect.height;
      const targetTop = Math.max(minTop, Math.min(preferredTop, maxTop));

      popover.style.setProperty('--offset-y', `${targetTop - menuRect.top}px`);
    });
  }
}
