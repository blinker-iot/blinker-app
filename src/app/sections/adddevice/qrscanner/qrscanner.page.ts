import { Component, OnInit } from '@angular/core';
import { QRScanner, QRScannerStatus } from '@ionic-native/qr-scanner/ngx';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'qrscanner',
  templateUrl: './qrscanner.page.html',
  styleUrls: ['./qrscanner.page.scss'],
  providers: [QRScanner]
})
export class QrscannerPage implements OnInit {

  constructor(
    private qrScanner: QRScanner,
    private navCtrl: NavController
  ) { }

  ngOnInit() {
    this.scan()
  }

  ngOnDestroy(): void {
    this.exitScannerMode()
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
    this.qrScanner.prepare()
      .then((status: QRScannerStatus) => {
        console.log(status);
        if (status.authorized) {
          this.entryScannerMode();
          this.qrScanner.show();
          let scanSub = this.qrScanner.scan().subscribe((text: string) => {
            alert(text);
            this.exitScannerMode();
            this.qrScanner.hide(); // hide camera preview
            scanSub.unsubscribe(); // stop scanning
            this.navCtrl.pop();
          });

        } else if (status.denied) {
          // camera permission was permanently denied
          // you must use QRScanner.openSettings() method to guide the user to the settings page
          // then they can grant the permission from there
        } else {
          // permission was denied, but not permanently. You can ask for permission again at a later time.
        }
      })
      .catch((e: any) => console.log('Error is', e));
  }

}
