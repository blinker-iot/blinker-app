import { Component, ChangeDetectorRef, Input } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { ModalController, PickerController } from '@ionic/angular';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceSelectorModalComponent } from 'src/app/core/modals/device-selector-modal/device-selector-modal.component';
import { ActionSelectorModalComponent } from 'src/app/core/modals/action-selector-modal/action-selector-modal.component';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { SelectorModalComponent } from 'src/app/core/modals/selector-modal/selector-modal.component';


@Component({
  selector: 'scene-edit-addact',
  templateUrl: 'scene-edit-addact.html',
  styleUrls: ['scene-edit-addact.scss']
})
export class SceneEditorAddact {

  typeItems = [
    { text: '设备动作', value: 'action' },
    { text: '延迟执行', value: 'delay' }
  ]
  delayItems = [
    { text: '1s', value: '1' },
    { text: '2s', value: '2' },
    { text: '3s', value: '3' },
    { text: '4s', value: '4' },
    { text: '5s', value: '5' },
    { text: '6s', value: '6' },
    { text: '7s', value: '7' },
    { text: '8s', value: '8' },
    { text: '9s', value: '9' },
    { text: '10s', value: '10' },
    { text: '11s', value: '11' },
  ]


  @Input() sceneName;
  currentSceneData;

  get sceneDataDict() {
    return this.dataService.scene.dict
  }

  get disableSave() {
    return this.selectedType.value == 'action' && this.selectedAction == null
  }

  get disableActionSelector() {
    return this.selectedDevice == null
  }



  selectedDevice: BlinkerDevice = null;
  selectedAction: any = null;
  selectedType: any = this.typeItems[0]
  selectedDelay: any = this.delayItems[0]

  delayTask;

  constructor(
    public userService: UserService,
    public deviceService: DeviceService,
    private dataService: DataService,
    private modalCtrl: ModalController
  ) { }

  ngOnInit(): void {
    this.currentSceneData = this.sceneDataDict[this.sceneName]
  }

  close() {
    this.modalCtrl.dismiss()
  }

  save() {
    if (typeof this.selectedAction == 'undefined') return;
    if (this.disableSave) return
    if (typeof this.currentSceneData.acts == 'undefined') this.currentSceneData.acts = []
    if (this.selectedType.value == 'action') {
      let action = {
        deviceId: this.selectedDevice.id,
        text: this.selectedAction,
        data: this.selectedAction
      };
      this.currentSceneData.acts.push(action);
    } else {
      this.currentSceneData.acts.push({ delay: this.selectedDelay.value });
    }

    this.modalCtrl.dismiss()
  }

  async openTypeSelectModal() {
    const modal = await this.modalCtrl.create({
      component: SelectorModalComponent,
      componentProps: {
        items: this.typeItems
      }
    });
    modal.onDidDismiss().then(result => {
      if (typeof result.data != 'undefined') {
        this.selectedType = result.data
      }
    })
    return await modal.present();
  }

  async openDelaySelectModal() {
    const modal = await this.modalCtrl.create({
      component: SelectorModalComponent,
      componentProps: {
        items: this.delayItems
      }
    });
    modal.onDidDismiss().then(result => {
      if (typeof result.data != 'undefined') {
        this.selectedDelay = result.data
      }
    })
    return await modal.present();
  }

  async openDeviceSelectModal() {
    const modal = await this.modalCtrl.create({
      component: DeviceSelectorModalComponent
    });
    modal.onDidDismiss().then(result => {
      if (typeof result.data != 'undefined') {
        this.selectedDevice = result.data
        this.selectedAction = null
      }
    })
    return await modal.present();
  }

  async openActionSelectorModal() {
    if (this.disableActionSelector) return
    const modal = await this.modalCtrl.create({
      component: ActionSelectorModalComponent,
      componentProps: {
        device: this.selectedDevice
      }
    });
    modal.onDidDismiss().then(result => {
      if (typeof result.data != 'undefined') {
        this.selectedAction = result.data
      }
    })
    return await modal.present();
  }

}
