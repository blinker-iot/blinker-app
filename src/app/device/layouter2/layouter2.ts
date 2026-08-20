import { IonicModule, ModalController, Platform } from '@ionic/angular';
import {
  ChangeDetectorRef,
  Component,
  ViewChild,
  ElementRef,
  Input,
  EventEmitter,
  TemplateRef,
} from '@angular/core';
import {
  DisplayGrid,
  Gridster,
  GridsterConfig,
  GridsterItem,
  GridsterItemConfig,
  GridType,
} from 'angular-gridster2';
import { Observable, of } from 'rxjs';

import { widgetList, configList, styleList } from './widgets/config';

import { arrayRemove, randomString } from 'src/app/core/functions/func';
import { DeviceService } from 'src/app/core/services/device.service';
import { NativeService } from 'src/app/core/services/native.service';
import { LayouterService } from '../layouter.service';
import { Layouter2GuidePage } from './guide/layouter2-guide';
import { Mode } from './layouter2-mode';
import { ActivatedRoute } from '@angular/router';
import {
  BlinkerDevice,
  DeviceComponent,
} from 'src/app/core/model/device.model';
import { ViewService } from 'src/app/core/services/view.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { ParentDynamicComponent } from './widgets/parentDynamic.component';
import { WidgetListbarComponent } from './widget-listbar/widget-listbar.component';
import { replaceDashboardWidget } from './widget-update';
import { normalizeTextWidget } from './widgets/widget-text/widget-text-layout';

@Component({
  standalone: true,
  selector: 'app-layouter2',
  templateUrl: 'layouter2.html',
  styleUrls: ['layouter2.scss'],
  imports: [
    IonicModule,
    Gridster,
    GridsterItem,
    ParentDynamicComponent,
    WidgetListbarComponent,
  ],
})
export class Layouter2Component implements DeviceComponent {
  static deviceType = 'Layouter2';

  id;
  @Input() device: BlinkerDevice;

