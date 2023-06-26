import { Component, Input, ViewChild } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { WidgetEditor } from '../widget-editor/widget-editor';
import { LayouterService } from '../../layouter.service';
import { Layouter2Widget } from './config';

@Component({
  selector: 'widget-dynamic',
  templateUrl: './parentDynamic.component.html',
  styleUrls: ['parentDynamic.component.scss']
})
export class ParentDynamicComponent {
  @Input()
  widget;
  @Input()
  device;
  @Input()
  resizeEvent;

  @Input()
  isDemo = false;

  @ViewChild('widgetComponent', { static: false }) widgetComponent: Layouter2Widget;

  public get mode() {
    return this.LayouterService.mode
  }

  get color() {
    return this.widget.clr
  }

  @Input()
  lstyle;

  constructor(
    private LayouterService: LayouterService,
    private modalCtrl: ModalController,
  ) { }

  async edit(e) {
    let modal = await this.modalCtrl.create({
      component: WidgetEditor,
      componentProps: {
        'widget': this.widget,
        'device': this.device
      }
    });
    if (typeof this.widgetComponent != 'undefined') {
      modal.onDidDismiss().then(() => {
        this.widgetComponent.refresh();
      });
    }

    modal.present();
  }

}