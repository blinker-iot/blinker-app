import { Component, Input, ElementRef, ViewChild, Renderer2, Injectable } from '@angular/core';
import { Layouter2Widget } from '../config';
import { NativeService } from 'src/app/core/services/native.service';
import { Layouter2Service } from '../../layouter2.service';
import { color2Rgba, convertToRgba } from 'src/app/core/functions/func';



@Component({
  selector: 'widget-select',
  templateUrl: 'widget-select.html',
  styleUrls: ['widget-select.scss']
})
export class WidgetSelectComponent implements Layouter2Widget {

  @Input() device;
  @Input() widget;

  get key() {
    return this.widget.key;
  }

  get t0() {
    return this.getValue(['tex', 't0', 'text'])
  }

  get t1() {
    return this.getValue(['tex1', 't1'])
  }

  get ico() {
    return this.getValue(['ico', 'icon'])
  }


  get color() {
    if (this.state == 'on') return '#FFF';
    return this.getValue(['clr', 'col', 'color'])
  }

  get color2() {
    if (this.state == 'on') return this.getValue(['clr', 'col', 'color']);
    return convertToRgba(this.color, 0.1)
  }

  get state() {
    this.device.data[this.key]
    if (typeof this.device.data[this.key] == 'string') {
      return this.device.data[this.key]
    }
    return this.getValue(['swi', 'switch'])
  }

  get mode() {
    return this.getValue(['mode'])
  }

  set mode(value) {
    this.device.data[this.key]['mode'] = value;
  }

  get custom() {
    return this.getValue(['cus', 'custom'])
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

  pressed = false;

  current;

  value;

  constructor(
    private LayouterService: Layouter2Service
  ) { }

  ngOnInit() {
    this.current = this.widget.opts[0];
    this.value = this.current.value;
  }

  selectChange(e) {
    console.log(e);
    for (let index = 0; index < this.widget.opts.length; index++) {
      const opt = this.widget.opts[index];
      if (opt.value == e) {
        this.current = opt
        break;
      }
    }

    let data = `{"${this.key}":"${this.current.value}"}`;
    this.LayouterService.send(data + '\n')
  }
}
