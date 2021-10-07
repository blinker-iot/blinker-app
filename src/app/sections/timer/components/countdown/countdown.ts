import { ChangeDetectorRef, Component } from '@angular/core';
import { timeToMinute, minuteToTime } from 'src/app/core/functions/func'
import { DeviceService } from 'src/app/core/services/device.service';
import { TimerService } from '../../timer.service';
import { DataService } from 'src/app/core/services/data.service';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { ModalController } from '@ionic/angular';
import { ActionSelectorModalComponent } from 'src/app/core/modals/action-selector-modal/action-selector-modal.component';
import { TimeSelectorModalComponent } from 'src/app/core/modals/time-selector-modal/time-selector-modal.component';

@Component({
  selector: 'timer-countdown',
  templateUrl: 'countdown.html',
  styleUrls: ['countdown.scss']
})
export class CountdownComponent {

  device: BlinkerDevice;
  deviceSubject;
  loaded;

  timeInfo = '00:00';
  countdownData = {
    "run": 1,
    "ttim": 1,
    "act": [],
  };

  constructor(
    private deviceService: DeviceService,
    private dataService: DataService,
    private timerService: TimerService,
    private modalCtrl: ModalController,
    private cd: ChangeDetectorRef
  ) { }

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.device = this.timerService.currentDevice
        this.timerService.loadTask('countdown');
        this.loaded = loaded
        this.deviceSubject = this.device.subject.subscribe((message) => {
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
    this.subscription.unsubscribe();
    this.deviceSubject.unsubscribe();
    window.clearInterval(this.timer);
  }


  async openTimeModal() {
    const modal = await this.modalCtrl.create({
      component: TimeSelectorModalComponent,
      componentProps: {
        data: this.timeInfo
      }
    });
    modal.onDidDismiss().then(result => {
      console.log(result.data);
      if (typeof result.data != 'undefined')
        this.timeInfo = result.data
    })
    return await modal.present();
  }

  async openActionModal() {
    const modal = await this.modalCtrl.create({
      component: ActionSelectorModalComponent,
      componentProps: {
        device: this.device
      }
    });
    modal.onDidDismiss().then(result => {
      // console.log(result.data);
      if (typeof result.data != 'undefined') {
        // this.actcmd = result.data
        this.countdownData.act = [JSON.stringify(result.data)];
      }
    })
    return await modal.present();
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
    setTimeout(() => {
      this.cd.detectChanges()
    }, 1000);
  }

  continueCountdown() {
    let data = {
      set: {
        countdown: { run: 1 }
      }
    }
    this.deviceService.sendData(this.device, JSON.stringify(data));
    setTimeout(() => {
      this.cd.detectChanges()
    }, 1000);
  }

  updateSelectedAction(act) {
    this.countdownData.act = [];
    this.countdownData.act.push(JSON.parse(act[0]));
  }

  startCountdown() {
    if (this.timeInfo == '00:00') return;
    this.countdownData.ttim = timeToMinute(this.timeInfo);
    if (this.countdownData.act.length == 0) return;
    let uploadDate = this.countdownData;
    let data = {
      set: {
        countdown: uploadDate
      }
    }
    this.deviceService.sendData(this.device, JSON.stringify(data));
    setTimeout(() => {
      this.cd.detectChanges()
    }, 1000);
  }

  cancelCountdown() {
    let data = {
      set: {
        countdown: 'dlt'
      }
    }
    this.deviceService.sendData(this.device, JSON.stringify(data));
    setTimeout(() => {
      this.cd.detectChanges()
    }, 1000);
  }

}