  loaded = false;
  get widgetList() {
    return widgetList;
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
        isFull: false,
      },
    },
    dashboard: [],
    actions: [],
    triggers: [],
  };

  demoDashboard = [
    {
      type: 'btn',
      ico: 'fad fa-siren-on',
      mode: 0,
      t0: '点我开关灯',
      clr: '#389BEE',
      t1: '文本2',
      cols: 2,
      rows: 2,
      key: 'btn-abc',
      x: 6,
      y: 1,
      lstyle: 0,
    },
    {
      type: 'tex',
      t0: 'blinker入门示例',
      size: 14,
      align: 'left',
      cols: 4,
      rows: 1,
      key: 'tex-272',
      x: 0,
      y: 0,
      lstyle: 1,
    },
    {
      type: 'num',
      t0: '点击按键',
      ico: 'fad fa-american-sign-language-interpreting',
      clr: '#389BEE',
      min: 0,
      max: 100,
      uni: '次',
      cols: 4,
      rows: 2,
      key: 'num-abc',
      x: 0,
      y: 1,
      lstyle: 1,
    },
    {
      type: 'btn',
      ico: 'fad fa-hand-point-down',
      mode: 0,
      t0: '点我计数',
      t1: '文本2',
      cols: 2,
      rows: 2,
      key: 'btn-123',
      x: 4,
      y: 1,
      lstyle: 0,
      clr: '#389BEE',
    },
    { type: 'deb', mode: 0, cols: 8, rows: 3, key: 'debug', x: 0, y: 3 },
  ];

  demoActions = [
    {
      cmd: { switch: 'on' },
      text: '打开?name',
    },
    {
      cmd: { switch: 'off' },
      text: '关闭?name',
    },
  ];

  demoTriggers = [
    {
      source: 'switch',
      source_zh: '开关状态',
      state: ['on', 'off'],
      state_zh: ['打开', '关闭'],
    },
  ];

  get dashboard(): Array<GridsterItemConfig> {
    if (typeof this.device.data['layouterData'] == 'undefined') return [];
    return this.device.data['layouterData']['dashboard'];
  }

  set dashboard(dashboard: Array<GridsterItemConfig>) {
    this.device.data['layouterData']['dashboard'] = dashboard;
  }

  get config() {
    if (typeof this.device.data['layouterData'] == 'undefined')
      return {
        headerColor: 'transparent',
        headerStyle: 'dark',
        background: {
          img: 'assets/img/headerbg.jpg',
          isFull: false,
        },
      };
    return this.device.data['layouterData']['config'];
  }

  set config(config) {
    this.device.data['layouterData']['config'] = config;
  }

  margin = 5;

  options: GridsterConfig = {
    margin: 8,
    outerMargin: true,
    // gridType: GridType.Fixed,
    gridType: GridType.ScrollVertical,
    // ScrollVertical needs Gridster to publish the content height.
    // Its generated width is overridden in the component stylesheet.
    setGridSize: true,
    displayGrid: DisplayGrid.None,
    mobileBreakpoint: 0,
    outerMarginTop: 0,
    outerMarginLeft: 16,
    outerMarginRight: 16,
    minCols: 8,
    maxCols: 8,
    minRows: 14,
    maxRows: 50,
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
      enabled: false,
    },
    swap: true,
    swapWhileDragging: true,
    pushItems: true,
    disableWindowResize: false,
    disableWarnings: false,
    scrollToNewItems: false,
    itemInitCallback: (GridsterItem, GridsterItemComponent) =>
      this.iteminitCallback(GridsterItem, GridsterItemComponent),
    itemResizeCallback: (item) => this.resizeEvent.emit(item),
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
  private dashboardRefreshPending = false;
  private oldLayouterData = '';

  public hasDebug = false;
  public hasVideo = false;

  oldState;

  @ViewChild('gridsterBox', { read: ElementRef, static: true })
  gridsterBox: ElementRef;
  @ViewChild('headerActions', { static: true })
  headerActions: TemplateRef<unknown>;
  @ViewChild(Gridster) gridster?: Gridster;

  // detectChangesTimer;
  heartbeatTimer;
  heartbeatTimer2;
  clientHeight;
  clientWidth;

  actionSubject;

  get isSharedDevice() {
    return this.device.config.isShared;
  }

  get canEditLayout(): boolean {
    return !!this.device && !this.device.config.isShared;
  }

  realtimeDataTimer;

  constructor(
    private activatedRoute: ActivatedRoute,
    private modalCtrl: ModalController,
    private deviceService: DeviceService,
    private nativeService: NativeService,
    private LayouterService: LayouterService,
    private platform: Platform,
    private viewService: ViewService,
    private noticeService: NoticeService,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.id = this.activatedRoute.snapshot.params['id'];
    try {
      this.initLayouter2();
    } catch (error) {
      this.noticeService.showToast('界面配置数据错误，请清空界面后重新配置');
    }
    // 实时数据连接;
    if (!this.device.config.isPreview) {
      this.deviceService.queryRealtimeData(
        this.device,
        this.device.data['layouterData']
      );
    }
    if (
      !this.device.config.isPreview &&
      typeof this.device.data['layouterData'].rt != 'undefined'
    ) {
      if (this.device.data['layouterData'].rt.length > 0) {
        this.realtimeDataTimer = window.setInterval(() => {
          this.deviceService.queryRealtimeData(
            this.device,
            this.device.data['layouterData']
          );
        }, 9000);
      }
    }
  }

  ngAfterViewInit() {
    this.nativeService.init();
    this.viewService.disableSwipeBack();
    this.viewReady = true;
    this.applyMode();
    this.actionSubject = this.LayouterService.action.subscribe(async (act) => {
      if (act.name == 'addWidget') this.addWidget(act.data);
      else if (act.name == 'delWidget') this.delWidget(act.data);
      else if (act.name == 'changeWidget') this.changedOptions(act.data);
      else if (act.name == 'showGuide') {
        this.showGuide();
      } else if (act.name == 'send') {
        this.sendWidgetData(act.data);
      }
    });
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
    const width =
      this.gridsterBox.nativeElement.clientWidth || window.innerWidth;
    const gridLength = Math.max(1, (width - 26 - 7 * this.margin) / 8);
    const height =
      this.gridsterBox.nativeElement.clientHeight || gridLength * 14;
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

  //显示使用向导
  async showGuide() {
    if (this.isSharedDevice) return;
    let modal = await this.modalCtrl.create({
      component: Layouter2GuidePage,
      cssClass: 'modal',
    });
    modal.onDidDismiss().then((result) => {
      if (result.data == 'loadExample1') {
        this.defaultData.dashboard = this.demoDashboard;
        this.defaultData.actions = this.demoActions;
        this.defaultData.triggers = this.demoTriggers;
        this.layouterData = JSON.stringify(this.defaultData);
        this.loadLayouterData();
        let layouterDataConfig = {
          layouter: JSON.stringify(this.device.data['layouterData']),
        };
        this.device.config['layouter'] = this.layouterData;
        if (this.device.config.isPreview) {
          this.device.subject.next({
            key: 'layouter',
            value: this.layouterData,
          });
          this.noticeService.showToast('importSuccess');
        } else {
          this.deviceService
            .saveDeviceConfig(this.device, layouterDataConfig)
            .then((result) => {
              if (result) this.noticeService.showToast('importSuccess');
            });
        }
      }
    });
    modal.present();
  }

  loadLayouterData() {
    if (
      this.layouterData == 'null' ||
      this.layouterData == null ||
      this.layouterData == ''
    ) {
      this.device.data['layouterData'] = this.defaultData;
    } else {
      this.device.data['layouterData'] = JSON.parse(this.layouterData);
    }

    this.dashboard = (this.dashboard ?? []).map((widget) =>
      normalizeTextWidget(widget)
    );

    if (this.dashboard.length == 0) this.showGuide();
    else {
      for (let component of this.dashboard) {
        if (component['type'] == 'deb') {
          this.hasDebug = true;
        }
        if (component['type'] == 'vid') {
          this.hasVideo = true;
        }
      }
      this.loadRealtimeData();
    }
    console.log(this.device.data['layouterData']);

    this.loaded = true;
    this.LayouterService.updateConfig.next();
  }

  // 加载实时数据
  loadRealtimeData() {
    this.device.data['layouterData']['rt'] = this.dashboard
      .filter((widget) => {
        return widget['rt'];
      })
      .map((widget) => widget['key']);
  }

  //清空组件
  async cleanWidgets() {
    this.dashboard = [];
    this.hasDebug = false;
    this.hasVideo = false;
  }

  unlock(): void {
    if (!this.canEditLayout) return;
    this.oldLayouterData = JSON.stringify(this.device?.data?.layouterData);
    this.changeLayoutMode(Mode.Edit);
  }

  lock(): void {
    this.changeLayoutMode(Mode.Default);
    this.saveLayouterData();
  }

  canDeactivate(): Observable<boolean> | boolean {
    if (this.mode !== Mode.Edit || !this.isChanged) return true;
    return of(window.confirm('界面布局未保存，是否放弃保存并退出？'));
  }

  private changeLayoutMode(mode: Mode): void {
    this.mode = mode;
  }

  private saveLayouterData(): void {
    if (!this.device?.data?.layouterData) return;

    const data = JSON.stringify(this.device.data.layouterData);
    if (this.oldLayouterData === data) return;
    this.device.config.layouter = data;
    this.oldLayouterData = data;

    if (this.device.config.isPreview) {
      this.device.subject.next({ key: 'layouter', value: data });
      return;
    }

    this.deviceService
      .saveDeviceConfig(this.device, { layouter: data })
      .then((result) => {
        if (result) this.deviceService.loadDeviceLayouter(this.device);
      });
  }

  //删除组件
  delWidget(item) {
    const itemIndex = this.dashboard.indexOf(item);
    if (itemIndex === -1) return;

    this.dashboard = this.dashboard.filter((_, index) => index !== itemIndex);
    if (item.type == 'deb') {
      this.hasDebug = false;
    }
    if (item.type == 'vid') {
      this.hasVideo = false;
    }
    this.scheduleDashboardRefresh();
  }

  //添加组件
  addWidget(type) {
    let component = Object.assign({}, configList[type], styleList[type][0]);
    component['key'] = component.type + '-' + randomString();
    if (type == 'deb') {
      this.hasDebug = true;
      component['key'] = 'debug';
    } else if (type == 'vid') {
      this.hasVideo = true;
      component['key'] = 'video';
    }
    this.dashboard = [...this.dashboard, component];
    this.scheduleDashboardRefresh();
  }

  private scheduleDashboardRefresh(): void {
    if (this.dashboardRefreshPending) return;

    this.dashboardRefreshPending = true;
    queueMicrotask(() => {
      this.dashboardRefreshPending = false;
      if (!this.viewReady) return;

      // Widget additions are emitted by the sibling toolbar through a
      // service, so explicitly refresh this dynamically-created view before
      // the browser paints. Recalculate once after Angular creates the item.
      this.changeDetectorRef.detectChanges();
      this.gridster?.api.calculateLayout();
    });
  }

  //检测组件是否成功放置，如未放置，删除数据并提示用户
  //此处有bug，但暂时不管
  iteminitCallback(GridsterItem, GridsterItemComponent) {
    if (this.mode == Mode.Edit) {
      if (typeof GridsterItemComponent.notPlaced != 'undefined') {
        if (GridsterItemComponent.notPlaced) {
          arrayRemove(this.dashboard, this.dashboard.length - 1);
          this.noticeService.showToast('notPlaced');
          if (GridsterItem.type == 'deb') {
            this.hasDebug = false;
          }
          if (GridsterItem.type == 'vid') {
            this.hasVideo = false;
          }
        }
      }
    }
  }

  DefaultMode() {
    this.disableDrag();
    // 重新加载实时数据
    this.loadRealtimeData();
  }

  EditMode() {
    this.enableDrag();
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

  changedOptions(changedWidget?) {
    // Gridster v22 observes the options input by reference. The legacy
    // optionsChanged() API no longer exists, so publish a fresh object.
    this.options = { ...this.options };

    if (typeof changedWidget === 'undefined') return;

    const updatedDashboard = replaceDashboardWidget(
      this.dashboard,
      changedWidget
    );
    if (typeof updatedDashboard === 'undefined') return;

    // Gridster v22 caches item dimensions by input identity. Publish a new
    // item reference so changed rows/cols are observed and rendered.
    this.dashboard = updatedDashboard;
    this.scheduleDashboardRefresh();
  }

  get isChanged() {
    return (
      this.device.config.layouter !==
      JSON.stringify(this.device.data['layouterData'])
    );
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
        if (
          currentValue &&
          typeof currentValue === 'object' &&
          !Array.isArray(currentValue)
        ) {
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
