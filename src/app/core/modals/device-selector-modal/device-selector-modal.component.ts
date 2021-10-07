import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'blinker-device-selector-modal',
  templateUrl: './device-selector-modal.component.html',
  styleUrls: ['./device-selector-modal.component.scss'],
})
export class DeviceSelectorModalComponent implements OnInit {

  selectedDeviceIndex;
  selectedDevice;

  @Output() update = new EventEmitter();
  @Output() cancel = new EventEmitter()

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  get deviceDataList() {
    return this.dataService.device.list
  }

  constructor(
    private dataService: DataService,
    private modalController: ModalController
  ) { }

  ngOnInit(): void {
  }

  selectDevice(device) {
    this.modalController.dismiss(device)
  }

  clickCancel() {
    this.cancel.emit()
    this.modalController.dismiss()
  }

}
