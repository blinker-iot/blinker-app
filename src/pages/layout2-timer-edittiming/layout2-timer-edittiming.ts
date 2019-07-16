import { Component, Renderer2, ViewChildren, ElementRef, QueryList } from '@angular/core';
import { IonicPage, NavController, NavParams, PickerController, ViewController, AlertController, Events } from 'ionic-angular';
import { styleList } from '../../components/layout.component';
import { timeToMinute, minuteToTime } from '../../functions/func'


@IonicPage()
@Component({
  selector: 'page-layout2-timer-edittiming',
  templateUrl: 'layout2-timer-edittiming.html',
})
export class Layout2TimerEdittimingPage {

  public timingData;
  public time;
  timeInfo = '00:00';
  device;
  buttonList = [];
  actionList = []

  @ViewChildren('demo') demoList: QueryList<ElementRef>;

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
    this.getButton();
    this.timingData = navParams.data.task;
    this.timeInfo = minuteToTime(this.timingData.tim);

  }

  ionViewDidLoad() {
    this.resizeDemo();
  }

  //动态调整demo组件的尺寸
  length = 55;
  margin = 5;
  resizeDemo() {
    let i = 0;
    for (let demo of this.demoList.toArray()) {
      if (typeof this.buttonList[i].lstyle == 'undefined') this.buttonList[i].lstyle = 0;
      let cols = styleList.btn[this.buttonList[i].lstyle].cols;
      let rows = styleList.btn[this.buttonList[i].lstyle].rows;
      let width = cols * this.length + ((cols - 1) * this.margin);
      let height = (rows * this.length) + ((rows - 1) * this.margin);
      this.renderer.setStyle(demo.nativeElement, 'width', `${width}px`);
      this.renderer.setStyle(demo.nativeElement, 'height', `${height}px`);
      i++;
    }
  }

  getButton() {
    for (let item of this.device.config.dashboard) {
      let ccomponent = JSON.parse(item);
      if (ccomponent.type == "btn") {
        this.buttonList.push(ccomponent);
      }
    }
    // console.log(this.buttonList);
  }

  isSelected(btn) {
    if (this.timingData.act.length == 0) return false;
    for (let btnAct of this.timingData.act) {
      // console.log(btnAct);
      let index = btnAct.indexOf(btn.key);
      if (index > -1) {
        return true
      }
    }
  }

  changeAction(i) {
    // console.log(i);
    // console.log('changeAction')
    // 删除动作
    let n = 0;
    for (let btnAct of this.timingData.act) {
      // console.log(this.buttonList[i].key)
      // console.log(btnAct)
      let index = btnAct.indexOf(this.buttonList[i].key)
      if (index > -1) {
        // console.log(index)
        this.timingData.act.splice(n, 1);
        // console.log('删除动作')
        // console.log(this.timingData.act)
        return;
      }
      n++;
    }
    // 添加动作
    if (this.timingData.act.length > 1) {
      //只能添加两个动作
      this.events.publish('provider:notice', "tooMuchAction");
      return;
    }
    let act;
    // console.log(this.buttonList[i].mode)
    if (typeof this.buttonList[i].mode == "undefined") {
      this.buttonList[i]['mode'] = 0
    }
    if (this.buttonList[i].mode == 0) {
      act = `{"${this.buttonList[i].key}":"tap"}`
      // act = "tap"
    } else if (this.buttonList[i].mode == 1) {
      this.showBtnAction(i);
      return;
    } else {
      act = `{"${this.buttonList[i].key}":"${this.buttonList[i].custom}"}`
      // act = this.buttonList[i].custom
    }
    // actJson[this.buttonList[i].key] = act;
    this.timingData.act.push(act);
    // console.log('添加动作')
    // console.log(actJson)
    // console.log(this.timingData.act)
  }

  showBtnAction(i) {
    let act;
    let alert = this.alertCtrl.create();
    alert.setTitle('选择指令动作');
    alert.addInput({
      type: 'radio',
      label: 'on',
      value: 'on',
      checked: true
    });
    alert.addInput({
      type: 'radio',
      label: 'off',
      value: 'off'
    });
    alert.addButton({
      text: '添加',
      handler: data => {
        act = `{"${this.buttonList[i].key}":"${data}"}`
        this.timingData.act.push(act);
        // console.log('添加动作')
        // console.log(actJson)
        // console.log(this.timingData.act)
      }
    });
    alert.present();
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
    // console.log(this.timingData.day);
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
            this.timingData.tim = timeToMinute(time);
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
    this.events.publish("loading:show", "loadingTiming");
    window.setTimeout(() => {
      this.events.publish("loading:hide", "loadingTiming");
    }, 1000);
    this.viewCtrl.dismiss();
  }

  delete() {
    let data = {
      set: {
        timing: [{ dlt: this.timingData.task }]
      }
    }
    this.events.publish("layout:send", JSON.stringify(data));
    this.events.publish("loading:show", "loadingTiming");
    window.setTimeout(() => {
      this.events.publish("loading:hide", "loadingTiming");
    }, 1000);
    this.viewCtrl.dismiss();
  }
}
