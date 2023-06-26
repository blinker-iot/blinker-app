import {
  ModalController,
  Platform
} from '@ionic/angular';
import {
  Component,
  ViewChild,
  Renderer2,
  ElementRef,
  Input,
  EventEmitter,
} from '@angular/core';
import {
  DisplayGrid,
  GridsterConfig,
  GridsterItem,
  GridType,
} from 'angular-gridster2';

import { widgetList, configList, styleList } from './widgets/config'
import { arrayRemove, randomString } from 'src/app/core/functions/func';
import { DeviceService } from 'src/app/core/services/device.service';
import { NativeService } from 'src/app/core/services/native.service';
import { LayouterService } from '../layouter.service';
import { Layouter2GuidePage } from './guide/layouter2-guide';
import { Mode } from './layouter2-mode';
import { ActivatedRoute } from '@angular/router';
import { BackgroundComponent } from './background/background.component'
import { BlinkerDevice, DeviceComponent } from 'src/app/core/model/device.model';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';
import { ViewService } from 'src/app/core/services/view.service';
import { NoticeService } from 'src/app/core/services/notice.service';

@Component({
  selector: 'layouter2',
  templateUrl: 'layouter2.html',
  styleUrls: ['layouter2.scss'],
})
export class Layouter2 implements DeviceComponent {

  static deviceType = 'Layouter2';

  id;
  @Input() device: BlinkerDevice;

  loaded = false;
  get widgetList() {
    return widgetList
  }

  resizeEvent: EventEmitter<any> = new EventEmitter<any>();

  @Input() layouterData: string;

  defaultData = {
    version: '2.0.0',
    config: {
      headerColor: 'transparent',
      headerStyle: 'dark',
      background: {
        img: 'assets/img/headerbg.jpg',
        isFull: false
      }
    },
    dashboard: [],
    actions: [],
    triggers: []
  }

  demoDashboard = [
    { "type": "btn", "ico": "fad fa-siren-on", "mode": 0, "t0": "点我开关灯", "clr": "#389BEE", "t1": "文本2", "bg": 0, "cols": 2, "rows": 2, "key": "btn-abc", "x": 6, "y": 1, "speech": [], "lstyle": 0 },
    { "type": "tex", "t0": "blinker入门示例", "t1": "文本2", "bg": 2, "ico": "", "cols": 4, "rows": 1, "key": "tex-272", "x": 0, "y": 0, "speech": [], "lstyle": 1, "clr": "#FFF" },
    { "type": "num", "t0": "点击按键", "ico": "fad fa-american-sign-language-interpreting", "clr": "#389BEE", "min": 0, "max": 100, "uni": "次", "bg": 0, "cols": 4, "rows": 2, "key": "num-abc", "x": 0, "y": 1, "speech": [], "lstyle": 1 },
    { "type": "btn", "ico": "fad fa-hand-point-down", "mode": 0, "t0": "点我计数", "t1": "文本2", "bg": 0, "cols": 2, "rows": 2, "key": "btn-123", "x": 4, "y": 1, "speech": [], "lstyle": 0, "clr": "#389BEE" },
    { "type": "deb", "mode": 0, "bg": 0, "cols": 8, "rows": 3, "key": "debug", "x": 0, "y": 3 }
  ]

  demoActions = [
    {
      "cmd": { "switch": "on" },
      "text": "打开?name"
    },
    {
      "cmd": { "switch": "off" },
      "text": "关闭?name"
    }
  ]

  demoTriggers = [
    {
      "source": "switch",
      "source_zh": "开关状态",
      "state": ["on", "off"],
      "state_zh": ["打开", "关闭"]
    }
  ]

  get dashboard(): Array<GridsterItem> {
    if (typeof this.device.data['layouterData'] == 'undefined')
      return []
    return this.device.data['layouterData']['dashboard']
  }

  set dashboard(dashboard: Array<GridsterItem>) {
    this.device.data['layouterData']['dashboard'] = dashboard
  }

  get config() {
    if (typeof this.device.data['layouterData'] == 'undefined')
      return {
        "headerColor": 'transparent',
        "headerStyle": 'dark',
        "background": {
          img: 'assets/img/headerbg.jpg',
          isFull: false
        },
      }
    return this.device.data['layouterData']['config']
  }

  set config(config) {
    this.device.data['layouterData']['config'] = config
  }

  margin = 5;

