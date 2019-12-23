import {
  Component,
  ElementRef,
  ViewChild
} from '@angular/core';
import {
  AlertController,
  Events,
  Platform,
  ModalController
} from '@ionic/angular';
import { arrayRemove } from 'src/app/core/functions/func';
import { UserService } from 'src/app/core/services/user.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { ActivatedRoute, Router } from '@angular/router';
import { IconListPage } from 'src/app/core/pages/icon-list/icon-list';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'scene-edit',
  templateUrl: 'scene-edit.html',
  styleUrls: ['scene-edit.scss']
})
export class SceneEditPage {

  sceneName;
  currentSceneData;

  tempSceneName = "unknown";
  alert;

  get sceneDataDict() {
    return this.dataService.scene.dict
  }

  get sceneDataList() {
    return this.dataService.scene.list
  }

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  get deviceDataList() {
    return this.dataService.device.list
  }

  set acts(newActs) {
    this.currentSceneData.acts = newActs
  }

  get acts() {
    return this.currentSceneData.acts
  }

  actionName(act) {
    return act.text
  }

  constructor(
    public modalCtrl: ModalController,
    public alertCtrl: AlertController,
    public deviceService: DeviceService,
    private dataService: DataService,
    public userService: UserService,
    public events: Events,
    public platform: Platform,
    private router: Router,
    private activatedRoute: ActivatedRoute
  ) {
  }

  ngOnInit(): void {
    this.sceneName = this.activatedRoute.snapshot.params['scene'];
    this.currentSceneData = this.sceneDataDict[this.sceneName]
    this.tempSceneName = this.sceneName;
    // 移除已解绑设备
    let newActs = []
    for (let action of this.acts) {
      if (typeof this.deviceDataDict[action.deviceName] != 'undefined') {
        newActs.push(action);
      }
    }
    this.acts = newActs;
  }

  async changeSceneName() {
    this.alert = await this.alertCtrl.create({
      header: '修改房间名',
      inputs: [{ name: 'newSceneName', value: this.tempSceneName, placeholder: this.tempSceneName }],
      buttons: [
        {
          text: '取消', handler: data => {
            console.log('Cancel clicked')
          }
        },
        {
          text: '确认修改', handler: data => {
            // console.log(data.newSceneName.length);
            if (data.newSceneName.length == 0) return;
            if (data.newSceneName.length > 10) {
              this.events.publish('provider:notice', 'tooLongSceneName')
              return;
            }
            if (this.sceneIsExist(data.newSceneName)) {
              this.events.publish('provider:notice', 'sameSceneName')
              return;
            }
            this.tempSceneName = data.newSceneName;
            this.renameScene(this.tempSceneName)
          }
        }
      ]
    });
    this.alert.present();
  }

  renameScene(newSceneName) {
    let oldSceneName = this.sceneName;
    // 使用新名字新建scene
    let index = this.sceneDataList.indexOf(oldSceneName);
    this.sceneDataList.splice(index + 1, 0, newSceneName);
    this.sceneDataDict[newSceneName] = this.sceneDataDict[oldSceneName];
    this.sceneName = newSceneName;
    // 删除原本的scene
    this.sceneDataList.splice(index, 1);
    delete this.sceneDataDict[oldSceneName];
  }

  sceneIsExist(sceneName) {
    if (this.sceneDataList.indexOf(sceneName) > -1) return true;
    return false
  }

  async changeSceneIcon() {
    let modal = await this.modalCtrl.create({
      component: IconListPage,
      componentProps: {
        'item': this.currentSceneData
      }
    });
    modal.present();
  }

  addAct() {
    this.router.navigate(['/scene-manager', this.sceneName, 'addact'])
  }

  delAct(index) {
    this.acts.splice(index, 1);
  }

}
