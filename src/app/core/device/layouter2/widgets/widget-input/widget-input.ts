import { Component, Input } from '@angular/core';
import { Layouter2Widget } from '../config';
import { ModalController } from '@ionic/angular';
import { InputBoxComponent } from 'src/app/core/components/input-box/input-box.component';

@Component({
  selector: 'widget-input',
  templateUrl: 'widget-input.html',
  styleUrls: ['widget-input.scss']
})
export class WidgetInputComponent implements Layouter2Widget {

  @Input() widget;
  @Input() device;

  get key() {
    return this.widget.key;
  }

  get t0() {
    return this.getValue(['tex','t0'])
  }

  get t1() {
    return this.getValue(['tex1','t1'])
  }

  get ico() {
    return this.getValue(['ico','icon'])
  }

  get color() {
    return this.getValue(['clr','col','color'])
  }

  getValue(valueKeys: string[]): any {
    for (let valueKey of valueKeys) {
      if (typeof this.device.data[this.key] != 'undefined')
        if (typeof this.device.data[this.key][valueKey] != 'undefined')
          return this.device.data[this.key][valueKey]
      if (typeof this.widget[valueKey] != 'undefined')
        return this.widget[valueKey]
    };
    return
  }

  _lstyle
  @Input()
  set lstyle(lstyle) {
    this._lstyle = lstyle
  }
  get lstyle() {
    if (typeof this._lstyle != 'undefined')
      return this._lstyle
    if (typeof this.widget.lstyle != 'undefined')
      return this.widget.lstyle
    return 0;
  }

  sendmess;

  constructor(
    private modalCtrl: ModalController,
  ) {}


  send(){
 
  }

  async showInputModal() {
    const modal = await this.modalCtrl.create({
      component: InputBoxComponent,
      backdropDismiss: false,
      componentProps: {
        'device': this.device
      }
    });
    modal.present();
  }

}
