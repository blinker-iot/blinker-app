import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  QueryList,
  Renderer2,
  ViewChildren,
} from '@angular/core';
import { NgClass, NgStyle } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonicModule,
  ModalController,
  Platform,
} from '@ionic/angular';
import { styleList } from '../widgets/config';

import { LayouterService } from '../../layouter.service';
import { IconListPage } from 'src/app/core/pages/icon-list/icon-list';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { arrayRemove } from 'src/app/core/functions/func';
import { DeviceService } from 'src/app/core/services/device.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { BColorpickerBtnsComponent } from 'src/app/core/components/b-colorpicker-btns/b-colorpicker-btns.component';
import { ParentDynamicComponent } from '../widgets/parentDynamic.component';
import { HorizontalDragScrollDirective } from '../horizontal-drag-scroll.directive';
import { cloneWidgetDraft, commitWidgetDraft } from '../widget-update';
import {
  TextWidgetAlignment,
  normalizeTextWidget,
  normalizeTextWidgetFontSize,
} from '../widgets/widget-text/widget-text-layout';

@Component({
  standalone: true,
  selector: 'widget-editor',
  templateUrl: 'widget-editor.html',
  styleUrls: ['widget-editor.scss'],
  imports: [
    NgClass,
    NgStyle,
    FormsModule,
    IonicModule,
    ParentDynamicComponent,
    BColorpickerBtnsComponent,
    HorizontalDragScrollDirective,
  ],
})
export class WidgetEditor {
  @Input() widget;
  @Input() device: BlinkerDevice;

  private sourceWidget;

  get widgets() {
    return styleList[this.widget.type];
  }

  get layouterData() {
    return this.device.data.layouterData;
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
  ) {}

  ngOnInit() {
    if (typeof this.widget === 'undefined') return;

    this.sourceWidget = this.widget;
    this.widget = normalizeTextWidget(cloneWidgetDraft(this.widget));
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
      let width =
        cols * this.LayouterService.gridLength +
        (cols - 1) * this.LayouterService.gridMargin;
      let height =
        rows * this.LayouterService.gridLength +
        (rows - 1) * this.LayouterService.gridMargin;
      this.renderer.setStyle(item.nativeElement, 'width', `${width}px`);
      this.renderer.setStyle(item.nativeElement, 'height', `${height}px`);
      i++;
      this.changeDetectorRef.detectChanges();
    }
  }

  inputChange() {
    this.widget = { ...this.widget };
    this.changeDetectorRef.markForCheck();
  }

  updateWidgetParameter(parameter: string, value) {
    this.widget = {
      ...this.widget,
      [parameter]: value,
    };
    this.changeDetectorRef.markForCheck();
  }

  updateTextSize(value: unknown) {
    this.updateWidgetParameter('size', normalizeTextWidgetFontSize(value));
  }

  updateTextAlignment(align: TextWidgetAlignment) {
    this.updateWidgetParameter('align', align);
  }

  updateImageUrl(index: number, url: string) {
    const list = this.widget.list.map((item, itemIndex) =>
      itemIndex === index ? { ...item, url } : item
    );
    this.updateWidgetParameter('list', list);
  }

  async save() {
    const sourceWidget = this.sourceWidget ?? this.widget;
    const updatedWidget = normalizeTextWidget(this.widget);
    const modal = await this.modalCtrl.getTop();
    await modal.dismiss();

    this.LayouterService.changeWidget(
      commitWidgetDraft(sourceWidget, updatedWidget)
    );
  }

  async delete() {
    const sourceWidget = this.sourceWidget ?? this.widget;

    // Update the dashboard before waiting for Ionic's leave animation so the
    // widget disappears as soon as the delete action is clicked.
    this.LayouterService.delWidget(sourceWidget);

    const modal = await this.modalCtrl.getTop();
    await modal?.dismiss(undefined, 'delete');
  }

  async close() {
    (await this.modalCtrl.getTop()).dismiss();
  }

  changeStyle(lstyle) {
    const style = styleList[this.widget.type][lstyle];
    this.widget = {
      ...this.widget,
      lstyle,
      cols: style.cols,
      rows: style.rows,
    };
  }

  changeColor(color) {
    this.updateWidgetParameter('clr', color);
    if (this.widget.type == 'num' && this.widget.lstyle != 0)
      this.LayouterService.refreshWidget(this.widget);
  }

  choseBtnMode(mode) {
    this.updateWidgetParameter('mode', mode);
  }

  chosePlayMode(mode) {
    this.updateWidgetParameter('mode', mode);
  }

  changeChartStyle(id, style) {}

  async changeIcon() {
    let modal = await this.modalCtrl.create({
      component: IconListPage,
      componentProps: {
        item: this.widget,
      },
    });
    const didDismiss = modal.onDidDismiss();
    await modal.present();
    await didDismiss;
    this.inputChange();
  }

  async selectIcon(iconId) {
    let modal = await this.modalCtrl.create({
      component: IconListPage,
      componentProps: {
        item: this.widget,
        iconId: iconId,
      },
    });
    const didDismiss = modal.onDidDismiss();
    await modal.present();
    await didDismiss;
    this.inputChange();
  }

  showKeyboard = false;
  listenKeyboardShow;
  listenKeyboardHide;
  listenKeyboard() {
    this.listenKeyboardShow = this.renderer.listen(
      'window',
      'native.keyboardshow',
      (e) => {
        this.showKeyboard = true;
      }
    );
    this.listenKeyboardHide = this.renderer.listen(
      'window',
      'native.keyboardhide',
      (e) => {
        this.showKeyboard = false;
      }
    );
  }

  unlistenKeyboard() {
    if (typeof this.listenKeyboardShow === 'function')
      this.listenKeyboardShow();
    if (typeof this.listenKeyboardHide === 'function')
      this.listenKeyboardHide();
  }

  choseStream(stream) {
    this.updateWidgetParameter('str', stream);
  }

  turnRealtime() {
    this.updateWidgetParameter('rt', !this.widget['rt']);
  }
}
