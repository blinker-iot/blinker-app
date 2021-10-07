import { Component, OnInit, Input, Output, SimpleChanges, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';
import { DataService } from 'src/app/core/services/data.service';
import { PickerController } from '@ionic/angular';
import { BlinkerDevice } from 'src/app/core/model/device.model';

@Component({
  selector: 'source-list',
  templateUrl: './source-list.component.html',
  styleUrls: ['./source-list.component.scss'],
})
export class SourceListComponent implements OnInit {

  @Input() device: BlinkerDevice;
  @Input() deviceId;
  @Output() updateSource = new EventEmitter;

  numPicker;
  // rangeList;
  // unitList;
  // valueList;
  range;
  unit;
  value;

  items = []

  @ViewChild('numinput', { read: ElementRef, static: true }) numInput: ElementRef;
  @ViewChild('numpickerbox', { read: ElementRef, static: true }) numPickerBox: ElementRef;

  constructor(
    private dataService: DataService,
    private deviceConfigService: DeviceConfigService,
    private pickerCtrl: PickerController
  ) { }

  ngOnInit() {
    console.log("SourceListComponent");
  }

  ngOnChanges(changes: SimpleChanges) {
    if (typeof this.device == 'undefined' && typeof this.deviceId == 'undefined') return;
    if (typeof this.deviceId != 'undefined') this.device = this.dataService.device.dict[this.deviceId]
    this.items = [];
    let deviceTriggerConfig;
    if (this.device.deviceType.indexOf('Diy') > -1) {
      deviceTriggerConfig = this.processDiyDevice()
    } else {
      deviceTriggerConfig = this.processProDevice()
    }
    console.log(deviceTriggerConfig);
    deviceTriggerConfig.forEach(triggerItem => {
      console.log(triggerItem);
      let item;
      let item2;
      if (this.isState(triggerItem)) {
        triggerItem.state_zh.forEach(stateItem => {
          item = {
            // text: `${triggerItem.source_zh}为${stateItem}`
            text: `${stateItem}`,
            source: triggerItem.source,
            operator: '=',
            value: triggerItem.state[triggerItem.state_zh.indexOf(stateItem)]
          }
          this.items.push(item)
        });
      } else {
        item = {
          text: `${triggerItem.source_zh}大于指定数值`,
          source: triggerItem.source,
          operator: '>'
        }
        this.items.push(item)
        item2 = {
          text: `${triggerItem.source_zh}小于指定数据`,
          source: triggerItem.source,
          operator: '<'
        }
        if (typeof triggerItem.range != 'undefined') {
          item['range'] = triggerItem.range
          item['unit'] = triggerItem.unit
          item2['range'] = triggerItem.range
          item2['unit'] = triggerItem.unit
        }
        this.items.push(item2)
      }
    });
    console.log(this.items);
  }

  processDiyDevice() {
    let layouterData = JSON.parse(this.device.config.layouter)
    console.log(layouterData);
    if (typeof layouterData.triggers != 'undefined') {
      if (layouterData.triggers.length > 0)
        return layouterData.triggers
    }
  }

  processProDevice() {
    let deviceConfig = this.deviceConfigService.getDeviceConfig(this.device);
    if (typeof deviceConfig.triggers == "undefined") deviceConfig.triggers = "[]";
    if (deviceConfig.triggers == "") deviceConfig.triggers = "[]";
    if (deviceConfig.triggers == "[]") {
      return
    }
    return JSON.parse(deviceConfig.triggers);
  }

  isState(triggerItem) {
    if (typeof triggerItem.state == 'undefined')
      return false
    return true
  }

  async selectSource(item) {
    console.log(item);
    if (typeof item.range != 'undefined') {
      this.range = item.range
      this.unit = item.unit
    }
    if (typeof item.value == 'undefined') {
      if (!await this.showPicker()) return
      item['value'] = this.value;
    }
    item['deviceId'] = this.deviceId;
    item['duration'] = 0;
    delete item['text']
    delete item['range']
    delete item['unit']
    this.updateSource.emit(item)
  }

  showPicker(): Promise<boolean> {
    let rangeArray = []
    for (let index = this.range[0]; index < this.range[1] + 1; index++) {
      rangeArray.push({
        text: index + ' ' + this.unit,
        value: index
      })
    }
    return new Promise(async (resolve, reject) => {
      const picker = await this.pickerCtrl.create({
        buttons: [
          {
            text: '取消',
            handler: data => {
              resolve(false)
            }
          },
          {
            text: '确认',
            handler: data => {
              this.value = data.value.value
              resolve(true)
            }
          }
        ],
        columns: [
          {
            name: 'value',
            options: rangeArray
          }
        ]
      })
      await picker.present();
    })
  }

  valueChanged() {

  }

}
