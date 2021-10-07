import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'blinker-auto-edit-trigger',
  templateUrl: './auto-edit-trigger.component.html',
  styleUrls: ['./auto-edit-trigger.component.scss'],
})
export class AutoEditTriggerComponent implements OnInit {

  disableSave = true;

  step = 1;

  selectedDeviceId;
  selectedSource;

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  constructor(
    private modalCtrl: ModalController,
    private dataService: DataService
  ) { }

  ngOnInit() { }

  close() {
    this.modalCtrl.dismiss()
  }

  save() {
    if (this.disableSave) return
    this.modalCtrl.dismiss(this.selectedSource)
  }

  reset() {
    this.step = 1;
    this.disableSave = true;
  }

  updateSelectedDeviceId(deviceId) {
    this.selectedDeviceId = deviceId;
    this.step = 2;
  }

  updateSelectedSource(source) {
    this.selectedSource = source
    this.step = 3;
    this.disableSave = false;
  }

  updateSourceValue(value) {

  }

  updateDuration(duration) {

  }

}
