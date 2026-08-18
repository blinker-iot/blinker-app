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
  Gridster,
  GridsterConfig,
  GridsterItemConfig,
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
import { BlinkerDevice, DeviceComponent } from 'src/app/core/model/device.model';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';
import { ViewService } from 'src/app/core/services/view.service';
import { NoticeService } from 'src/app/core/services/notice.service';

@Component({
  standalone: false,
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
    { "type": "btn", "ico": "fad fa-siren-on", "mode": 0, "t0": "点我开关灯", "clr": "#389BEE", "t1": "文本2", "bg": 0, "cols": 2, "rows": 2, "key": "btn-abc", "x": 6, "y": 1, "lstyle": 0 },
    { "type": "tex", "t0": "blinker入门示例", "t1": "文本2", "bg": 2, "ico": "", "cols": 4, "rows": 1, "key": "tex-272", "x": 0, "y": 0, "lstyle": 1, "clr": "#FFF" },
    { "type": "num", "t0": "点击按键", "ico": "fad fa-american-sign-language-interpreting", "clr": "#389BEE", "min": 0, "max": 100, "uni": "次", "bg": 0, "cols": 4, "rows": 2, "key": "num-abc", "x": 0, "y": 1, "lstyle": 1 },
    { "type": "btn", "ico": "fad fa-hand-point-down", "mode": 0, "t0": "点我计数", "t1": "文本2", "bg": 0, "cols": 2, "rows": 2, "key": "btn-123", "x": 4, "y": 1, "lstyle": 0, "clr": "#389BEE" },
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

  get dashboard(): Array<GridsterItemConfig> {
    if (typeof this.device.data['layouterData'] == 'undefined')
      return []
    return this.device.data['layouterData']['dashboard']
  }

  set dashboard(dashboard: Array<GridsterItemConfig>) {
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
    scale: 1,
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
      // Keep Gridster's native listeners attached. Edit mode is gated by the
      // handle element, which only exists while the layout is being edited.
      enabled: true,
      ignoreContent: true,
      dragHandleClass: 'layouter2-drag-handle',
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
    const nextMode = mode ?? Mode.Default;
    if (this.currentMode === nextMode) {
      return;
    }
    this.currentMode = nextMode;
    this.applyMode();
  }

  public get mode(): Mode {
    return this.currentMode;
  }

  private currentMode = Mode.Default;
  private appliedMode?: Mode;
  private viewReady = false;

  public hasDebug = false;
  public hasTiming = false;
  public hasVideo = false;

  oldState;

  @ViewChild('gridsterBox', { read: ElementRef, static: true }) gridsterBox: ElementRef;
  @ViewChild('backgroundimg', { read: ElementRef, static: true }) backgroundimg: ElementRef;
  @ViewChild(Gridster) gridster?: Gridster;

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
    return this.device.config.isDiy || this.device.config.isPreview
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
    private noticeService: NoticeService,
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
    if (!this.device.config.isPreview) {
      this.deviceService.queryRealtimeData(this.device, this.device.data['layouterData']);
    }
    if (!this.device.config.isPreview && typeof this.device.data['layouterData'].rt != 'undefined') {
      if (this.device.data['layouterData'].rt.length > 0) {
        this.realtimeDataTimer = window.setInterval(() => {
          this.deviceService.queryRealtimeData(this.device, this.device.data['layouterData']);
        }, 9000)
      }
    }
  }

  ngAfterViewInit() {
    this.nativeService.init();
    this.viewService.disableSwipeBack();
    this.viewReady = true;
    this.applyMode();
    this.actionSubject = this.LayouterService.action.subscribe(async act => {
      if (act.name == 'cleanWidgets') this.cleanWidgets();
      else if (act.name == 'addWidget') this.addWidget(act.data)
      else if (act.name == 'delWidget') this.delWidget(act.data);
      else if (act.name == 'changeWidget') this.changedOptions();
      else if (act.name == 'showGuide') {
        this.showGuide()
      } else if (act.name == 'send') {
        this.sendWidgetData(act.data);
      }

    })
    setTimeout(() => {
      // this.options.api.resize();
      this.getBgPosition();
    }, 50);
  }

  ngOnDestroy() {
    this.viewReady = false;
    this.viewService.enableSwipeBack();
    clearInterval(this.realtimeDataTimer);
    this.destroy();
  }

  bgPosition;

  getBgPosition() {
    const width = this.gridsterBox.nativeElement.clientWidth || window.innerWidth;
    const gridLength = Math.max(1, (width - 26 - (7 * this.margin)) / 8);
    const height = this.gridsterBox.nativeElement.clientHeight || gridLength * 14;
    this.bgPosition = `${height + (this.platform.is('cordova') ? 72 : 52)}px`;
    this.LayouterService.gridLength = gridLength;
    this.LayouterService.gridMargin = this.margin;
  }

  initLayouter2() {
    this.loadLayouterData();
    this.initGrid();
  }

  destroy() {
    this.nativeService.allStop(this.device);
    this.actionSubject?.unsubscribe();
  }

  initGrid() {
    this.changedOptions();
  }

  public scaling;
  scale() {
    const height = this.gridsterBox.nativeElement.clientHeight;
    const nextScale = height > 75 ? (height - 75) / height : 1;
    this.scaling = Number.isFinite(nextScale) && nextScale > 0
      ? nextScale
      : 1;
    this.options = {
      ...this.options,
      scale: this.scaling,
    };
    this.render.setStyle(this.gridsterBox.nativeElement, 'transform', `scale(${this.scaling},${this.scaling})`);
  }

  rescale() {
    this.options = {
      ...this.options,
      scale: 1,
    };
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
        this.device.config['layouter'] = this.layouterData;
        if (this.device.config.isPreview) {
          this.device.subject.next({ key: 'layouter', value: this.layouterData });
          this.noticeService.showToast('importSuccess');
        } else {
          this.deviceService.saveDeviceConfig(this.device, layouterDataConfig).then(result => {
            if (result)
              this.noticeService.showToast('importSuccess');
          });
        }
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
        if (component['type'] == 'deb') {
          this.hasDebug = true;
        }
        if (component['type'] == 'tim') {
          this.hasTiming = true;
        }
        if (component['type'] == 'vid') {
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

  private applyMode(): void {
    if (!this.viewReady || this.appliedMode === this.currentMode) {
      return;
    }

    if (this.currentMode === Mode.Edit) {
      this.EditMode();
    } else {
      this.DefaultMode();
    }
    this.appliedMode = this.currentMode;
  }

  enableDrag() {
    this.options = {
      ...this.options,
      draggable: {
        ...this.options.draggable,
        enabled: true,
        ignoreContent: true,
        dragHandleClass: 'layouter2-drag-handle',
      },
    };
    this.refreshGridsterOptions();
  }

  disableDrag() {
    // The edit-only drag handle disappears in default mode. Keeping the
    // listener enabled avoids the fragile runtime detach/reattach path in
    // angular-gridster2 while still preventing any non-edit drag.
    this.options = {
      ...this.options,
      draggable: {
        ...this.options.draggable,
        enabled: true,
        ignoreContent: true,
        dragHandleClass: 'layouter2-drag-handle',
      },
    };
    this.refreshGridsterOptions();
  }

  private refreshGridsterOptions(): void {
    // Let Angular publish the new options input first. Calling detectChanges
    // synchronously from an input setter re-entered the parent click change
    // detection and could leave edit mode half-applied.
    queueMicrotask(() => {
      if (this.viewReady) this.gridster?.api.calculateLayout();
    });
  }

  changedOptions() {
    // Gridster v22 observes the options input by reference. The legacy
    // optionsChanged() API no longer exists, so publish a fresh object.
    this.options = { ...this.options };
  }

  get isChanged() {
    return this.device.config.layouter !== JSON.stringify(this.device.data['layouterData']);
  }

  private sendWidgetData(rawData: string) {
    if (!this.device.config.isPreview) {
      this.deviceService.sendData(this.device, rawData);
      return;
    }

    try {
      const payload = JSON.parse(rawData.trim());
      Object.entries(payload).forEach(([key, value]) => {
        const currentValue = this.device.data[key];
        if (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
          if (typeof value === 'number') currentValue.val = value;
          else if (value === 'on' || value === 'off') currentValue.swi = value;
          else currentValue.val = value;
        } else {
          this.device.data[key] = value;
        }
        this.device.subject.next({ key, value });
      });
    } catch (error) {
      console.warn('Invalid preview widget payload', rawData, error);
    }
  }

}
