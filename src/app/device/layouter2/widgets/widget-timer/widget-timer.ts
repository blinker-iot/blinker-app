import { Component, Input, ChangeDetectorRef } from '@angular/core';
import { Layouter2Widget } from '../config';
import { Router } from '@angular/router';
import { deviceName12 } from 'src/app/core/functions/func';

@Component({
  selector: 'widget-timer',
  templateUrl: 'widget-timer.html',
  styleUrls: ['widget-timer.scss']
})
export class WidgetTimerComponent implements Layouter2Widget {

  @Input() device;
  @Input() widget;
  @Input() t0 = '定时任务';
  @Input() key = 'timing';
  @Input() lstyle = 0;

  get hasTask() {
    if (typeof this.device.data.timer != 'undefined')
      if (this.device.data.timer != '000')
        return true
    return false
  }

  constructor(
    public changeDetectorRef: ChangeDetectorRef,
    private router: Router
  ) { }

  gotoTimingPage() {
    if (this.device.config.mode == 'test') return
    this.router.navigate(['timer', deviceName12(this.device.deviceName)])
  }

}
