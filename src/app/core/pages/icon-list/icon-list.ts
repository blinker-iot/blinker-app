import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { IconList } from 'src/app/configs/app.config';

@Component({
  selector: 'icon-list',
  templateUrl: 'icon-list.html',
  styleUrls: ['icon-list.scss']
})
export class IconListPage {
  @Input() item;
  @Input() iconId;

  iconList;

  constructor(
    public modalCtrl: ModalController
  ) {
    this.iconList=IconList
   }

  select(icon) {
    if (typeof this.iconId == 'undefined')
      this.item['ico'] = icon;
    else
      this.item[this.iconId] = icon;
    this.modalCtrl.dismiss();
  }

}
