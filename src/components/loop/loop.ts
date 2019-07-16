import { Component, Input } from '@angular/core';
import { Events } from 'ionic-angular';

@Component({
  selector: 'loop',
  templateUrl: 'loop.html'
})
export class LoopComponent {

  @Input() device;

  timeInfo = '00:00';
  loopData = {
    "tim": 1,
    "run": 1,
    "dur1": 5,
    "act1": [`{"btn":"tap"}`, `{"btn":"hahah"}`],
    "dur2": 1,
    "act2": [`{"btn":"tap"}`, `{"btn":"ttt"}`],
  };

  constructor(
    public events: Events,
  ) {

  }

  startLoop() {
    let uploadDate
    let data = {
      set: {
        countdown: uploadDate
      }
    }
    this.events.publish("layout:send", JSON.stringify(data));
  }

  cancelLoop() {
    let data = {
      set: {
        loop: 'dlt'
      }
    }
    this.events.publish("layout:send", JSON.stringify(data));
  }

  loopBtn = "暂停";
  tapLoopBtn() {
    if (this.loopBtn == "暂停") {
      // this.loopBtn = "继续";
      let data = {
        set: {
          loop: { run: 0 }
        }
      }
      this.events.publish("layout:send", JSON.stringify(data));
      return;
    }
    if (this.loopBtn == "继续") {
      // this.loopBtn = "暂停";
      let data = {
        set: {
          loop: { run: 1 }
        }
      }
      this.events.publish("layout:send", JSON.stringify(data));
      return;
    }
  }

  exchange() {
    let dur = this.loopData.dur1
    let act = this.loopData.act1
    this.loopData.dur1 = this.loopData.dur2
    this.loopData.act1 = this.loopData.act2
    this.loopData.dur2 = dur
    this.loopData.act2 = act

  }

}
