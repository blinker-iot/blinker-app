import { Component, Renderer2 } from '@angular/core';
import { IonicPage, NavController, NavParams, PickerController, ViewController, AlertController, Events } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'page-own-plug-add-timing',
  templateUrl: 'own-plug-add-timing.html',
})
export class OwnPlugAddTimingPage {

  public timingData;
  public time;
  timeInfo = '00:00';
  device;
  buttonList = [];
  actionList = []

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private pickerCtrl: PickerController,
    public renderer: Renderer2,
    public viewCtrl: ViewController,
    public alertCtrl: AlertController,
    public events: Events,
  ) {
    this.device = navParams.data.device;
    this.timingData = navParams.data.task;
    this.timeInfo = this.minuteToTime(this.timingData.tim);
  }

  ionViewDidLoad(

  ) {

  }

  choseDay(num) {
    let days = '';
    this.timingData.day;
    for (var i = 0; i < this.timingData.day.length; i++) {
      if (num == i) {
        days = days + (this.timingData.day[num] == '1' ? '0' : '1');
      } else {
        days = days + this.timingData.day[i];
      }
    }
    this.timingData.day = days;
    console.log(this.timingData.day);
  }


  minuteToTime(minute): string {
    let h = Math.floor(minute / 60);
    let time = "";
    let m = Math.floor(minute % 60);
    if (h < 10) time = "0" + h + ":";
    else time = h + ":";
    if (m < 10) time += "0" + m;
    else time += m;
    return time;
  }

  timeToMinute(time): number {
    let h = time.split(':')[0];
    let m = time.split(':')[1];
    let minute = Number(h) * 60 + Number(m);
    return minute;
  }

  showTimePicker() {
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
            this.timingData.tim = this.timeToMinute(time);
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

  save() {
    //检查act是否为空,如果为空提示用户，是否放弃编辑
    if (this.timingData.act.length == 0) {
      this.viewCtrl.dismiss();
      return;
    }
    let uploadDate = JSON.parse(JSON.stringify(this.timingData));
    // uploadDate['task'] = this.device.data.timing.length;
    let btnActList = []
    for (let btnAct of this.timingData.act) {
      btnActList.push(JSON.parse(btnAct))
    }
    uploadDate.act = btnActList;
    let data = {
      set: {
        timing: []
      }
    }
    data.set.timing.push(uploadDate);
    this.events.publish("layout:send", JSON.stringify(data));
    this.viewCtrl.dismiss();
  }

  delete() {
    let data = {
      set: {
        timing: [{ dlt: this.timingData.task }]
      }
    }
    this.events.publish("layout:send", JSON.stringify(data));
    this.viewCtrl.dismiss();
  }

}
