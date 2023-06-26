import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { Layouter2Widget } from '../config';
import { LayouterService } from '../../../layouter.service';

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

  @ViewChild('rangbox', { read: ElementRef, static: true }) rangbox: ElementRef;

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

  textBoxWidth = '300px'

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
    private LayouterService: LayouterService
  ) {
  }

  ngAfterViewInit(): void {
    this.refresh()
  }

  canSend = true;
  sendData(senddata) {
    this.LayouterService.send(`{"${this.key}":${senddata}}\n`);
  }

  refresh() {
    setTimeout(() => {
      this.textBoxWidth = `${this.rangbox.nativeElement.clientWidth}px`
    }, 100)
  }

  jia() {
    if (typeof this.value == 'undefined') this.value = 0
    if (this.value < this.max) this.value++
    this.sendData(this.value)
  }

  jian() {
    if (typeof this.value == 'undefined') this.value = 0
    if (this.value > this.min) this.value--
    this.sendData(this.value)
  }

}
