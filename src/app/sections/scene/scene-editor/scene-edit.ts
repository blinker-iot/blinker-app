import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  AlertController,
  IonicModule,
  ModalController
} from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import { IconListPage } from 'src/app/core/pages/icon-list/icon-list';
import { Act2TextPipe } from 'src/app/core/pipes/actcmd2text';
import { DataService } from 'src/app/core/services/data.service';
import { SceneEditorAddact } from '../components/scene-editor-addact/scene-edit-addact';
import { NoticeService } from 'src/app/core/services/notice.service';
import { SceneService } from '../scene.service';

@Component({
  selector: 'scene-edit',
  standalone: true,
  templateUrl: 'scene-edit.html',
  styleUrls: ['scene-edit.scss'],
  imports: [
    CommonModule,
    IonicModule,
    Act2TextPipe,
    BDeviceImgComponent,
  ],
})
export class SceneEditor implements OnInit, OnDestroy {

  sceneName = '';
  currentSceneData;

  tempSceneName = "unknown";
  alert;

  loaded = false;
  private originalSceneData = '';
  private subscription;

  get sceneDataDict() {
    return this.dataService.scene?.dict ?? {};
  }

  get sceneDataList() {
    return this.dataService.scene?.list ?? [];
  }

  get deviceDataDict() {
    return this.dataService.device?.dict ?? {};
  }

  get deviceDataList() {
    return this.dataService.device?.list ?? [];
  }

  set acts(newActs) {
    if (this.currentSceneData) {
      this.currentSceneData.acts = newActs;
    }
  }

  get acts() {
    return this.currentSceneData?.acts ?? [];
  }

  constructor(
    public modalCtrl: ModalController,
    public alertCtrl: AlertController,
    private dataService: DataService,
    public notice: NoticeService,
    private sceneService: SceneService,
    private activatedRoute: ActivatedRoute
  ) {
  }

  ngOnInit(): void {
    this.subscription = this.dataService.userDataLoader.subscribe(() => {
      this.bindScene();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.alert?.dismiss();

    if (!this.loaded || this.originalSceneData === JSON.stringify(this.dataService.scene)) {
      return;
    }
    void this.sceneService.saveData(this.dataService.scene);
  }

  private bindScene(): void {
    const sceneName = this.activatedRoute.snapshot.params['scene'];
    const scene = this.dataService.scene;
    if (!scene?.dict?.[sceneName] || !this.dataService.device) {
      return;
    }

    this.sceneName = sceneName;
    this.currentSceneData = scene.dict[sceneName];
    this.tempSceneName = sceneName;
    this.originalSceneData = JSON.stringify(scene);

    // 移除已解绑设备的动作，但保留延时动作。
    this.acts = this.acts.filter(action =>
      typeof action.delay !== 'undefined' ||
      typeof this.deviceDataDict[action.deviceId] !== 'undefined'
    );
    this.loaded = true;
  }

  async changeSceneName() {
    this.alert = await this.alertCtrl.create({
      header: '修改场景名称',
      inputs: [{ name: 'newSceneName', value: this.tempSceneName, placeholder: this.tempSceneName }],
      buttons: [
        {
          text: '取消',
          role: 'cancel',
        },
        {
          text: '确认修改', handler: data => {
            const newSceneName = data.newSceneName?.trim();
            if (!newSceneName || newSceneName === this.sceneName) return;
            if (newSceneName.length > 10) {
              this.notice.showToast('tooLongSceneName');
              return;
            }
            if (this.sceneIsExist(newSceneName)) {
              this.notice.showToast('sameSceneName');
              return;
            }
            this.renameScene(newSceneName);
          }
        }
      ]
    });
    await this.alert.present();
  }

  renameScene(newSceneName: string): void {
    const oldSceneName = this.sceneName;
    // 使用新名字新建scene
    const index = this.sceneDataList.indexOf(oldSceneName);
    if (index < 0) return;

    this.sceneDataList.splice(index, 1, newSceneName);
    this.sceneDataDict[newSceneName] = this.sceneDataDict[oldSceneName];
    this.sceneName = newSceneName;
    this.tempSceneName = newSceneName;
    // 删除原本的scene
    delete this.sceneDataDict[oldSceneName];
  }

  sceneIsExist(sceneName: string): boolean {
    return this.sceneDataList.includes(sceneName);
  }

  async changeSceneIcon() {
    let modal = await this.modalCtrl.create({
      component: IconListPage,
      componentProps: {
        'item': this.currentSceneData
      }
    });
    await modal.present();
  }

  async addAct() {
    let modal = await this.modalCtrl.create({
      component: SceneEditorAddact,
      componentProps: {
        'sceneName': this.sceneName
      }
    });
    await modal.present();
  }

  delAct(index: number): void {
    this.acts.splice(index, 1);
  }

}
