import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { IconList } from 'src/app/configs/app.config';
import { InAppBrowser } from '@ionic-native/in-app-browser/ngx';

@Component({
  selector: 'icon-list',
  templateUrl: 'icon-list.html',
  styleUrls: ['icon-list.scss'],
  providers: [InAppBrowser]
})
export class IconListPage {
  @Input() item;
  @Input() iconId;

  iconList;

  style = 'fad';

  constructor(
    private modalCtrl: ModalController,
    private iab: InAppBrowser
  ) {
  }

  ngOnInit() {
    this.iconList = IconList
  }

  async select(icon) {
    if (typeof this.iconId == 'undefined')
      this.item['ico'] = icon;
    else
      this.item[this.iconId] = icon;
    // this.modalCtrl.dismiss();
    (await this.modalCtrl.getTop()).dismiss()
  }

  async close() {
    // this.modalCtrl.dismiss()
    (await this.modalCtrl.getTop()).dismiss()
  }

  open(url) {
    let browser = this.iab.create(url, '_system', 'location=no,hidden=no');
  }

  selectStyle(style) {
    this.style = style;
  }
}
