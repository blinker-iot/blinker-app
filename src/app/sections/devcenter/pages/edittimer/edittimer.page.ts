import { Component, OnInit } from '@angular/core';
import { DevcenterService } from '../../devcenter.service';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular';
import { NoticeService } from 'src/app/core/services/notice.service';

@Component({
  selector: 'dev-edittimer',
  templateUrl: './edittimer.page.html',
  styleUrls: ['./edittimer.page.scss'],
})
export class EdittimerPage implements OnInit {
  get prodevice() {
    return this.devcenterService.currentProDevice
  }
  timerConfig: string

  deviceType = '';

  constructor(
    private devcenterService: DevcenterService,
    private activatedRoute: ActivatedRoute,
    private navCtrl: NavController,
    private noticeService: NoticeService
  ) { }

  ngOnInit() {
    this.deviceType = this.activatedRoute.snapshot.params['deviceType'];
    this.timerConfig = JSON.stringify(this.prodevice.timer).replace(/\}\,\{/, '\}\,\n  \{').replace(/\[/, '\[\n  ').replace(/\]/, '\n\]')
  }

  uploadTimer() {
    try {
      let config = {
        timer: JSON.parse(this.timerConfig)
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
