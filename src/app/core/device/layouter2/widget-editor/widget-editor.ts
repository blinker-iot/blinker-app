import { Component, ChangeDetectorRef, ViewChildren, QueryList, ElementRef, Renderer2, Input } from '@angular/core';
import { Events, ModalController, AlertController, Platform } from '@ionic/angular';
import { styleList } from '../widgets/config';
import { Layouter2Service } from '../layouter2.service';
import { IconListPage } from 'src/app/core/pages/icon-list/icon-list';

@Component({
  selector: 'widget-editor',
  templateUrl: 'widget-editor.html',
  styleUrls: ['widget-editor.scss']
})
export class WidgetEditor {

  @Input() widget;
  @Input() device;
  tabSelected = 0;

  get widgets() {
    return styleList[this.widget.type]
  }

  @ViewChildren('widgetItem') widgetItems: QueryList<ElementRef>;

  constructor(
    public events: Events,
    public changeDetectorRef: ChangeDetectorRef,
    public modalCtrl: ModalController,
    public renderer: Renderer2,
    public alertCtrl: AlertController,
    public platform: Platform,
    private layouter2Service: Layouter2Service
  ) { }

  ngOnInit() {
    if (typeof this.widget.speech == 'undefined') this.widget['speech'] = []
  }

  ngAfterViewInit() {
    if (this.platform.is('android'))
      this.listenKeyboard();
    setTimeout(() => {
      this.resize();
    }, 100);
  }

  loadWidgets() {
    // this.renderer
  }

  //动态调整demo组件的尺寸
  resize() {
    let i = 0;
    for (let item of this.widgetItems.toArray()) {
      let cols = styleList[this.widget.type][i].cols;
      let rows = styleList[this.widget.type][i].rows;
      let width = cols * this.layouter2Service.gridLength + ((cols - 1) * this.layouter2Service.gridMargin);
      let height = (rows * this.layouter2Service.gridLength) + ((rows - 1) * this.layouter2Service.gridMargin);
      this.renderer.setStyle(item.nativeElement, 'width', `${width}px`);
      this.renderer.setStyle(item.nativeElement, 'height', `${height}px`);
      i++;
    }
  }

  inputChange() {
    console.log('inputChange');
    console.log(this.widget);
    this.changeDetectorRef.detectChanges();
  }

  save() {
    this.events.publish('layouter2', 'changeWidget', '')
    this.modalCtrl.dismiss();
  }

  delete() {
    this.events.publish('layouter2', 'delWidget', this.widget)
    this.modalCtrl.dismiss();
  }

  changeStyle(lstyle) {
    console.log("changeStyle");
    this.widget["lstyle"] = lstyle;
    this.widget.cols = styleList[this.widget.type][lstyle].cols;
    this.widget.rows = styleList[this.widget.type][lstyle].rows;
  }

  changeColor(color) {
    console.log("changeColor");
    this.widget["clr"] = color;
    // this.changeDetectorRef.detectChanges();
    if (this.widget.type == 'num' && this.widget.lstyle != 0)
      this.events.publish(this.device.deviceName + ':refreshWidget', this.widget)
  }

  choseBtnMode(mode) {
    this.widget["mode"] = mode;
  }

  choseBgMode(bgmode) {
    this.widget["bg"] = bgmode;
  }

  changeChartStyle(id,style){

  }

  tabChange(tab) {
    this.tabSelected = tab;
  }

  async changeIcon() {
    let modal = await this.modalCtrl.create({
      component: IconListPage,
      componentProps: {
        'item': this.widget
      }
    });
    modal.present();
  }

  async selectIcon(iconId) {
    let modal = await this.modalCtrl.create({
      component: IconListPage,
      componentProps: {
        'item': this.widget,
        'iconId': iconId
      }
    });
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
    });
    this.listenKeyboardHide = this.renderer.listen('window', 'native.keyboardhide', e => {
      this.showKeyboard = false;
    });
  }

  unlistenKeyboard() {
    if (typeof (this.listenKeyboardShow) === 'function') this.listenKeyboardShow();
    if (typeof (this.listenKeyboardHide) === 'function') this.listenKeyboardHide();
  }


  async showSpeechCmd() {
    let alert = await this.alertCtrl.create({
      header: '选择动作',
      inputs: [
        {
          type: 'radio',
          label: 'on',
          value: 'on',
          checked: true
        },
        {
          type: 'radio',
          label: 'off',
          value: 'off'
        },
        {
          type: 'radio',
          label: 'tap',
          value: 'tap'
        }
      ],
      buttons: [
        {
          text: '取消',
        }, {
          text: '添加',
          handler: data => {
            this.addSpeechCmd('', data)
          }
        }
      ]
    });

    alert.present();
  }

  addSpeechCmd(cmd, action) {
    this.widget.speech.push({
      'cmd': cmd,
      'act': action
    });
  }

  delSpeechCmd(id) {
    this.arrayRemove(this.widget.speech, id)
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
