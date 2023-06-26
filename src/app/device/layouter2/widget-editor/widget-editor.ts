import { Component, ChangeDetectorRef, ViewChildren, QueryList, ElementRef, Renderer2, Input } from '@angular/core';
import { ModalController, AlertController, Platform } from '@ionic/angular';
import { styleList } from '../widgets/config';
import { LayouterService } from '../../layouter.service';
import { IconListPage } from 'src/app/core/pages/icon-list/icon-list';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { arrayRemove } from 'src/app/core/functions/func';
import { DeviceService } from 'src/app/core/services/device.service';
import { NoticeService } from 'src/app/core/services/notice.service';

@Component({
  selector: 'widget-editor',
  templateUrl: 'widget-editor.html',
  styleUrls: ['widget-editor.scss']
})
export class WidgetEditor {

  @Input() widget;
  @Input() device: BlinkerDevice;

  get widgets() {
    return styleList[this.widget.type]
  }

  get layouterData() {
    return this.device.data.layouterData
  }

  @ViewChildren('widgetItem') widgetItems: QueryList<ElementRef>;

  constructor(
    public changeDetectorRef: ChangeDetectorRef,
    public modalCtrl: ModalController,
    public renderer: Renderer2,
    public alertCtrl: AlertController,
    public platform: Platform,
    private LayouterService: LayouterService,
    private deviceService: DeviceService,
    private noticeService: NoticeService
  ) { }

  ngOnInit() {
  }

  ngAfterViewInit() {
    if (this.platform.is('android')) {
      this.listenKeyboard();
    }
    setTimeout(() => {
      this.resize();
    }, 100);
  }

  //动态调整demo组件的尺寸
  resize() {
    let i = 0;
    for (let item of this.widgetItems.toArray()) {
      let cols = styleList[this.widget.type][i].cols;
      let rows = styleList[this.widget.type][i].rows;
      let width = cols * this.LayouterService.gridLength + ((cols - 1) * this.LayouterService.gridMargin);
      let height = (rows * this.LayouterService.gridLength) + ((rows - 1) * this.LayouterService.gridMargin);
      this.renderer.setStyle(item.nativeElement, 'width', `${width}px`);
      this.renderer.setStyle(item.nativeElement, 'height', `${height}px`);
      i++;
      this.changeDetectorRef.detectChanges();
    }
  }

  inputChange() {
    console.log('inputChange');
    console.log(this.widget);
    this.changeDetectorRef.detectChanges();
  }

  async save() {
    // this.saveRealtime()
    this.LayouterService.changeWidget();
    (await this.modalCtrl.getTop()).dismiss()
  }

  async delete() {
    this.LayouterService.delWidget(this.widget);
    (await this.modalCtrl.getTop()).dismiss()
  }

  async close() {
    (await this.modalCtrl.getTop()).dismiss()
  }

  changeStyle(lstyle) {
    this.widget["lstyle"] = lstyle;
    this.widget.cols = styleList[this.widget.type][lstyle].cols;
    this.widget.rows = styleList[this.widget.type][lstyle].rows;
  }

  changeColor(color) {
    this.widget["clr"] = color;
    if (this.widget.type == 'num' && this.widget.lstyle != 0)
      this.LayouterService.refreshWidget(this.widget)
  }

  choseBtnMode(mode) {
    this.widget["mode"] = mode;
  }

  choseBgMode(bgmode) {
    this.widget["bg"] = bgmode;
  }

  chosePlayMode(mode) {
    this.widget["mode"] = mode;
  }

  changeChartStyle(id, style) {

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

  choseStream(stream) {
    this.widget["str"] = stream;
  }

  turnRealtime() {
    this.widget['rt'] = !this.widget['rt']
  }

}
