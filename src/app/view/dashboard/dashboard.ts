import { Component, ViewChild, Renderer2, ElementRef, ViewChildren, QueryList } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { DataService } from 'src/app/core/services/data.service';
import { DisplayGrid, GridsterConfig, GridType } from 'angular-gridster2';
import { ViewService } from 'src/app/core/services/view.service';

@Component({
  selector: 'page-dashboard',
  templateUrl: 'dashboard.html',
  styleUrls: ['dashboard.scss']
})
export class DashboardPage {

  editMode = false

  options: GridsterConfig = {
    margin: 5,
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
    // itemInitCallback: (GridsterItem, GridsterItemComponent) => this.iteminitCallback(GridsterItem, GridsterItemComponent),
    // itemResizeCallback: (item) => this.resizeEvent.emit(item)
  };

  dashboardData = [
    { "type": "tex", "mode": 0, "t0": "点我开关灯", "clr": "#389BEE", "text": "文本", "cols": 4, "rows": 1, "key": "btn-abc", "x": 0, "y": 0 },
    { "type": "btn", "ico": "fad fa-siren-on", "mode": 0, "t0": "点我开关灯", "clr": "#389BEE", "t1": "文本2", "bg": 0, "cols": 2, "rows": 2, "key": "btn-abc", "x": 6, "y": 0 },
    { "type": "btn", "ico": "fad fa-siren-on", "mode": 0, "t0": "点我开关灯", "clr": "#389BEE", "t1": "文本2", "bg": 0, "cols": 2, "rows": 2, "key": "btn-abc", "x": 0, "y": 0 },
    { "type": "btn", "ico": "fad fa-siren-on", "mode": 0, "t0": "点我开关灯", "clr": "#389BEE", "t1": "文本2", "bg": 0, "cols": 2, "rows": 2, "key": "btn-abc", "x": 2, "y": 0, },
    { "type": "btn", "ico": "fad fa-siren-on", "mode": 0, "t0": "点我开关灯", "clr": "#389BEE", "t1": "文本2", "bg": 0, "cols": 2, "rows": 2, "key": "btn-abc", "x": 4, "y": 0 },
    { "type": "btn", "ico": "fad fa-siren-on", "mode": 0, "t0": "点我开关灯", "clr": "#389BEE", "t1": "文本2", "bg": 0, "cols": 2, "rows": 2, "key": "btn-abc", "x": 0, "y": 2, },
    { "type": "sli", "dir": "x", "tex": "测试", "ico": "fad fa-american-sign-language-interpreting", "clr": "#389BEE", "min": 0, "max": 100, "uni": "次", "bg": 0, "cols": 4, "rows": 2, "key": "num-abc", "x": 0, "y": 4, "speech": [], "lstyle": 1 },
    { "type": "sli", "dir": "y", "tex": "测试", "ico": "fad fa-american-sign-language-interpreting", "clr": "#ff4f4f", "min": 0, "max": 100, "uni": "次", "bg": 0, "cols": 2, "rows": 4, "key": "num-abc", "x": 4, "y": 2, "speech": [], "lstyle": 1 },
    { "type": "btn", "ico": "fad fa-hand-point-down", "mode": 0, "t0": "点我计数", "t1": "文本2", "bg": 0, "cols": 2, "rows": 2, "key": "btn-123", "x": 2, "y": 2, "speech": [], "lstyle": 0, "clr": "#389BEE" }
  ]

  constructor(
    public modalCtrl: ModalController,
    public render: Renderer2,
    public userService: UserService,
    private dataService: DataService,
    private viewService: ViewService,
  ) {

  }
  subscription;
  loaded = false;

  mode = 'default';  // edit

  ngOnInit(): void {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.loaded = loaded
      }
    })
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.changedOptions();
    }, 50);

  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe()
  }


  lock() {
    this.disableDrag()
    console.log(JSON.stringify(this.dashboardData));
    this.mode = 'default'
  }

  unlock() {
    this.enableDrag()
    this.mode = 'edit'
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
      console.log('changedOptions');
      this.options.api.optionsChanged();
    }
  }


  // 弹出视图模式菜单
  changeView() {
    this.viewService.changeView();
  }

}
