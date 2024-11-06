import { Component, OnInit } from '@angular/core';
import { DocService } from 'src/app/core/services/doc.service';
import { DevcenterService } from '../../devcenter.service';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular';
import { CONFIG } from 'src/app/configs/app.config';
// import { Camera } from '@awesome-cordova-plugins/camera/ngx';

@Component({
  selector: 'prodevice-public',
  templateUrl: './publicprodevice.page.html',
  styleUrls: ['./publicprodevice.page.scss'],
})
export class PublicprodevicePage implements OnInit {
  step = 0;
  agreement: string = '';
  isAuthenticated = false;
  deviceType = '';
  prodevice;

  constructor(
    private docService: DocService,
    private devcenterService: DevcenterService,
    private activatedRoute: ActivatedRoute,
    private navCtrl: NavController
  ) { }

  ngOnInit() {
    this.deviceType = this.activatedRoute.snapshot.params['deviceType'];
    this.docService.getMarkdownDoc(CONFIG.DEV_AGREEMENT).then(doc => {
      // console.log(doc);
      this.agreement = doc;
    });
    this.devcenterService.isAuthenticated().then(result => {
      this.isAuthenticated = result;
    });
    for (let prodevice of this.devcenterService.proDeviceList) {
      if (prodevice.deviceType == this.deviceType) {
        this.prodevice = prodevice;
        break;
      }
    }
    console.log(this.prodevice);


  }


  next() {
    if (this.isAuthenticated)
      this.step = 2;
    else
      this.step = 1;
  }

  uploadAuthInfo() {
    this.step = 2;
  }

  publicDevice() {
    this.step = 3;
    this.devcenterService.publicProDevice(this.deviceType);
  }

  pop() {
    this.navCtrl.pop();
  }


}
