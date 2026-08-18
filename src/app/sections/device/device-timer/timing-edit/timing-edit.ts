import { Component } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { minuteToTime, timeToMinute } from 'src/app/core/functions/func';
import { DeviceService } from 'src/app/core/services/device.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { RepeatSelectorModalComponent } from '../../../../core/modals/repeat-selector-modal/repeat-selector-modal.component';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { ActionSelectorModalComponent } from '../../../../core/modals/action-selector-modal/action-selector-modal.component';
import { TimeSelectorModalComponent } from '../../../../core/modals/time-selector-modal/time-selector-modal.component';
import { MenuListComponent } from 'src/app/core/components/menu-list/menu-list';
import { MenuItemComponent } from 'src/app/core/components/menu-list/menu-item/menu-item';

import { TranslatePipe } from '@ngx-translate/core';
import { DataService } from 'src/app/core/services/data.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Act2TextPipe } from 'src/app/core/pipes/actcmd2text';
import { Days2TextPipe } from 'src/app/core/pipes/days2text';

@Component({
  selector: 'timing-edit',
  templateUrl: 'timing-edit.html',
  styleUrls: ['timing-edit.scss'],
  imports: [
    IonicModule,
    MenuListComponent,
    MenuItemComponent,
    TranslatePipe,
    Act2TextPipe,
    Days2TextPipe,
  ],
})
export class TimingEditPage {
  id;
  taskid;
  device: BlinkerDevice;
  task = {
    // "taskid": this.device.data.timing.length,
    ena: 1,
    tim: 0,
    act: [],
    day: '0000000',
  };

  mode = 'new';

  cmdList = [];
  cmds;

  public timingData;
  public time;
  timeInfo = '00:00';

  actcmd;

  constructor(
    private deviceService: DeviceService,
    private noticeService: NoticeService,
    private modalCtrl: ModalController,
    private dataService: DataService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    console.log(this.router.url);

    this.dataService.initCompleted.subscribe((result) => {
      if (result) {
        console.log(this.router.url);
        this.id = this.activatedRoute.snapshot.params['id'];
        this.device = this.dataService.device.dict[this.id];
        this.taskid = this.activatedRoute.snapshot.params['taskid'];
      }
    });

    this.timingData = this.task;
    this.timeInfo = minuteToTime(this.timingData.tim);
  }

  save() {
    //检查act是否为空,如果为空提示用户，是否放弃编辑
    if (this.timingData.act.length == 0) {
      return;
    }
    this.timingData.tim = timeToMinute(this.timeInfo);
    let uploadDate = JSON.parse(JSON.stringify(this.timingData));
    let btnActList = [];
    for (let btnAct of this.timingData.act) {
      btnActList.push(JSON.parse(btnAct));
    }
    uploadDate.act = btnActList;
    let data = {
      set: {
        timing: [],
      },
    };
    data.set.timing.push(uploadDate);

    this.deviceService.sendData(this.device, JSON.stringify(data));
    this.noticeService.showLoading('loadingTiming');
    window.setTimeout(() => {
      this.noticeService.hideLoading();
    }, 1000);
  }

  close() {}

  delete() {
    let data = {
      set: {
        timing: [{ dlt: this.timingData.task }],
      },
    };
    this.deviceService.sendData(this.device, JSON.stringify(data));
    this.noticeService.showLoading('loadingTiming');
    window.setTimeout(() => {
      this.noticeService.hideLoading();
    }, 1000);
  }

  async openTimeModal() {
    const modal = await this.modalCtrl.create({
      component: TimeSelectorModalComponent,
      componentProps: {
        data: this.timeInfo,
      },
    });
    modal.onDidDismiss().then((result) => {
      console.log(result.data);
      if (typeof result.data != 'undefined') {
        this.timeInfo = result.data;
      }
    });
    return await modal.present();
  }

  async openRepeatModal() {
    const modal = await this.modalCtrl.create({
      component: RepeatSelectorModalComponent,
      componentProps: {
        data: this.timingData.day,
      },
    });
    modal.onDidDismiss().then((result) => {
      console.log(result.data);
      if (typeof result.data != 'undefined') {
        this.timingData.day = result.data;
      }
    });
    return await modal.present();
  }

  async openActionModal() {
    const modal = await this.modalCtrl.create({
      component: ActionSelectorModalComponent,
      componentProps: {
        device: this.device,
      },
      backdropDismiss: true,
    });
    modal.onDidDismiss().then((result) => {
      if (typeof result.data != 'undefined') {
        this.actcmd = result.data;
        this.timingData.act = [JSON.stringify(this.actcmd)];
      }
    });
    return await modal.present();
  }
}
