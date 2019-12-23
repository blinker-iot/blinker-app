import { Component, ElementRef, ViewChild, Renderer2, ChangeDetectorRef } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { deviceName12 } from 'src/app/core/functions/func';
import { UserService } from 'src/app/core/services/user.service';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular';
import { DataService } from 'src/app/core/services/data.service';


@Component({
  selector: 'scene-edit-addact',
  templateUrl: 'scene-edit-addact.html',
  styleUrls: ['scene-edit-addact.scss']
})
export class SceneEditAddactPage {

  sceneName;
  currentSceneData;

  get sceneDataDict() {
    return this.dataService.scene.dict
  }

  alert;

  action;
  deviceLoaded = false;
  actionLoaded = false;
  actionValue = false;

  selectedDeviceIndex = 255;
  selectedActionIndex = 255;

  selectedDevice: any;
  selectedAction: any;

  // elementActions = [];

  @ViewChild("onBlock", { read: ElementRef, static: true }) onBlock: ElementRef;
  @ViewChild("offBlock", { read: ElementRef, static: true }) offBlock: ElementRef;

  constructor(
    public userService: UserService,
    public deviceService: DeviceService,
    private dataService: DataService,
    public renderer: Renderer2,
    public changeDetectorRef: ChangeDetectorRef,
    private activatedRoute: ActivatedRoute,
    private navCtrl: NavController
  ) { }

  ngOnInit(): void {
    this.sceneName = this.activatedRoute.snapshot.params['scene'];
    this.currentSceneData = this.sceneDataDict[this.sceneName]
  }

  updateSelectedDevice(device) {
    this.selectedDevice = device
    delete this.selectedAction;
    // console.log(this.selectedDevice)
  }

  updateSelectedAction(action) {
    this.selectedAction = action[0]
    // console.log(this.selectedAction);
  }

  delete() {
    this.navCtrl.pop();
  }

  save() {
    // console.log(this.selectedAction);
    if (typeof this.selectedAction == 'undefined') return;
    let action = {
      deviceName: deviceName12(this.selectedDevice.deviceName),
      text: this.selectedAction,
      data: this.selectedAction
    };

    // console.log(action);
    if (typeof this.currentSceneData.acts == 'undefined') this.currentSceneData.acts = []
    this.currentSceneData.acts.push(action);
    this.navCtrl.pop();
  }

}
