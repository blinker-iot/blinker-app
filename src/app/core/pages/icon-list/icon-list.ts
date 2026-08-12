// 需修复 12.27

import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { IconList } from 'src/app/configs/app.config';
// import { InAppBrowser } from '@awesome-cordova-plugins/in-app-browser/ngx';

@Component({
  selector: 'icon-list',
  standalone: true,
  templateUrl: 'icon-list.html',
  styleUrls: ['icon-list.scss'],
  imports: [CommonModule, IonicModule],
})
export class IconListPage {
  @Input() item;
  @Input() iconId;
  @Input() icon;

  iconList;

  style = 'fad';

  constructor(
    private modalCtrl: ModalController,
    // private iab: InAppBrowser
  ) {
  }

  ngOnInit() {
    this.iconList = IconList
  }

  async select(icon) {
    if (this.item)
      if (typeof this.iconId == 'undefined')
        this.item['ico'] = icon;
      else
        this.item[this.iconId] = icon;
    (await this.modalCtrl.getTop()).dismiss(icon)
  }

  async close() {
    // this.modalCtrl.dismiss()
    (await this.modalCtrl.getTop()).dismiss()
  }

  open(url) {
    // let browser = this.iab.create(url, '_system', 'location=no,hidden=no');
  }

  selectStyle(style) {
    this.style = style;
  }
}
