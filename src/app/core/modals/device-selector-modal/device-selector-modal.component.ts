import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'blinker-device-selector-modal',
  standalone: true,
  templateUrl: './device-selector-modal.component.html',
  styleUrls: ['./device-selector-modal.component.scss'],
  imports: [BDeviceImgComponent],
})
export class DeviceSelectorModalComponent implements OnInit {
  selectedDeviceIndex;
  selectedDevice;

  @Output() update = new EventEmitter();
  @Output() cancel = new EventEmitter();

  get deviceDataDict() {
    return this.dataService.device.dict;
  }

  get deviceDataList() {
    return this.dataService.device.list;
  }

  constructor(
    private dataService: DataService,
    private modalController: ModalController
  ) {}

  ngOnInit(): void {}

  selectDevice(device) {
    this.modalController.dismiss(device);
  }

  clickCancel() {
    this.cancel.emit();
    this.modalController.dismiss();
  }
}
