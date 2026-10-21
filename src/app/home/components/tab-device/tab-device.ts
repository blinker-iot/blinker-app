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
import { AlertController, IonicModule, NavController, Platform } from '@ionic/angular';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BehaviorSubject, combineLatest, distinctUntilChanged, filter, map, merge, of, switchMap } from 'rxjs';
import { RoomListComponent } from '../room-list/room-list';
import { DeviceblockZone } from '../deviceblock-zone/deviceblock-zone';
import { DataService } from '../../../core/services/data.service';
import { DeviceUiPort } from '../../../core/device-v2/device-ui.port';
import { BlePresenceRefresh } from '../../../core/device-v2/ble-direct/presence-refresh';
import { AppVisibilityService } from '../../../core/services/app-visibility.service';
import { API } from '../../../configs/api.config';
import { DeviceCardEditor } from '../../device-card-editor.service';
import { DeviceCardSettingsPanel } from '../device-card-settings/device-card-settings';
import { DeviceCardControl } from '../../device-card-control.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'tab-device',
  templateUrl: 'tab-device.html',
  styleUrls: ['tab-device.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DeviceCardEditor, DeviceCardControl],
  host: {
    '[class.card-editing]': 'cardEditor.editing()',
    '[class.card-editor-error]': '!!cardEditor.error()',
  },
  imports: [
    IonicModule,
    RouterModule,
    TranslatePipe,
    RoomListComponent,
    DeviceblockZone,
    DeviceCardSettingsPanel,
  ],
})

export class TabDeviceComponent implements OnInit {
  readonly messagesAvailable = environment.deployment.messages;
  private _roomid = -1;
  private addMenuLayoutFrame?: number;
  private readonly presenceRefresh: BlePresenceRefresh;
  private readonly homeVisible = new BehaviorSubject(false);
  private bleEnabled: boolean | null = null;
  private exitDecision?: Promise<boolean>;
  private discardAlert?: HTMLIonAlertElement;

  @ViewChild('deviceAddMenuTrigger', { read: ElementRef })
  private deviceAddMenuTrigger?: ElementRef<HTMLElement>;

  @ViewChild('deviceAddMenu', { read: ElementRef })
  private deviceAddMenu?: ElementRef<HTMLIonPopoverElement>;

  @Input()
  set roomid(roomid: number) {
    if (this.cardEditor.editing()) return;
    if (roomid !== this._roomid) this.cardControls?.stop();
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
    private destroyRef: DestroyRef,
    private visibility: AppVisibilityService,
    public readonly cardEditor: DeviceCardEditor,
    private readonly alerts: AlertController,
    platform: Platform,
    readonly cardControls?: DeviceCardControl,
  ) {
    this.presenceRefresh = new BlePresenceRefresh((ids, signal) => this.deviceUi.refreshBlePresence(ids, signal));
    this.destroyRef.onDestroy(() => {
      this.presenceRefresh.close();
      this.cardControls?.setVisible(false);
      this.cardEditor.setActive(false);
      this.cardEditor.cancel();
      void this.discardAlert?.dismiss(undefined, 'cancel');
      if (typeof this.addMenuLayoutFrame !== 'undefined') {
        window.cancelAnimationFrame(this.addMenuLayoutFrame);
      }
    });
    const back = platform.backButton.subscribeWithPriority(10000, processNext => {
      if (!this.homeVisible.value || !this.cardEditor.active() || !this.cardEditor.editing()) {
        processNext();
        return;
      }

      if (this.cardEditor.settingsId()) this.cardEditor.closeSettings();
      else if (this.discardAlert) void this.discardAlert.dismiss(undefined, 'cancel');
      else void this.canDeactivate();
    });
    this.destroyRef.onDestroy(() => back.unsubscribe());
  }

  ngOnInit() {
    this.homeVisible.next(this.router.url.split(/[?#]/, 1)[0] === '/home/device');
    this.dataService.userDataLoader
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.cardEditor.refresh();
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
        const visible = event.urlAfterRedirects.split(/[?#]/, 1)[0] === '/home/device';

        this.homeVisible.next(visible);
        if (!visible) {
          this.cardEditor.cancel();
          void this.discardAlert?.dismiss(undefined, 'cancel');
        }
        this.refreshPresenceDemand();
      });
    merge(this.visibility.active, this.dataService.authDataChanged, this.dataService.deviceDataLoader)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.cardEditor.refresh();
        this.refreshPresenceDemand();
      });
    combineLatest([this.homeVisible, this.visibility.active])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([home, active]) => {
        this.cardEditor.setActive(home && active);
        this.cardControls?.setVisible(home && active);
      });
    combineLatest([this.homeVisible, this.visibility.active])
      .pipe(
        map(([home, active]) => home && active),
        distinctUntilChanged(),
        switchMap(visible => visible ? this.deviceUi.watchBleAdapterEnabled() : of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(enabled => { this.bleEnabled = enabled; this.refreshPresenceDemand(); });
  }

  private refreshPresenceDemand(): void {
    const auth = this.dataService.auth;
    const enabled = this.homeVisible.value && this.visibility.active.value && this.bleEnabled === true
      && this.dataService.deviceDataLoader.value && !!auth?.uuid;
    this.presenceRefresh.setDemand(enabled
      ? `${API.BASE_URL}\0${auth!.uuid}\0${this.dataService.sessionEpoch}` : undefined,
      this.dataService.device?.list ?? []);
  }

  onRoomidChange(value: number) {
    if (this.cardEditor.editing()) return;
    if (value !== this._roomid) this.cardControls?.stop();
    this._roomid = value;

    this.roomidChange.emit(value);
    this.cd.markForCheck();
  }

  async canDeactivate(): Promise<boolean> {
    if (this.cardEditor.saving()) return false;
    if (!this.cardEditor.editing()) return true;
    if (!this.cardEditor.dirty()) {
      this.cardEditor.cancel();
      return true;
    }
    if (!this.exitDecision) {
      this.exitDecision = this.confirmDiscard().catch(() => false).finally(() => { this.exitDecision = undefined; });
    }

    return this.exitDecision;
  }

  private async confirmDiscard(): Promise<boolean> {
    const epoch = this.dataService.sessionEpoch;
    const generation = this.cardEditor.generation();
    const stale = () => epoch !== this.dataService.sessionEpoch || generation !== this.cardEditor.generation();
    const alert = await this.alerts.create({
      header: '放弃未保存的卡片修改？',
      message: '已保存的卡片大小和顺序不会改变。',
      buttons: [{ text: '继续编辑', role: 'cancel' }, { text: '放弃修改', role: 'destructive' }],
    });

    this.discardAlert = alert;
    try {
      if (stale()) {
        alert.remove();
        return !this.cardEditor.editing();
      }
      await alert.present();
      if (stale()) {
        await alert.dismiss();
        return !this.cardEditor.editing();
      }
      const discard = (await alert.onDidDismiss()).role === 'destructive';
      if (stale()) return !this.cardEditor.editing();
      if (discard) this.cardEditor.cancel();
      return discard;
    } finally {
      if (this.discardAlert === alert) this.discardAlert = undefined;
    }
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
