import { Component } from '@angular/core';
import { Events, ModalController } from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { TimingEditPage } from './timing-edit/timing-edit';
import { TimerService } from '../../timer.service';
import { UserService } from 'src/app/core/services/user.service';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'timer-timing',
  templateUrl: 'timing.html',
  styleUrls: ['timing.scss']
})
export class TimingComponent {

  get device() {
    return this.timerService.currentDevice
  }

  loaded;

  constructor(
    public modalCtrl: ModalController,
    public events: Events,
    public deviceService: DeviceService,
    private dataService: DataService,
    private timerService: TimerService
  ) { }

  ngOnInit() {
    this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.loaded = loaded
        this.timerService.loadTask();
      }
    })
  }

  trackByFn(index, task) {
    return JSON.stringify(task); // or item.id
  }

  addTimingTask() {
    if (typeof this.device.data.timing == 'undefined')
      this.device.data['timing'] = []
    let task = {
      "task": this.device.data.timing.length,
      "ena": 1,
      "tim": 0,
      "act": [],
      "day": "0000000"
    }
    this.gotoTimingEditPage(task)
  }

  editTimingTask(task) {
    let editTask = JSON.parse(JSON.stringify(task));
    let actList = [];
    for (let btnAct of editTask.act) {
      actList.push(JSON.stringify(btnAct))
    }
    editTask.act = actList;
    this.gotoTimingEditPage(editTask)
  }

  async gotoTimingEditPage(task) {
    let modal = await this.modalCtrl.create({
      component: TimingEditPage,
      componentProps: {
        'task': task,
        'device': this.device
      }
    });
    modal.present();
  }

  delTimingTask(task) {
    console.log('delTimingTask')
  }

  getEna(task) {
    return (task.ena == "1" ? true : false)
  }

  changeEna(task) {
    console.log('enaChange:' + task.ena)
    task.ena = (task.ena == "1" ? 0 : 1)
    this.updateTask(task)
  }

  updateTask(task) {
    let uploadDate = JSON.parse(JSON.stringify(task));
    let data = {
      set: {
        timing: []
      }
    }
    data.set.timing.push(uploadDate);
    this.deviceService.sendData(this.device, JSON.stringify(data));
  }
}