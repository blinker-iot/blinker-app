import { Component, OnInit, ViewChild, ViewContainerRef, ChangeDetectorRef } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { ActivatedRoute } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { Observable, of } from 'rxjs';
import { ViewService } from 'src/app/core/services/view.service';
import { DebugService } from 'src/app/debug/debug.service';
import { DebugComponent } from 'src/app/debug/debug.component';
import { BlinkerDevice } from '../core/model/device.model';
import { DataService } from '../core/services/data.service';
import { DeviceConfigService } from '../core/services/device-config.service';
// import { Customizer } from './customizer/customizer.component';
import { Layouter2Component } from './layouter2/layouter2';
import { Layouter2Service } from './layouter2/layouter2.service';
import { ConfigEditorComponent } from './layouter2/config-editor/config-editor.component';
import { Layouter2Data } from './layouter2/layouter.interface';
import { LayouterVersion } from './layouter2/layouter.config';

@Component({
  selector: 'app-device',
  templateUrl: './device.page.html',
  styleUrls: ['./device.page.scss']
})
export class DevicePage implements OnInit {

  loaded;
  id;

  initCompleted;

  device: BlinkerDevice;

  deviceConfig;

  showGuide = false;
  willCloseGuide = false;

  get isSharedDevice() {
    return this.device.config.isShared
  }

  get isDiyDevice() {
    return this.device.config.isDiy
  }

  deviceComponentRef;

  deviceComponent;

  deviceSubject;

  showState = false

  get mode(): any {
    return this.layouter2Service.mode
  }

  set mode(mode: any) {
    this.layouter2Service.mode = mode
  }

  get layouterData(): Layouter2Data {
    return this.layouter2Service.layouterData
  }

  get headerCss() {
    if (this.mode == 1)
      return {
        "color": "#666"
      }
    return this.layouter2Service.headerCss
  }

  debug() {
    console.log(this.layouterData);
  }

  @ViewChild("deviceView", { read: ViewContainerRef, static: false }) deviceViewContainer: ViewContainerRef;

  constructor(
    private activatedRoute: ActivatedRoute,
    public deviceService: DeviceService,
    private dataService: DataService,
    private viewService: ViewService,
    private deviceConfigService: DeviceConfigService,
    private debugService: DebugService,
    private modalCtrl: ModalController,
    private layouter2Service: Layouter2Service,
    private cd: ChangeDetectorRef,
  ) { }

  ngOnInit() {
    this.activatedRoute.params.subscribe(params => {
      this.id = params['id']
      console.log('load device: ' + this.id);
    })
    this.initCompleted = this.dataService.initCompleted.subscribe(state => {
      if (state) {
        this.device = this.dataService.device.dict[this.id]
        this.loaded = state;
        setTimeout(() => {
          this.loadDevice();
          this.initConnect();
        }, 20);
        this.viewService.setLightStatusBar();

        this.deviceSubject = this.device.subject.subscribe(data => {
          this.cd.detectChanges()
        })
      }
    });
    this.debugService.init();

    this.layouter2Service.action.subscribe(act => {
      switch (act.name) {
        case 'showGuide':
          setTimeout(() => {
            this.showGuide = true
          }, 500);
          break;
        default:
          break;
      }
    })
  }

  ngOnDestroy() {
    this.initCompleted.unsubscribe();
    this.deviceSubject.unsubscribe();
    this.disconnectDevice();
    this.debugService.end();
    // shortcut进入
    if (this.viewService.devicePageIsRoot) {
      this.viewService.devicePageIsRoot = false;
    }
  }

  initConnect() {
    // 连接设备
    this.connectDevice();
    //MQTT设备进行OTA版本检查,DIY设备、共享设备不支持OTA
    if (this.isSharedDevice) return;
    if (this.device.deviceType.indexOf('Diy') > -1) return;
    if (this.device.config.mode == 'mqtt')
      setTimeout(() => {
        this.deviceService.checkDeviceVersion(this.device)
      }, 2000);
  }

