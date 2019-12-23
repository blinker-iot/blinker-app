import {
  ModalController,
  AlertController,
  Events,
  Platform
} from '@ionic/angular';
import {
  Component,
  ViewChild,
  Renderer2,
  ElementRef,
  ChangeDetectorRef,
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

import { arrayRemove, randomString, deviceName12 } from 'src/app/core/functions/func';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { NativeService } from 'src/app/core/services/native.service';
import { Layouter2Service } from './layouter2.service';
import { Layouter2GuidePage } from './guide/layouter2-guide';
import { Mode } from './layouter2-mode';
import { ActivatedRoute } from '@angular/router';
import { parse } from 'zipson';
import { DeviceComponent } from '../device.model';
import { DevicelistService } from '../../services/devicelist.service';


// interface LayouterData {
//   config: {
//     headerColor: string,
//     headerStyle: string,
//     background: {
//       img: string,
//       isFull: boolean
//     },
//   },
//   dashboard: any[]
// }

@Component({
  selector: 'layouter2',
  templateUrl: 'layouter2.html',
  styleUrls: ['layouter2.scss'],
})
export class Layouter2 implements DeviceComponent {

  static deviceType = 'Layouter2';

  id;
  @Input() device:BlinkerDevice;

  loaded = false;
  get widgetList() {
    return widgetList
  }

  options: GridsterConfig;
  resizeEvent: EventEmitter<any> = new EventEmitter<any>();

  @Input() layouterData:string;

  defaultData = {
    "config": {
      "headerColor": 'transparent',
      "headerStyle": 'light',
      "background": {
        img: 'assets/img/headerbg.jpg',
        isFull: false
      },
    },
    "dashboard": []
  }

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
        "headerStyle": 'light',
        "background": {
          img: 'assets/img/headerbg.jpg',
          isFull: false
        },
      }
    // console.log(this.device.data['layouterData']['config'].background.isFull);
      
    return this.device.data['layouterData']['config']
  }

  set config(config) {
    this.device.data['layouterData']['config'] = config
  }

  @Input()
  public set mode(mode: Mode) {
    if (mode == Mode.Edit) this.EditMode();
    else if (mode == Mode.Default) this.DefaultMode();
    else if (mode == Mode.EditBackground) this.EditBackgroundMode();
    this.layouter2Service.mode = mode
    // this.changeDetectorRef.detectChanges();
  }

  public get mode() {
    return this.layouter2Service.mode
  }

  public hasDebug = false;
  public hasTiming = false;

  oldState;

  @ViewChild('gridsterBox', { read: ElementRef, static: true }) gridsterBox: ElementRef;
  @ViewChild('backgroundimg', { read: ElementRef, static: true }) backgroundimg: ElementRef;

  // detectChangesTimer;
  heartbeatTimer;
  heartbeatTimer2;
  clientHeight;
  clientWidth;

  get isSharedDevice() {
    return this.device.config.isShared
  }

  get isDiyDevice() {
    return this.device.config.isDiy
  }

  constructor(
    private activatedRoute: ActivatedRoute,
    private render: Renderer2,
    private events: Events,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private deviceService: DeviceService,
    private userService: UserService,
    private nativeService: NativeService,
    private changeDetectorRef: ChangeDetectorRef,
    private layouter2Service: Layouter2Service,
    private platform: Platform,
    private deviceListService: DevicelistService
  ) {
  }

  ngOnInit() {
    this.id = this.activatedRoute.snapshot.params['id'];
    this.initLayouter2();
  }

  ngAfterViewInit() {
    this.nativeService.init();
    this.events.publish("swipeEnable", false)
    this.events.subscribe('layouter2', (act, data) => {
      if (act == 'cleanWidgets') this.cleanWidgets();
      else if (act == 'addWidget') this.addWidget(data)
      else if (act == 'delWidget') this.delWidget(data);
      else if (act == 'changeWidget') this.changedOptions();
      else if (act == 'changeMode') this.mode = data;
      else if (act == 'send') this.deviceService.sendData(this.device, data);
    })
    // this.events.subscribe(this.device.deviceName + ':state', data => {
    //   this.changeDetectorRef.detectChanges();
    // })
    setTimeout(() => {
      this.getBgPosition()
    }, 50);
    // this.detectChangesTimer = setInterval(() => {
    //   this.changeDetectorRef.detectChanges();
    // }, 1111)
  }

  ngOnDestroy() {
    this.layouter2Service.mode = Mode.Default;
    // clearInterval(this.detectChangesTimer);
    this.events.publish("swipeEnable", true)
    this.destroy();
  }

  bgPosition;

  getBgPosition() {
    let csstext = document.querySelectorAll('.gridster-row')[2]['style']['cssText'];
    this.bgPosition = `${Number(csstext.substring(22, csstext.indexOf('px'))) + (this.platform.is('cordova') ? 72 : 52)}px`;
    let length = csstext.substring(csstext.lastIndexOf('height:') + 7, csstext.lastIndexOf('px'));
    this.layouter2Service.gridLength = parseFloat(length);
    this.layouter2Service.gridMargin = this.margin;
  }

  initLayouter2() {
    this.loadLayouterData();
    this.initGrid();
  }

  destroy() {
    this.nativeService.allStop(this.device);
    this.events.unsubscribe('layouter2');
    // this.events.unsubscribe(this.device.deviceName + ':state');
  }

  public margin = 5;
  initGrid() {
    this.options = {
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
      maxRows: 16,
      maxItemCols: 8,
      minItemCols: 1,
      maxItemRows: 8,
      minItemRows: 1,
      maxItemArea: 64,
      minItemArea: 1,
      defaultItemCols: 1,
      defaultItemRows: 1,
      scrollSensitivity: 0,
      scrollSpeed: 0,
      ignoreMarginInRow: false,
      draggable: {
        enabled: false
      },
      swap: false,
      pushItems: true,
      disableWindowResize: false,
      disableWarnings: false,
      scrollToNewItems: false,
      itemInitCallback: (GridsterItem, GridsterItemComponent) => this.iteminitCallback(GridsterItem, GridsterItemComponent),
      itemResizeCallback: (item) => this.resizeEvent.emit(item)
    };
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
        this.layouterData = JSON.stringify(parse(`{¨config¨{¨headerColor¨¨transparent¨¨headerStyle¨¨light¨¨background¨{¨img¨¨assets/img/headerbg.jpg¨¨isFull¨«}}¨dashboard¨|{¨type¨¨btn¨¨ico¨¨fal fa-power-off¨¨mode¨É¨t0¨¨点我开关灯¨¨t1¨¨文本2¨¨bg¨É¨cols¨Ë¨rows¨Ë¨key¨¨btn-abc¨´x´Ï´y´Ê¨speech¨|÷¨lstyle¨É}{ßA¨tex¨ßF¨blinker入门示例¨ßHßIßJËßC´´ßKÍßLÊßM¨tex-272¨´x´É´y´ÉßO|÷ßPÊ¨clr¨¨#FFF¨}{ßA¨num¨ßF¨点击按键¨ßC¨fal fa-comment-dots¨ßT¨#389BEE¨¨min¨É¨max¨¢1c¨uni¨´次´ßJÉßKËßLËßM¨num-abc¨´x´É´y´ÊßO|÷}{ßAßBßC¨fal fa-pencil-alt¨ßEÉßF¨点我计数¨ßHßIßJÉßKËßLËßM¨btn-123¨´x´Í´y´ÊßO|÷ßPÉßT¨#595959¨}÷}`))
        this.loadLayouterData();
        let layouterDataConfig = {
          "layouter": JSON.stringify(this.device.data['layouterData'])
        }
        this.deviceService.saveDeviceConfig(this.device, layouterDataConfig).then(result => {
          this.device.config['layouter'] = this.layouterData;
          if (result) this.events.publish("provider:notice", "importSuccess")
        });
      }
    });
    modal.present();
  }

  loadLayouterData() {
    // console.log(this.layouterData);
    if (this.layouterData == null) {
      this.device.data['layouterData'] = this.defaultData;
    } else {
      this.device.data['layouterData'] = JSON.parse(this.layouterData);
    }
    if (this.dashboard.length == 0)
      this.showGuide();
    for (let component of this.dashboard) {
      if (component.type == 'deb') {
        this.hasDebug = true;
      }
      if (component.type == 'tim') {
        this.hasTiming = true;
      }
    }
    this.loaded = true;
  }

  loadProDevice() {
    this.deviceListService.deviceConfig[this.device.deviceType]
  }

  //清空组件
  async cleanWidgets() {
    this.dashboard = [];
    this.hasDebug = false;
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
    if (type == 'tim' && this.device.config.mode == "ble") {
      this.events.publish("provider:notice", "canNotBeUsed");
      return;
    }
    let component = Object.assign({}, configList[type], styleList[type][0])
    component['key'] = component.type + "-" + randomString();
    // component['layouter'] = this;
    // component['device'] = this.device;
    // component['self'] = component;
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
    if (this.mode == Mode.Edit) {
      console.log(GridsterItemComponent);
      if (typeof GridsterItemComponent.notPlaced != "undefined") {
        if (GridsterItemComponent.notPlaced) {
          arrayRemove(this.dashboard, this.dashboard.length - 1);
          this.events.publish('provider:notice', 'notPlaced');

          if (GridsterItem.type == 'deb') {
            this.hasDebug = false;
          }
          if (GridsterItem.type == 'tim') {
            this.hasTiming = false;
          }
        }
      }
    }
  }

  DefaultMode() {
    this.rescale();
    this.disableDrag();
  }

  EditMode() {
    this.scale();
    this.enableDrag()
  }

  EditBackgroundMode() {
    this.rescale();
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
    // if (this.options.api && this.options.api.optionsChanged) {
    if (this.options.api) {
      // setTimeout(() => {
        this.options.api.optionsChanged();
      // })
    }
  }

  get isChanged() {
    if (this.device.config.layouter == JSON.stringify(this.layouterData))
      return false;
    return true;
  }

  backgroundChanged(background) {
    this.config['background']['img'] = background.img;
    this.config['background']['isFull'] = background.isFull;
  }

}
