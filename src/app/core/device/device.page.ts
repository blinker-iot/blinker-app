import { Component, OnInit, ComponentFactoryResolver, ViewChild, ViewContainerRef, Type } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { ActivatedRoute } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { Mode } from './layouter2/layouter2-mode';
import { Observable, of } from 'rxjs';
import { ViewService } from 'src/app/core/services/view.service';
import { DeviceConfigService } from '../services/device-config.service';
import { DebugService } from 'src/app/debug/debug.service';
import { DebugComponent } from 'src/app/debug/debug.component';
import { DataService } from '../services/data.service';
import { BlinkerDevice } from '../model/device.model';
import { deviceComponentDict } from 'src/app/configs/components.config';
import { LayouterService } from './layouter.service';

declare var window;

@Component({
  selector: 'app-device',
  templateUrl: './device.page.html',
  styleUrls: ['./device.page.scss'],
})
export class DevicePage implements OnInit {

  loaded;
  id;

  initCompleted;

  device: BlinkerDevice;

  deviceConfig;

  headerStyle = 'dark';

  get isSharedDevice() {
    return this.device.config.isShared
  }

  get isDiyDevice() {
    return this.device.config.isDiy
  }

  editMode = false;
  deviceComponentRef;

  deviceComponent;

  @ViewChild("deviceView", { read: ViewContainerRef, static: false }) deviceViewContainer: ViewContainerRef;

  constructor(
    private activatedRoute: ActivatedRoute,
    public deviceService: DeviceService,
    private dataService: DataService,
    private viewService: ViewService,
    private componentFactoryResolver: ComponentFactoryResolver,
    private deviceConfigService: DeviceConfigService,
    private debugService: DebugService,
    private modalCtrl: ModalController,
    private LayouterService: LayouterService,
    // private layouterService: LayouterService,
  ) { }

  ngOnInit() {
    this.activatedRoute.params.subscribe(params => {
      this.id = params['id']
      console.log('load device:' + this.id);
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
      }
    });
    this.debugService.init();
    this.LayouterService.action.subscribe(act => {
      if (act.name == 'changeMode') {
        if (act.data == Mode.Default) {
          this.editMode = false
        } else {
          this.editMode = true
        }
      }
    })
    // 加载layouter指定的headerStyle
    this.LayouterService.updateConfig.subscribe(() => {
      // console.log('updateConfig');
      if (typeof this.device.data != 'undefined')
        if (typeof this.device.data['layouterData'] != 'undefined')
          if (typeof this.device.data['layouterData']['config'] != 'undefined')
            setTimeout(() => {
              this.headerStyle = this.device.data['layouterData']['config'].headerStyle
            })
    })

  }

  ngOnDestroy() {
    this.initCompleted.unsubscribe();
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
        if (this.deviceComponent.indexOf('Customizer?') > -1) {
          this.customizerUrl = this.deviceComponent.substr(11)
          console.log(this.customizerUrl);
          this.deviceComponent = 'Customizer'
        }
        console.log('load component:' + this.deviceComponent);

        let factoryClass = deviceComponentDict[this.deviceComponent]
        let componentFactory = this.componentFactoryResolver.resolveComponentFactory(factoryClass);
        this.deviceComponentRef = this.deviceViewContainer.createComponent(componentFactory);
        this.deviceComponentRef.instance.device = this.device;

        // Customizer数据加载
        if (this.deviceComponent == 'Customizer') {
          this.deviceComponentRef.instance.customizerUrl = this.customizerUrl;
        }
        // Layouter2数据加载
        else if (this.deviceComponent.indexOf('Layouter') > -1) {
          let layouterData;

          if (typeof this.deviceConfig.layouter != 'undefined') {
            layouterData = this.deviceConfig.layouter;
          } else {
            layouterData = this.device.config.layouter;
          }
          this.deviceComponentRef.instance.layouterData = layouterData;
        }
        this.headerStyle = this.deviceConfig.headerStyle
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
    // window.clearTimeout(this.heartbeatTimer2);
    // if (this.device.config.mode == "ble") return;
    setTimeout(() => {
      this.deviceService.queryDevice(this.device);
    }, this.device.config.mode == "mqtt" ? 10 : 1000)
    // 心跳连接
    this.heartbeatTimer = window.setInterval(() => {
      this.deviceService.queryDevice(this.device);
    }, this.device.config.mode == "mqtt" ? 59001 : 29001)
  }

  disconnectDevice() {
    this.deviceService.disconnectDevice(this.device);
    clearInterval(this.heartbeatTimer);
  }

  lock() {
    this.LayouterService.changeMode(Mode.Default)
    // this.editMode = false;
    this.saveLayouterData();
  }

  oldLayouterData;
  unlock() {
    if (this.deviceComponent.indexOf('Layouter') > -1)
      this.LayouterService.changeMode(Mode.Edit)
    // else
    //   this.layouterService.changeMode(newMode.EditWidget)
    // this.editMode = true;
    this.oldLayouterData = JSON.stringify(this.device.data['layouterData']);
  }

  saveLayouterData() {
    let data = JSON.stringify(this.device.data['layouterData']);
    if (this.oldLayouterData == data) return;
    let layouterConfig = {
      "layouter": data
    }
    this.deviceService.saveDeviceConfig(this.device, layouterConfig).then(result => {
      if (result) this.deviceService.loadDeviceLayouter(this.device);
    });
  }

  editBackground() {
    this.LayouterService.changeMode(Mode.EditBackground)
  }

  cleanWidgets() {
    this.LayouterService.cleanWidgets()
  }

  canDeactivate(): Observable<boolean> | boolean {
    if (!this.editMode) return true;
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
      componentProps: {
        'device': this.device,
      }
    });
    modal.present();
  }

}
