import { Component, NgZone } from '@angular/core';
// import { QRScanner, QRScannerStatus } from '@awesome-cordova-plugins/qr-scanner/ngx';
import { NavController } from '@ionic/angular';
import { AdddeviceService } from '../adddevice.service';
import { UserService } from 'src/app/core/services/user.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { Router } from '@angular/router';

@Component({
  selector: 'qrscanner',
  templateUrl: './qrscanner.page.html',
  styleUrls: ['./qrscanner.page.scss']
})
export class QrscannerPage {

  isShow = false;

  constructor(
    // private qrScanner: QRScanner,
    private navCtrl: NavController,
    private adddeviceService: AdddeviceService,
    private userService: UserService,
    private noticeService: NoticeService,
    private router: Router,
    private ngzone: NgZone
  ) { }

  // ngAfterViewInit() {
  //   setTimeout(() => {
  //     this.scan();
  //     this.entryScannerMode();
  //     this.isShow = true;
  //   }, 1000);
  // }

  ngOnDestroy() {
    this.exitScannerMode();
    // this.qrScanner.destroy();
  }

  ionViewDidEnter() {
    setTimeout(() => {
      this.scan();
      this.entryScannerMode();
      this.isShow = true;
    }, 1000);
  }

  entryScannerMode() {
    document.querySelector('ion-app').classList.add('scannerMode');
    document.querySelector('body').classList.add('scanner');
  }

  exitScannerMode() {
    document.querySelector('ion-app').classList.remove('scannerMode');
    document.querySelector('body').classList.remove('scanner');
  }

  scan() {
    // this.qrScanner.prepare()
    //   .then((status: QRScannerStatus) => {
    //     if (status.authorized) {
    //       this.qrScanner.show();
    //       this.startScan();
    //     } else if (status.denied) {
    //       // camera permission was permanently denied
    //       // you must use QRScanner.openSettings() method to guide the user to the settings page
    //       // then they can grant the permission from there
    //     } else {
    //       // permission was denied, but not permanently. You can ask for permission again at a later time.
    //     }
    //   })
    //   .catch((e: any) => console.log('Error is', e));
  }

  timeout = 0;

  startScan() {
    // setTimeout(() => {
    //   this.timeout = 5000
    //   let scanSub = this.qrScanner.scan().subscribe((text: string) => {
    //     this.ngzone.run(() => {
    //       scanSub.unsubscribe();
    //       console.log(text);
    //       let device;
    //       try {
    //         device = JSON.parse(text)
    //       } catch (error) {

    //       }
    //       if (typeof device != 'undefined' && typeof device.deviceType != 'undefined') {
    //         // this.exitScannerMode();
    //         // this.qrScanner.destroy();
    //         this.gotoGuide(device);
    //       } else if (text.indexOf('IMEI:') > -1) {
    //         // NBiot设备
    //         let imei = text.match(/IMEI:(\S*);/)[1]
    //         this.adddeviceService.addDeviceByScan(imei).then(result => {
    //           if (result) {
    //             this.exitScannerMode();
    //             // this.qrScanner.hide();
    //             this.gotoHome()
    //           } else {
    //             this.startScan()
    //           }
    //         })
    //       } else {
    //         this.noticeService.showToast('无效的二维码')
    //         this.startScan()
    //       }
    //     })
    //   });
    // }, this.timeout);
  }


  gotoHome() {
    this.navCtrl.navigateRoot('/');
    this.userService.getAllInfo();
  }

  gotoGuide(device) {
    // console.log(device);
    this.adddeviceService.isDev = device.isDev
    this.router.navigate(['/adddevice', device.deviceType])
  }

}
