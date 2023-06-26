import { Component, Input, ViewChild, ElementRef, ChangeDetectorRef, SimpleChanges } from '@angular/core';
import { Layouter2Widget } from '../config';
// import {Gauge} from 'svg-gauge-latest';

@Component({
  selector: 'widget-number',
  templateUrl: 'widget-number.html',
  styleUrls: ['widget-number.scss']
})
export class WidgetNumberComponent implements Layouter2Widget {
  @Input() widget;
  @Input() device;
  @Input() isDemo = false;

  oldLstyle;

  get key() {
    return this.widget.key;
  }

  get t0() {
    return this.getValue(['tex', 't0'])
  }

  get ico() {
    return this.getValue(['ico', 'icon'])
  }

  @Input()
  set color(color) {
    this.setValue('clr', color);
  }
  get color() {
    return this.getValue(['clr', 'col', 'color'])
  }

  get value() {
    let val = this.getValue(['val', 'value'])
    if (typeof val == 'undefined')
      return 0
    try {
      if ((val.toString()).indexOf(".") > -1)
        return Math.floor(val * 100) / 100
    } catch (error) {

    }
    return val
  }

  get unit() {
    return this.getValue(['uni', 'unit'])
  }

  get max() {
    return this.getValue(['max'])
  }

  setValue(valueKey, value) {
    if (typeof this.device.data[this.key] == 'undefined')
      this.device.data[this.key] = {}
    this.device.data[this.key][valueKey] = value;
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

  get valueWithUnit() {
    return `${this.value} ${this.unit}`
  }

  get valuePer() {
    return (this.value / this.max).toFixed(2)
  }

  get is2Long() {
    if (this.value.toString().length >= 4) return true;
    return false;
  }

  @ViewChild('Gauge', { read: ElementRef, static: false }) progressBar: ElementRef;

  scale = 1;
  fontScale = `scale(${this.scale})`;

  constructor(
    private cd: ChangeDetectorRef
  ) { }

  timer;
  scaleInterval
  ngAfterViewInit() {
    this.initChart();
    if (this.isDemo) return;
    this.cd.detectChanges();
    this.scaleInterval = setInterval(() => {
      let textLength = this.value.toString().length + this.unit.length
      if (textLength > 9)
        this.scale = 0.6
      else if (textLength > 6)
        this.scale = 0.8
      else
        this.scale = 1
      this.fontScale = `scale(${this.scale})`;
    }, 1111)
  }

  ngOnDestroy() {
    clearInterval(this.scaleInterval);
    this.destroyBar();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (typeof this.bar != 'undefined') {
      console.log('change color');
      // this.bar.destroy()
      this.refresh()
    }
  }

  bar;
  interval;
  initValue;
  initColor;
  initChart() {
    if (this.oldLstyle == 1 || this.oldLstyle == 2) {
      this.destroyBar();
    }
    if (this.lstyle == 0) {
      this.oldLstyle = 0;
    } else if (this.lstyle == 1) {
      this.oldLstyle = 1;
    } else if (this.lstyle == 2) {
      this.initSemiCircle();
      this.oldLstyle = 2;
    } else if (this.lstyle == 3) {
      this.initSemiCircle2();
      this.oldLstyle = 3;
    } else if (this.lstyle == 4) {
      this.initSemiCircle3();
      this.oldLstyle = 4;
    } else if (this.lstyle == 5) {
      this.initCircle();
      this.oldLstyle = 5;
    }

  }

  // 上半圆
  initSemiCircle() {
    // this.bar = Gauge(this.progressBar.nativeElement, {
    //   min: 0,
    //   max: this.max,
    //   dialStartAngle: 180,
    //   dialEndAngle: 0,
    //   value: 0,
    //   showValue: false,
    //   color: () => {
    //     return this.color
    //   }
    // })
    // this.interval = setInterval(() => {
    //   this.update()
    // }, 1100);
  }

  // 下半圆
  initSemiCircle2() {
    // this.bar = Gauge(this.progressBar.nativeElement, {
    //   min: 0,
    //   max: this.max,
    //   dialStartAngle: 0,
    //   dialEndAngle: -180,
    //   value: 0,
    //   showValue: false,
    //   color: () => {
    //     return this.color
    //   }
    // })
    // this.interval = setInterval(() => {
    //   this.update()
    // }, 1100);
  }


  initSemiCircle3() {
    // this.bar = Gauge(this.progressBar.nativeElement, {
    //   min: 0,
    //   max: this.max,
    //   value: 0,
    //   color: () => {
    //     return this.color
    //   }
    // })
    // this.interval = setInterval(() => {
    //   this.update()
    // }, 1100);
  }

  initCircle() {
    // this.bar = Gauge(this.progressBar.nativeElement, {
    //   min: 0,
    //   max: this.max,
    //   dialStartAngle: -90,
    //   dialEndAngle: -90.001,
    //   value: 0,
    //   color: () => {
    //     return this.color
    //   }
    // })
    // this.interval = setInterval(() => {
    //   this.update()
    // }, 1100);
  }



  update() {
    this.bar.setValueAnimated(this.value, 1);
  }

  destroyBar() {
    clearInterval(this.interval);
  }

  refresh() {
    if (typeof this.progressBar != 'undefined')
      if (this.progressBar.nativeElement.querySelector('svg') != null)
        this.progressBar.nativeElement.removeChild(this.progressBar.nativeElement.querySelector('svg'))
    this.initChart();
  }

}
