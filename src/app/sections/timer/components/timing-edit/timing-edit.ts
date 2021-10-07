import { Component, ViewChildren, ElementRef, QueryList, Input, ViewChild } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { timeToMinute, minuteToTime } from 'src/app/core/functions/func';
import { DeviceService } from 'src/app/core/services/device.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';
import { TimerService } from '../../timer.service';
import { RepeatSelectorModalComponent } from '../../../../core/modals/repeat-selector-modal/repeat-selector-modal.component';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { ActionSelectorModalComponent } from '../../../../core/modals/action-selector-modal/action-selector-modal.component';
import { TimeSelectorModalComponent } from '../../../../core/modals/time-selector-modal/time-selector-modal.component';

@Component({
  selector: 'timer-timing-edit',
  templateUrl: 'timing-edit.html',
  styleUrls: ['timing-edit.scss']
})
export class TimingEditPage {
  @Input() device: BlinkerDevice;
  @Input() task;
  @Input() mode = 'new';

  get deviceConfig() {
    return this.device.config.isDev ? this.deviceConfigService.devDeviceConfig : this.deviceConfigService.deviceConfigs;
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

  // buttonList = [];

  // @ViewChildren('demo') demoList: QueryList<ElementRef>;


  actcmd;

  constructor(
    private deviceService: DeviceService,
    private noticeService: NoticeService,
    private modalCtrl: ModalController,
    private deviceConfigService: DeviceConfigService,
    private timerService: TimerService,
  ) {

  }

  ngOnInit() {
    this.timingData = this.task;
    this.timeInfo = minuteToTime(this.timingData.tim)
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

    this.deviceService.sendData(this.device, JSON.stringify(data))
    this.noticeService.showLoading('loadingTiming')
    window.setTimeout(() => {
      this.noticeService.hideLoading();
    }, 1000);
    this.modalCtrl.dismiss();
  }

  close() {
    this.modalCtrl.dismiss()
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

  async openRepeatModal() {
    const modal = await this.modalCtrl.create({
      component: RepeatSelectorModalComponent,
      componentProps: {
        data: this.timingData.day
      }
    });
    modal.onDidDismiss().then(result => {
      // console.log(result.data);
      if (typeof result.data != 'undefined')
        this.timingData.day = result.data
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
        this.actcmd = result.data
        this.timingData.act = [JSON.stringify(this.actcmd)];
      }
    })
    return await modal.present();
  }

}
