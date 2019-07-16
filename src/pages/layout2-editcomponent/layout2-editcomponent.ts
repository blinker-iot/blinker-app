import { Component, ChangeDetectorRef, ViewChildren, QueryList, ElementRef, Renderer2 } from '@angular/core';
import { IonicPage, NavController, NavParams, ViewController, Events, ModalController, AlertController, Platform } from 'ionic-angular';
import { styleList } from '../../components/layout.component';
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

@IonicPage()
@Component({
  selector: 'page-layout2-editcomponent',
  templateUrl: 'layout2-editcomponent.html',
})
export class Layout2EditcomponentPage {

  item;
  length;
  margin;
  tabSelected = 0;
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
  configList = {
    "tex": { "cols": 2, "rows": 1, "type": "tex", "title": "模块标题", "content": "自定义模块内容", "key": 'col1' },
    "num": { "cols": 2, "rows": 1, "type": "num" },
    "btn": { "cols": 1, "rows": 1, "type": "btn" },
    "col": { "cols": 3, "rows": 3, "type": "col" },
    "ran": { "cols": 6, "rows": 1, "type": "ran" },
    "cha": { "cols": 6, "rows": 3, "type": "cha" },
    "joy": { "cols": 3, "rows": 3, "type": "joy" },
    "deb": { "cols": 6, "rows": 3, "type": "deb" },
    "tim": { "cols": 2, "rows": 1, "type": "tim" },
    "vid": { "cols": 6, "rows": 4, "type": "vid" },
  }

  @ViewChildren('demo') demoList: QueryList<ElementRef>;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public viewCtrl: ViewController,
    public events: Events,
    public changeDetectorRef: ChangeDetectorRef,
    public modalCtrl: ModalController,
    public renderer: Renderer2,
    public alertCtrl: AlertController,
    public platform: Platform
  ) {
    this.item = navParams.data;
    this.length = this.item.layouter.length;
    this.margin = this.item.layouter.margin;
    if (typeof this.item.lstyle == "undefined") {
      this.item['lstyle'] = 0;
    }
    if (typeof this.item.color == "undefined") {
      this.item['color'] = '595959';
    }
    if (this.item.type == "btn") {
      if (typeof this.item.mode == 'undefined') {
        this.item['mode'] = 0;
      }
      if (typeof this.item.custom == 'undefined') {
        this.item['custom'] = "";
      }
      if (typeof this.item.speech == 'undefined') {
        this.item['speech'] = []
      }
    }
    if (this.item.type == "num") {
      if (typeof this.item.max == 'undefined') {
        this.item['max'] = 100;
      }
    }
    if (this.item.type == "ran") {
      if (typeof this.item.min == 'undefined') {
        this.item['min'] = 0;
      }
    }
    // console.log(this.item.layouter.editMode);
    // this.item = this.configList["tex"]
  }

  ionViewDidLoad() {
    if (this.platform.is('android'))
      this.listenKeyboard();
    this.resizeDemo();
  }

  //动态调整demo组件的尺寸
  resizeDemo() {
    let i = 0;
    for (let demo of this.demoList.toArray()) {
      let cols = styleList[this.item.type][i].cols;
      let rows = styleList[this.item.type][i].rows;
      let width = cols * this.length + ((cols - 1) * this.margin);
      let height = (rows * this.length) + ((rows - 1) * this.margin);
      this.renderer.setStyle(demo.nativeElement, 'width', `${width}px`);
      this.renderer.setStyle(demo.nativeElement, 'height', `${height}px`);
      i++;
    }
  }

  save() {
    this.viewCtrl.dismiss();
  }

  back() {
    this.viewCtrl.dismiss();
  }

  delete() {
    this.viewCtrl.dismiss();
    this.events.publish('layout:delete', this.item)
  }

  changeStyle(style) {
    console.log("changeStyle");
    this.item["lstyle"] = style;
    this.item.cols = styleList[this.item.type][style].cols;
    this.item.rows = styleList[this.item.type][style].rows;
    this.item.layouter.changedOptions();
    // console.log(this.item);
  }

  changeColor(color) {
    console.log("changeColor");
    this.item["color"] = color;
    this.item.layouter.changedOptions();
    this.changeDetectorRef.detectChanges();
  }

  choseBtnMode(mode) {
    this.item["mode"] = mode;
  }

  tabChange(tab) {
    this.tabSelected = tab;
  }

  changeIcon() {
    let modal = this.modalCtrl.create('IconPage', this.item);
    modal.present();
  }

  // delete() {
  //   this.viewCtrl.dismiss();
  //   this.events.publish('layout:delete', this.element.id)
  // }

  // @ViewChild(Content) content: Content;
  showKeyboard = false;
  listenKeyboardShow;
  listenKeyboardHide;
  listenKeyboard() {
    this.listenKeyboardShow = this.renderer.listen('window', 'native.keyboardshow', e => {
      this.showKeyboard = true;
      // this.changeDetectorRef.detectChanges();
    });
    this.listenKeyboardHide = this.renderer.listen('window', 'native.keyboardhide', e => {
      this.showKeyboard = false;
      // this.changeDetectorRef.detectChanges();
    });
    // window.addEventListener('native.keyboardshow', (e: any) => {
    //   this.showKeyboard = true;
    //   this.changeDetectorRef.detectChanges();
    // });
    // window.addEventListener('native.keyboardhide', (e: any) => {
    //   this.showKeyboard = false;
    //   this.changeDetectorRef.detectChanges();
    // });
  }

  unlistenKeyboard() {
    if (typeof (this.listenKeyboardShow) === 'function') this.listenKeyboardShow();
    if (typeof (this.listenKeyboardHide) === 'function') this.listenKeyboardHide();
  }


  showSpeechCmd() {
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
    alert.addInput({
      type: 'radio',
      label: 'tap',
      value: 'tap'
    });
    alert.addButton('取消');
    alert.addButton({
      text: '添加',
      handler: data => {
        this.addSpeechCmd('', data)
      }
    });
    alert.present();
  }

  addSpeechCmd(cmd, action) {
    this.item.speech.push({
      'cmd': cmd,
      'act': action
    });
  }

  delSpeechCmd(id) {
    this.arrayRemove(this.item.speech, id)
  }

  arrayRemove(array, index) {
    if (index <= (array.length - 1)) {
      for (var i = index; i < array.length; i++) {
        array[i] = array[i + 1];
      }
    }
    else {
      // throw new Error('超出最大索引！');
    }
    array.length = array.length - 1;
    return array;
  }

}
