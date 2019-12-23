import { Component } from '@angular/core';
import { UserService } from 'src/app/core/services/user.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { ActivatedRoute } from '@angular/router';
import { NavController, ModalController } from '@ionic/angular';
import { DataService } from '../../services/data.service';
import { ImageList } from 'src/app/configs/app.config';


@Component({
  selector: 'page-device-icon',
  templateUrl: 'device-icon.html',
  styleUrls: ['device-icon.scss']
})
export class DeviceIconPage {
  id;
  device;

  imageList;

  constructor(
    private activatedRoute: ActivatedRoute,
    private deviceService: DeviceService,
    private dataService: DataService,
    private navCtrl: NavController,
    private modalCtrl: ModalController
  ) {
  }

  ngOnInit() {
    this.imageList = ImageList;
    this.id = this.activatedRoute.snapshot.params['id'];
    this.device = this.dataService.device.dict[this.id];
  }

  async select(filename) {
    if (typeof this.id != 'undefined') {
      let newConfig = {
        "image": filename + '.png'
      }
      if (await this.deviceService.saveDeviceConfig(this.device, newConfig)) {
        this.deviceService.loadDeviceConfig(this.device);
      }
      this.navCtrl.pop();
    } else {
      this.modalCtrl.dismiss(filename + '.png');
    }
  }


}
