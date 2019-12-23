import { Component, Input, ViewChild, ElementRef, EventEmitter, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { Layouter2Widget } from '../config';
import ProgressBar from 'progressbar.js';
import { Events } from '@ionic/angular';

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

  // @Input() color;
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

  @ViewChild('ProgressBar', { read: ElementRef, static: false }) progressBar: ElementRef;

  scale = 1;
  fontScale = `scale(${this.scale})`;

  constructor(
    private events: Events,
    private cd: ChangeDetectorRef
  ) { }

  timer;
  scaleInterval
  ngAfterViewInit() {
    this.initChart();
    if (this.isDemo) return;
    this.events.subscribe(this.device.deviceName + ':refreshWidget', widget => {
      if (widget === this.widget) {
        this.initChart();
      }
    });
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
    this.destroyBar();
    clearInterval(this.scaleInterval);
    if (!this.isDemo)
      this.events.unsubscribe(this.device.deviceName + ':' + this.key)
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
    }
    else if (this.lstyle == 1) {
      this.initSemiCircle();
      this.oldLstyle = 1;
    }
    else if (this.lstyle == 2) {
      this.initCircle();
      this.oldLstyle = 2;
    }

  }

  initSemiCircle() {
    this.bar = new ProgressBar.SemiCircle(this.progressBar.nativeElement, {
      strokeWidth: 5,
      duration: 1000,
      color: this.color,
      trailColor: '#eee',
      trailWidth: 5,
      step: (state, bar) => {
        bar.path.setAttribute('stroke', this.color);
        // bar.setText(this.value + this.unit);
      }
    });
    this.interval = setInterval(() => {
      this.update()
    }, 1100);
  }

  initCircle() {
    this.bar = new ProgressBar.Circle(this.progressBar.nativeElement, {
      strokeWidth: 5,
      duration: 1000,
      color: this.color,
      trailColor: '#eee',
      trailWidth: 5,
      step: (state, bar) => {
        bar.path.setAttribute('stroke', this.color);
        // bar.setText(this.value + this.unit);
      }
    });
    this.interval = setInterval(() => {
      this.update()
    }, 1100);
  }

  update() {
    this.bar.animate(this.valuePer, {
      duration: 300
    });

    this.bar.path.setAttribute('stroke', this.color);
  }

  destroyBar() {
    clearInterval(this.interval);
    if (typeof this.bar != 'undefined') {
      if (this.bar.path != null)
        this.bar.destroy();
    }
  }

}
