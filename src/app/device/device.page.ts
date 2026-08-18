import {
  ChangeDetectorRef,
  Component,
  ComponentRef,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { IonicModule, ModalController } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, of, Subscription } from 'rxjs';

import { deviceComponentDict } from '../configs/components.config';
import { BlinkerDevice } from '../core/model/device.model';
import { DataService } from '../core/services/data.service';
import { ManagedDeviceService } from '../core/services/managed-device.service';
import { DebugComponent } from '../debug/debug.component';
import { DebugService } from '../debug/debug.service';
import { DeviceConfigService } from '../core/services/device-config.service';
import { DeviceService } from '../core/services/device.service';
import { ViewService } from '../core/services/view.service';
import { LayouterService } from './layouter.service';
import { canEditDeviceLayout } from './device-layout-edit';
import { Mode } from './layouter2/layouter2-mode';
import { Layouter2Module } from './layouter2/layouter2.module';

interface LoadedDeviceComponent {
  device?: BlinkerDevice;
  customizerUrl?: string;
  layouterData?: string;
  isChanged?: boolean;
}

@Component({
  selector: 'app-device',
  standalone: true,
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    TranslatePipe,
    Layouter2Module,
  ],
  templateUrl: './device.page.html',
  styleUrls: ['./device.page.scss'],
})
export class DevicePage implements OnInit, OnDestroy {
  loaded = false;
  id = '';
  device?: BlinkerDevice;
  deviceConfig: any;
  editMode = false;
  deviceComponent = '';

