import { Component, Input, ViewChild, ElementRef } from '@angular/core';
import { Layouter2Widget } from '../config';
import { CloudStorageService } from 'src/app/core/services/cloudStorage.service';
import { Layouter2Service } from '../../layouter2.service';
import { DataService } from 'src/app/core/services/data.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { BlinkerDevice } from 'src/app/core/model/device.model';

@Component({
  selector: 'widget-chart',
  templateUrl: 'widget-chart.html',
  styleUrls: ['widget-chart.scss']
})
export class WidgetChartComponent implements Layouter2Widget {

  @Input() device: BlinkerDevice;
  @Input() widget;

  showNoData = false;
  showChart = false;

  get isHidden() {
    if (this.quickCode == 'rt')
      return this.data.length == 0
    else
      return this.showNoData
  }

  quickCode = '1h';

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

  get selectedKey() {
    return this.selectedItem.key
  }

  get key() {
    return this.widget.key;
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
    private LayouterService: Layouter2Service,
    private dataService: DataService,
    private noticeService: NoticeService
  ) { }

  async ngOnInit() {
    this.selectedItem = this.widget.items[0];
    this.quickCode = localStorage.getItem(`${this.device.deviceName}:${this.key}`) ?? '1h'
    setTimeout(() => {
      this.showChart = true
    }, 500)
  }

  ngOnDestroy(): void {
    clearInterval(this.updateTimer)
  }


  ngAfterViewInit() {
    if (this.device.config.mode == 'test') return
    setTimeout(() => {
      this.changeQuickCode()
    }, 100);
    this.LayouterService.action.subscribe(act => {
      if (act.data == this.widget) {
        this.changeQuickCode()
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
  }

  changeQuickCode() {
    if (this.quickCode == 'rt') {
      this.renderRtChart();
    } else {
      clearInterval(this.updateTimer)
      this.getDataFromCloud();
    }
    localStorage.setItem(`${this.device.deviceName}:${this.key}`, this.quickCode)
  }

  selectedItem;
  selectItem(item) {
    if (this.selectedItem == item) return;
    this.selectedItem = item;
    if (this.quickCode == 'rt') {
      this.renderRtChart();
    } else {
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
    // console.log('renderRtChart');
    if (!this.dataService.isAdvancedDeveloper) {
      this.noticeService.showToast('canNotBeUsed3');
      return;
    }
    if (typeof this.selectedKey == 'undefined') return
    this.updateData();
  }

  updateTimer;
  // getDataTimer;
  updateData() {
    clearInterval(this.updateTimer)
    this.data = []
    this.updateTimer = setInterval(() => {
      let newData = this.data.map(el => {
        return {
          date: el.date,
          value: el.value
        }
      })
      let newEl = this.getRtData(this.selectedKey)
      if (typeof newEl == 'undefined') return

      // if (newData != null) {
      newData.push({
        date: new Date(newEl.date * 1000),
        value: newEl.value
      })
      if (newData.length > 59) newData.shift()
      this.data = newData
      // }
    }, 1000);
  }

  refresh() {

  }

}
