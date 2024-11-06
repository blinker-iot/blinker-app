import { Component, Input, Output, EventEmitter, ChangeDetectorRef, ViewChildren, QueryList, ElementRef, Renderer2 } from '@angular/core';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'widget-buttonlist',
  templateUrl: 'widget-buttonlist.html',
  styleUrls: ['widget-buttonlist.scss']
})
export class widgetButtonListComponent {

  _device;
  @Input()
  set device(device) {
    this._device = device;
    this.getButtonList();
  }
  get device() {
    return this._device;
  }
  @Input() maxAct = 1;

  @Output() update = new EventEmitter();

  buttonList = [];
  actList = [];

  @ViewChildren('widgetItem') demoList: QueryList<ElementRef>;

  constructor(
    public alertCtrl: AlertController,
    public changeDetectorRef: ChangeDetectorRef,
    public renderer: Renderer2
  ) { }

  ngAfterViewInit() {
    this.getButtonList();
  }

  getButtonList() {
    this.buttonList = [];
    this.actList = [];
    if (this.device.config.layouter == null) return;    
    let dashboard = JSON.parse(this.device.config.layouter).dashboard;
    console.log(dashboard);

    for (let widget of dashboard) {
      if (widget.type == "btn") {
        this.buttonList.push(widget);
      }
    }
    this.changeDetectorRef.detectChanges();
    // this.resizeDemo();
  }

  //动态调整demo组件的尺寸
  // length = 38;
  // margin = 5;
  // resizeDemo() {
  //   let i = 0;
  //   for (let demo of this.demoList.toArray()) {
  //     if (typeof this.buttonList[i].lstyle == 'undefined') this.buttonList[i].lstyle = 0;
  //     let cols = styleList.btn[this.buttonList[i].lstyle].cols;
  //     let rows = styleList.btn[this.buttonList[i].lstyle].rows;
  //     let width = cols * this.length + ((cols - 1) * this.margin);
  //     let height = (rows * this.length) + ((rows - 1) * this.margin);
  //     this.renderer.setStyle(demo.nativeElement, 'width', `${width}px`);
  //     this.renderer.setStyle(demo.nativeElement, 'height', `${height}px`);
  //     i++;
  //   }
  // }

  isSelected(btn) {
    if (this.actList.length == 0) return false;
    for (let btnAct of this.actList) {
      if (typeof JSON.parse(btnAct)[btn.key] != 'undefined')
        return true
      // let index = btnAct.indexOf(btn.key);
      // if (index > -1) {
      //   return true
      // }
    }
  }


  changeAction(i) {
    if (this.maxAct == 1) {
      this.changeAction1(i)
    } else if (this.maxAct == 2) {
      this.changeAction2(i)
    }
  }

  changeAction1(i) {
    let act;
    if (typeof this.buttonList[i].mode == "undefined") {
      this.buttonList[i]['mode'] = 0
    }
    if (this.buttonList[i].mode == 0) {
      act = `{"${this.buttonList[i].key}":"tap"}`
    } else if (this.buttonList[i].mode == 1) {
      this.showBtnAction(i);
      return;
    } else {
      act = `{"${this.buttonList[i].key}":"${this.buttonList[i].cus}"}`
    }
    this.actList[0] = act;
    this.update.emit(this.actList);
  }

  changeAction2(i) {
    // 删除动作
    let n = 0;
    for (let btnAct of this.actList) {
      console.log(this.buttonList[i].key)
      console.log(btnAct)
      let index = btnAct.indexOf(this.buttonList[i].key)
      if (index > -1) {
        console.log(index)
        this.actList.splice(n, 1);
        // console.log('删除动作')
        // console.log(this.actList)
        this.update.emit(this.actList);
        return;
      }
      n++;
    }
    // 添加动作
    if (this.actList.length > 1) {
      //只能添加两个动作
      return;
    }
    let act;
    // console.log(this.buttonList[i].mode)
    if (typeof this.buttonList[i].mode == "undefined") {
      this.buttonList[i]['mode'] = 0
    }
    if (this.buttonList[i].mode == 0) {
      act = `{"${this.buttonList[i].key}":"tap"}`
    } else if (this.buttonList[i].mode == 1) {
      this.showBtnAction(i);
      return;
    } else {
      act = `{"${this.buttonList[i].key}":"${this.buttonList[i].custom}"}`
      // act = this.buttonList[i].custom
    }
    // actJson[this.buttonList[i].key] = act;
    this.actList.push(act);
    this.update.emit(this.actList);
  }

  async showBtnAction(i) {
    let act;
    let alert = await this.alertCtrl.create({
      header: '选择动作',
      buttons: [
        {
          text: '打开',
          handler: () => {
            act = `{"${this.buttonList[i].key}":"on"}`
          }
        }, {
          text: '关闭',
          handler: () => {
            act = `{"${this.buttonList[i].key}":"off"}`
          }
        }
      ]
    })
    alert.present();
    alert.onDidDismiss().then(() => {
      this.actList[0] = act;
      this.update.emit(this.actList);
    });
  }

}