  private readonly subscriptions = new Subscription();
  private deviceSubject?: Subscription;
  private deviceComponentRef?: ComponentRef<unknown>;
  private deviceViewContainer?: ViewContainerRef;
  private heartbeatTimer?: number;
  private oldLayouterData = '';

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
    public readonly deviceService: DeviceService,
    private readonly managedDevices: ManagedDeviceService,
    private readonly dataService: DataService,
    private readonly viewService: ViewService,
    private readonly deviceConfigService: DeviceConfigService,
    private readonly debugService: DebugService,
    private readonly modalCtrl: ModalController,
    private readonly layouterService: LayouterService,
    private readonly cd: ChangeDetectorRef,
  ) {}

  get isSharedDevice(): boolean {
    return !!this.device?.config?.isShared;
  }

  get isDiyDevice(): boolean {
    return (
      !!this.device?.config?.isDiy ||
      !!this.device?.deviceType?.includes('Diy')
    );
  }

  get isPreview(): boolean {
    return !!this.device?.config?.isPreview;
  }

  get canEditLayout(): boolean {
    return canEditDeviceLayout(this.device, this.deviceComponent);
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.activatedRoute.paramMap.subscribe((params) => {
        this.id = params.get('id') || '';
        this.bindDevice();
      }),
    );
    this.subscriptions.add(
      this.dataService.initCompleted.subscribe((completed) => {
        if (completed) this.bindDevice();
      }),
    );
    this.debugService.init();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.deviceSubject?.unsubscribe();
    this.deviceComponentRef?.destroy();
    this.deviceComponentRef = undefined;
    this.layouterService.resetMode();
    this.disconnectDevice();
    this.debugService.end();
    if (this.viewService.devicePageIsRoot) {
      this.viewService.devicePageIsRoot = false;
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
    if (this.device?.config?.mode === 'managed-http') return;
    if (this.device && !this.isPreview) {
      this.deviceService.disconnectDevice(this.device);
    }
  }

  lock(): void {
    this.changeLayoutMode(Mode.Default);
    this.saveLayouterData();
  }

  unlock(): void {
    if (!this.canEditLayout) return;
    this.oldLayouterData = JSON.stringify(this.device?.data?.layouterData);
    this.changeLayoutMode(Mode.Edit);
  }

  cleanWidgets(): void {
    this.layouterService.cleanWidgets();
  }

  canDeactivate(): Observable<boolean> | boolean {
    if (!this.editMode) return true;
    const component = this.deviceComponentRef?.instance as LoadedDeviceComponent;
    if (!component?.isChanged) return true;
    return this.confirm();
  }

  confirm(): Observable<boolean> {
    return of(window.confirm('界面布局未保存，是否放弃保存并退出？'));
  }

  private bindDevice(): void {
    const nextDevice = this.dataService.device?.dict?.[this.id] as
      | BlinkerDevice
      | undefined;

    if (!nextDevice) {
      this.deviceSubject?.unsubscribe();
      this.disconnectDevice();
      this.device = undefined;
      this.loaded = true;
      this.cd.detectChanges();
      return;
    }

    if (this.device === nextDevice) {
      if (this.deviceViewContainer && !this.deviceComponentRef) this.loadDevice();
      return;
    }

    this.deviceSubject?.unsubscribe();
    this.disconnectDevice();
    this.deviceComponentRef?.destroy();
    this.deviceComponentRef = undefined;
    this.editMode = false;
    this.layouterService.resetMode();
    this.device = nextDevice;
    this.loaded = true;
    this.deviceSubject = nextDevice.subject.subscribe(() => {
      this.cd.detectChanges();
    });
    this.loadDevice();
    void this.startDeviceSession();
    this.cd.detectChanges();
  }

  private loadDevice(): void {
    if (!this.device || !this.deviceViewContainer) return;

    this.deviceConfig = this.deviceConfigService.getDeviceConfig(this.device);
    let componentName = this.deviceConfig?.component || 'Layouter2';
    let customizerUrl = '';

    if (componentName.startsWith('Customizer?')) {
      customizerUrl = componentName.slice('Customizer?'.length);
      componentName = 'Customizer';
    }

    const componentType =
      deviceComponentDict[componentName] || deviceComponentDict['Layouter2'];
    this.deviceComponent = deviceComponentDict[componentName]
      ? componentName
      : 'Layouter2';
    this.deviceViewContainer.clear();
    this.deviceComponentRef =
      this.deviceViewContainer.createComponent(componentType);
    this.deviceComponentRef.setInput('device', this.device);

    if (this.deviceComponent === 'Customizer') {
      this.deviceComponentRef.setInput('customizerUrl', customizerUrl);
    } else if (this.deviceComponent.includes('Layouter')) {
      this.deviceComponentRef.setInput(
        'layouterData',
        this.deviceConfig?.layouter ?? this.device.config.layouter ?? '',
      );
      this.deviceComponentRef.setInput(
        'mode',
        this.editMode ? Mode.Edit : Mode.Default,
      );
    }

    this.deviceComponentRef.changeDetectorRef.detectChanges();
  }

  private changeLayoutMode(mode: Mode): void {
    // DevicePage owns edit mode. The dynamically-created layouter receives
    // that state through one input; the service notification is retained for
    // non-visual editor commands, but it is no longer a second UI state path.
    this.editMode = mode === Mode.Edit;
    this.layouterService.changeMode(mode);
    if (this.deviceComponent.includes('Layouter') && this.deviceComponentRef) {
      this.deviceComponentRef.setInput('mode', mode);
    }
  }

  private async startDeviceSession(): Promise<void> {
    if (!this.device || this.isPreview) return;

    if (this.device.config.mode === 'managed-http') {
      await this.managedDevices.refreshDevice(this.device.deviceName);
      return;
    }

    if (this.device.config.mode === 'ble') {
      await this.deviceService.connectDevice(this.device);
    }
    this.deviceService.queryDevice(this.device);
    if (
      !this.isSharedDevice &&
      !this.isDiyDevice &&
      this.device.config.mode === 'mqtt'
    ) {
      window.setTimeout(() => {
        if (this.device) this.deviceService.checkDeviceVersion(this.device);
      }, 2000);
    }

    if (typeof this.heartbeatTimer !== 'undefined') {
      window.clearInterval(this.heartbeatTimer);
    }
    this.heartbeatTimer = window.setInterval(() => {
      if (this.device) this.deviceService.queryDevice(this.device);
    }, this.device.config.mode === 'mqtt' ? 59001 : 29001);
  }

  private saveLayouterData(): void {
    if (!this.device?.data?.layouterData) return;

    const data = JSON.stringify(this.device.data.layouterData);
    if (this.oldLayouterData === data) return;
    this.device.config.layouter = data;
    this.oldLayouterData = data;

    if (this.isPreview) {
      this.device.subject.next({ key: 'layouter', value: data });
      return;
    }

    this.deviceService
      .saveDeviceConfig(this.device, { layouter: data })
      .then((result) => {
        if (result && this.device) {
          this.deviceService.loadDeviceLayouter(this.device);
        }
      });
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
}
