import { Component } from '@angular/core';
import { Platform, ModalController } from '@ionic/angular';

@Component({
  selector: 'layouter2-guide',
  templateUrl: 'layouter2-guide.html',
  styleUrls: ['layouter2-guide.scss']
})
export class Layouter2GuidePage {

  isIos = false;
  isIphonex = false;
  showDialog = true;

  constructor(
    public platform: Platform,
    private modalCtrl: ModalController
  ) {
  }

  ngOnInit() {
    // 判断是否为ios、iphonex，以便做适配
    if (this.platform.is('ios')) {
      this.isIos = true;
      if ((window.screen.width == 375) && (window.screen.height == 812)) {
        this.isIphonex = true;
      }
    }
  }

  close(e) {
    // e.stopPropagation();
    this.modalCtrl.dismiss();
  }

  loadExample(e) {
    // e.stopPropagation();
    this.modalCtrl.dismiss('loadExample1');
  }

  closeDialog(e) {
    // e.stopPropagation();
    // if (!this.showDialog) this.viewCtrl.dismiss();
    // this.showDialog = false;
  }

}
