import { Component, Input, ViewChild, ElementRef, Renderer2, ChangeDetectorRef } from '@angular/core';
import { Layouter2Widget } from '../config';
import { Events } from '@ionic/angular';

@Component({
  selector: 'widget-color',
  templateUrl: 'widget-color.html',
  styleUrls: ['widget-color.scss']
})

export class WidgetColorComponent implements Layouter2Widget {

  @Input() device;
  @Input() widget;

  get key() {
    return this.widget.key;
  }

  get color() {
    if (typeof this.device.data[this.key] != 'undefined')
      return this.device.data[this.key]
    return this.rgb
  }

  get t0() {
    return this.getValue('t0')
  }

  get brightness() {
    if (typeof this.device.data[this.key] != 'undefined')
      if (typeof this.device.data[this.key][3] != 'undefined')
        return this.device.data[this.key][3]
    return this.value;
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


  getValue(valueKey) {
    if (typeof this.device.data[this.key] != 'undefined')
      if (typeof this.device.data[this.key][valueKey] != 'undefined')
        return this.device.data[this.key][valueKey]
    if (typeof this.widget[valueKey] != 'undefined')
      return this.widget[valueKey]
    return ''
  }

  rgb = [255, 255, 255];
  value = 0;
  gesture;
  loaded = false;

  constructor(
    public changeDetectorRef: ChangeDetectorRef,
    public events: Events,
  ) { }

  timer;
  oldColor;
  ngAfterViewInit() {
    this.timer = setInterval(() => {
      if (this.oldColor != this.color) {
        this.oldColor = this.color;
        this.rgb = this.color;
      }
    }, 1100)
  }

  ngOnDestroy() {
    clearInterval(this.timer)
  }

  get rgbStr() {
    return `rgb(${this.rgb[0]},${this.rgb[1]},${this.rgb[2]})`
  }

  get barcolor() {
    return `linear-gradient(to right, #333, ${this.rgbStr})`
  }

  colorChange(e) {
    this.value = this.brightness
    this.rgb = e;
    this.sendData();
  }

  brightnessChange(e) {
    this.value = e;
    // this.rgb = this.color
    this.sendData();
  }

  sendData() {
    // if (typeof this.rgb == 'undefined') this.rgb = this.color;
    let data = `{"${this.key}":[${this.rgb[0]},${this.rgb[1]},${this.rgb[2]},${this.value}]}\n`;
    this.events.publish('layouter2', 'send', data);
  }

}
