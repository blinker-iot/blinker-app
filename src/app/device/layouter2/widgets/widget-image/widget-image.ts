import { Component, Input } from '@angular/core';
import { Layouter2Service } from '../../layouter2.service';
import { Layouter2Widget } from '../config';

@Component({
  selector: 'widget-image',
  templateUrl: 'widget-image.html',
  styleUrls: ['widget-image.scss']
})
export class WidgetImageComponent implements Layouter2Widget {

  @Input() widget;
  @Input() device;

  get key() {
    return this.widget.key;
  }

  get list() {
    return this.getValue(['list'])
  }

  get img() {
    return this.getValue(['img'])
  }

  get image() {
    return this.list[this.img]
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

  constructor(
    private LayouterService: Layouter2Service
  ) { }

  // 预加载图片，避免切换时再加载一时显示不出来
  ngOnInit(): void {
    // console.log(this.list);
  }

  tap() {
    this.LayouterService.send(`{"${this.key}":"${this.img}"}\n`)
  }

}
