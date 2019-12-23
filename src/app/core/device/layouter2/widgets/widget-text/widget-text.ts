import { Component, Input } from '@angular/core';
import { Layouter2Widget } from '../config';

@Component({
  selector: 'widget-text',
  templateUrl: 'widget-text.html',
  styleUrls: ['widget-text.scss']
})
export class WidgetTextComponent implements Layouter2Widget {

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

  constructor(
    // public events: Events,
    // private changeDetectorRef: ChangeDetectorRef,
    // public render: Renderer2,
  ) {}

  // ngAfterContentInit(): void {
  //   if (typeof (this.device) != 'undefined') {
  //     window.setTimeout(() => {
  //       this.subscribe(this.key);
  //     }, 100);
  //   }
  //   // console.log(this.widget);
  // }

  // ngOnDestroy() {
  //   if (typeof (this.device) != 'undefined')
  //     this.events.unsubscribe(this.device.deviceName + ':' + this.key);
  // }

  // subscribe(key) {
  //   if (typeof (this.device) != 'undefined')
  //     window.setTimeout(() => {
  //       // console.log("this.device test:");
  //       this.events.subscribe(this.device.deviceName + ':' + key, message => {
  //         if (message == "loaded") {
  //           if (this.device.data.hasOwnProperty(key)) {
  //             this.processData(this.device.data[key])
  //           }
  //           this.changeDetectorRef.detectChanges();
  //         }
  //       });
  //     }, 100);
  // }

  // processData(data) {
  //   if (typeof data.t0 != "undefined")
  //     this.t0 = data.t0;
  //   if (typeof data.t1 != "undefined")
  //     this.t1 = data.t1;
  //   if (typeof data.tex != "undefined")
  //     this.t0 = data.tex;
  //   if (typeof data.tex1 != "undefined")
  //     this.t1 = data.tex1;
  // }

  // unsubscribe(key) {
  //   if (typeof (this.device) != 'undefined')
  //     this.events.unsubscribe(this.device.deviceName + ':' + key);
  // }

  // changeColor(color = '#959595') {
  //   if (color[0] != '#' && color[0] != 'r') color = '#' + color;
  //   if (typeof this.icon.first != 'undefined')
  //     this.render.setStyle(this.icon.first.nativeElement, 'color', `${color}`);
  // }

}
