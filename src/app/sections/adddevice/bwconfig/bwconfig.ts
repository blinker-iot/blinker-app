import { Component } from '@angular/core';
import { Events, NavController } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { ActivatedRoute } from '@angular/router';
import { NoticeService } from 'src/app/core/services/notice.service';
import { AdddeviceService } from '../adddevice.service';


@Component({
  selector: 'page-bwconfig',
  templateUrl: 'bwconfig.html',
  styleUrls: ['bwconfig.scss']
})
export class BwconfigPage {
  mode: string = 'ble';
  type: string;
  found: boolean = false;
  timer;

  get deviceTypeList() {
    return this.adddeviceService.deviceTypeList
  }

  constructor(
    private adddeviceService: AdddeviceService,
    private userService: UserService,
    public events: Events,
    private navCtrl: NavController,
    private activatedRoute: ActivatedRoute,
    private noticeService: NoticeService
  ) {
  }

  ngOnInit() {
    this.type = this.activatedRoute.snapshot.params['deviceType'];
  }

  ngAfterViewInit() {
    this.adddeviceService.startScanDevice(this.type, this.mode);
    this.timer = window.setTimeout(() => {
      this.found = true;
    }, 3000)
  }

  ngOnDestroy(): void {
    this.adddeviceService.stopScanDevice();
    window.clearTimeout(this.timer);
  }

  async registerLocalDevice(item) {
    this.noticeService.showLoading("addDevice");
    let device = {
      "deviceType": this.type,
      "deviceName": item.deviceName,
      "config": {
        "mode": this.mode,
        "image": this.type.toLowerCase() + ".png",
        "customName": this.type == 'DiyArduino' ? "Arduino" : "Linux设备",
        "showSwitch": true
      }
    }
    if (await this.adddeviceService.addDevice(device)) {
      this.navCtrl.navigateRoot('/');
      this.userService.getAllInfo();
      this.noticeService.showAlert("addDeviceSuccess");
    } else {
      console.log('设备注册失败');
    }
  }

}
