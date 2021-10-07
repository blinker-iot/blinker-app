import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DataService } from 'src/app/core/services/data.service';
import { BlinkerDevice } from 'src/app/core/model/device.model';

@Component({
  selector: 'blinker-auto-edit-action',
  templateUrl: './auto-edit-action.component.html',
  styleUrls: ['./auto-edit-action.component.scss'],
})
export class AutoEditActionComponent implements OnInit {

  disableSave = true;

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  get deviceDataList() {
    return this.dataService.device.list
  }

  selectedDevice: BlinkerDevice;
  selectedAction;

  constructor(
    private modalCtrl: ModalController,
    private dataService: DataService
  ) { }

  ngOnInit() { }

  close() {
    this.modalCtrl.dismiss()
  }

  updateSelectedDevice(device) {
    this.selectedDevice = device
    delete this.selectedAction;
    this.disableSave = true;
  }

  updateSelectedAction(action) {
    this.selectedAction = action[0]
    this.disableSave = false;
  }

  save() {
    if (this.disableSave) return
    this.modalCtrl.dismiss(
      {
        deviceId: this.selectedDevice.id,
        act: this.selectedAction
      }
    )
  }

}
