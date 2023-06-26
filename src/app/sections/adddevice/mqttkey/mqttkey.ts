import { Component } from '@angular/core';
import { NavController } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { Clipboard } from '@ionic-native/clipboard/ngx';
import { ActivatedRoute } from '@angular/router';
import { GeolocationService } from 'src/app/core/services/geolocation.service';
import { AdddeviceService } from '../adddevice.service';
import { NoticeService } from 'src/app/core/services/notice.service';

@Component({
  selector: 'page-mqttkey',
  templateUrl: 'mqttkey.html',
  styleUrls: ['mqttkey.scss'],
  providers: [Clipboard]
})
export class MqttkeyPage {
  showKey = false;
  showExit = false;

  step = 0;
  secretKey: string;
  showBroker: string;
  deviceType;

  get latitude() {
    return this.geolocationService.latitude
  }
  get longitude() {
    return this.geolocationService.longitude
  }
  get address() {
    return this.geolocationService.address
  }

  constructor(
    private adddeviceService: AdddeviceService,
    private userService: UserService,
    private noticeService: NoticeService,
    private activatedRoute: ActivatedRoute,
    private navCtrl: NavController,
    private clipboard: Clipboard,
    private geolocationService: GeolocationService,
  ) {
  }

  ngOnInit() {
    this.deviceType = this.activatedRoute.snapshot.params['deviceType'];
  }

  ngAfterViewInit() {
    this.registerDevice('blinker')
  }

  async registerDevice(broker = 'aliyun') {
    this.showBroker = broker;
    this.step++;
    let image;
    let customName;
    if (this.deviceType == 'DiyArduino') {
      image = "diyarduino.png"
      customName = "Arduino";
    } else if (this.deviceType == 'DiyLinux') {
      image = "diylinux.png";
      customName = "Linux设备";
    }
    let device = {
      "deviceType": this.deviceType,
      "config": {
        "mode": "mqtt",
        "broker": broker,
        "image": image,
        "customName": "新的设备",
        "showSwitch": true
      }
    }
    console.log('get position');

    // 获取设备地址
    // if (await this.geolocationService.getUserPosition()) {
    //   device.config['position'] = {
    //     "location": [this.longitude, this.latitude],
    //     "address": this.address
    //   }
    //   device.config['public'] = 1;
    // }

    let newDevice = await this.adddeviceService.getMqttKey(device)
    if (newDevice) {
      this.secretKey = newDevice.authKey;
      this.step++;
    } else {
      this.showExit = true;
      console.log('注册失败');
    }
  }

  copyKey() {
    this.clipboard.copy(this.secretKey);
    this.noticeService.showToast('copySuccess')
  }

  gotoHome() {
    this.navCtrl.navigateRoot('/');
    this.userService.getAllInfo();
  }

  showToast() {
    this.noticeService.showToast('您的账号暂不支持该功能');
  }

}
