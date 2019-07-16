import { Component, Input, ChangeDetectorRef } from '@angular/core';
import { Layout2Component } from '../layout.component';
import { Events } from 'ionic-angular';

@Component({
  selector: 'layout2range',
  templateUrl: 'layout2range.html'
})
export class Layout2rangeComponent implements Layout2Component {

  @Input() device;
  @Input() layouter = {
    editMode: true
  };
  @Input() t0;
  @Input() min = 0;
  @Input() max = 100;
  _key;
  @Input()
  set key(key) {
    this.unsubscribe(this._key);
    this.subscribe(key);
    this._key = key;
  }
  get key() {
    return this._key;
  }
  @Input() lstyle = 0;
  @Input() value = 0;
  @Input() color = '#076EEF';
  @Input() disabled = false;

  constructor(
    public events: Events,
    public changeDetectorRef: ChangeDetectorRef
  ) {
  }

  ngAfterViewInit() {
    if (typeof (this.device) != 'undefined') {
      window.setTimeout(() => {
        this.subscribe(this.key);
      }, 100);
    }
  }

  ngOnDestroy() {
    if (typeof (this.device) != 'undefined')
      this.events.unsubscribe(this.device.deviceName + ':' + this.key);
  }

  subscribe(key) {
    if (typeof (this.device) != 'undefined')
      window.setTimeout(() => {
        this.events.subscribe(this.device.deviceName + ':' + key, message => {
          if (message == "loaded") {
            if (this.device.data.hasOwnProperty(key)) {
              this.processData(this.device.data[key])
            }
            window.setTimeout(() => {
              this.changeDetectorRef.detectChanges();
            }, 100);
            // this.changeDetectorRef.detectChanges();
          }
        });
      }, 100);
  }

  unsubscribe(key) {
    if (typeof (this.device) != 'undefined')
      this.events.unsubscribe(this.device.deviceName + ':' + key);
  }

  processData(data) {
    if (typeof data.val != "undefined") {
      this.value = data.val;
    }
    if (typeof data.col != "undefined") {
      this.color = data.col;
    }
    if (typeof data.tex != "undefined") {
      this.t0 = data.tex;
    }
    if (typeof data.t0 != "undefined") {
      this.t0 = data.t0;
    }

  }

  valueChange(value) {
    this.value = value;
    this.changeDetectorRef.detectChanges();
  }

  sendData(value) {
    if (this.layouter.editMode) return;
    let data = `{"${this.key}":${value}}\n`;
    this.events.publish('layout:send', data);
  }

}
