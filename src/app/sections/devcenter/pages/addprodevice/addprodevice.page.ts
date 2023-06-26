import { Component } from '@angular/core';
import { DevcenterService } from '../../devcenter.service';
import { NavController, ModalController } from '@ionic/angular';
import { DeviceIconPage } from 'src/app/core/pages/device-icon/device-icon';
import { DataService } from 'src/app/core/services/data.service';

@Component({
  selector: 'prodevice-add',
  templateUrl: './addprodevice.page.html',
  styleUrls: ['./addprodevice.page.scss'],
})
export class AddprodevicePage {

  mode = "mqtt"
  btnDisabled = true;

  get username() {
    return this.dataService.user.username
  }
  customName = '';
  image = 'unknown.png'
  description = '';

  constructor(
    private dataService: DataService,
    private devcenterService: DevcenterService,
    private navCtrl: NavController,
    private modalCtrl: ModalController
  ) { }

  checkCustomName(e) {
    this.btnDisabled = (this.customName.length == 0);
  }

  add() {
    this.btnDisabled = true;
    let config = {
      "name": this.customName,
      "mode": this.mode,
      "vender": this.username,
      "image": this.image,
      "broker":'blinker'
    }
    this.devcenterService.addProDevice(config).then(() => {
      this.devcenterService.getProDevices();
      this.navCtrl.pop();
    });
  }

  async selectIcon() {
    let modal = await this.modalCtrl.create({
      component: DeviceIconPage,
    });
    modal.present();
    this.image = (await modal.onDidDismiss()).data;
  }

}
