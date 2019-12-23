import { Component, Input } from '@angular/core';
import { Layouter2Widget } from '../config';

@Component({
  selector: 'widget-video',
  templateUrl: 'widget-video.html',
  styleUrls: ['widget-video.scss']
})
export class WidgetVideoComponent implements Layouter2Widget {

  @Input() device;
  @Input() widget;
  @Input() key;

  get hlsUrl() {
    return this.getValue('hls')
  }

  getValue(valueKey) {
    if (typeof this.device.data[this.key] != 'undefined')
      if (typeof this.device.data[this.key][valueKey] != 'undefined')
        return this.device.data[this.key][valueKey]
    if (typeof this.widget[valueKey] != 'undefined')
      return this.widget[valueKey]
    return ''
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

  constructor() {

  }

  ngAfterContentInit() {

  }

  ngOnDestroy() {

  }

  init() {

  }

}
