import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { DefaultLayouterData } from './layouter.config';
import { HttpClient } from '@angular/common/http';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { NoticeService } from 'src/app/core/services/notice.service';
import { Layouter2Data } from './layouter.interface';

@Injectable({
  providedIn: 'root'
})
export class Layouter2Service {
  action: Subject<any> = new Subject;

  mode = 0; // 0:默认模式  1:编辑模式

  updateConfig = new Subject();

  layouterData: Layouter2Data;

  headerCss;
  backgroundCss;

  device: BlinkerDevice;

  gridSize = (window.innerWidth - 82) / 8;

  constructor(
    private http: HttpClient,
    private notice: NoticeService
  ) { }

  init(device: BlinkerDevice) {
    this.device = device
    let layouterData: Layouter2Data = JSON.parse(this.device.config.layouter)
    if (layouterData)
      this.layouterData = layouterData;
    else
      this.layouterData = JSON.parse(JSON.stringify(DefaultLayouterData))

    // 删除旧的配置信息
    if (this.layouterData['config']) {
      delete this.layouterData['config']
      this.layouterData['header'] = DefaultLayouterData['header']
      this.layouterData['background'] = DefaultLayouterData['background']
    }
    console.log(this.layouterData);
    if (layouterData && layouterData.version[0] != '3') {
      console.log('老版本提示');
      this.notice.showToast('布局器已升级，请清除界面配置后，重新使用新布局器编辑。', 9000)
      // this.cleanWidgets();

    }
    this.headerCss = this.layouterData['header']
    this.backgroundCss = this.layouterData['background']

    // console.log('gridSize:', this.gridSize);
  }

  changeWidgetSubject = new Subject();
  changeWidget(widget = null) {
    this.action.next({ name: 'changeWidget', data: widget })
    if (widget) {
      this.changeWidgetSubject.next(widget)
    }
  }

  delWidget(data) {
    this.action.next({ name: 'delWidget', data: data })
  }

  refreshWidget(data) {
    this.action.next({ name: 'refreshWidget', data: data })
  }

  send(data) {
    this.action.next({ name: 'send', data: data })
  }

  addWidget(data) {
    this.action.next({ name: 'addWidget', data: data })
  }

  editWidget(data) {
    this.action.next({ name: 'editWidget', data: data })
  }

  editBackground() {
    this.action.next({ name: 'editBackground' })
  }

  changeBackground(imgData) {
    this.action.next({ name: 'changeBackground', data: imgData })
  }

  cleanWidgets() {
    this.action.next({ name: 'cleanWidgets' })
  }

  enterEditMode() {
    this.mode = 1;
    this.action.next({ name: 'enterEditMode' })
  }

  exitEditMode() {
    this.mode = 0;
    this.action.next({ name: 'exitEditMode' })
  }

  async openConfigEditor() {
    // let modal = await this.modalCtrl.create({
    //   component: ConfigEditorComponent,
    //   initialBreakpoint: 0.3,
    //   breakpoints: [0.3, 0.5, 1]
    // })
    // modal.present();
  }

  getTemplateList() {
    return this.http.get('https://iot.diandeng.tech/public/templates.json')
  }

  selectWidget(widget, dom = null) {
    this.action.next({ name: 'selectWidget', data: widget, dom: dom })
  }

  unselectWidget() {
    this.action.next({ name: 'selectWidget', data: null })
  }

}
