import { canEditConsole } from '../core/services/device-console.service';

import {
  ChangeDetectorRef,
  Component,
  ComponentRef,
  OnDestroy,
  OnInit,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';

import { CommonModule } from '@angular/common';

import {
  ActivatedRoute,
  NavigationEnd,
  NavigationStart,
  Router,
  RouterModule,
} from '@angular/router';

import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonModal,
  IonRouterLink,
  IonRouterLinkWithHref,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@ngx-translate/core';
import { Observable, Subscription } from 'rxjs';
import { deviceComponentDict } from '../configs/components.config';
import { BlinkerDevice } from '../core/model/device.model';
import { DataService } from '../core/services/data.service';
import { DebugComponent } from '../debug/debug.component';
import { DebugService } from '../debug/debug.service';
import { DeviceService } from '../core/services/device.service';
import { ViewService } from '../core/services/view.service';
import { NoticeService } from '../core/services/notice.service';
import { DevicePanelService } from '../core/services/device-panel.service';
import { normalizeUiTheme, UI_THEMES, UiTheme } from '../core/device-v2/ui-theme';
import { readDeviceTheme, saveDeviceTheme } from './device-theme';
import { readDevicePanelMode } from './device-panel-mode';

interface LoadedDeviceComponent {
  device?: BlinkerDevice;
  customizerUrl?: string;

  layouterData?: string;
  headerActions?: TemplateRef<unknown>;
  stateLabel?: string;
  layoutTheme?: UiTheme;

  canDeactivate?: () => Observable<boolean> | boolean;
}

@Component({
  selector: 'app-device',
  standalone: true,
  imports: [
    CommonModule,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonModal,
    IonRouterLink,
    IonRouterLinkWithHref,
    IonSpinner,
    IonTitle,
    IonToolbar,
    RouterModule,
    TranslatePipe,
  ],
  templateUrl: './device.page.html',
  styleUrls: ['./device.page.scss'],
  host: {
    '[attr.data-ui-theme]': 'deviceTheme',
  },
})

export class DevicePage implements OnInit, OnDestroy {
  loaded = false;
  id = '';
  device?: BlinkerDevice;
  viewActive = false;
  deviceComponent = '';
  deviceHeaderActions: TemplateRef<unknown> | null = null;
  readonly deviceThemes = UI_THEMES;
  selectedDeviceTheme?: UiTheme;

  themePickerOpen = false;
  themeSaved = true;
  switchingMode = false;
  viewError = '';

  private defaultComponent?: string;
  private viewEpoch = 0;

  get canEdit(): boolean { return canEditConsole(this.device); }
  get debugMode(): boolean { return this.deviceComponent === 'TestDashboard'; }

  get customMode(): boolean {
    return readDevicePanelMode(this.device) === 'custom' && !this.debugMode;
  }

  async returnToPanel(): Promise<void> {
    if (!this.device || this.switchingMode || this.device.config.isShared) return;

    this.switchingMode = true;

    try {
      if (this.device.config.mode !== 'bbp2') {
        await this.panels.setView(this.device, this.device.config.panelMode || 'normal');

        return;
      }

      const component = 'DeviceV2';

      if (!this.isPreview && !await this.deviceService.saveDeviceConfig(this.device, { component })) throw new Error();

      this.device.config.component = component;

      this.device.subject.next({ key: 'component', value: component, source: 'device-header' });
    } catch { await this.notice.showToast('切换失败，请稍后重试'); }

    finally { this.switchingMode = false; }
  }

  // Personal choice, then the layout's own theme, then the app's light or dark mode.
  get deviceTheme(): UiTheme {
    if (this.customMode && this.device?.config.customPanel) return this.device.config.customPanel.theme;

    return this.selectedDeviceTheme ?? this.layoutTheme ?? (this.viewService.theme === 'dark' ? 'dark' : 'natural');
  }

  openThemePicker(): void {
    if (this.customMode) return;

    this.themePickerOpen = true;
  }

  selectDeviceTheme(theme: UiTheme): void {
    if (this.customMode) return;

    this.selectedDeviceTheme = theme;
    this.themeSaved = saveDeviceTheme(this.id, theme);
  }

  private readonly subscriptions = new Subscription();
  private deviceSubject?: Subscription;
  private deviceComponentRef?: ComponentRef<unknown>;
  private deviceViewContainer?: ViewContainerRef;
  private loadedComponentConfig = '';
  private loadingDevice = false;
  private heartbeatTimer?: number;

  @ViewChild('deviceView', { read: ViewContainerRef })

  set deviceView(container: ViewContainerRef | undefined) {
    const containerChanged = this.deviceViewContainer !== container;

    this.deviceViewContainer = container;

    if (
      container &&
      this.device &&
      (containerChanged || !this.deviceComponentRef)
    ) {
      this.loadDevice();
    }
  }

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router,
    public readonly deviceService: DeviceService,
    private readonly dataService: DataService,
    private readonly viewService: ViewService,
    private readonly debugService: DebugService,
    private readonly modalCtrl: ModalController,
    private readonly cd: ChangeDetectorRef,
    private readonly notice: NoticeService,
    private readonly panels: DevicePanelService,
  ) {}

  get isPreview(): boolean {
    return !!this.device?.config?.isPreview;
  }

  // Decided from the config, not the loaded component: the template must pick
  // its branch before loading, or a throwaway ion-content is created and torn down.
  get usesV2DevicePage(): boolean {
    return this.resolveComponentName() === 'DeviceV2';
  }

  get layoutTheme(): UiTheme | undefined {
    if (this.usesV2DevicePage || this.deviceComponent.includes('Layouter')) {
      return (this.deviceComponentRef?.instance as LoadedDeviceComponent | undefined)?.layoutTheme;
    }

    return normalizeUiTheme(this.device?.data?.['layouterData']?.config?.interfaceStyle);
  }

  get deviceStateLabel(): string {
    if (this.device?.config.mode !== 'bbp2') return '';

    const component =
      this.deviceComponentRef?.instance as LoadedDeviceComponent | undefined;

    if (component?.stateLabel) {
      return component.stateLabel;
    }

    if (this.device.data?.enable) return '在线';
    if (this.device.data?.state === 'waiting') return '正在连接';

    return '离线';
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.activatedRoute.paramMap.subscribe((params) => {
        this.id = params.get('id') || '';
        this.selectedDeviceTheme = readDeviceTheme(this.id);
        this.themePickerOpen = false;
        this.themeSaved = true;

        this.updateViewActive(this.router.url);
        this.bindDevice();
      }),
    );

    this.subscriptions.add(this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) this.updateViewActive(event.url);
      if (event instanceof NavigationEnd) this.updateViewActive(event.urlAfterRedirects);
    }));

    this.subscriptions.add(
      this.dataService.deviceDataLoader.subscribe((loaded) => {
        if (loaded) this.bindDevice();
      }),
    );

    this.debugService.init();
  }

  ngOnDestroy(): void {
    this.viewEpoch++;
    this.subscriptions.unsubscribe();
    this.deviceSubject?.unsubscribe();

    this.deviceHeaderActions = null;

    this.deviceComponentRef?.destroy();

    this.deviceComponentRef = undefined;

    this.disconnectDevice();
    this.debugService.end();

    if (this.viewService.devicePageIsRoot) {
      this.viewService.devicePageIsRoot = false;
    }
  }

  ionViewWillEnter(): void {
    this.bindDevice();

    if (this.activatedRoute.snapshot.queryParamMap.get('edit') === '1') {
      void this.router.navigate(['/device', this.id, 'edit'], { replaceUrl: true });

      return;
    }

    if (
      this.device &&
      this.deviceViewContainer &&
      this.getComponentConfig() !== this.loadedComponentConfig
    ) {
      this.loadDevice();
    }
  }

  connectDevice(): Promise<void> {
    if (!this.device || this.isPreview) return Promise.resolve();

    return this.startDeviceSession();
  }

  disconnectDevice(): void {
    if (typeof this.heartbeatTimer !== 'undefined') {
      window.clearInterval(this.heartbeatTimer);

      this.heartbeatTimer = undefined;
    }

    if (
      this.device &&
      !this.isPreview &&
      this.device.config.mode !== 'bbp2'
    ) {
      this.deviceService.disconnectDevice(this.device);
    }
  }

  canDeactivate(): Observable<boolean> | boolean {
    const component = this.deviceComponentRef?.instance as LoadedDeviceComponent;

    return component?.canDeactivate?.() ?? true;
  }

  private bindDevice(): void {
    const nextDevice = this.dataService.device?.dict?.[this.id] as
      | BlinkerDevice
      | undefined;

    if (!nextDevice) {
      this.deviceSubject?.unsubscribe();
      this.disconnectDevice();

      this.deviceHeaderActions = null;
      this.loadedComponentConfig = '';
      this.device = undefined;
      this.loaded = true;

      this.cd.detectChanges();

      return;
    }

    if (this.device === nextDevice) {
      if (
        this.deviceViewContainer &&
        (!this.deviceComponentRef ||
          this.getComponentConfig() !== this.loadedComponentConfig)
      ) {
        this.loadDevice();
      }

      return;
    }

    this.deviceSubject?.unsubscribe();
    this.disconnectDevice();

    this.deviceHeaderActions = null;

    this.deviceComponentRef?.destroy();

    this.deviceComponentRef = undefined;
    this.loadedComponentConfig = '';
    this.device = nextDevice;
    this.defaultComponent = undefined;
    this.viewError = '';
    this.loaded = !!nextDevice.config.component;

    this.viewEpoch++;

    this.deviceSubject = nextDevice.subject.subscribe((event) => {
      if (event?.key === 'customName' || event?.key === 'image') {
        nextDevice.config[event.key] = event.value;
      }

      if (event?.key === 'component') {
        this.viewEpoch++;

        this.loaded = !!nextDevice.config.component;

        if (this.loaded) this.loadDevice();
        else void this.resolveDefaultView();
      }

      this.cd.detectChanges();
    });

    if (this.loaded) this.loadDevice();
    else void this.resolveDefaultView();

    void this.startDeviceSession();

    if (this.loaded && nextDevice.config.mode !== 'bbp2' && !nextDevice.config.isPreview) void this.restorePanelView(nextDevice);

    this.cd.detectChanges();
  }

  async resolveDefaultView(): Promise<void> {
    const device = this.device;
    const epoch = ++this.viewEpoch;

    if (!device) return;

    this.viewError = '';

    try {
      let component: string;

      if (device.config.mode === 'bbp2') {
        component = 'DeviceV2';
      } else {
        const record = await this.panels.get(device);

        if (record && epoch === this.viewEpoch && this.device === device && !this.subscriptions.closed) {
          this.panels.install(device, record);
        }

        component = record ? record.panel.view === 'debug' ? 'TestDashboard' : 'Layouter2Component'
          : 'Layouter2Component';
      }

      if (epoch !== this.viewEpoch || this.device !== device || this.subscriptions.closed) return;

      this.defaultComponent = component;
      this.loaded = true;

      this.cd.detectChanges();
      this.loadDevice();
    } catch {
      if (epoch === this.viewEpoch) this.viewError = '无法读取设备界面配置，请重试。';
    } finally { if (!this.subscriptions.closed) this.cd.markForCheck(); }
  }

  private async restorePanelView(device: BlinkerDevice): Promise<void> {
    const original = device.config.component;

    try {
      const record = await this.panels.get(device);

      if (!record || this.device !== device || device.config.component !== original) return;

      this.panels.install(device, record);
      this.loadDevice();
      this.cd.detectChanges();
    } catch { /* The visible panel reports load errors; keep the existing mode. */ }
  }

  private loadDevice(): void {
    if (this.loadingDevice || !this.loaded || !this.device || !this.deviceViewContainer) return;

    this.loadingDevice = true;

    try {
      const componentConfig = this.getComponentConfig();

      const customizerUrl = componentConfig.startsWith('Customizer?')
        ? componentConfig.slice('Customizer?'.length) : '';

      this.deviceComponent = this.resolveComponentName(componentConfig);

      const componentType = deviceComponentDict[this.deviceComponent];

      this.deviceHeaderActions = null;

      // Switching modes can replace the host container. Refresh it before mounting,
      // while the loading guard prevents the ViewChild setter from mounting again.
      this.cd.detectChanges();

      if (!this.deviceViewContainer) return;

      this.deviceViewContainer.clear();

      this.deviceComponentRef =
        this.deviceViewContainer.createComponent(componentType);

      this.loadedComponentConfig = componentConfig;

      this.deviceComponentRef.setInput('device', this.device);

      if (this.deviceComponent === 'DeviceV2') {
        this.deviceComponentRef.setInput('embedded', true);
      }

      if (['DeviceV2', 'TestDashboard', 'Layouter2Component', 'Layouter2'].includes(this.deviceComponent)) {
        this.deviceComponentRef.setInput('viewActive', this.viewActive);
      }

      if (this.deviceComponent === 'Customizer') {
        this.deviceComponentRef.setInput('customizerUrl', customizerUrl);
      }

      this.deviceComponentRef.changeDetectorRef.detectChanges();

      const componentRef = this.deviceComponentRef;
      const component = componentRef.instance as LoadedDeviceComponent;
      const headerActions = component.headerActions ?? null;

      queueMicrotask(() => {
        if (this.deviceComponentRef !== componentRef) return;

        this.deviceHeaderActions = headerActions;

        this.cd.detectChanges();
      });
    } finally {
      this.loadingDevice = false;
    }
  }

  private getComponentConfig(): string {
    if (this.device?.config.component) return this.device.config.component;

    return this.defaultComponent ?? (this.device?.config.mode === 'bbp2' ? 'DeviceV2' : 'Layouter2Component');
  }

  private resolveComponentName(config = this.getComponentConfig()): string {
    const name = config.startsWith('Customizer?') ? 'Customizer' : config;

    if (this.device?.config.mode === 'bbp2' && (name === 'Layouter2' || name === 'Layouter2Component')) return 'DeviceV2';

    return deviceComponentDict[name] ? name
      : this.device?.config.mode === 'bbp2' ? 'DeviceV2' : 'Layouter2Component';
  }

  private async startDeviceSession(): Promise<void> {
    const device = this.device;

    if (!device || device.config.isPreview) return;

    if (device.config.mode === 'bbp2') {
      // The standard V2 child owns its persistent/cancellable page scope.
      // A second shell read would survive navigation until BLE became ready.
      if (!['DeviceV2', 'TestDashboard'].includes(this.resolveComponentName())) await this.deviceService.connectDevice(device);

      return;
    }

    if (device.config.mode === 'ble') {
      await this.deviceService.connectDevice(device);
    }

    if (
      this.subscriptions.closed ||
      this.device !== device
    ) {
      return;
    }

    this.deviceService.queryDevice(device);

    if (typeof this.heartbeatTimer !== 'undefined') {
      window.clearInterval(this.heartbeatTimer);
    }

    const interval = device.config.mode === 'mqtt' ? 59001 : 29001;

    this.heartbeatTimer = window.setInterval(() => {
      if (!this.subscriptions.closed && this.device === device) {
        this.deviceService.queryDevice(device);
      }
    }, interval);
  }

  private clickTime = 0;
  private debugTimer?: number;

  enterDebug(): void {
    if (typeof this.debugTimer !== 'undefined') {
      window.clearTimeout(this.debugTimer);
    }

    if (this.clickTime !== 0) {
      this.debugTimer = window.setTimeout(() => {
        this.clickTime = 0;
      }, 5000);
    }

    this.clickTime++;

    if (this.clickTime === 5) {
      this.clickTime = 0;

      void this.showDebugModal();
    }
  }

  private async showDebugModal(): Promise<void> {
    if (!this.device) return;

    const modal = await this.modalCtrl.create({
      component: DebugComponent,
      backdropDismiss: false,
      componentProps: { device: this.device },
    });

    await modal.present();
  }

  private updateViewActive(url: string): void {
    const path = url.split(/[?#]/, 1)[0].replace(/\/$/, '');
    const active = !!this.id && path === `/device/${encodeURIComponent(this.id)}`;

    if (active === this.viewActive) return;

    this.viewActive = active;

    if (this.deviceComponentRef && ['DeviceV2', 'TestDashboard', 'Layouter2Component', 'Layouter2'].includes(this.deviceComponent)) {
      this.deviceComponentRef.setInput('viewActive', active);
    }

    this.cd.markForCheck();
  }
}
