import { Component, OnInit } from '@angular/core';
import { DataService } from 'src/app/core/services/data.service';
import { Router } from '@angular/router';
import { AutoService } from '../auto.service';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'auto-manager',
  templateUrl: './auto-manager.html',
  styleUrls: ['./auto-manager.scss'],
})
export class AutoManagerPage implements OnInit {

  loaded = false;
  editMode = false;

  get autoTaskList() {
    return this.autoService.autoTaskData.list
  }

  get autoTaskDict() {
    return this.autoService.autoTaskData.dict
  }

  constructor(
    private autoService: AutoService,
    private dataService: DataService,
    private router: Router,
    private alertCtrl: AlertController
  ) { }

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.autoService.getAutoTasks().then(result => {
          if (result) this.loaded = loaded;
        })
      }
    })
    if (this.autoService.firstEnter) {
      this.showAlert();
      this.autoService.firstEnter = false;
    }

  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  async showAlert() {
    let alert = await this.alertCtrl.create({
      header: '智动化beta',
      message: '这是一项正在测试的功能，如遇使用问题，请在开发者社区提出',
      buttons: [
        {
          text: '确认'
        }
      ]
    })
    alert.present();
  }

  editTask(taskId) {
    if (this.editMode) return
    this.router.navigate(['auto-manager/edit', taskId])
  }

  addTask() {
    this.router.navigate(['auto-manager/edit', 'new'])
  }

  delTask(id) {
    this.autoService.delAutoTask(id).then(result => {
      this.autoService.getAutoTasks()
    })
  }

  tapTaskSwitch(taskId) {
    this.autoService.changeAutoTaskState(taskId, !this.autoTaskDict[taskId].enable).then(result => {
      if (result) {
        this.autoTaskDict[taskId].enable = !this.autoTaskDict[taskId].enable
      }
    })
  }

  switchMode() {
    this.editMode = !this.editMode
  }

  trackByIndex(index, item){
    return item;
   }

}
