import { Component, OnInit } from '@angular/core';
import { AutoService } from '../auto.service';
import { ActivatedRoute } from '@angular/router';
import { ModalController, AlertController, NavController } from '@ionic/angular';
import { TimeModalComponent } from '../time-modal/time-modal.component';
import { DataService } from 'src/app/core/services/data.service';
import { minuteToTime } from 'src/app/core/functions/func';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';
import { AutoEditTriggerComponent } from '../auto-edit-trigger/auto-edit-trigger.component';
import { AutoEditActionComponent } from '../auto-edit-action/auto-edit-action.component';

@Component({
  selector: 'auto-edit',
  templateUrl: './auto-edit.component.html',
  styleUrls: ['./auto-edit.component.scss'],
})
export class AutoEditComponent implements OnInit {

  taskId;
  loaded = false;

  // get task() {
  //   return this.autoService.autoTaskData.dict[this.taskId]
  // }
  get disableSave() {
    return (this.task.actions.length == 0 || this.task.triggers.length == 0)
  }

  get timeRange() {
    return `${minuteToTime(this.task.time.range[0])} ~ ${minuteToTime(this.task.time.range[1])}`
  }

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  task;
  newTask = {
    "enable": true,
    "text": "新的规则", // 描述，也可作为自动化的名字
    "mode": "and", //and,or,other
    "time": {
      "day": "1111111",
      "range": [0, 1440],
    },
    "triggers": [],
    "actions": []
  }

  constructor(
    private activatedRoute: ActivatedRoute,
    private autoService: AutoService,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private dataService: DataService,
    private deviceConfigService: DeviceConfigService,
    private navCtrl: NavController
  ) { }

  ngOnInit() {
    this.autoService.getAutoTasks()
    this.activatedRoute.params.subscribe(params => {
      this.taskId = params['id']
      if (this.taskId == 'new') {
        this.task = this.newTask
      } else {
        this.task = this.autoService.autoTaskData.dict[this.taskId]
      }
      this.deviceConfigService.loaded.subscribe(loaded => {
        this.loaded = loaded
      })

    })
  }

  async showChangeText() {
    const alert = await this.alertCtrl.create({
      header: '规则名设定',
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: this.task.text,
          placeholder: this.task.text
        }
      ],
      buttons: [
        {
          text: '修改',
          handler: (data) => {
            if (data.name.length > 2)
              this.task.text = data.name
          }
        }
      ]
    });

    await alert.present();
  }

  async editTime() {
    const modal = await this.modalCtrl.create({
      component: TimeModalComponent,
      backdropDismiss: false,
      componentProps: {
        'timeData': this.task.time
      }
    });
    modal.present();
    const { data } = await modal.onWillDismiss();
    if (typeof data != 'undefined')
      this.task.time = data
  }

  async addTrigger() {
    const modal = await this.modalCtrl.create({
      component: AutoEditTriggerComponent,
      backdropDismiss: false,
    });
    modal.present();
    const { data } = await modal.onWillDismiss();
    if (typeof data != 'undefined')
      this.task.triggers.push(data)
  }

  delTrigger(item) {
    this.task.triggers.splice(this.task.triggers.indexOf(item), 1)
  }

  delAction(item) {
    this.task.actions.splice(this.task.actions.indexOf(item), 1)
  }

  async addAction() {
    const modal = await this.modalCtrl.create({
      component: AutoEditActionComponent,
      backdropDismiss: false,
    });
    modal.present();
    const { data } = await modal.onWillDismiss();
    if (typeof data != 'undefined')
      this.task.actions.push(data)
  }

  changeMode() {
    if (this.task.mode == 'and') {
      this.task.mode = 'or'
    } else {
      this.task.mode = 'and'
    }
  }

  save() {
    if (this.disableSave) return
    this.autoService.updateAutoTask(this.task).then(result => {
      if (result) {
        this.autoService.getAutoTasks();
        this.navCtrl.pop();
      }
    });
  }
}
