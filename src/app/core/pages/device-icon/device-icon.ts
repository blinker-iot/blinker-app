import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeviceService } from 'src/app/core/services/device.service';
import { ActivatedRoute } from '@angular/router';
import { IonicModule, NavController, ModalController } from '@ionic/angular';
import { DataService } from '../../services/data.service';
import { ImageList } from 'src/app/configs/app.config';
import { ImageService } from '../../services/image.service';
import { BDeviceImgComponent } from '../../components/b-device-img/b-device-img.component';


@Component({
    standalone: true,
    selector: 'page-device-icon',
    templateUrl: 'device-icon.html',
    styleUrls: ['device-icon.scss'],
    imports: [CommonModule, FormsModule, IonicModule, BDeviceImgComponent]
})
export class DeviceIconPage {
  id;
  device;

  imageList;

  customUrl = "";

  get deviceIconDict() {
    return this.imageService.deviceIconDict
  }

  constructor(
    private activatedRoute: ActivatedRoute,
    private deviceService: DeviceService,
    public dataService: DataService,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private imageService: ImageService
  ) {
  }

  ngOnInit() {
    this.id = this.activatedRoute.snapshot.params['id'];
    this.device = this.dataService.device.dict[this.id];
    this.imageList = ImageList.concat([...this.imageService.deviceIconList]);
    // this.imageService.imageDict
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
      (await this.modalCtrl.getTop()).dismiss(filename + '.png')
      // this.modalCtrl.dismiss();
    }
  }

  async close() {
    (await this.modalCtrl.getTop()).dismiss()
    // this.modalCtrl.dismiss()
  }

  async selectCustomUrl() {
    if ((this.customUrl.indexOf('https://') > -1 || this.customUrl.indexOf('http://') > -1) && (this.customUrl.indexOf('.png')))
      (await this.modalCtrl.getTop()).dismiss(this.customUrl)
  }

}
