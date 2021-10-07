import { Component } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DeviceService } from 'src/app/core/services/device.service';
import { TimingEditPage } from '../timing-edit/timing-edit';
import { TimerService } from '../../timer.service';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'timer-timing',
  templateUrl: 'timing.html',
  styleUrls: ['timing.scss']
})
export class TimingComponent {

  device;
  editMode = false;


  get deviceDataDict() {
    return this.dataService.device.dict
  }


  loaded = false;

  constructor(
    public modalCtrl: ModalController,
    public deviceService: DeviceService,
    private dataService: DataService,
    private timerService: TimerService
  ) { }


  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.device = this.timerService.currentDevice
        this.timerService.loadTask();
        this.loaded = loaded
      }
    })
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
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
    this.gotoTimingEditPage(editTask, 'edit')
  }

  async gotoTimingEditPage(task, mode = 'new') {
    let modal = await this.modalCtrl.create({
      component: TimingEditPage,
      componentProps: {
        'task': task,
        'device': this.device,
        'mode': mode
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