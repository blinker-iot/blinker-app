import { Component, Input, ViewChild, ElementRef } from '@angular/core';
import { Layouter2Widget } from '../config';
import { CloudStorageService } from 'src/app/core/services/cloudStorage.service';
import { LayouterService } from '../../../layouter.service';
import { DataService } from 'src/app/core/services/data.service';
import { NoticeService } from 'src/app/core/services/notice.service';

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

  showNoData = false;
  showChart = false;

  get isHidden() {
    if (this.quickCode == 'rt')
      return this.data.length == 0
    else
      return this.showNoData
  }

  quickCode = '1h';
  valueTicks;
  renderMode = 1;

  get mask() {
    if (this.quickCode == '1h') return 'HH:mm'
    if (this.quickCode == '1d') return 'HH:mm'
    if (this.quickCode == '1w') return 'M.D'
  }

  data = [];

  getRtData(key) {
    if (typeof this.device.data[key] != 'undefined') {
      if (typeof this.device.data[key]['date'] != 'undefined') {
        return { value: this.device.data[key].val, date: this.device.data[key].date }
      }
    }
  }

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
    return this.widget.key0;
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
    private LayouterService: LayouterService,
    private dataService: DataService,
    private noticeService: NoticeService
  ) { }

  ngOnInit() {
    this.selectedKey = this.key0;
    setTimeout(() => {
      this.showChart = true
    }, 300)
  }

  ngOnDestroy(): void {
    clearInterval(this.updateTimer)
    clearInterval(this.getDataTimer)
  }


  ngAfterViewInit() {
    if (this.device.config.mode == 'test') return
    setTimeout(() => {
      // this.initChart();
      this.getDataFromCloud();
    }, this.isDemo ? 500 : 100);
    if (!this.isDemo)
      this.LayouterService.action.subscribe(act => {
        if (act.data == this.widget) {
          if (typeof this.chart != 'undefined') {
            this.chart.destroy();
            this.chart = null;
            this.getDataFromCloud();
          }
        }
      })

  }

  // times;
  processData() {
    let min = null;
    let max = null;
    let data = [];
    // this.times = []
    this.device.data['history'][this.selectedKey][this.quickCode].forEach(element => {
      let date = new Date(element.date * 1000);
      data.push({ date: date, value: element.value })
      // 计算最大最小值
      // if (element.value > max || max == null) max = Math.ceil(element.value);
      // if (element.value < min || min == null) min = Math.floor(element.value);
    });
    this.data = data
    // let a = (max - min) / 3;
    // this.valueTicks = [min, Math.ceil((min + a) * 100) / 100, Math.ceil((min + a + a) * 100) / 100, max]
    // if (this.quickCode == '1h') this.times = this.times.slice(this.times.length - 21, this.times.length - 1);
    // if (this.quickCode == '1d') this.times = this.times.slice(this.times.length - 13, this.times.length - 1);
    // if (this.quickCode == '1w') this.times = this.times.slice(this.times.length - 24, this.times.length - 1);
  }

  switch(item) {
    if (item == 0) this.selected0 = !this.selected0;
    if (item == 1) this.selected1 = !this.selected1;
    if (item == 2) this.selected2 = !this.selected2;
  }

  changeQuickCode() {
    if (this.quickCode == 'rt') {
      // this.renderRtChart();
    } else {
      clearInterval(this.updateTimer)
      clearInterval(this.getDataTimer)
      this.getDataFromCloud();
    }
  }

  changeKey(key) {
    if (this.selectedKey == key) return;
    this.selectedKey = key;
    if (this.quickCode == 'rt') {
      //  this.renderRtChart();
    }
    else {
      this.getDataFromCloud();
    }

  }

  getDataFromCloud() {
    if (typeof this.selectedKey != 'undefined')
      this.cloudStorageService.getTimeSeriesData(this.device, this.selectedKey, this.quickCode)
        .then(result => {
          if (result) {
            if (this.device.data['history'][this.selectedKey][this.quickCode].length > 0) {
              this.processData();
              this.showNoData = false;
            } else {
              this.showNoData = true;
            }
          }
        });
  }

  renderRtChart() {
    if (!this.dataService.isAdvancedDeveloper) {
      this.noticeService.showToast('canNotBeUsed3');
      return;
    }
    this.updateData();
  }

  updateTimer;
  getDataTimer;
  updateData() {
    if (typeof this.selectedKey == 'undefined') return
    let cmd = {}
    cmd[this.key] = { "get": this.selectedKey }
    clearInterval(this.getDataTimer)
    clearInterval(this.updateTimer)
    this.LayouterService.send(cmd)
    this.getDataTimer = setInterval(() => {
      this.LayouterService.send(cmd)
    }, 14000)
    this.updateTimer = setInterval(() => {
      let newData = [this.getRtData(this.selectedKey)]
      if (newData != null) {
        this.mergeNewData2Data(newData)
        if (this.data.length > 59) this.data.shift()
        this.chart.changeData(this.data);
      }
    }, 1000);
  }

  mergeNewData2Data(newRtData) {
    for (let index = 0; index < newRtData.length; index++) {
      const element_new = newRtData[index];
      if (typeof element_new['date'] == 'undefined') return
      let isExist = false
      for (let index = 0; index < this.data.length; index++) {
        const element = this.data[index];
        if (element.date == element_new.date) {
          isExist = true;
          break;
        }
      }
      if (!isExist) this.data.push(element_new)
    }
  }

}
