
import {
  IonicPage,
  NavController,
  NavParams,
  Content,
  ModalController,
  AlertController,
  Events,
} from 'ionic-angular';
import {
  Component,
  ViewChild,
  Renderer2,
  ElementRef,
  ChangeDetectorRef,
} from '@angular/core';
import {
  DisplayGrid,
  GridsterConfig,
  GridsterItem,
  GridType,
  // GridsterItemComponentInterface
} from 'angular-gridster2';
import { DeviceProvider } from '../../providers/device/device';
import { UserProvider } from '../../providers/user/user';
import { NativeProvider } from '../../providers/native/native';

import { Layout2textComponent } from '../../components/layout2text/layout2text';
import { Layout2numberComponent } from '../../components/layout2number/layout2number';
import { Layout2buttonComponent } from '../../components/layout2button/layout2button';
import { Layout2colorComponent } from '../../components/layout2color/layout2color';
import { Layout2rangeComponent } from '../../components/layout2range/layout2range';
import { Layout2chartComponent } from '../../components/layout2chart/layout2chart';
import { Layout2joystickComponent } from '../../components/layout2joystick/layout2joystick';
import { Layout2videoComponent } from '../../components/layout2video/layout2video';
import { Layout2timerComponent } from '../../components/layout2timer/layout2timer';
import { Layout2debugComponent } from '../../components/layout2debug/layout2debug';

import { configList } from '../../components/layout.component';
import { arrayRemove, randomString } from '../../functions/func';
import { TabsPage } from '../tabs/tabs';

@IonicPage()
@Component({
  selector: 'page-layout2',
  templateUrl: 'layout2.html',
  providers: [NativeProvider]
})
export class Layout2Page {

  public device;
  public options: GridsterConfig = {};
  public dashboard: Array<GridsterItem> = [];
  public editMode = false;
  public dragging = false;
  public hasDebug = false;
  public hasTiming = false;
  oldState;
  // public showBar = false;
  @ViewChild(Content) content: Content;
  @ViewChild('gridsterBox', { read: ElementRef }) gridsterBox: ElementRef;