  options: GridsterConfig = {
    margin: this.margin,
    outerMargin: true,
    // gridType: GridType.Fixed,
    gridType: GridType.ScrollVertical,
    displayGrid: DisplayGrid.None,
    mobileBreakpoint: 0,
    outerMarginLeft: 13,
    outerMarginRight: 13,
    minCols: 8,
    maxCols: 8,
    minRows: 14,
    maxRows: 20,
    maxItemCols: 8,
    minItemCols: 1,
    maxItemRows: 8,
    minItemRows: 1,
    maxItemArea: 64,
    minItemArea: 1,
    defaultItemCols: 1,
    defaultItemRows: 1,
    // 多层配置
    allowMultiLayer: true,
    defaultLayerIndex: 1,
    baseLayerIndex: 2,
    maxLayerIndex: 2,
    // 
    scrollSensitivity: 0,
    scrollSpeed: 0,
    ignoreMarginInRow: false,
    draggable: {
      enabled: false
    },
    resizable: {
      enabled: false
    },
    swap: true,
    swapWhileDragging: true,
    pushItems: false,
    disableWindowResize: false,
    disableWarnings: false,
    scrollToNewItems: false,
    itemInitCallback: (GridsterItem, GridsterItemComponent) => this.iteminitCallback(GridsterItem, GridsterItemComponent),
    itemResizeCallback: (item) => this.resizeEvent.emit(item)
  };

  @Input()
  public set mode(mode: Mode) {
    this.LayouterService.mode = mode
  }

  public get mode() {
    return this.LayouterService.mode
  }

  public hasDebug = false;
  public hasTiming = false;
  public hasVideo = false;

  oldState;

  @ViewChild('gridsterBox', { read: ElementRef, static: true }) gridsterBox: ElementRef;
  @ViewChild('backgroundimg', { read: ElementRef, static: true }) backgroundimg: ElementRef;

  // detectChangesTimer;
  heartbeatTimer;
  heartbeatTimer2;
  clientHeight;
  clientWidth;

  actionSubject;

  get isSharedDevice() {
    return this.device.config.isShared
  }

  get isDiyDevice() {
    return this.device.config.isDiy
  }

  realtimeDataTimer;

  constructor(
    private activatedRoute: ActivatedRoute,
    private render: Renderer2,
    private modalCtrl: ModalController,
    private deviceService: DeviceService,
    private nativeService: NativeService,
    private LayouterService: LayouterService,
    private platform: Platform,
    private deviceListService: DeviceConfigService,
    private viewService: ViewService,
    private noticeService: NoticeService
  ) {
  }

  ngOnInit() {
    this.id = this.activatedRoute.snapshot.params['id'];
    try {
      this.initLayouter2();
    } catch (error) {
      this.noticeService.showToast('界面配置数据错误，请清空界面后重新配置')
    }
    // 实时数据连接;
    this.deviceService.queryRealtimeData(this.device);
    if (typeof this.device.data['layouterData'].rt != 'undefined') {
      if (this.device.data['layouterData'].rt.length > 0) {
        this.realtimeDataTimer = window.setInterval(() => {
          this.deviceService.queryRealtimeData(this.device);
        }, 9000)
      }
    }
  }

  ngAfterViewInit() {
    this.nativeService.init();
    this.viewService.disableSwipeBack();
    this.actionSubject = this.LayouterService.action.subscribe(async act => {
      if (act.name == 'cleanWidgets') this.cleanWidgets();
      else if (act.name == 'addWidget') this.addWidget(act.data)
      else if (act.name == 'delWidget') this.delWidget(act.data);
      else if (act.name == 'changeWidget') this.changedOptions();
      else if (act.name == 'changeMode') {
        this.mode = act.data;
        switch (this.mode) {
          case Mode.Edit:
            this.EditMode()
            break;
          case Mode.EditBackground:
            this.EditBackgroundMode()
            break;
          default:
            this.DefaultMode()
            break;
        }
      } else if (act.name == 'changeBackground') {
        this.backgroundChanged(act.data)
      } else if (act.name == 'send') {
        this.deviceService.sendData(this.device, act.data);
      }

    })
    setTimeout(() => {
      this.checkBackground();
      // this.options.api.resize();
      this.getBgPosition();
    }, 50);
  }

  ngOnDestroy() {
    this.LayouterService.mode = Mode.Default;
    this.viewService.enableSwipeBack();
    clearInterval(this.realtimeDataTimer);
    this.destroy();
  }

  bgPosition;

  getBgPosition() {
    let csstext = document.querySelectorAll('.gridster-row')[2]['style']['cssText'];
    // console.log('csstext:', csstext);
    this.bgPosition = `${Number(csstext.substring(22, csstext.indexOf('px'))) + (this.platform.is('cordova') ? 72 : 52)}px`;
    let length = csstext.substring(csstext.lastIndexOf('height:') + 7, csstext.lastIndexOf('px'));
    this.LayouterService.gridLength = parseFloat(length);
    this.LayouterService.gridMargin = this.margin;
  }

  initLayouter2() {
    this.loadLayouterData();
    this.initGrid();
  }

  destroy() {
    this.nativeService.allStop(this.device);
    this.actionSubject.unsubscribe();
  }

