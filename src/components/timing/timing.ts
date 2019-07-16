import { Component, Input } from '@angular/core';
import { Events, ModalController, PickerController } from 'ionic-angular';
import { timeToMinute, minuteToTime } from '../../functions/func'

@Component({
  selector: 'timing',
  templateUrl: 'timing.html'
})
export class TimingComponent {
  @Input() device;

  constructor(
    public modalCtrl: ModalController,
    public events: Events,
    // private pickerCtrl: PickerController,
  ) {

  }

  trackByFn(index, task) {
    return JSON.stringify(task); // or item.id
  }

  addTimingTask() {
    let task = {
      "task": this.device.data.timing.length,
      "ena": 1,
      "tim": 0,
      "act": [],
      "day": "0000000"
    }
    let modal = this.modalCtrl.create('Layout2TimerEdittimingPage', { device: this.device, task: task });
    modal.present();
  }

  editTimingTask(task) {
    // console.log(task);
    let editTask = JSON.parse(JSON.stringify(task));
    let actList = [];
    for (let btnAct of editTask.act) {
      actList.push(JSON.stringify(btnAct))
    }
    editTask.act = actList;
    let modal = this.modalCtrl.create('Layout2TimerEdittimingPage', { device: this.device, task: editTask });
    modal.present();
  }

  delTimingTask(task) {
    console.log('delTimingTask')
  }

  getEna(task) {
    return (task.ena == "1" ? true : false)
  }

  changeEna(task) {
    // console.log('enaChange:' + task.ena)
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
    // console.log(JSON.stringify(data));
    this.events.publish("layout:send", JSON.stringify(data));
  }
}
