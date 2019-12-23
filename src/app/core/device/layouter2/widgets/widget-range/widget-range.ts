import { Component, Input, ChangeDetectorRef } from '@angular/core';
import { Layouter2Widget } from '../config';
import { Events } from '@ionic/angular';

@Component({
  selector: 'widget-range',
  templateUrl: 'widget-range.html',
  styleUrls: ['widget-range.scss']
})
export class WidgetRangeComponent implements Layouter2Widget {

  @Input() device;
  @Input() widget;

  get key() {
    return this.widget.key;
  }

  get t0() {
    return this.getValue('t0')
  }

  showValue = 0;
  set value(value) {
    if (typeof this.device.data[this.key] == 'undefined')
      this.device.data[this.key] = {};
    this.device.data[this.key]['val'] = value;
  }

  get value() {
    return this.getValue('val')
  }

  get max() {
    return this.getValue('max')
  }

  get min() {
    return this.getValue('min')
  }

  get ico() {
    return this.getValue('ico')
  }

  get color() {
    return this.getValue('clr')
  }

  get state() {
    return this.getValue('swi')
  }

  get mode() {
    return this.getValue('mode')
  }

  get custom() {
    return this.getValue('cus')
  }

  getValue(valueKey) {
    if (typeof this.device.data[this.key] != 'undefined')
      if (typeof this.device.data[this.key][valueKey] != 'undefined')
        return this.device.data[this.key][valueKey]
    if (typeof this.widget[valueKey] != 'undefined')
      return this.widget[valueKey]
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

  constructor(
    public events: Events,
    public changeDetectorRef: ChangeDetectorRef
  ) {
  }

  ngOnDestroy() {
    if (typeof (this.device) != 'undefined')
      this.events.unsubscribe(this.device.deviceName + ':' + this.key);
  }

  // valueChange(e) {
  //   this.showValue = e;
  //   this.changeDetectorRef.detectChanges();
  // }

  sendData(e) {
    // if (this.layouter.editMode) return;
    let data = `{"${this.key}":${e}}\n`;
    this.events.publish('layouter2', 'send', data);
  }

}
