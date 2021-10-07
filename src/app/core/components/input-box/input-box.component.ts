import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { DeviceService } from '../../services/device.service';

@Component({
  selector: 'widget-input-sub',
  templateUrl: './input-box.component.html',
  styleUrls: ['./input-box.component.scss'],
})
export class InputBoxComponent implements OnInit {
  sendmess;
  device;

  constructor(
    private deviceService:DeviceService,
    private modalCtrl: ModalController
  ) { }

  ngOnInit() {}

  clear() {
  }

  close() {
    this.modalCtrl.dismiss();
  }

  send() {
    this.deviceService.sendData(this.device, this.sendmess);
    this.sendmess = '';
  }

}
