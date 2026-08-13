import { Component, Input, ViewChild } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { WidgetEditor } from '../widget-editor/widget-editor';
import { Layouter2Widget } from './config';
import { EditGesturePoint, isEditGestureTap } from './edit-gesture';

@Component({
  standalone: false,
  selector: 'widget-dynamic',
  templateUrl: './parentDynamic.component.html',
  styleUrls: ['parentDynamic.component.scss']
})
export class ParentDynamicComponent {
  private editGestureStart?: EditGesturePoint;

  @Input()
  widget;
  @Input()
  device;
  @Input()
  resizeEvent;

  @Input()
  isDemo = false;

  @ViewChild('widgetComponent', { static: false }) widgetComponent: Layouter2Widget;

  get color() {
    return this.widget.clr
  }

  @Input()
  lstyle;

  constructor(
    private modalCtrl: ModalController,
  ) { }

  beginEditGesture(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) {
      this.cancelEditGesture();
      return;
    }

    this.editGestureStart = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }

  finishEditGesture(event: PointerEvent): void {
    const start = this.editGestureStart;
    this.cancelEditGesture();

    if (!isEditGestureTap(start, event)) {
      return;
    }

    void this.edit();
  }

  cancelEditGesture(): void {
    this.editGestureStart = undefined;
  }

  async edit() {
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
