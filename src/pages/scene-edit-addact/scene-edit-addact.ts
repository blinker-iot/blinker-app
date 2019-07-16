import { Component, ElementRef, ViewChild, Renderer2, ChangeDetectorRef } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { DeviceProvider } from '../../providers/device/device';
import { deviceName2Mac } from '../../functions/func';

@IonicPage()
@Component({
  selector: 'page-scene-edit-addact',
  templateUrl: 'scene-edit-addact.html',
})
export class SceneEditAddactPage {
  scene;
  action;
  deviceLoaded = false;
  actionLoaded = false;
  actionValue = false;

  selectedDeviceIndex = 255;
  selectedActionIndex = 255;

  selectedDevice: any;
  selectedAction: any;

  // elementActions = [];

  @ViewChild("onBlock", { read: ElementRef }) onBlock: ElementRef;
  @ViewChild("offBlock", { read: ElementRef }) offBlock: ElementRef;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public deviceProvider: DeviceProvider,
    public renderer: Renderer2,
    public changeDetectorRef: ChangeDetectorRef,
  ) {
    this.scene = navParams.data;
  }

  updateSelectedDevice(device) {
    this.selectedDevice = device
    console.log(this.selectedDevice)
    // this.changeDetectorRef.detectChanges()
  }

  updateSelectedAction(action) {
    this.selectedAction = action[0]
    console.log(this.selectedAction);
  }


  // selectDevice(id, device) {
  //   this.selectedDeviceIndex = id;
  //   this.elementActions = [];
  //   // this.renderer.addClass(item.elementRef.nativeElement,'select');
  //   if (typeof (device.config.elements) != 'undefined') {
  //     for (let element of JSON.parse(device.config.elements)) {
  //       if (element.type == "toggle" || element.type == "button") {
  //         this.elementActions.push(element);
  //       }
  //     }
  //   }
  //   this.selectedDevice = device;
  //   this.selectedActionIndex = 255;
  //   this.actionLoaded = false;
  //   this.actionValue = false;
  //   this.deviceLoaded = true;
  // }

  // selectAction(id, element) {
  //   this.selectedActionIndex = id;
  //   this.selectedElement = element;
  //   if (element.type == "button"){
  //     this.selectedValue = 'tap';
  //     this.actionValue = true;
  //   }else{
  //     this.actionValue = false;
  //   }
  //   this.actionLoaded = true;
  // }

  // selectValue(value) {
  //   if (value == 'on') {
  //     this.renderer.addClass(this.onBlock.nativeElement, 'selected');
  //     this.renderer.removeClass(this.offBlock.nativeElement, 'selected');
  //   } else {
  //     this.renderer.addClass(this.offBlock.nativeElement, 'selected');
  //     this.renderer.removeClass(this.onBlock.nativeElement, 'selected');
  //   }
  //   this.selectedValue = value;
  //   this.actionValue = true;
  // }

  delete() {
    this.navCtrl.pop();
  }

  save() {
    let action = {
      deviceName: deviceName2Mac(this.selectedDevice.deviceName),
      content: this.selectedAction,
      data: this.selectedAction
    };
    
    console.log(action);
    this.scene.actions.push(action);
    this.navCtrl.pop();
  }

}