  heartbeatTimer;
  heartbeatTimer2;
  clientHeight;
  clientWidth;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public render: Renderer2,
    public events: Events,
    public modalCtrl: ModalController,
    public alertCtrl: AlertController,
    public deviceProvider: DeviceProvider,
    public userProvider: UserProvider,
    public nativeProvider: NativeProvider,
    public changeDetectorRef: ChangeDetectorRef
  ) {
    this.device = navParams.data;
    // this.device.data["unknownData"] = '';
  }

  async ionViewDidLoad() {
    this.initGrid();
    this.reSize();
    this.nativeProvider.init();
    this.showGuide();
    this.events.subscribe('layout:delete', item => {
      this.delComponent(item);
    });
    this.events.subscribe('layout:send', data => {
      this.deviceProvider.sendData(this.device, data);
    });
    this.events.subscribe(this.device.deviceName + ':state', data => {
      this.changeDetectorRef.detectChanges();
    });
    this.events.subscribe('layout:goto', page => {
      this.navCtrl.push(page, this.device);
    });
    // 连接设备
    this.connectDevice();
    this.watchNetWork();

    // 加载组件
    setTimeout(() => {
      this.loadLayout();
    }, 150);
  }

  ionViewWillUnload() {
    this.navCtrl.swipeBackEnabled = false;
    this.nativeProvider.allStop(this.device);
    this.events.unsubscribe('layout:send');
    this.events.unsubscribe(this.device.deviceName + ':state');
    this.events.unsubscribe('layout:delete');
    this.events.unsubscribe('layout:goto');
    this.unwatchNetWork();
    this.disconnectDevice();
  }

  async connectDevice() {
    // 连接设备
    if (this.device.config.mode == "net" || this.device.config.mode == "ble") {
      await this.deviceProvider.connectDevice(this.device);
    }
    window.clearInterval(this.heartbeatTimer);
    window.clearTimeout(this.heartbeatTimer2);
    if (this.device.config.mode == "ble") return;
    window.setTimeout(() => {
      this.deviceProvider.queryDevice(this.device);
    }, this.device.config.mode == "mqtt" ? 10 : 1000)
    // 心跳连接
    this.heartbeatTimer = window.setInterval(() => {
      // console.log('心跳');
      this.oldState = this.device.data.state;
      this.deviceProvider.queryDevice(this.device);
      this.heartbeatTimer2 = window.setTimeout(() => {
        this.changeDetectorRef.detectChanges();
      }, 2900)
    }, this.device.config.mode == "mqtt" ? 59001 : 29001)
  }

  disconnectDevice() {
    this.deviceProvider.disconnectDevice(this.device);
    window.clearInterval(this.heartbeatTimer);
    window.clearTimeout(this.heartbeatTimer2);
  }


  // reconnect() {
  //   if (this.device.data.state == 'disconnected')
  //     this.deviceProvider.connectDevice(this.device);
  // }

  watchNetWork() {
    // if (this.device.config.mode == 'mqtt') return;
    this.events.subscribe("network", networkState => {
      if (networkState == "connected") {
        console.log('layout2重连中');
        if (this.device.config.mode == 'mqtt') {
          window.setTimeout(() => {
            this.deviceProvider.queryDevice(this.device);
          }, 3000)
        } else {
          window.setTimeout(() => {
            this.connectDevice();
          }, 3000)
        }
      } else if (networkState == "disconnected") {
        console.log('layout2断开连接');
        if (this.device.config.mode == 'mqtt') {
          this.deviceProvider.queryDevice(this.device);
        } else {
          this.disconnectDevice();
        }
      }
    })
  }

  unwatchNetWork() {
    this.events.unsubscribe("network");
  }


  public margin = 5;
  initGrid() {
    this.options = {
      margin: this.margin,
      gridType: GridType.Fixed,
      fixedColWidth: 50,
      fixedRowHeight: 50,
      displayGrid: DisplayGrid.None,
      mobileBreakpoint: 0,
      outerMargin: true,
      outerMarginTop: 5,
      outerMarginBottom: 5,
      // outerMarginLeft: 5,
      // outerMarginRight: 5,
      minCols: 6,
      maxCols: 6,
      minRows: 10,
      maxRows: 10,
      maxItemCols: 6,
      minItemCols: 1,
      maxItemRows: 6,
      minItemRows: 1,
      maxItemArea: 60,
      minItemArea: 1,
      defaultItemCols: 1,
      defaultItemRows: 1,
      scrollSensitivity: 0,
      scrollSpeed: 0,
      ignoreMarginInRow: false,
      draggable: {
        enabled: false,
        // start: this.dragStart,
        // stop: this.dragStop
      },
      swap: false,
      pushItems: true,
      disableWindowResize: false,
      disableWarnings: false,
      scrollToNewItems: false,
      itemInitCallback: (GridsterItem, GridsterItemComponent) => this.iteminitCallback(GridsterItem, GridsterItemComponent)
    };
  }

  getSize(wh = 'height') {
    if (this.editMode) {
      this.clientHeight = this.gridsterBox.nativeElement.clientHeight - 75;
    } else {
      this.clientHeight = this.gridsterBox.nativeElement.clientHeight
    }
    this.clientWidth = this.gridsterBox.nativeElement.clientWidth;
    let length;
    if (wh == 'height') {
      length = (this.clientHeight - (this.margin) * 9 - 10) / 10;
    } else {
      length = (this.clientWidth - (this.margin) * 5) / 6;
    }
    return length;
  }

  public length;
  reSize() {
    // window.setTimeout(() => {
    this.length = this.getSize();
    let margin = (this.clientWidth - (this.length * 6) - (this.margin * 5)) / 2;
    if (margin < 0) {
      this.length = this.getSize('width') * 0.95;
      margin = (this.clientWidth - (this.length * 6) - (this.margin * 5)) / 2;
    }
    // console.log(this.length);
    this.options.gridType = GridType.Fixed;
    this.options.outerMarginLeft = margin;
    this.options.outerMarginRight = margin;
    this.options.fixedColWidth = this.length;
    this.options.fixedRowHeight = this.length;
    this.changedOptions();
    // }, 100)
  }

  public scaling;
  scale() {
    this.scaling = (this.gridsterBox.nativeElement.clientHeight - 75) / this.gridsterBox.nativeElement.clientHeight;
    this.render.setStyle(this.gridsterBox.nativeElement, 'transform', `scale(${this.scaling},${this.scaling})`);
  }

  rescale() {
    this.render.setStyle(this.gridsterBox.nativeElement, 'transform', `none`);
  }

  //显示使用向导
  async showGuide() {
    // if()
    if (typeof this.device.config.dashboard != "undefined") {
      if (this.device.config.dashboard.length == 0) {
        let modal = this.modalCtrl.create('Layout2GuidePage');
        modal.onDidDismiss(data => {
          if (data == 'loadExample1')
            this.loadExample();
        });
        modal.present();
      }
    }
  }

  loadExample() {
    let db = [
      `{"cols":2,"rows":2,"type":"btn","ico":"fal fa-smile-wink","t0":"文本1","t1":"点我开关灯","key":"btn-abc","x":2,"y":4,"lstyle":4,"color":"595959","mode":0,"custom":"","speech":[]}`,
      `{"cols":2,"rows":2,"type":"num","t0":"点击按键","ico":"fal fa-question","unit":"次","key":"num-abc","x":2,"y":1,"lstyle":3,"color":"595959"}`,
      `{"cols":2,"rows":1,"type":"btn","ico":"fal fa-power-off","t0":"点我计数","t1":"","key":"btn-123","x":2,"y":3,"lstyle":3,"color":"595959","mode":0,"custom":"","speech":[]}`,
    ]
    this.device.config.dashboard = db;
    this.loadLayout();
    this.saveLayout();
  }

  //加载组件
  loadLayout() {
    if (typeof (this.device.config.dashboard) != 'undefined') {
      let db = this.device.config.dashboard;
      // let timeout = 0;
      for (let component of db) {
        // timeout = timeout + 100;
        // setTimeout(() => {
        let ccomponent = JSON.parse(component);
        ccomponent['layouter'] = this;
        ccomponent['device'] = this.device;
        this.dashboard.push(ccomponent);
        if (ccomponent.type == 'deb') {
          this.hasDebug = true;
        }
        if (ccomponent.type == 'tim') {
          this.hasTiming = true;
        }
        if (ccomponent.type == 'num') {
          ccomponent['length'] = this.length;
        }
        // }, timeout);
      }
    }
  }

  //保存布局
  async saveLayout() {
    let db = this.processSaveData();
    // console.log(db);
    let dashboardConfig = {
      "dashboard": db
    }
    await this.userProvider.saveDeviceConfig(this.device, dashboardConfig);
    this.userProvider.loadConfig(this.device);
  }

  processSaveData() {
    let db = [];
    for (let component of this.dashboard) {
      // let ccomponent = JSON.parse(JSON.stringify(component));
      let ccomponent = Object.assign({}, component);
      delete ccomponent['layouter'];
      delete ccomponent['device'];
      delete ccomponent['self'];
      delete ccomponent['opts'];
      if (ccomponent.type == "num") {
        delete ccomponent['length'];
      }
      db.push(JSON.stringify(ccomponent))
    }
    return db;
  }

  showclearLayoutConfirm() {
    let confirm = this.alertCtrl.create({
      title: '清除界面布局',
      message: '清除布局数据后无法还原。',
      buttons: [
        {
          text: '取消',
          handler: () => {
          }
        },
        {
          text: '确认清除',
          handler: () => {
            this.clearLayout();
          }
        }
      ]
    });
    confirm.present();
  }

  async clearLayout() {
    let dashboardConfig = { "dashboard": [] }
    console.log(JSON.stringify(dashboardConfig));

    await this.userProvider.saveDeviceConfig(this.device, dashboardConfig);
    await this.userProvider.loadConfig(this.device);
    this.dashboard = [];
    this.hasDebug = false;
    this.hasTiming = false;
  }

  //删除组件
  delComponent(item) {
    this.dashboard.splice(this.dashboard.indexOf(item), 1);
    if (item.type == 'deb') {
      this.hasDebug = false;
    }
    if (item.type == 'tim') {
      this.hasTiming = false;
    }
  }

  //添加组件
  addComponent(type) {
    // 蓝牙模式，禁用定时
    if (type == 'tim' && this.device.config.mode == "ble") {
      this.events.publish("provider:notice", "canNotBeUsed");
      return;
    }
    let component = JSON.parse(configList[type])
    component['key'] = component.type + "-" + randomString();
    component['layouter'] = this;
    component['device'] = this.device;
    component['self'] = component;
    this.dashboard.push(component);
    if (type == 'deb') {
      this.hasDebug = true;
      component['key'] = 'debug';
    }
    if (type == 'tim') {
      this.hasTiming = true;
      component['key'] = 'timing';
    }
  }

  //检测组件是否成功放置，如未放置，删除数据并提示用户
  //此处有bug，但暂时不管
  iteminitCallback(GridsterItem, GridsterItemComponent) {
    if (this.editMode) {
      console.log(GridsterItemComponent);
      if (typeof GridsterItemComponent.notPlaced != "undefined") {
        if (GridsterItemComponent.notPlaced) {
          arrayRemove(this.dashboard, this.dashboard.length - 1);
          this.events.publish('provider:notice', 'notPlaced');

          if (GridsterItem.type == 'deb') {
            this.hasDebug = false;
          }
          if (GridsterItem.type == 'tim') {
            this.hasTiming = true;
          }
        }
      }
    }
  }

  editComponent(item) {
    if (this.editMode) {
      // console.log('push page')
      // this.navCtrl.push('Layout2ComponentSettingsPage', item);
      let modal = this.modalCtrl.create('Layout2EditcomponentPage', item);
      modal.present();
    }
  }

  lock() {
    this.editMode = false;
    this.navCtrl.swipeBackEnabled = false;
    // this.reSize();
    this.rescale();
    this.disableDrag();
    this.changeDetectorRef.detectChanges();
    this.saveLayout();
  }

  unlock() {
    this.editMode = true;
    this.navCtrl.swipeBackEnabled = false;
    // this.reSize();
    this.scale();
    this.enableDrag()
    this.changeDetectorRef.detectChanges();
  }

  enableDrag() {
    this.options.draggable.enabled = true;
    this.changedOptions();
  }

  disableDrag() {
    this.options.draggable.enabled = false;
    this.changedOptions();
  }

  changedOptions() {
    if (typeof this.options.api != 'undefined') {
      this.options.api.optionsChanged();
      this.options.api.resize();
    }
  }

  // 组件默认数据
  // 准备单独写一个配置文件存储

  inputs = {};
  outputs = {};

  componentList = {
    "tex": Layout2textComponent,
    "num": Layout2numberComponent,
    "btn": Layout2buttonComponent,
    "col": Layout2colorComponent,
    "ran": Layout2rangeComponent,
    "cha": Layout2chartComponent,
    "joy": Layout2joystickComponent,
    "deb": Layout2debugComponent,
    "tim": Layout2timerComponent,
    "vid": Layout2videoComponent,
  }

  buttonList = [
    { name: '文字', icon: 'fal fa-font', key: 'tex' },
    { name: '按键', icon: 'fal fa-circle', key: 'btn' },
    { name: '数据', icon: 'fal fa-tachometer', key: 'num' },
    { name: '滑块', icon: 'fal fa-sliders-v-square', key: 'ran' },
    { name: '颜色', icon: 'fal fa-palette', key: 'col' },
    { name: '摇杆', icon: 'fal fa-gamepad', key: 'joy' },
    // { name: '图表', icon: 'far fa-chart-bar', key: 'cha' },
    { name: '定时', icon: 'fal fa-stopwatch', key: 'tim' },
    // { name: '视频', icon: 'fal fa-camera-retro', key: 'vid' },
    { name: '调试', icon: 'fal fa-terminal', key: 'deb' },
  ]

  gotoSettings() {
    this.navCtrl.push('Layout2SettingsPage', this.device);
  }

  //未保存提示
  //1.有变更，提示保存
  alert;
  canExit = false;
  ionViewCanLeave() {
    if (!this.editMode) return true;
    if (!this.checkChanges()) return true;
    if (this.canExit) return true;
    this.unsavedAlert();
    return false;
  }

  checkChanges() {
    if (JSON.stringify(this.device.config.dashboard) == JSON.stringify(this.processSaveData()))
      return false;
    return true;
  }

  unsavedAlert() {
    // console.log(this.alert)
    // if (typeof (this.alert) == 'undefined') {
    let showAlert = false;
    if (this.alert) {
      if (this.alert._state == 4)
        showAlert = true
    } else {
      showAlert = true
    }
    if (showAlert) {
      this.alert = this.alertCtrl.create({
        title: '退出编辑模式',
        subTitle: '当前布局未保存，是否直接退出？',
        buttons: [
          {
            text: '取消',
            handler: data => {

              console.log('Cancel clicked');
            }
          },
          {
            text: '退出',
            handler: data => {
              console.log('Saved clicked');
              this.canExit = true;
              this.navCtrl.pop();
            }
          }
        ]
      });
      this.alert.present();
    }
  }

  gotoHomePage() {
    this.navCtrl.setRoot(TabsPage, this.deviceProvider.device);
  }

  //测试数据
  // this.dashboard = [
  // { x: 0, y: 0, cols: 6, rows: 1, type: "ran", layouter: this, key: 'ran1', device: this.device },
  // { x: 0, y: 1, cols: 1, rows: 6, type: "ran", layouter: this, key: 'ran2', device: this.device },
  // { x: 1, y: 1, cols: 3, rows: 3, type: "col", layouter: this, key: 'col1', device: this.device },
  // { x: 2, y: 2, cols: 4, rows: 4, type: "col", layouter: this, key: 'col2', device: this.device },
  // { x: 1, y: 1, cols: 2, rows: 1, type: "tex", title: "模块标题", content: "自定义模块内容", layouter: this, key: 'col1', device: this.device },
  // { x: 1, y: 1, cols: 2, rows: 1, type: "tex", title: "模块标题", layouter: this, key: 'col1', device: this.device },
  // { x: 1, y: 1, cols: 2, rows: 2, type: "tex", title: "模块标题", content: "自定义模块内容", layouter: this, key: 'col1', device: this.device },
  // { x: 3, y: 3, cols: 2, rows: 1, type: "num", value: "123", content: "温度", icon: "tint", unit: "℃", layouter: this, key: 'num1', device: this.device },
  // { x: 3, y: 5, cols: 2, rows: 1, type: "num", value: "33", content: "高度", layouter: this, key: 'num2', device: this.device },
  // { x: 5, y: 2, cols: 2, rows: 2, type: "num", value: "0", content: "湿度", unit: "%", layouter: this, key: 'num3', device: this.device },
  // { x: 5, y: 7, cols: 1, rows: 1, type: "btn", layouter: this, key: 'btn1', device: this.device, icon: "hand-point-up" },
  // { x: 4, y: 7, cols: 2, rows: 1, type: "btn", layouter: this, key: 'btn2', device: this.device, },
  // { x: 4, y: 7, cols: 2, rows: 2, type: "btn", layouter: this, key: 'btn2', device: this.device, }
  // ];

  // test() {
  //   console.log(this.device.data)
  // }
}
