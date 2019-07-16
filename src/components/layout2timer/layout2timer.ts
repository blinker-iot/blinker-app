import { Component, Input, ChangeDetectorRef } from '@angular/core';
import { Layout2Component } from '../layout.component';
import {
  Events,
} from 'ionic-angular';

@Component({
  selector: 'layout2timer',
  templateUrl: 'layout2timer.html'
})
export class Layout2timerComponent implements Layout2Component {

  @Input() device;
  @Input() layouter = {
    editMode: false
  };
  @Input() t0 = '定时任务';
  @Input() key = 'timing';
  @Input() lstyle = 0;
  @Input() disabled = false;
  hasTask;

  constructor(
    public events: Events,
    public changeDetectorRef: ChangeDetectorRef,
  ) {
  }


  ngAfterViewInit() {
    if (typeof this.device != 'undefined') {
      this.events.subscribe(this.device.deviceName + ':timer', message => {
        if (this.device.data.timer != "000") {
          this.hasTask = true;
        } else {
          this.hasTask = false;
        }
        this.changeDetectorRef.detectChanges();
      });
      this.events.subscribe(this.device.deviceName + ':timing', message => {
        // console.log("timing update");
        // console.log(this.device.data.timer);
        if (this.device.data.timing.length != 0) {
          this.hasTask = true;
        } else {
          this.hasTask = false;
        }

        this.changeDetectorRef.detectChanges();
      });
      // this.events.subscribe(this.device.deviceName + ':countdown', message => {
      //   if (this.device.data.timer != "000") {
      //     this.hasTask = true;
      //   } else {
      //     this.hasTask = false;
      //   }
      //   this.changeDetectorRef.detectChanges();
      // });
      // this.events.subscribe(this.device.deviceName + ':loop', message => {
      //   if (this.device.data.timer != "000") {
      //     this.hasTask = true;
      //   } else {
      //     this.hasTask = false;
      //   }
      //   this.changeDetectorRef.detectChanges();
      // });


    }
  }

  ngOnDestroy() {
    if (typeof this.device != 'undefined') {
      this.events.unsubscribe(this.device.deviceName + ':timer');
      this.events.unsubscribe(this.device.deviceName + ':timing');
      // this.events.unsubscribe(this.device.deviceName + ':countdown');
      // this.events.unsubscribe(this.device.deviceName + ':loop');
    }
  }

  gotoTimingPage() {
    if (this.disabled) return;
    this.events.publish("layout:goto", "Layout2TimerPage");
  }

}
