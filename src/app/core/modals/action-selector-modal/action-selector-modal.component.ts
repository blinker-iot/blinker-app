import { Component, EventEmitter, Input, OnInit, Output, SimpleChanges } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';

@Component({
  selector: 'blinker-action-selector-modal',
  templateUrl: './action-selector-modal.component.html',
  styleUrls: ['./action-selector-modal.component.scss'],
})
export class ActionSelectorModalComponent implements OnInit {


  @Input() data = '0000000';
  @Output() dataChange = new EventEmitter()

  @Output() done = new EventEmitter()
  @Output() cancel = new EventEmitter()

  @Input() device;
  @Output() updateAct = new EventEmitter;

  selectedItem;

  get deviceConfig() {
    return this.device.config.isDev ? this.deviceConfigService.devDeviceConfig : this.deviceConfigService.deviceConfigs;
  }

  get isDiy() {
    if (this.device.deviceType.indexOf('Diy') > -1)
      return true
    else
      return false
  }

  actions = []

  constructor(
    private modalController: ModalController,
    private deviceConfigService: DeviceConfigService
  ) { }

  ngOnInit(): void {
    if (this.isDiy) {
      let deviceConfig = JSON.parse(this.device.config.layouter)
      if (deviceConfig == null) return;
      if (typeof deviceConfig == 'undefined') return
      if (typeof deviceConfig.actions == 'undefined') return
      this.actions = deviceConfig.actions;
    } else {
      let deviceConfig = this.deviceConfigService.getDeviceConfig(this.device)
      if (typeof deviceConfig.actions == 'undefined') deviceConfig['actions'] = '[]';
      this.actions = JSON.parse(deviceConfig.actions)
    }
    // console.log(this.actions);

  }

  updateSelectedAction(event) {
    // console.log(event[0]);
    this.done.emit(event[0])
    this.modalController.dismiss(event[0])
  }

  clickConfirm() {
    this.done.emit(this.data)
    this.modalController.dismiss(this.data)
  }

  clickCancel() {
    this.cancel.emit()
    this.modalController.dismiss()
  }

  genActs(){
    
  }
}
