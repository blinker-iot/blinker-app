// 需修复 12.27

import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
// import { OpenNativeSettings } from '@awesome-cordova-plugins/open-native-settings/ngx';
import { Platform } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { DataService } from 'src/app/core/services/data.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { NewuiService } from '../../newui/newui.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { Esptouch } from 'capacitor-esptouch';

declare var wifi;

@Component({
  selector: 'blinker-guide-esptouch',
  templateUrl: './esptouch.component.html',
  styleUrls: ['./esptouch.component.scss'],
})
export class EsptouchComponent implements OnInit {

  id: string;
  device: BlinkerDevice

  ssid: string = '';
  password: string = '';
  customData: string = '';

  mode = 2;  //esptouch v1:1 , esptouch v2:2

  editable = false;

  stateIndex: number;  //见html

  is5G: boolean;

  pwshow = false; //密码可见
  cdshow = false; //密钥可见

  platformResume: Subscription;

  savePassword = false

  passwordList = {}

  constructor(
    private dataService: DataService,
    private deviceService: DeviceService,
    private activatedRoute: ActivatedRoute,
    private platform: Platform,
    // private openNativeSettings: OpenNativeSettings,
    private changeDetectorRef: ChangeDetectorRef,
    private newuiService: NewuiService,
    private notice: NoticeService
  ) {
  }

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
        this.id = this.activatedRoute.snapshot.params['id'];
        this.device = this.dataService.device.dict[this.id]
        this.customData = this.device.config.authKey
      }
    })
  }

  ngAfterViewInit() {
    if (!this.platform.is("cordova")) return;
    this.loadSavePasswordConfig();
    if (this.platform.is("android")) {
      wifi.checkLocation(result => {
        if (!result) {
          this.notice.showToast('请开启位置服务，以获取WiFi信息');
          this.stateIndex = -2;
        } else {
          this.getConnectedInfo();
        }
      });
    } else if (this.platform.is("ios")) {
      // this.geo.getCurrentPosition();
      this.getConnectedInfo();
    }
    this.platformResume = this.platform.resume.subscribe(() => {
      this.getConnectedInfo();
      this.changeDetectorRef.detectChanges();
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    if (this.savePassword)
      this.saveLocalPassowrd();
    else
      this.delLocalPassowrd()
    if (this.platform.is("cordova")) {
      this.platformResume.unsubscribe();
      Esptouch.stop();
    }
  }

  getConnectedInfo() {
    this.stateIndex = 1;
    this.changeDetectorRef.detectChanges();
    wifi.getConnectedInfo(
      info => {
        console.log('getConnectedInfo:', info);
        if (this.mode == 1) this.stateIndex = 11
        else if (this.mode == 2) this.stateIndex = 12
        this.ssid = info.ssid;
        if (this.platform.is('android'))
          this.is5G = info.is5G;
        this.loadLocalPassowrd();
        this.changeDetectorRef.detectChanges();
      },
      error => {
        if (error.state == 'Connecting') {
          this.stateIndex = 2
          setTimeout(() => {
            this.getConnectedInfo()
          }, 1000)
        } else if (error.state == 'NotConnected') {
          this.stateIndex = -1
          this.notice.showToast('请先连接到WiFi热点，再进行配置');
        }
      }
    )
  }

  openWifiSetting() {
    // this.openNativeSettings.open("wifi");
  }

  showPassword() {
    this.pwshow = !this.pwshow
  }

  showCustomData() {
    this.cdshow = !this.cdshow
  }

  loadSavePasswordConfig() {
    let val = localStorage.getItem('saveWiFiPassword')
    if (val == null) return
    this.savePassword = val == 'true' ? true : false
  }

  clickSavePassword() {
    this.savePassword = !this.savePassword
    localStorage.setItem('saveWiFiPassword', JSON.stringify(this.savePassword));
  }

  saveLocalPassowrd() {
    if (this.savePassword && this.ssid != 'unknown ssid' && this.ssid != '') {
      this.passwordList[this.ssid] = this.password
      localStorage.setItem('passwordList', JSON.stringify(this.passwordList));
    }
  }

  loadLocalPassowrd() {
    if (this.ssid != 'unknown ssid' && this.ssid != '') {
      let val = localStorage.getItem('passwordList')
      if (val == null) return
      let passwordList = JSON.parse(val)
      this.password = passwordList[this.ssid]
    }
  }

  delLocalPassowrd() {
    localStorage.removeItem('passwordList');
  }

  onClick() {
    if (this.state == 0 || this.state == -1) {
      this.configBegin()
    } else if (this.state == 1) {
      Esptouch.stop();
      this.updateState(0)
    } else if (this.state == 2) {
      this.newuiService.goBack()
    }
  }

  date1;
  date2;
  time;
  timeoutTimer;
  mac;
  ip;
  btnIcon = 'fa-light fa-wifi';
  btnIconList = ['fa-light fa-wifi-weak', 'fa-light fa-wifi-fair', 'fa-light fa-wifi']
  btnTitle = '开始配置'
  btnText = '';
  state = 0; // 0：等待开始  1：正在配网  2：配置完成  -1：配置失败
  async configBegin() {
    if (this.ssid == '') return
    if (this.platform.is('cordova')) {
      this.date1 = new Date();
      console.log("开始配置");
      this.updateState(1);
      // esptouch2.start(this.ssid, this.password, this.customData,
      //   result => {
      //     this.updateState(2);
      //     this.configComplete(result)
      //   },
      //   error => { this.configFail(error) }
      // );
      Esptouch.start({
        ssid: this.ssid,
        bssid: '00:00:00:00:00:00',
        password: this.password,
        aesKey: '1234567890123456',
        customData: this.customData,
      }).then(result => {
        this.updateState(2);
        this.configComplete(result)
      }).catch(error => {
        this.configFail(error)
      })
      this.timeoutTimer = setTimeout(() => {
        this.configFail('config timeout')
      }, 60000);
    }
  }

  intervalTimer;
  iconIndex = 0;
  updateState(state) {
    setTimeout(() => {
      this.state = state;
      clearInterval(this.intervalTimer)
      switch (state) {
        case 0:
          this.btnIcon = 'fa-light fa-wifi';
          this.btnTitle = '开始配置'
          this.btnText = '';
          break;
        case 1:
          this.intervalTimer = setInterval(() => {
            this.btnIcon = this.btnIconList[this.iconIndex]
            this.iconIndex > 1 ? this.iconIndex = 0 : this.iconIndex++
          }, 300)
          this.btnTitle = '正在配置...'
          this.btnText = '点击停止设备配置';
          break;
        case 2:
          this.btnIcon = 'fa-light fa-check';
          this.btnTitle = '配置成功'
          this.btnText = '设备已连接到WiFi热点';
          clearTimeout(this.timeoutTimer)
          setTimeout(() => {
            this.newuiService.goBack()
          }, 3000);
          setTimeout(() => {
            this.deviceService.queryDevice(this.device)
          }, 5000)
          break;
        case -1:
          this.btnIcon = 'fa-light fa-xmark';
          this.btnTitle = '配置失败'
          this.btnText = '点击重新尝试配置';
          clearTimeout(this.timeoutTimer)
          break;
        default:
          break;
      }
      this.changeDetectorRef.detectChanges();
    });
  }

  configFail(err) {
    console.log(err)
    this.updateState(-1);
  }

  async configComplete(res) {
    clearTimeout(this.timeoutTimer)
    console.log(res);
    this.date2 = new Date();
    this.time = this.date2.getTime() - this.date1.getTime();
    console.log("SmartConfig成功,耗时：" + this.time + "ms");
    Esptouch.stop();
    this.mac = res.bssid;
    this.ip = res.ip;
    this.updateState(2);
  }
}
