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

import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
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
    private toastController: ToastController,
    private translate: TranslateService,
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
      .subscribe((state) => {
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
    await this.navController.navigateForward(url);
  }

  async showComponentPending(): Promise<void> {
    await this.dismissAddMenu();
    const toast = await this.toastController.create({
      message: this.translate.instant('TAB_DEVICE.FEATURE_PENDING'),
      duration: 1600,
      position: 'bottom',
    });
    await toast.present();
  }

  private async dismissAddMenu(): Promise<void> {
    await this.deviceAddMenu?.nativeElement.dismiss();
  }

  prepareAddMenuPosition(): void {
    const arrow = this.deviceAddMenu?.nativeElement.shadowRoot
      ?.querySelector<HTMLElement>('.popover-arrow');
    if (arrow) arrow.style.visibility = 'hidden';
    this.scheduleAddMenuPosition();
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
        this.showAddMenuArrow();
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

      const arrow = root?.querySelector<HTMLElement>('.popover-arrow');
      const arrowHeight = arrow?.getBoundingClientRect().height ?? 0;
      const preferredTop = triggerRect.bottom + Math.max(arrowHeight, 8) + 2;
      const maxTop = maxBottom - menuRect.height;
      const targetTop = Math.max(minTop, Math.min(preferredTop, maxTop));
      popover.style.setProperty('--offset-y', `${targetTop - menuRect.top}px`);

      // The offset CSS variable is applied asynchronously. Read the final
      // geometry on the next frame before moving Ionic's arrow, otherwise
      // Android can calculate it from the previous menu position.
      this.addMenuLayoutFrame = window.requestAnimationFrame(() => {
        this.addMenuLayoutFrame = undefined;
        this.alignAddMenuArrow();
      });
    });
  }

  private alignAddMenuArrow(): void {
    const popover = this.deviceAddMenu?.nativeElement;
    const trigger = this.deviceAddMenuTrigger?.nativeElement;
    const root = popover?.shadowRoot;
    const menu = root?.querySelector<HTMLElement>('.popover-content');
    const arrow = root?.querySelector<HTMLElement>('.popover-arrow');
    if (!trigger || !menu || !arrow) {
      this.showAddMenuArrow();
      return;
    }

    arrow.style.removeProperty('translate');
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const arrowRect = arrow.getBoundingClientRect();
    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    const safeArrowInset = 18;
    const targetCenter = Math.min(
      Math.max(triggerCenter, menuRect.left + safeArrowInset),
      menuRect.right - safeArrowInset
    );
    const arrowCenter = arrowRect.left + arrowRect.width / 2;
    arrow.style.translate = `${targetCenter - arrowCenter}px 0`;
    arrow.style.removeProperty('visibility');
  }

  private showAddMenuArrow(): void {
    this.deviceAddMenu?.nativeElement.shadowRoot
      ?.querySelector<HTMLElement>('.popover-arrow')
      ?.style.removeProperty('visibility');
  }
}
