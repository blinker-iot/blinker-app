import { Component, Input, ViewChild, ElementRef } from '@angular/core';
import { Layouter2Widget } from '../config';
import F2 from '@antv/f2/build/f2-all';
import { Events } from '@ionic/angular';
import { CloudStorageService } from 'src/app/core/services/cloudStorage.service';

@Component({
  selector: 'widget-chart',
  templateUrl: 'widget-chart.html',
  styleUrls: ['widget-chart.scss']
})
export class WidgetChartComponent implements Layouter2Widget {

  @Input() device;
  @Input() widget;
  @Input() isDemo = false;
  chart;
  geometry;
  geometryArea;
  showNoData = false;
  quickCode = '1h';
  // tickCount;
  valueTicks;
  renderMode = 1;

  get mask() {
    if (this.quickCode == '1h') return 'HH:mm'
    if (this.quickCode == '1d') return 'HH:mm'
    if (this.quickCode == '1w') return 'M.D HH:mm'
  }

  data;

  selected0 = true;
  selected1 = true;
  selected2 = true;
  selectedKey;

  get key() {
    return this.widget.key;
  }

  get keys() {
    return [this.key0, this.key1, this.key2];
  }

  get ts() {
    return [this.t0, this.t1, this.t2];
  }

  get chartStyle() {
    if (this.selectedKey == this.key0) return this.style0
    if (this.selectedKey == this.key1) return this.style1
    if (this.selectedKey == this.key2) return this.style2
  }

  get chartColor() {
    if (this.selectedKey == this.key0) return this.color0
    if (this.selectedKey == this.key1) return this.color1
    if (this.selectedKey == this.key2) return this.color2
  }

  get key0() {
    return this.widget.key;
  }

  get key1() {
    return this.widget.key1;
  }

  get key2() {
    return this.widget.key2;
  }

  get t0() {
    return this.getValue(['t0']);
  }

  get t1() {
    return this.getValue(['t1']);
  }

  get t2() {
    return this.getValue(['t2']);
  }

  get style0() {
    return this.getValue(['sty']);
  }

  get style1() {
    return this.getValue(['sty1']);
  }

  get style2() {
    return this.getValue(['sty2']);
  }

  get color0() {
    return this.getValue(['clr']);
  }

  get color1() {
    return this.getValue(['clr1']);
  }

  get color2() {
    return this.getValue(['clr2']);
  }

