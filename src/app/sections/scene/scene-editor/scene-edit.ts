import {
  Component
} from '@angular/core';
import {
  AlertController,
  Platform,
  ModalController
} from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { ActivatedRoute } from '@angular/router';
import { IconListPage } from 'src/app/core/pages/icon-list/icon-list';
import { DataService } from 'src/app/core/services/data.service';
import { SceneEditorAddact } from '../components/scene-editor-addact/scene-edit-addact';
import { NoticeService } from 'src/app/core/services/notice.service';

@Component({
  selector: 'scene-edit',
  templateUrl: 'scene-edit.html',
  styleUrls: ['scene-edit.scss']
})
export class SceneEditor {

  sceneName;
  currentSceneData;

  tempSceneName = "unknown";
  alert;

  loaded = false;

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
    public notice: NoticeService,
    public platform: Platform,
    private activatedRoute: ActivatedRoute
  ) {
  }

  ngOnInit(): void {
    this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.sceneName = this.activatedRoute.snapshot.params['scene'];
        this.currentSceneData = this.sceneDataDict[this.sceneName]
        console.log(this.currentSceneData);

        this.tempSceneName = this.sceneName;
        // 移除已解绑设备
        let newActs = []
        for (let action of this.acts) {
          if (typeof this.deviceDataDict[action.deviceId] != 'undefined') {
            newActs.push(action);
          }
        }
        this.acts = newActs;
        this.loaded = loaded
      }
    })
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
              this.notice.showToast('tooLongSceneName')
              return;
            }
            if (this.sceneIsExist(data.newSceneName)) {
              this.notice.showToast('sameSceneName')
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

  async addAct() {
    let modal = await this.modalCtrl.create({
      component: SceneEditorAddact,
      componentProps: {
        'sceneName': this.sceneName
      }
    });
    modal.present();
  }

  delAct(index) {
    this.acts.splice(index, 1);
  }

}
