import { Component, Input } from '@angular/core';
import { Events, PickerController } from 'ionic-angular';
import { timeToMinute, minuteToTime } from '../../functions/func'

@Component({
  selector: 'countdown',
  templateUrl: 'countdown.html'
})
export class CountdownComponent {

  @Input() device;

  timeInfo = '00:00';
  countdownData = {
    "run": 1,
    "ttim": 1,
    "act": [],
  };

  constructor(
    public events: Events,
    private pickerCtrl: PickerController,
  ) {

  }

  ngAfterViewInit() {
    this.events.subscribe(this.device.deviceName + ":countdown", (message) => {
      if (message == "loaded") {
        if (this.device.data.countdown.run == 1) {
          this.countdownProcess();
        }
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
          this.events.publish("layout:send", `{"get":"countdown"}`);
        }, 2000)
      }
    }, 60000)
    this.device.data.countdown.ttim - this.device.data.countdown.rtim
  }

  selectTime(minute) {
    this.countdownData.ttim = minute;
    this.timeInfo = minuteToTime(minute)
  }

  pauseCountdown() {
    let data = {
      set: {
        countdown: { run: 0 }
      }
    }
    this.events.publish("layout:send", JSON.stringify(data));
  }

  continueCountdown() {
    let data = {
      set: {
        countdown: { run: 1 }
      }
    }
    this.events.publish("layout:send", JSON.stringify(data));
  }

  countdownActChange(actList) {
    this.countdownData.act = [];
    for (let act of actList) {
      this.countdownData.act.push(JSON.parse(act))
    }

    // this.countdownData.act = actList;
  }

  startCountdown() {
    if (this.countdownData.act.length == 0) return;
    let uploadDate = this.countdownData;
    let data = {
      set: {
        countdown: uploadDate
      }
    }

    this.events.publish("layout:send", JSON.stringify(data));
  }

  cancelCountdown() {
    let data = {
      set: {
        countdown: 'dlt'
      }
    }
    this.events.publish("layout:send", JSON.stringify(data));
  }

  showTimePicker(targe) {
    let picker = this.pickerCtrl.create({
      buttons: [
        {
          text: '取消',
          role: 'cancel'
        },
        {
          text: '确认',
          handler: (data: any) => {
            let time = `${data.flavor1.value}:${data.flavor2.value}`;
            this.timeInfo = time;
            this.countdownData.ttim = timeToMinute(time);
          }
        }
      ],
      columns: [
        {
          name: 'flavor1',
          columnWidth: '4em',
          suffix: ' :',
          options: [
            { text: '00' },
            { text: '01' },
            { text: '02' },
            { text: '03' },
            { text: '04' },
            { text: '05' },
            { text: '06' },
            { text: '07' },
            { text: '08' },
            { text: '09' },
            { text: '10' },
            { text: '11' },
            { text: '12' },
            { text: '13' },
            { text: '14' },
            { text: '15' },
            { text: '16' },
            { text: '17' },
            { text: '18' },
            { text: '19' },
            { text: '20' },
            { text: '21' },
            { text: '22' },
            { text: '23' }
          ]
        },
        {
          name: 'flavor2',
          columnWidth: '4em',
          options: [
            { text: '00' },
            { text: '01' },
            { text: '02' },
            { text: '03' },
            { text: '04' },
            { text: '05' },
            { text: '06' },
            { text: '07' },
            { text: '08' },
            { text: '09' },
            { text: '10' },
            { text: '11' },
            { text: '12' },
            { text: '13' },
            { text: '14' },
            { text: '15' },
            { text: '16' },
            { text: '17' },
            { text: '18' },
            { text: '19' },
            { text: '20' },
            { text: '21' },
            { text: '22' },
            { text: '23' },
            { text: '24' },
            { text: '25' },
            { text: '26' },
            { text: '27' },
            { text: '28' },
            { text: '29' },
            { text: '30' },
            { text: '31' },
            { text: '32' },
            { text: '33' },
            { text: '34' },
            { text: '35' },
            { text: '36' },
            { text: '37' },
            { text: '38' },
            { text: '39' },
            { text: '40' },
            { text: '41' },
            { text: '42' },
            { text: '43' },
            { text: '44' },
            { text: '45' },
            { text: '46' },
            { text: '47' },
            { text: '48' },
            { text: '49' },
            { text: '50' },
            { text: '51' },
            { text: '52' },
            { text: '53' },
            { text: '54' },
            { text: '55' },
            { text: '56' },
            { text: '57' },
            { text: '58' },
            { text: '59' }
          ]
        },
      ]
    });
    picker.present();
  }

}
