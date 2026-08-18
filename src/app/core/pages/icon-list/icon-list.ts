// 需修复 12.27

import { Component, Input } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { IconList, IconStyle } from './icons.config';
// import { InAppBrowser } from '@awesome-cordova-plugins/in-app-browser/ngx';

@Component({
  selector: 'icon-list',
  standalone: true,
  templateUrl: 'icon-list.html',
  styleUrls: ['icon-list.scss'],
  imports: [IonicModule],
})
export class IconListPage {
  @Input() item;
  @Input() iconId;
  @Input() icon;

  readonly iconList = IconList;
  style: IconStyle = 'fa-light';

  constructor(private modalCtrl: ModalController) // private iab: InAppBrowser
  {}

  async select(icon) {
    if (this.item)
      if (typeof this.iconId == 'undefined') this.item['ico'] = icon;
      else this.item[this.iconId] = icon;
    (await this.modalCtrl.getTop()).dismiss(icon);
  }

  async close() {
    // this.modalCtrl.dismiss()
    (await this.modalCtrl.getTop()).dismiss();
  }

  open(url) {
    // let browser = this.iab.create(url, '_system', 'location=no,hidden=no');
  }

  applyStyle(icon: string) {
    return icon.replace(
      /^fa-(?:light|regular|solid|duotone)\b/,
      this.style,
    );
  }

  selectStyle(style: IconStyle) {
    this.style = style;
  }
}
