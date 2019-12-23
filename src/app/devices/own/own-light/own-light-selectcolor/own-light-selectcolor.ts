import { Component, Input } from '@angular/core';
import { NavController, ModalController } from '@ionic/angular';


@Component({
  selector: 'page-own-light-selectcolor',
  styleUrls: ['own-light-selectcolor.scss'],
  templateUrl: 'own-light-selectcolor.html',
})
export class OwnLightSelectcolorPage {

  @Input() colorList;
  @Input() id;

  constructor(
    public navCtrl: NavController,
    private modalCtrl: ModalController
  ) {
    // this.colorList = navParams.data.colorList;
    // this.i = navParams.data.id;
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }

  colorChange(e) {
    this.colorList[this.id] = e;
  }

  delColor() {
    this.colorList.splice(this.id, 1);
    this.modalCtrl.dismiss();
  }

}