  initGrid() {
    this.changedOptions();
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
    if (this.isSharedDevice || !this.isDiyDevice) return
    let modal = await this.modalCtrl.create({
      component: Layouter2GuidePage,
      cssClass: 'modal'
    });
    modal.onDidDismiss().then(result => {
      if (result.data == 'loadExample1') {
        this.defaultData.dashboard = this.demoDashboard;
        this.defaultData.actions = this.demoActions;
        this.defaultData.triggers = this.demoTriggers;
        this.layouterData = JSON.stringify(this.defaultData);
        this.loadLayouterData();
        let layouterDataConfig = {
          "layouter": JSON.stringify(this.device.data['layouterData'])
        }
        this.deviceService.saveDeviceConfig(this.device, layouterDataConfig).then(result => {
          this.device.config['layouter'] = this.layouterData;
          if (result)
            this.noticeService.showToast('importSuccess');
        });
      }
    });
    modal.present();
  }

  loadLayouterData() {
    if (this.layouterData == 'null' || this.layouterData == null || this.layouterData == '') {
      this.device.data['layouterData'] = this.defaultData;
    } else {
      this.device.data['layouterData'] = JSON.parse(this.layouterData);
    }

    if (this.dashboard.length == 0)
      this.showGuide();
    else {
      for (let component of this.dashboard) {
        if (component.type == 'deb') {
          this.hasDebug = true;
        }
        if (component.type == 'tim') {
          this.hasTiming = true;
        }
        if (component.type == 'vid') {
          this.hasVideo = true;
        }
      }
      this.loadRealtimeData()
    }
    console.log(this.device.data['layouterData']);

    this.loaded = true;
    this.LayouterService.updateConfig.next();
  }

  // 加载实时数据
  loadRealtimeData() {
    this.device.data['layouterData']['rt'] = this.dashboard.filter(widget => {
      return widget['rt']
    }).map(widget => widget['key'])
  }

  loadProDevice() {
    this.deviceListService.deviceConfigs[this.device.deviceType]
  }

  //清空组件
  async cleanWidgets() {
    this.dashboard = [];
    this.hasDebug = false;
    this.hasVideo = false;
    this.hasTiming = false;
  }

  //删除组件
  delWidget(item) {
    this.dashboard.splice(this.dashboard.indexOf(item), 1);
    if (item.type == 'deb') {
      this.hasDebug = false;
    }
    if (item.type == 'tim') {
      this.hasTiming = false;
    }
  }

  //添加组件
  addWidget(type) {
    // 蓝牙模式，禁用定时
    // if (type == 'tim' && this.device.config.mode == "ble") {
    //   this.noticeService.showToast('canNotBeUsed');
    //   return;
    // }
    let component = Object.assign({}, configList[type], styleList[type][0])
    component['key'] = component.type + "-" + randomString();
    this.dashboard.push(component);
    if (type == 'deb') {
      this.hasDebug = true;
      component['key'] = 'debug';
    } else if (type == 'vid') {
      this.hasVideo = true;
      component['key'] = 'video';
    } else if (type == 'tim') {
      this.hasTiming = true;
      component['key'] = 'timing';
    }
  }

  //检测组件是否成功放置，如未放置，删除数据并提示用户
  //此处有bug，但暂时不管
  iteminitCallback(GridsterItem, GridsterItemComponent) {
    if (this.mode == Mode.Edit) {
      if (typeof GridsterItemComponent.notPlaced != "undefined") {
        if (GridsterItemComponent.notPlaced) {
          arrayRemove(this.dashboard, this.dashboard.length - 1);
          this.noticeService.showToast('notPlaced');
          if (GridsterItem.type == 'deb') {
            this.hasDebug = false;
          }
          if (GridsterItem.type == 'tim') {
            this.hasTiming = false;
          }
          if (GridsterItem.type == 'vid') {
            this.hasVideo = false;
          }
        }
      }
    }
  }

  DefaultMode() {
    this.rescale();
    this.disableDrag();
    // 重新加载实时数据
    this.loadRealtimeData()
  }

  EditMode() {
    this.scale();
    this.enableDrag()
  }

  async EditBackgroundMode() {
    this.rescale();
    let modal = await this.modalCtrl.create({
      component: BackgroundComponent
    })
    modal.present();
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
    if (this.options.api) {
      this.options.api.optionsChanged();
    }
  }

  get isChanged() {
    if (this.device.config.layouter == JSON.stringify(this.layouterData))
      return false;
    return true;
  }

  checkBackground() {
    if (this.config['headerStyle'] == 'light') {
      this.viewService.setDarkStatusBar();
    }
  }

  backgroundChanged(background) {
    if (background.img == '' || background.headerStyle == 'light') {
      this.config['headerStyle'] = 'light';
      this.viewService.setDarkStatusBar();
    }
    else {
      this.config['headerStyle'] = 'dark';
      this.viewService.setLightStatusBar();
    }

    this.config['background']['img'] = background.img;
    this.config['background']['isFull'] = background.isFull;
    this.LayouterService.updateConfig.next();
  }

}
