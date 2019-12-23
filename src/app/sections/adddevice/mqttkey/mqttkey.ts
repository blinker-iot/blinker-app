import { Component } from '@angular/core';
import { Events, NavController } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';
import { Clipboard } from '@ionic-native/clipboard/ngx';
import { ActivatedRoute } from '@angular/router';
import { GeolocationService } from 'src/app/core/services/geolocation.service';
import { AdddeviceService } from '../adddevice.service';

@Component({
  selector: 'page-mqttkey',
  templateUrl: 'mqttkey.html',
  styleUrls: ['mqttkey.scss'],
  providers: [Clipboard]
})
export class MqttkeyPage {
  showKey = false;
  showExit = false;
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
    private events: Events,
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
    // this.deviceType = this.activatedRoute.snapshot.params['deviceType'];
    this.registerDevice();
  }

  async registerDevice(broker = 'aliyun') {
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
        "customName": customName,
        "showSwitch": true
      }
    }
    console.log('get position');
    
    if (await this.geolocationService.getUserPosition()) {
      device.config['position'] = {
        "location": [this.longitude, this.latitude],
        "address": this.address
      }
      device.config['public'] = 1;
    }

    this.showBroker = broker;
    console.log('get key');
    let newDevice = await this.adddeviceService.getMqttKey(device)
    if (newDevice) {
      this.secretKey = newDevice.authKey;
      this.showKey = true;
    } else {
      this.showExit = true;
      console.log('注册失败');
    }
  }

  copyKey() {
    this.clipboard.copy(this.secretKey);
    this.events.publish("provider:notice", "copySuccess")
  }

  gotoHome() {
    this.navCtrl.navigateRoot('/');
    this.userService.getAllInfo();
  }
}
