import { ModalController, Platform } from "@ionic/angular";
import {
  Component,
  ElementRef,
  Input,
  Renderer2,
  ViewChild,
} from "@angular/core";
import { DisplayGrid, GridsterConfig, GridType } from "angular-gridster2";

import { configList, widgetList } from "./widgets/config";
import { arrayRemove, isJson, randomString } from "src/app/core/functions/func";
import { DeviceService } from "src/app/core/services/device.service";
import { NativeService } from "src/app/core/services/native.service";
import { ActivatedRoute } from "@angular/router";
import {
  BlinkerDevice,
  DeviceComponent,
} from "src/app/core/model/device.model";
import { DeviceConfigService } from "src/app/core/services/device-config.service";
import { ViewService } from "src/app/core/services/view.service";
import { NoticeService } from "src/app/core/services/notice.service";
import { Layouter2Service } from "./layouter2.service";
import { DefaultLayouterData } from "./layouter.config";
import { WidgetEditor } from "./widget-editor2/widget-editor";

@Component({
  selector: "layouter2",
  templateUrl: "layouter2.html",
  styleUrls: ["layouter2.scss"],
})
export class Layouter2Component implements DeviceComponent {
  static deviceType = "Layouter2";

  get layouterData() {
    return this.layouterService.layouterData;
  }

  id;
  @Input()
  device: BlinkerDevice;

  @ViewChild("LayouterBox", { read: ElementRef, static: true })
  LayouterBox: ElementRef;

  loaded = false;
  get widgetList() {
    return widgetList;
  }

  defaultData = JSON.parse(JSON.stringify(DefaultLayouterData));

  get dashboard(): any {
    return this.layouterData.dashboard;
  }

  set dashboard(dashboard) {
    this.layouterData.dashboard = dashboard;
  }

  get gridSize() {
    return this.layouterService.gridSize;
  }

  options: GridsterConfig = {
    margin: 8,
    outerMargin: true,
    gridType: GridType.Fixed,
    displayGrid: DisplayGrid.None,
    mobileBreakpoint: 0,
    outerMarginLeft: 13,
    outerMarginRight: 13,
    // 界面尺寸
    minCols: 8,
    maxCols: 8,
    minRows: 14,
    maxRows: 20,
    fixedColWidth: this.gridSize,
    fixedRowHeight: this.gridSize,
    // 组件尺寸
    maxItemCols: 8,
    minItemCols: 1,
    maxItemRows: 20,
    minItemRows: 1,
    maxItemArea: 1000,
    minItemArea: 1,
    defaultItemCols: 1,
    defaultItemRows: 1,
    // 多层配置
    allowMultiLayer: true,
    defaultLayerIndex: 3,
    baseLayerIndex: 1,
    maxLayerIndex: 9,

    scrollSensitivity: 0,
    scrollSpeed: 0,
    ignoreMarginInRow: false,
    draggable: {
      enabled: false,
    },
    resizable: {
      enabled: false,
    },
    swap: true,
    swapWhileDragging: false,
    pushItems: false,
    scrollToNewItems: false,
    disableAutoPositionOnConflict: false,
    itemInitCallback: (GridsterItem, GridsterItemComponent) =>
      this.iteminitCallback(GridsterItem, GridsterItemComponent),
  };

  get mode() {
    return this.layouterService.mode;
  }

  public hasDebug = false;
  public hasTiming = false;
  public hasVideo = false;

  oldState;

  heartbeatTimer;
  heartbeatTimer2;
  clientHeight;
  clientWidth;

  actionSubject;

  get isSharedDevice() {
    return this.device.config.isShared;
  }

  get isDiyDevice() {
    return this.device.config.isDiy;
  }

  realtimeDataTimer;

  selectedWidget = null;

  get backgroundCss() {
    return this.layouterService.backgroundCss;
  }

  constructor(
    private activatedRoute: ActivatedRoute,
    private render: Renderer2,
    private modalCtrl: ModalController,
    private deviceService: DeviceService,
    private nativeService: NativeService,
    private layouterService: Layouter2Service,
    private deviceListService: DeviceConfigService,
    private viewService: ViewService,
    private noticeService: NoticeService,
  ) {
  }

  ngOnInit() {
    this.id = this.activatedRoute.snapshot.params["id"];
    try {
      this.initLayouter2();
    } catch (error) {
      this.noticeService.showToast("界面配置数据错误，请清空界面后重新配置");
    }
    // 实时数据连接;
    this.deviceService.queryRealtimeData(this.device, this.layouterData);
    if (typeof this.layouterData["rt"] != "undefined") {
      if (this.layouterData["rt"].length > 0) {
        this.realtimeDataTimer = window.setInterval(() => {
          this.deviceService.queryRealtimeData(this.device, this.layouterData);
        }, 9000);
      }
    }
    this.listenIframe();
  }

  ngAfterViewInit() {
    this.nativeService.init();
    this.viewService.disableSwipeBack();
    this.actionSubject = this.layouterService.action.subscribe(async (act) => {
      // console.log('layouter2 action:', act);
      switch (act.name) {
        case "addWidget":
          this.addWidget(act.data);
          break;
        case "delWidget":
          this.delWidget(act.data);
          break;
        case "changeWidget":
          this.changedOptions();
          break;
        case "cleanWidgets":
          this.cleanWidgets();
          break;
        case "enterEditMode":
          this.enterEditMode();
          break;
        case "exitEditMode":
          this.exitEditMode();
          break;
        case "selectWidget":
          this.selectWidget(act);
          break;
        case "send":
          this.deviceService.sendData(this.device, act.data);
          break;
        default:
          break;
      }
    });
  }