  getValue(valueKeys: string[]): any {
    for (let valueKey of valueKeys) {
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

  @ViewChild('chartCanvas', { read: ElementRef, static: true }) chartCanvas: ElementRef;
  @ViewChild('chartbox', { read: ElementRef, static: true }) chartBox: ElementRef;

  constructor(
    private cloudStorageService: CloudStorageService,
    private events: Events
  ) { }

  ngOnInit() {
    this.selectedKey = this.key0;
  }

  ngAfterViewInit() {
    if (this.device.config.mode == 'test') return
    this.renderChart();
    if (!this.isDemo)
      this.events.subscribe(this.device.deviceName + ':refreshWidget', (widget) => {
        if (widget == this.widget) {
          if (typeof this.chart != 'undefined') {
            this.chart.destroy();
            this.chart = null;
            this.renderChart();
          }
        }
      })
  }

  times;
  processData() {
    let min = null;
    let max = null;
    this.data = [];
    this.times = []
    this.device.data['history'][this.selectedKey][this.quickCode].forEach(element => {
      let date = new Date(element.date * 1000);
      this.data.push({ date: date, value: element.value })
      this.times.push(date);
      if (element.value > max || max == null) max = element.value;
      if (element.value < min || min == null) min = element.value;
    });
    let a = (max - min) / 3;
    this.valueTicks = [min, Math.ceil((min + a) * 100) / 100, Math.ceil((min + a + a) * 100) / 100, Math.ceil((min + a + a + a) * 100) / 100]
    if (this.quickCode == '1h') this.times = this.times.slice(this.times.length - 21, this.times.length - 1);
    if (this.quickCode == '1d') this.times = this.times.slice(this.times.length - 13, this.times.length - 1);
    if (this.quickCode == '1w') this.times = this.times.slice(this.times.length - 24, this.times.length - 1);
  }

  initChart() {
    console.log('init chart');

    this.chart = new F2.Chart({
      el: this.chartCanvas.nativeElement,
      width: this.chartBox.nativeElement.clientWidth,
      height: this.chartBox.nativeElement.clientHeight,
      padding: [58, 'auto', 26, 'auto'],
      pixelRatio: window.devicePixelRatio
    });

    this.chart.source(this.data);
    this.chart.scale('date', {
      type: 'timeCat',
      mask: this.mask,
      values: this.times
    });
    this.chart.scale('value', {
      // tickCount: this.tickCount,
      ticks: this.valueTicks
    });
    this.chart.axis('date', {
      label: {
        fill: '#000'
      }
    });
    this.chart.axis('value', {
      label: {
        fill: '#000'
      }
    });
    this.geometry = this.chart.line();
    this.geometryArea = this.chart.area();
    this.geometry.position('date*value').color(this.chartColor);
    this.geometryArea.position('date*value').color(this.chartColor);
    if (!this.isDemo) {
      this.chart.interaction('pan');
      this.chart.interaction('pinch');
      this.chart.scrollBar({
        mode: 'x',
        xStyle: {
          offsetY: -5
        }
      });
    }

    this.chart.render();
  }

  switch(item) {
    if (item == 0) this.selected0 = !this.selected0;
    if (item == 1) this.selected1 = !this.selected1;
    if (item == 2) this.selected2 = !this.selected2;
  }

  changeQuickCode() {
    this.renderMode = 1;
    this.renderChart();
  }

  changeKey(key) {
    if (this.selectedKey == key) return;
    this.renderMode = 2;
    this.selectedKey = key;
    this.renderChart();
  }

  renderChart() {
    this.cloudStorageService.getTimeSeriesData(this.device, this.selectedKey, this.quickCode)
      .then(result => {
        if (result) {
          if (this.device.data['history'][this.selectedKey][this.quickCode].length > 0) {
            this.processData();
            if (typeof this.chart == 'undefined' || this.chart == null) {
              setTimeout(() => {
                this.initChart();
              }, 50);
            } else {
              this.rerender();
            }
            this.showNoData = false;
          } else {
            this.showNoData = true;
          }
        }
      });
  }

  rerender() {
    if (this.renderMode == 1) {
      // 模式1
      this.chart.clear();
      this.chart.source(this.data);
      this.chart.scale('date', {
        type: 'timeCat',
        mask: this.mask,
        values: this.times
      });
      this.chart.scale('value', {
        // tickCount: this.tickCount,
        ticks: this.valueTicks
      });
      this.chart.line().position('date*value').color(this.chartColor);
      this.chart.area().position('date*value').color(this.chartColor);
      this.chart.render();
    } else if (this.renderMode == 2) {
      // 模式2 其实和模式1一样，因为f2有bug，所以还是改为了清除再重绘
      this.chart.clear();
      this.chart.source(this.data);
      this.chart.scale('date', {
        type: 'timeCat',
        mask: this.mask,
        values: this.times
      });
      this.chart.scale('value', {
        // tickCount: this.tickCount,
        ticks: this.valueTicks
      });
      this.chart.line().position('date*value').color(this.chartColor);
      this.chart.area().position('date*value').color(this.chartColor);
      // this.geometry.position('date*value').color(this.chartColor);
      // this.geometryArea.position('date*value').color(this.chartColor);
      // this.chart.repaint();
      this.chart.render();
    } else if (this.renderMode == 3)
      // 模式3
      this.chart.changeData(this.data);
  }

}
