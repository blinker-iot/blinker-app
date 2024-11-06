import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
// import { OpenNativeSettings } from '@awesome-cordova-plugins/open-native-settings/ngx';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'apconfig-ios-guide',
  templateUrl: './ios-guide.component.html',
  styleUrls: ['./ios-guide.component.scss'],
})
export class IosGuideComponent implements OnInit {

  // @Output() cancel = new EventEmitter()

  // @Output() confirm = new EventEmitter()

  @Input() deviceType = '';

  constructor(
    // private openNativeSettings: OpenNativeSettings,
    private modalCtrl: ModalController
  ) { }

  ngOnInit() { }


  openWifiSetting() {
    // this.openNativeSettings.open("wifi");
  }

  close() {
    this.modalCtrl.dismiss();
  }

}
