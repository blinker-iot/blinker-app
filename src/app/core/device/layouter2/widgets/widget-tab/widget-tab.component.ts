import { Component, OnInit, Input } from '@angular/core';
import { Layouter2Widget } from '../config';
import { Events } from '@ionic/angular';

@Component({
  selector: 'widget-tab',
  templateUrl: './widget-tab.component.html',
  styleUrls: ['./widget-tab.component.scss'],
})
export class WidgetTabComponent implements Layouter2Widget {

  @Input() device;
  @Input() widget;

  get key() {
    return this.widget.key;
  }

  @Input() lstyle;

  get t0() {
    return this.getValue(['tex', 't0'])
  }

  get ico() {
    return this.getValue(['ico', 'icon'])
  }

  get value() {
    return this.getValue(['val'])
  }

  get val() {
    if (typeof this.value == 'undefined') return false
    return this.getValue(['val'])[0] == '1' ? true : false
  }

  get t1() {
    return this.getValue(['tex1', 't1'])
  }

  get ico1() {
    return this.getValue(['ico1', 'icon1'])
  }

  get val1() {
    if (typeof this.value == 'undefined') return false
    return this.getValue(['val'])[1] == '1' ? true : false
  }

  get t2() {
    return this.getValue(['tex2', 't2'])
  }

  get ico2() {
    return this.getValue(['ico2', 'icon2'])
  }

  get val2() {
    if (typeof this.value == 'undefined') return false
    return this.getValue(['val'])[2] == '1' ? true : false
  }

  get t3() {
    return this.getValue(['tex3', 't3'])
  }

  get ico3() {
    return this.getValue(['ico3', 'icon3'])
  }

  get val3() {
    if (typeof this.value == 'undefined') return false
    return this.getValue(['val'])[3] == '1' ? true : false
  }

  get t4() {
    return this.getValue(['tex4', 't4'])
  }

  get ico4() {
    return this.getValue(['ico4', 'icon4'])
  }

  get val4() {
    if (typeof this.value == 'undefined') return false
    return this.getValue(['val'])[4] == '1'
  }

  get color() {
    return this.getValue(['clr', 'col'])
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

  constructor(
    public events: Events
  ) { }

  ngOnInit() {
    // this.device.data[this.key]={}
    // this.device.data[this.key]['val']="10101"
  }

  selectTab(tabId) {
    let selectList;
    if (typeof this.value == 'undefined')
      selectList = '00000'
    else
      selectList = this.value;

    let newSelectList = '';
    for (var i = 0; i < selectList.length; i++) {
      if (tabId == i) {
        newSelectList = newSelectList + (selectList[tabId] == '0' ? '1' : '0');
      } else {
        newSelectList = newSelectList + selectList[i];
      }
    }
    let data = `{"${this.key}":"${newSelectList}"}`;
    this.events.publish('layouter2', 'send', data + '\n');
  }

}
