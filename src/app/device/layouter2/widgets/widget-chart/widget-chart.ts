import { Component, Input } from '@angular/core';
import { Layouter2Widget } from '../config';
import { CloudStorageService } from 'src/app/core/services/cloudStorage.service';
import { LayouterService } from '../../../layouter.service';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { NgStyle, NgClass } from '@angular/common';
import { LineChartAreaComponent } from '../../../../core/charts/line-chart-area/line-chart-area.component';
import { FormsModule } from '@angular/forms';
import {
  createWidgetChartDemoData,
  WidgetChartDataPoint,
} from './widget-chart-demo.data';

@Component({
  selector: 'widget-chart',
  templateUrl: 'widget-chart.html',
  styleUrls: ['widget-chart.scss'],
  imports: [NgStyle, LineChartAreaComponent, NgClass, FormsModule],
})
export class WidgetChartComponent implements Layouter2Widget {
  @Input() device: BlinkerDevice;
  @Input() widget;
  @Input() isDemo = false;
  // chart;

  showNoData = false;

  get isHidden() {
    if (this.quickCode == 'rt') return this.data.length == 0;
    else return this.showNoData;
  }

  quickCode = '1h';

  get mask() {
    if (this.quickCode == '1h') return 'HH:mm';
    if (this.quickCode == '1d') return 'HH:mm';
    if (this.quickCode == '1w') return 'M.D';
  }

  data: WidgetChartDataPoint[] = [];

  private get shouldUsePreviewData() {
    return (
      this.isDemo ||
      this.device?.config?.isPreview ||
      this.device?.config?.mode == 'test'
    );
  }

  getRtData(key) {
    if (typeof this.device.data[key] != 'undefined') {
      if (typeof this.device.data[key]['date'] != 'undefined') {
        return {
          value: this.device.data[key].val,
          date: this.device.data[key].date,
        };
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
    if (this.selectedKey == this.key0) return this.style0;
    if (this.selectedKey == this.key1) return this.style1;
    if (this.selectedKey == this.key2) return this.style2;
  }

  get chartColor() {
    if (this.selectedKey == this.key0) return this.color0;
    if (this.selectedKey == this.key1) return this.color1;
    if (this.selectedKey == this.key2) return this.color2;
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
        return this.widget[valueKey];
    }
    return;
  }

  _lstyle;
  @Input()
  set lstyle(lstyle) {
    this._lstyle = lstyle;
  }
  get lstyle() {
    if (typeof this._lstyle != 'undefined') return this._lstyle;
    if (typeof this.widget.lstyle != 'undefined') return this.widget.lstyle;
    return 0;
  }

  constructor(
    private cloudStorageService: CloudStorageService,
    private LayouterService: LayouterService
  ) {}

  async ngOnInit() {
    this.selectedKey = this.key0;
    if (this.shouldUsePreviewData) {
      this.quickCode = '1h';
      this.loadPreviewData();
    } else {
      this.quickCode =
        localStorage.getItem(`${this.device.deviceName}:${this.key}`) ?? '1h';
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.updateTimer);
  }

  ngAfterViewInit() {
    if (this.shouldUsePreviewData) return;
    setTimeout(() => {
      this.changeQuickCode();
    }, 100);
    this.LayouterService.action.subscribe((act) => {
      if (act.data == this.widget) {
        this.changeQuickCode();
      }
    });
  }

  private loadPreviewData() {
    clearInterval(this.updateTimer);
    const history =
      this.device?.data?.['history']?.[this.selectedKey]?.[this.quickCode];

    if (Array.isArray(history) && history.length > 0) {
      this.processData();
    } else {
      this.data = createWidgetChartDemoData();
    }
    this.showNoData = false;
  }

  // times;
  processData() {
    let min = null;
    let max = null;
    let data: WidgetChartDataPoint[] = [];
    // this.times = []
    this.device.data['history'][this.selectedKey][this.quickCode].forEach(
      (element) => {
        let date = new Date(element.date * 1000);
        data.push({ date: date, value: element.value });
        // 计算最大最小值
        // if (element.value > max || max == null) max = Math.ceil(element.value);
        // if (element.value < min || min == null) min = Math.floor(element.value);
      }
    );
    this.data = data;
  }

  switch(item) {
    if (item == 0) this.selected0 = !this.selected0;
    if (item == 1) this.selected1 = !this.selected1;
    if (item == 2) this.selected2 = !this.selected2;
  }

  changeQuickCode() {
    if (this.shouldUsePreviewData) {
      this.loadPreviewData();
    } else if (this.quickCode == 'rt') {
      this.renderRtChart();
    } else {
      clearInterval(this.updateTimer);
      this.getDataFromCloud();
    }
    if (!this.shouldUsePreviewData)
      localStorage.setItem(
        `${this.device.deviceName}:${this.key}`,
        this.quickCode
      );
  }

  changeKey(key) {
    if (this.selectedKey == key) return;
    this.selectedKey = key;
    if (this.shouldUsePreviewData) {
      this.loadPreviewData();
    } else if (this.quickCode == 'rt') {
      this.renderRtChart();
    } else {
      this.getDataFromCloud();
    }
  }

  getDataFromCloud() {
    if (typeof this.selectedKey != 'undefined')
      this.cloudStorageService
        .getTimeSeriesData(this.device, this.selectedKey, this.quickCode)
        .then((result) => {
          if (result) {
            if (
              this.device.data['history'][this.selectedKey][this.quickCode]
                .length > 0
            ) {
              this.processData();
              this.showNoData = false;
            } else {
              this.showNoData = true;
            }
          }
        });
  }

  renderRtChart() {
    if (typeof this.selectedKey == 'undefined') return;
    this.updateData();
  }

  updateTimer;
  // getDataTimer;
  updateData() {
    clearInterval(this.updateTimer);
    this.data = [];
    this.updateTimer = setInterval(() => {
      let newData = this.data.map((el) => {
        return {
          date: el.date,
          value: el.value,
        };
      });
      let newEl = this.getRtData(this.selectedKey);
      if (typeof newEl == 'undefined') return;

      const nextPoint = {
        date: new Date(newEl.date * 1000),
        value: newEl.value,
      };
      const lastPoint = newData[newData.length - 1];
      const nextTime = nextPoint.date.getTime();

      if (!Number.isFinite(nextTime)) return;
      if (lastPoint) {
        const lastTime = lastPoint.date.getTime();
        if (nextTime < lastTime) return;
        if (nextTime === lastTime) newData[newData.length - 1] = nextPoint;
        else newData.push(nextPoint);
      } else {
        newData.push(nextPoint);
      }

      if (newData.length > 59) newData.shift();
      this.data = newData;
    }, 1000);
  }

  refresh() {}
}
