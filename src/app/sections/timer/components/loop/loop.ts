import { Component, Input } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { TimerService } from '../../timer.service';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'timer-loop',
  templateUrl: 'loop.html',
  styleUrls: ['loop.scss']
})
export class LoopComponent {

  get device() {
    return this.timerService.currentDevice
  }

  loaded;

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
    public deviceService: DeviceService,
    private dataService: DataService,
    private timerService: TimerService
  ) {
  }

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.loaded = loaded
        this.timerService.loadTask('loop');
      }
    })
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  startLoop() {
    let uploadDate
    let data = {
      set: {
        countdown: uploadDate
      }
    }
  }

  cancelLoop() {
    let data = {
      set: {
        loop: 'dlt'
      }
    }
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
      return;
    }
    if (this.loopBtn == "继续") {
      // this.loopBtn = "暂停";
      let data = {
        set: {
          loop: { run: 1 }
        }
      }
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

  pauseCountdown() {

  }

}
