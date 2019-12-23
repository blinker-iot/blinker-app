import { Component, Renderer2, ViewChildren, ElementRef, QueryList, Input, ViewChild } from '@angular/core';
import { Events, ModalController } from '@ionic/angular';
import { timeToMinute, minuteToTime } from 'src/app/core/functions/func';
import { DeviceService } from 'src/app/core/services/device.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { DevicelistService } from 'src/app/core/services/devicelist.service';
import { TimerService } from '../../../timer.service';

@Component({
  selector: 'timer-timing-edit',
  templateUrl: 'timing-edit.html',
  styleUrls: ['timing-edit.scss']
})
export class TimingEditPage {
  @Input() device;
  @Input() task;

  get deviceConfig() {
    return this.device.config.isDev ? this.devicelistService.devDeviceConfig : this.devicelistService.deviceConfig;
  }

  get isDiy() {
    // if (this.deviceConfig[this.device.deviceType].component == "Layouter2")
    if (this.device.deviceType.indexOf('Diy') > -1)
      return true
    else
      return false
  }

  cmdList = [];
  cmds;

  public timingData;
  public time;
  timeInfo = '00:00';

  buttonList = [];

  @ViewChildren('demo') demoList: QueryList<ElementRef>;

  constructor(
    private deviceService: DeviceService,
    private noticeService: NoticeService,
    private modalCtrl: ModalController,
    private devicelistService: DevicelistService,
    private timerService: TimerService
  ) {

  }

  ngOnInit() {
    this.timingData = this.task;
    this.timeInfo = minuteToTime(this.timingData.tim)
    // this.cmds = this.timerService.getProDeviceCmd(this.device)
    // for (const key in this.cmds) {
    //   this.cmdList.push(key);
    // }
    // console.log(this.cmds);
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

  updateSelectedAction(act) {
    this.timingData.act = [];
    // console.log(act);

    this.timingData.act.push(act[0]);
    // console.log(this.timingData);
  }

  choseDay(num) {
    let days = '';
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

  save() {
    //检查act是否为空,如果为空提示用户，是否放弃编辑
    if (this.timingData.act.length == 0) {
      // this.viewCtrl.dismiss();
      return;
    }
    this.timingData.tim = timeToMinute(this.timeInfo);
    let uploadDate = JSON.parse(JSON.stringify(this.timingData));
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
    // console.log(JSON.stringify(data));
    this.deviceService.sendData(this.device, JSON.stringify(data))
    this.noticeService.showLoading('loadingTiming')
    window.setTimeout(() => {
      this.noticeService.hideLoading();
    }, 1000);
    this.modalCtrl.dismiss();
  }

  delete() {
    let data = {
      set: {
        timing: [{ dlt: this.timingData.task }]
      }
    }
    this.deviceService.sendData(this.device, JSON.stringify(data))
    this.noticeService.showLoading('loadingTiming')
    window.setTimeout(() => {
      this.noticeService.hideLoading();
    }, 1000);
    this.modalCtrl.dismiss();
  }
}
