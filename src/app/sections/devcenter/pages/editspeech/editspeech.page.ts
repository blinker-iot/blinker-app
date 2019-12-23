import { Component, OnInit } from '@angular/core';
import { DevcenterService } from '../../devcenter.service';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular';
import { NoticeService } from 'src/app/core/services/notice.service';

@Component({
  selector: 'dev-editspeech',
  templateUrl: './editspeech.page.html',
  styleUrls: ['./editspeech.page.scss'],
})
export class EditspeechPage implements OnInit {
  get prodevice() {
    return this.devcenterService.currentProDevice
  }
  speechConfig: string

  deviceType = '';

  constructor(
    private devcenterService: DevcenterService,
    private activatedRoute: ActivatedRoute,
    private navCtrl: NavController,
    private noticeService: NoticeService
  ) { }

  ngOnInit() {
    this.deviceType = this.activatedRoute.snapshot.params['deviceType'];
    // this.prodevice.speech = [
    //   { "cmd": "打开?room的?name", "act": "{\"btn-acb\"}:\"on\"" },
    //   { "cmd": "关闭?room的?name", "act": "{\"btn-acb\"}:\"off\"" }
    // ]
    this.speechConfig = JSON.stringify(this.prodevice.speech).replace(/\}\,\{/, '\}\,\n  \{').replace(/\[/, '\[\n  ').replace(/\]/, '\n\]')
  }

  uploadSpeech() {
    try {
      let config = {
        speech: JSON.parse(this.speechConfig)
      }
      this.devcenterService.setProDeviceConfig(this.deviceType, config)
        .then(result => {
          if (result) {
            this.navCtrl.pop()
          }

        })
    } catch (error) {
      this.noticeService.showToast('notJson')
    }
  }

}
