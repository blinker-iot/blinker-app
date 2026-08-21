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
import { ActivatedRoute, RouterModule } from '@angular/router';
import { IonicModule, ModalController } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, Subscription } from 'rxjs';

import { deviceComponentDict } from '../configs/components.config';
import { BlinkerDevice } from '../core/model/device.model';
import { DataService } from '../core/services/data.service';
import { DebugComponent } from '../debug/debug.component';
import { DebugService } from '../debug/debug.service';
import { DeviceService } from '../core/services/device.service';
import { ViewService } from '../core/services/view.service';

interface LoadedDeviceComponent {
  device?: BlinkerDevice;
  customizerUrl?: string;
  layouterData?: string;
  headerActions?: TemplateRef<unknown>;
  canDeactivate?: () => Observable<boolean> | boolean;
}

@Component({
  selector: 'app-device',
  standalone: true,
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    TranslatePipe,
  ],
  templateUrl: './device.page.html',
  styleUrls: ['./device.page.scss'],
})
export class DevicePage implements OnInit, OnDestroy {
  loaded = false;
  id = '';
  device?: BlinkerDevice;
  deviceComponent = '';
  deviceHeaderActions: TemplateRef<unknown> | null = null;

  private readonly subscriptions = new Subscription();
  private deviceSubject?: Subscription;
  private deviceComponentRef?: ComponentRef<unknown>;
  private deviceViewContainer?: ViewContainerRef;
  private loadedComponentConfig = '';
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
    public readonly deviceService: DeviceService,
    private readonly dataService: DataService,
    private readonly viewService: ViewService,
    private readonly debugService: DebugService,
    private readonly modalCtrl: ModalController,
    private readonly cd: ChangeDetectorRef,
  ) {}

  get isPreview(): boolean {
    return !!this.device?.config?.isPreview;
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
    if (this.device && !this.isPreview) {
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
    this.loaded = true;
    this.deviceSubject = nextDevice.subject.subscribe((event) => {
      if (event?.key === 'component') this.loadDevice();
      this.cd.detectChanges();
    });
    this.loadDevice();
    void this.startDeviceSession();
    this.cd.detectChanges();
  }

  private loadDevice(): void {
    if (!this.device || !this.deviceViewContainer) return;

    const componentConfig = this.getComponentConfig();
    let componentName = componentConfig;
    let customizerUrl = '';

    if (componentName.startsWith('Customizer?')) {
      customizerUrl = componentName.slice('Customizer?'.length);
      componentName = 'Customizer';
    }

    const componentExists = !!deviceComponentDict[componentName];
    this.deviceComponent = componentExists
      ? componentName
      : 'Layouter2Component';
    const componentType = deviceComponentDict[this.deviceComponent];
    this.deviceHeaderActions = null;
    this.deviceViewContainer.clear();
    this.deviceComponentRef =
      this.deviceViewContainer.createComponent(componentType);
    this.loadedComponentConfig = componentConfig;
    this.deviceComponentRef.setInput('device', this.device);

    if (this.deviceComponent === 'Customizer') {
      this.deviceComponentRef.setInput('customizerUrl', customizerUrl);
    } else if (this.deviceComponent.includes('Layouter')) {
      this.deviceComponentRef.setInput(
        'layouterData',
        this.device.config.layouter ?? '',
      );
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
  }

  private getComponentConfig(): string {
    return this.device?.config.component || 'Layouter2Component';
  }

  private async startDeviceSession(): Promise<void> {
    if (!this.device || this.isPreview) return;

    if (this.device.config.mode === 'ble') {
      await this.deviceService.connectDevice(this.device);
    }
    this.deviceService.queryDevice(this.device);
    if (typeof this.heartbeatTimer !== 'undefined') {
      window.clearInterval(this.heartbeatTimer);
    }
    this.heartbeatTimer = window.setInterval(() => {
      if (this.device) this.deviceService.queryDevice(this.device);
    }, this.device.config.mode === 'mqtt' ? 59001 : 29001);
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
