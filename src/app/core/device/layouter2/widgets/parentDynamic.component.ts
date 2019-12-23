import { Component, Input, ViewEncapsulation, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { ModalController, Events } from '@ionic/angular';
import { WidgetEditor } from '../widget-editor/widget-editor';
import { Layouter2Service } from '../layouter2.service';

@Component({
  selector: 'widget-dynamic',
  templateUrl: './parentDynamic.component.html',
  styleUrls: ['parentDynamic.component.scss'],
  // changeDetection: ChangeDetectionStrategy.Default,
  // encapsulation: ViewEncapsulation.None
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

  public get mode() {
    return this.layouter2Service.mode
  }

  @Input()
  lstyle;

  constructor(
    private layouter2Service: Layouter2Service,
    private modalCtrl: ModalController,
    private events: Events
  ) { }

  async edit(e) {
    // e.stopPropagation()
    // console.log(e);
    // let dom = this.el.nativeElement.getBoundingClientRect()
    // console.log(dom);
    // this.renderer.setStyle(this.el.nativeElement, 'top', `${dom.top}px`)
    // this.renderer.setStyle(this.el.nativeElement, 'left', `${dom.left}px`)
    // this.renderer.addClass(this.el.nativeElement, 'enter-edit')
    let modal = await this.modalCtrl.create({
      component: WidgetEditor,
      componentProps: {
        'widget': this.widget,
        'device': this.device
      }
    });
    modal.onDidDismiss().then(() => {
      this.events.publish(this.device.deviceName + ':refreshWidget', this.widget)
    });
    modal.present();
  }

}