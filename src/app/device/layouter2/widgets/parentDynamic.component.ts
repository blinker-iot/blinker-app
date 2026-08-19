import { Component, Input, ViewChild } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Layouter2Widget } from './config';
import { WidgetTextComponent } from './widget-text/widget-text';
import { WidgetNumberComponent } from './widget-number/widget-number';
import { WidgetButtonComponent } from './widget-button/widget-button';
import { WidgetRangeComponent } from './widget-range/widget-range';
import { WidgetTimerComponent } from './widget-timer/widget-timer';
import { WidgetColorComponent } from './widget-color/widget-color';
import { WidgetDebugComponent } from './widget-debug/widget-debug';
import { WidgetJoystickComponent } from './widget-joystick/widget-joystick';
import { WidgetChartComponent } from './widget-chart/widget-chart';
import { WidgetMapComponent } from './widget-map/widget-map.component';
import { WidgetTabComponent } from './widget-tab/widget-tab.component';
import { WidgetInputComponent } from './widget-input/widget-input';
import { WidgetVideoComponent } from './widget-video/widget-video';
import { WidgetImageComponent } from './widget-image/widget-image';
import { Layouter2EditTapDirective } from './edit-tap.directive';

@Component({
  selector: 'widget-dynamic',
  templateUrl: './parentDynamic.component.html',
  styleUrls: ['parentDynamic.component.scss'],
  imports: [
    WidgetTextComponent,
    WidgetNumberComponent,
    WidgetButtonComponent,
    WidgetRangeComponent,
    WidgetTimerComponent,
    WidgetColorComponent,
    WidgetDebugComponent,
    WidgetJoystickComponent,
    WidgetChartComponent,
    WidgetMapComponent,
    WidgetTabComponent,
    WidgetInputComponent,
    WidgetVideoComponent,
    WidgetImageComponent,
    Layouter2EditTapDirective,
  ],
})
export class ParentDynamicComponent {
  private editorOpening = false;

  @Input()
  widget;
  @Input()
  device;
  @Input()
  resizeEvent;

  @Input()
  isDemo = false;

  @Input()
  editMode = false;

  @ViewChild('widgetComponent', { static: false })
  widgetComponent: Layouter2Widget;

  get color() {
    return this.widget.clr;
  }

  @Input()
  lstyle;

  constructor(private modalCtrl: ModalController) {}

  async edit() {
    if (this.editorOpening) return;
    this.editorOpening = true;

    try {
      // WidgetEditor imports this standalone component for its preview.
      // Loading it lazily prevents a static ParentDynamic -> WidgetEditor ->
      // ParentDynamic cycle that causes Angular NG0919.
      const { WidgetEditor } = await import('../widget-editor/widget-editor');
      const modal = await this.modalCtrl.create({
        component: WidgetEditor,
        cssClass: 'widget-editor-modal',
        componentProps: {
          widget: this.widget,
          device: this.device,
        },
      });
      const didDismiss = modal.onDidDismiss();
      if (typeof this.widgetComponent != 'undefined') {
        void didDismiss.then(() => {
          this.widgetComponent.refresh();
        });
      }

      await modal.present();
      await didDismiss;
    } finally {
      this.editorOpening = false;
    }
  }
}
