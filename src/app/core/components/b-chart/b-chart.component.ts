import { Component, Input, ViewChild, ElementRef, OnInit } from '@angular/core';
// import * as F2 from '@antv/f2/dist/f2-all.min';
import { CloudStorageService } from 'src/app/core/services/cloudStorage.service';

@Component({
  selector: 'b-chart',
  templateUrl: './b-chart.component.html',
  styleUrls: ['./b-chart.component.scss'],
})
export class BChartComponent implements OnInit {

  @Input() device;

  @Input() key = "test";
  @Input() color = "#FFF";
  @Input() style = "black";

  chart;
  geometry;
  geometryArea;
  showNoData = false;
  quickCode = '1h';
  valueTicks;
  renderMode = 1;

  get mask() {
    if (this.quickCode == '1h') return 'HH:mm'
    if (this.quickCode == '1d') return 'HH:mm'
    if (this.quickCode == '1w') return 'M.D HH:mm'
  }

  data;

  @ViewChild('chartCanvas', { read: ElementRef, static: true }) chartCanvas: ElementRef;
  @ViewChild('chartbox', { read: ElementRef, static: true }) chartBox: ElementRef;

  constructor(
    private cloudStorageService: CloudStorageService,
  ) { }

  ngOnInit() {

  }

  ngAfterViewInit() {
    if (this.device.config.mode == 'test') return
    this.renderChart();
  }

  times;
  processData() {
    let min = null;
    let max = null;
    this.data = [];
    this.times = []
    this.device.data['history'][this.key][this.quickCode].forEach(element => {
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
    // this.chart = new F2.Chart({
    //   el: this.chartCanvas.nativeElement,
    //   width: this.chartBox.nativeElement.clientWidth,
    //   height: this.chartBox.nativeElement.clientHeight,
    //   padding: [58, 'auto', 26, 'auto'],
    //   pixelRatio: window.devicePixelRatio
    // });

    this.chart.source(this.data);
    this.chart.scale('date', {
      type: 'timeCat',
      mask: this.mask,
      values: this.times,
    });
    this.chart.scale('value', {
      // tickCount: this.tickCount,
      ticks: this.valueTicks
    });
    this.chart.axis('date', {
      label: {
        fill: this.style=='white'?'#fff':'#000',
        // textStyle: {
        //   fill: this.style=='white'?'#fff':'#000',
        // }
      }
    });
    this.chart.axis('value', {
      label: {
        fill: this.style=='white'?'#fff':'#000',
        // textStyle: {
        //   fill:  this.style=='white'?'#fff':'#000',
        // }
      }
    });
    this.geometry = this.chart.line();
    this.geometryArea = this.chart.area();
    this.geometry.position('date*value').color(this.color);
    this.geometryArea.position('date*value').color(this.color);
    this.chart.interaction('pan');

    this.chart.scrollBar({
      mode: 'x',
      xStyle: {
        offsetY: -5
      }
    });

    this.chart.render();
  }

  changeQuickCode() {
    this.renderMode = 1;
    this.renderChart();
  }

  renderChart() {
    this.cloudStorageService.getTimeSeriesData(this.device, this.key, this.quickCode)
      .then(result => {
        if (result) {
          if (this.device.data['history'][this.key][this.quickCode].length > 0) {
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
    this.chart.clear();
    this.chart.source(this.data);
    this.chart.scale('date', {
      type: 'timeCat',
      mask: this.mask,
      values: this.times
    });
    this.chart.scale('value', {
      ticks: this.valueTicks
    });
    this.chart.line().position('date*value').color(this.color);
    this.chart.area().position('date*value').color(this.color);
    this.chart.render();
  }

}
