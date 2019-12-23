import { Component, Input } from '@angular/core';
import { Events } from '@ionic/angular';
import { timeToMinute, minuteToTime } from 'src/app/core/functions/func'
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { TimerService } from '../../timer.service';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'timer-countdown',
  templateUrl: 'countdown.html',
  styleUrls: ['countdown.scss']
})
export class CountdownComponent {

  get device() {
    return this.timerService.currentDevice
  }

  loaded;

  timeInfo = '00:00';
  countdownData = {
    "run": 1,
    "ttim": 1,
    "act": [],
  };

  constructor(
    public events: Events,
    private deviceService: DeviceService,
    private dataService: DataService,
    private timerService: TimerService
  ) { }

  ngOnInit() {
    this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.loaded = loaded
        this.timerService.loadTask('countdown');
        this.events.subscribe(this.device.deviceName + ":countdown", (message) => {
          if (message == "loaded") {
            if (this.device.data.countdown.run == 1) {
              this.countdownProcess();
            }
          }
        })
      }
    })
  }

  ngOnDestroy() {
    this.events.unsubscribe(this.device.deviceName + ":countdown");
    window.clearInterval(this.timer);
  }

  timer;
  countdownProcess() {
    this.timer = window.setInterval(() => {
      this.device.data.countdown.rtim++;
      if (this.device.data.countdown.ttim == this.device.data.countdown.rtim) {
        window.clearInterval(this.timer);
        window.setTimeout(() => {
          this.deviceService.sendData(this.device, `{"get":"countdown"}`)
        }, 1000)
      }
    }, 61000)
    this.device.data.countdown.ttim - this.device.data.countdown.rtim
  }

  selectTime(minute) {
    this.timeInfo = minuteToTime(minute)
  }

  pauseCountdown() {
    let data = {
      set: {
        countdown: { run: 0 }
      }
    }
    this.deviceService.sendData(this.device, JSON.stringify(data));
  }

  continueCountdown() {
    let data = {
      set: {
        countdown: { run: 1 }
      }
    }
    this.deviceService.sendData(this.device, JSON.stringify(data));
  }

  updateSelectedAction(act) {
    this.countdownData.act = [];
    this.countdownData.act.push(JSON.parse(act[0]));
  }

  startCountdown() {
    this.countdownData.ttim = timeToMinute(this.timeInfo);
    if (this.countdownData.act.length == 0) return;
    let uploadDate = this.countdownData;
    let data = {
      set: {
        countdown: uploadDate
      }
    }
    console.log(JSON.stringify(data));
    this.deviceService.sendData(this.device, JSON.stringify(data));
  }

  cancelCountdown() {
    let data = {
      set: {
        countdown: 'dlt'
      }
    }
    this.deviceService.sendData(this.device, JSON.stringify(data));
  }

}
