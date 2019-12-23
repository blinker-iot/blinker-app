import { Component, ViewChild, Renderer2, ElementRef, ViewChildren, QueryList } from '@angular/core';
import { ModalController, Events } from '@ionic/angular';
// import Sortable from 'sortablejs';
import { UserService } from 'src/app/core/services/user.service';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'page-dashboard',
  templateUrl: 'dashboard.html',
})
export class DashboardPage {

  showBlockList = false;
  editMode = false;
  oldBlockListData;

  delSelected = 99;

  @ViewChildren("sortbox") sortbox: QueryList<ElementRef>;

  // block type三种类型：
  // swi:开关按键
  // num1:数据1组
  // num2:数组2组
  // txt:文字数据

  get blockList() {
    return this.dataService.block
  }

  set blockList(newblockList) {
    this.dataService.block = newblockList
  }

  // blockList = {
  // order: [],
  // data: {}
  // "order": ['abcde', 'ghjkl'],
  // "data": {
  //   'abcde': { deviceName: "C2B62032KKFZ", txt: "温度", ico: "fal fa-question", key: "temp", type: "num1", unit: "℃" },
  //   'ghjkl': { deviceName: "C2B62032KKFZ", txt: "开关", ico: "fal fa-question", key: "switch", type: "swi" }
  // }
  // }

  // groupList = ["照明设备", "室内数据", "办公室"]
  // groupData = {
  //   "照明设备": ['abcdef'],
  //   "室内数据": ['ghjkl'],
  //   "办公室": [],
  // }
  // blockData = {
  //   // 'qwert': { deviceName: "C2B62032KKFZ", txt: "温度", ico: "fal fa-question", key: "temp", type: "num1", unit: "℃" },
  //   'abcdef': { deviceName: "C2B62032KKFZ", txt: "温度", ico: "fal fa-question", key: "temp", type: "num1", unit: "℃" },
  //   'ghjkl': { deviceName: "C2B62032KKFZ", txt: "开关", ico: "fal fa-question", key: "switch", type: "swi" }
  // }

  // @ViewChild(Content,{ read: ElementRef, static: true }) content: Content;
  @ViewChild('dashboardbox',{ read: ElementRef, static: true }) dashboardbox: ElementRef;

  constructor(

    private events: Events,
    public modalCtrl: ModalController,
    public render: Renderer2,
    public userService: UserService,
    private dataService: DataService
  ) {
    this.oldBlockListData = JSON.stringify(this.blockList)
  }

  ngAfterViewInit(): void {
    this.initSortable()
  }

  gotoSettings() {

  }

  unlock() {
    this.editMode = true;
  }

  lock() {
    this.editMode = false;
    if (this.oldBlockListData == JSON.stringify(this.blockList)) return;
    this.saveConfig();
  }

  saveConfig() {
    let userConfig = {
      "blockList": this.blockList
    }
    this.userService.saveUserConfig(userConfig);
  }

  restorePosition() {
    this.render.setStyle(this.dashboardbox.nativeElement, 'top', '0px');
  }

  showAddBlockModal(e) {
    this.showBlockList = true;
    this.render.setStyle(this.dashboardbox.nativeElement, 'position', 'absolute');
    this.render.setStyle(this.dashboardbox.nativeElement, 'top', `${-e.srcElement.offsetTop + 10}px`);
    // let modal = this.modalCtrl.create('DashboardAddblockPage');
    // modal.onDidDismiss(data => {
    //   this.restorePosition();
    //   this.showBlockList = false;
    // });
    // modal.present();
  }

  delBlock(blockId, index) {
    if (index > -1) this.blockList.list.splice(index, 1);
    delete this.blockList.dict[blockId];
  }

  sortable;
  initSortable() {
    // this.sortable = new Sortable(this.dashboardbox.nativeElement, {
    //   handle: ".handle",
    //   animation: 150,
    //   chosenClass: "schosen",
    //   dragClass: "sdrag",
    //   dataIdAttr: "id",
    //   draggable: '.dashboard-block',
    //   // filter: ".block-add",
    //   scroll: false,
    //   onEnd: (event: any) => {
    //     this.saveList();
    //   },
    // });

  }

  saveList() {
    console.log(this.sortable.toArray());
    this.blockList.list = this.sortable.toArray();
  }

  changeView() {
    this.events.publish('changeView', '')
  }

}
