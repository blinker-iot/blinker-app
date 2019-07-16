import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, ViewController, Platform } from 'ionic-angular';


@IonicPage()
@Component({
  selector: 'page-layout2-guide',
  templateUrl: 'layout2-guide.html',
})
export class Layout2GuidePage {

  isIos = false;
  isIphonex = false;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public viewCtrl: ViewController,
    public plt: Platform,
  ) {
  }

  ionViewDidLoad() {
    // 判断是否为ios、iphonex，以便做适配
    if (this.plt.is('ios')) {
      this.isIos = true;
      if ((window.screen.width == 375) && (window.screen.height == 812)) {
        this.isIphonex = true;
      }
    }
  }

  close(e) {
    e.stopPropagation();
    this.viewCtrl.dismiss();
  }

  loadExample(e) {
    e.stopPropagation();
    this.viewCtrl.dismiss('loadExample1');
  }

}
