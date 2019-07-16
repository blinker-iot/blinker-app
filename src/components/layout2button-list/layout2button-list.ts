import { Component, Input, Output, EventEmitter, ChangeDetectorRef, ViewChildren, QueryList, ElementRef, Renderer2 } from '@angular/core';
import { AlertController, Events } from 'ionic-angular';
import { styleList } from '../../components/layout.component';

@Component({
  selector: 'layout2button-list',
  templateUrl: 'layout2button-list.html'
})
export class Layout2buttonListComponent {

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

  @ViewChildren('demo') demoList: QueryList<ElementRef>;

  constructor(
    public alertCtrl: AlertController,
    public events: Events,
    public changeDetectorRef: ChangeDetectorRef,
    public renderer: Renderer2
  ) { }

  // ngAfterViewInit() {
  //   this.getButtonList();
  // }

  getButtonList() {
    this.buttonList = [];
    this.actList = [];
    for (let item of this.device.config.dashboard) {
      let ccomponent = JSON.parse(item);
      if (ccomponent.type == "btn") {
        this.buttonList.push(ccomponent);
      }
    }
    this.changeDetectorRef.detectChanges();
    this.resizeDemo();
  }

  //动态调整demo组件的尺寸
  length = 55;
  margin = 5;
  resizeDemo() {
    let i = 0;
    for (let demo of this.demoList.toArray()) {
      if (typeof this.buttonList[i].lstyle == 'undefined') this.buttonList[i].lstyle = 0;
      let cols = styleList.btn[this.buttonList[i].lstyle].cols;
      let rows = styleList.btn[this.buttonList[i].lstyle].rows;
      let width = cols * this.length + ((cols - 1) * this.margin);
      let height = (rows * this.length) + ((rows - 1) * this.margin);
      this.renderer.setStyle(demo.nativeElement, 'width', `${width}px`);
      this.renderer.setStyle(demo.nativeElement, 'height', `${height}px`);
      i++;
    }
  }

  isSelected(btn) {
    if (this.actList.length == 0) return false;
    for (let btnAct of this.actList) {
      let index = btnAct.indexOf(btn.key);
      if (index > -1) {
        return true
      }
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
      act = `{"${this.buttonList[i].key}":"${this.buttonList[i].custom}"}`
    }
    this.actList[0] = act;
    console.log('添加动作')
    console.log(this.actList)
    this.update.emit(this.actList);
  }

  changeAction2(i) {
    console.log(i);
    console.log('changeAction')
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
      this.events.publish('provider:notice', "tooMuchAction");
      return;
    }
    let act;
    // console.log(this.buttonList[i].mode)
    if (typeof this.buttonList[i].mode == "undefined") {
      this.buttonList[i]['mode'] = 0
    }
    if (this.buttonList[i].mode == 0) {
      act = `{"${this.buttonList[i].key}":"tap"}`
      // act = "tap"
    } else if (this.buttonList[i].mode == 1) {
      this.showBtnAction(i);
      return;
    } else {
      act = `{"${this.buttonList[i].key}":"${this.buttonList[i].custom}"}`
      // act = this.buttonList[i].custom
    }
    // actJson[this.buttonList[i].key] = act;
    this.actList.push(act);
    // console.log('添加动作')
    // console.log(this.actList)
    this.update.emit(this.actList);
  }

  showBtnAction(i) {
    let act;
    let alert = this.alertCtrl.create();
    alert.setTitle('选择指令动作');
    alert.addInput({
      type: 'radio',
      label: 'on',
      value: 'on',
      checked: true
    });
    alert.addInput({
      type: 'radio',
      label: 'off',
      value: 'off'
    });
    alert.addButton({
      text: '添加',
      handler: data => {
        act = `{"${this.buttonList[i].key}":"${data}"}`
        if (this.maxAct == 1) {
          this.actList[0] = act;
        } else {
          this.actList.push(act);
        }
        // console.log('添加动作')
        // console.log(this.actList)
        this.update.emit(this.actList);
      }
    });
    alert.present();
  }

}