  customizerUrl;
  loadDevice() {
    this.deviceConfigService.loaded.subscribe(loaded => {
      if (loaded) {
        this.deviceConfig = this.deviceConfigService.getDeviceConfig(this.device);
        if (typeof this.deviceConfig == 'undefined')
          this.deviceComponent = 'Layouter2';
        else
          this.deviceComponent = this.deviceConfig.component;
        console.log('load component:' + this.deviceComponent);
        if (this.deviceComponent == 'Layouter2') {
          this.deviceComponentRef = this.deviceViewContainer.createComponent(Layouter2Component);
          this.deviceComponentRef.instance.device = this.device;
          this.layouter2Service.init(this.device)
        }
        // Customizer数据加载
        // else if (this.deviceComponent.indexOf('Customizer?') > -1) {
        //   this.customizerUrl = this.deviceComponent.substr(11)
        //   this.deviceComponentRef = this.deviceViewContainer.createComponent(Customizer);
        //   this.deviceComponentRef.instance.customizerUrl = this.customizerUrl;
        //   this.deviceComponentRef.instance.device = this.device;
        // }
      }
    })
  }

  heartbeatTimer;
  // heartbeatTimer2;
  async connectDevice() {
    // 连接设备
    if (this.device.config.mode == "ble") {
      await this.deviceService.connectDevice(this.device);
    }
    clearInterval(this.heartbeatTimer);
    setTimeout(() => {
      this.deviceService.queryDevice(this.device);
    }, this.device.config.mode == "mqtt" ? 100 : 1000)
    setTimeout(() => {
      this.showState = true
    }, this.device.config.mode == "mqtt" ? 200 : 2000);
    // 心跳连接
    this.heartbeatTimer = setInterval(() => {
      this.deviceService.queryDevice(this.device);
    }, this.device.config.mode == "mqtt" ? 59001 : 29001)

  }

  disconnectDevice() {
    this.deviceService.disconnectDevice(this.device);
    clearInterval(this.heartbeatTimer);
  }

  lock() {
    // this.layouter3Service.exitEditMode()
    this.layouter2Service.exitEditMode()
    this.saveLayouterData();
  }

  oldLayouterData;
  unlock() {
    this.layouter2Service.enterEditMode()
    this.oldLayouterData = JSON.stringify(this.layouterData);
  }

  saveLayouterData() {
    this.layouterData.version = LayouterVersion;
    let data = JSON.stringify(this.layouterData);
    if (this.oldLayouterData == data) return;
    let layouterConfig = {
      "layouter": data
    }
    this.deviceService.saveDeviceConfig(this.device, layouterConfig).then(result => {
      if (result) this.deviceService.loadDeviceLayouter(this.device);
    });
  }

  editBackground() {
    this.layouter2Service.editBackground()
  }

  cleanWidgets() {
    this.layouter2Service.cleanWidgets()
  }

  canDeactivate(): Observable<boolean> | Promise<boolean> | boolean {
    if (this.showGuide) {
      return new Promise<boolean>((resolve, reject) => {
        this.willCloseGuide = true
        setTimeout(() => {
          resolve(true)
        }, 300);
      })
    }
    if (this.mode == 0) return true;
    if (!this.deviceComponentRef.instance.isChanged) return true;
    return this.confirm();
  }

  confirm(message?: string): Observable<boolean> {
    const confirmation = window.confirm("界面布局未保存，是否放弃保存并退出？");
    return of(confirmation);
  };

  clickTime = 0;
  timer;
  enterDebug() {
    this.debug()
    clearTimeout(this.timer);
    if (this.clickTime != 0) {
      this.timer = setTimeout(() => {
        this.clickTime = 0;
      }, 5000);
    }
    this.clickTime++;
    if (this.clickTime == 5) {
      this.clickTime = 0;
      this.showDebugModal();
    }
  }

  async showDebugModal() {
    const modal = await this.modalCtrl.create({
      component: DebugComponent,
      backdropDismiss: false,
      initialBreakpoint: 1,
      breakpoints: [1],
      componentProps: {
        'device': this.device,
      }
    });
    modal.present();
  }

  closeGuide() {
    console.log('closeGuide');

    this.willCloseGuide = true
    setTimeout(() => {
      this.showGuide = false
    }, 300);
  }


  // openConfigEditor() {
  //   this.layouter2Service.openConfigEditor()
  // }

  async openConfigEditor() {
    let modal = await this.modalCtrl.create({
      component: ConfigEditorComponent,
      initialBreakpoint: 0.3,
      breakpoints: [0.3, 0.5, 1]
    })
    modal.present();
  }

}