  ngOnDestroy() {
    this.viewService.enableSwipeBack();
    clearInterval(this.realtimeDataTimer);
    this.destroy();
  }

  enterEditMode() {
    this.scale();
    this.enableDrag();
  }

  exitEditMode() {
    this.selectedWidget = null;
    this.rescale();
    this.disableDrag();
    // 重新加载实时数据
    this.loadRealtimeData();
  }

  initLayouter2() {
    this.loadLayouterData();
    this.initGrid();
  }

  destroy() {
    this.unlistenMessage();
    this.nativeService.allStop(this.device);
    this.actionSubject.unsubscribe();
  }

  initGrid() {
    this.changedOptions();
  }

  scaling;
  isScale;
  scale() {
    this.isScale = true;
    this.scaling =
      (screen.height - (this.viewService.statusBarHeight + 45 + 65 + 10)) /
      screen.height;
    this.render.setStyle(
      this.LayouterBox.nativeElement,
      "transform",
      `scale(${this.scaling}) translateY(${-90}px)`,
    );
  }

  rescale() {
    this.isScale = false;
    this.render.setStyle(this.LayouterBox.nativeElement, "transform", `none`);
  }

  loadLayouterData() {
    if (this.layouterData) {
      this.device.data["layouterData"] = JSON.parse(
        JSON.stringify(this.layouterData),
      );
    } else {
      this.device.data["layouterData"] = JSON.parse(
        JSON.stringify(DefaultLayouterData),
      );
    }
    if (this.dashboard.length == 0) {
      this.layouterService.action.next({ name: "showGuide" });
    } else {
      for (let component of this.dashboard) {
        if (component.type == "deb") {
          this.hasDebug = true;
        }
        if (component.type == "tim") {
          this.hasTiming = true;
        }
        if (component.type == "vid") {
          this.hasVideo = true;
        }
      }
      this.loadRealtimeData();
    }

    this.loaded = true;
    this.layouterService.updateConfig.next("");
  }

  // 加载实时数据
  loadRealtimeData() {
    this.layouterData["rt"] = this.dashboard.filter((widget) => {
      return widget["rt"];
    }).map((widget) => widget["key"]);
  }

  loadProDevice() {
    this.deviceListService.deviceConfigs[this.device.deviceType];
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
    this.selectedWidget = null;
    if (this.dashboard.indexOf(item) == -1) return;
    this.dashboard.splice(this.dashboard.indexOf(item), 1);
    if (item.type == "deb") {
      this.hasDebug = false;
    }
    if (item.type == "tim") {
      this.hasTiming = false;
    }
  }

  //添加组件
  addWidget(type) {
    let component = Object.assign({
      // background: JSON.parse(JSON.stringify(DefaultBackgroundCss)),
    }, configList[type]);
    // component['background']['justify-content'] =
    //   component['background']['align-items']
    //   = JSON.parse(JSON.stringify(DefaultBackgroundCss))
    component["key"] = component.type + "-" + randomString();
    this.dashboard.push(component);
    console.log("addWidget:", component);
  }

  async editWidget(widget, dom) {
    let top = this.selectedDom.getBoundingClientRect().top;
    if (top > 70) {
      this.render.setStyle(
        this.LayouterBox.nativeElement,
        "transform",
        `scale(${this.scaling}) translateY(${-80 + 100 -
        this.selectedDom.getBoundingClientRect().top
        }px)`,
      );
    }

    let modal = await this.modalCtrl.create({
      component: WidgetEditor,
      initialBreakpoint: 0.6,
      componentProps: {
        "widget": widget,
        "device": this.device,
        "dom": dom,
      },
    });
    modal.present();
    modal.onWillDismiss().then(() => {
      this.render.setStyle(
        this.LayouterBox.nativeElement,
        "transform",
        `scale(${this.scaling}) translateY(${-80}px)`,
      );
    });
  }

  //检测组件是否成功放置，如未放置，删除数据并提示用户
  //此处有bug，但暂时不管
  iteminitCallback(GridsterItem, GridsterItemComponent) {
    if (typeof GridsterItemComponent.notPlaced != "undefined") {
      if (GridsterItemComponent.notPlaced) {
        arrayRemove(this.dashboard, this.dashboard.length - 1);
        this.noticeService.showToast("notPlaced");
        if (GridsterItem.type == "deb") {
          this.hasDebug = false;
        }
        if (GridsterItem.type == "tim") {
          this.hasTiming = false;
        }
        if (GridsterItem.type == "vid") {
          this.hasVideo = false;
        }
      }
    }
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
    if (this.device.config.layouter == JSON.stringify(this.layouterData)) {
      return false;
    }
    return true;
  }

  selectedDom;

  selectWidget(act) {
    if (act.dom) {
      this.selectedDom = act.dom;
    }
    if (this.selectedWidget == act.data) {
      this.editWidget(act.data, act.dom);
    } else {
      this.selectedWidget = act.data;
      this.changedOptions();
    }
  }

  // IFRAME通信
  unlistenMessage;
  listenIframe() {
    this.unlistenMessage = this.render.listen(window, "message", (e) => {
      console.log(e.data);
      // 判断发出数据是否为json
      if (isJson(JSON.stringify(e.data))) {
        this.deviceService.sendData(this.device, e.data);
      } else {
        this.noticeService.showToast("组件发送数据格式错误");
      }
    });
  }
}
