import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, ModalController } from '@ionic/angular';
import { MinuteToTimePipe } from 'src/app/core/pipes/minute-to-time';
import { Act2TextPipe } from 'src/app/core/pipes/actcmd2text';
import { Days2TextPipe } from 'src/app/core/pipes/days2text';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { TimerService } from './timer.service';
import { MenuListComponent } from 'src/app/core/components/menu-list/menu-list';
import { MenuItemComponent } from 'src/app/core/components/menu-list/menu-item/menu-item';

@Component({
  selector: 'device-timer',
  templateUrl: './device-timer.page.html',
  styleUrls: ['./device-timer.page.scss'],
  imports: [
    IonicModule,
    MinuteToTimePipe,
    Act2TextPipe,
    Days2TextPipe,
    MenuListComponent,
    MenuItemComponent,
  ],
  providers: [TimerService],
})
export class DeviceTimerPage implements OnInit {
  id;
  device;
  editMode = false;

  get deviceDataDict() {
    return this.dataService.device.dict;
  }

  get timingTasks() {
    if (typeof this.device.data.timing == 'undefined') {
      return [];
    }
    return this.device.data.timing;
  }

  loaded = false;

  constructor(
    private dataService: DataService,
    private activatedRoute: ActivatedRoute,
    public modalCtrl: ModalController,
    public deviceService: DeviceService,
    private timerService: TimerService,
    private router: Router
  ) {}

  ngOnInit() {
    this.dataService.initCompleted.subscribe((result) => {
      if (result) {
        this.id = this.activatedRoute.snapshot.params['id'];
        this.device = this.dataService.device.dict[this.id];
        this.timerService.loadTask(this.device);
        this.loaded = true;
      }
    });
  }

  trackByFn(index, task) {
    return JSON.stringify(task); // or item.id
  }

  addTimingTask() {
    if (this.device.data.timing?.length > 19) {
      // 超出最大定时任务数
    }

    if (typeof this.device.data.timing == 'undefined') {
      this.device.data['timing'] = [];
    }
    let task = {
      task: this.device.data.timing.length,
      ena: 1,
      tim: 0,
      act: [],
      day: '0000000',
    };
    this.gotoTimingEditPage(task);
  }

  editTimingTask(task) {
    let editTask = JSON.parse(JSON.stringify(task));
    let actList = [];
    for (let btnAct of editTask.act) {
      actList.push(JSON.stringify(btnAct));
    }
    editTask.act = actList;
    this.gotoTimingEditPage(editTask, 'edit');
  }

  async gotoTimingEditPage(task, mode = 'new') {
    // let modal = await this.modalCtrl.create({
    //   component: TimingEditPage,
    //   // initialBreakpoint: 0.5,
    //   // breakpoints: [0, 0.5],
    //   componentProps: {
    //     "task": task,
    //     "device": this.device,
    //     "mode": mode,
    //   },
    // });
    // modal.present();
    this.router.navigate([`/device-manager/${this.id}/timer/new`]);
  }

  delTimingTask(task) {
    console.log('delTimingTask');
  }

  getEna(task) {
    return task.ena == '1' ? true : false;
  }

  changeEna(task) {
    console.log('enaChange:' + task.ena);
    task.ena = task.ena == '1' ? 0 : 1;
    this.updateTask(task);
  }

  updateTask(task) {
    let uploadDate = JSON.parse(JSON.stringify(task));
    let data = {
      set: {
        timing: [],
      },
    };
    data.set.timing.push(uploadDate);
    this.deviceService.sendData(this.device, JSON.stringify(data));
  }
}
