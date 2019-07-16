import { Component, Input, ChangeDetectorRef } from '@angular/core';
import { Events } from 'ionic-angular';
import { Layout2Component } from '../layout.component';
import { styleList } from '../../components/layout.component';

@Component({
  selector: 'layout2text',
  templateUrl: 'layout2text.html'
})
export class Layout2textComponent implements Layout2Component {

  @Input() self;
  @Input() device;
  @Input() layouter = {
    editMode: false
  };
  @Input() t0;
  @Input() t1;
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

  constructor(
    public events: Events,
    private changeDetectorRef: ChangeDetectorRef,
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
        // console.log("this.device test:");
        this.events.subscribe(this.device.deviceName + ':' + key, message => {
          if (message == "loaded") {
            if (this.device.data.hasOwnProperty(key)) {
              this.processData(this.device.data[key])
            }
            this.changeDetectorRef.detectChanges();
          }
        });
      }, 100);
  }

  processData(data) {
    if (typeof data.t0 != "undefined")
      this.t0 = data.t0;
    if (typeof data.t1 != "undefined")
      this.t1 = data.t1;
    if (typeof data.tex != "undefined")
      this.t0 = data.tex;
    if (typeof data.tex1 != "undefined")
      this.t1 = data.tex1;
  }

  unsubscribe(key) {
    if (typeof (this.device) != 'undefined')
      this.events.unsubscribe(this.device.deviceName + ':' + key);
  }

  // tap() {
  //   this.style = this.style + 1;
  // }

}
