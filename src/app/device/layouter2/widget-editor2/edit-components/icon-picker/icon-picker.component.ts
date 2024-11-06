import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { IconListPage } from 'src/app/core/pages/icon-list/icon-list';

@Component({
  selector: 'icon-picker',
  templateUrl: './icon-picker.component.html',
  styleUrls: ['./icon-picker.component.scss'],
})
export class IconPickerComponent implements OnInit {

  @Input() value;
  @Output() valueChange = new EventEmitter();

  constructor(
    private modalCtrl: ModalController
  ) { }

  ngOnInit() { }

  change(val) {
    this.valueChange.emit(this.value);
  }

  async selectIcon() {
    let modal = await this.modalCtrl.create({
      component: IconListPage,
      componentProps: {
        'icon': this.value
      }
    });
    modal.present();
    modal.onWillDismiss().then(res => {
      console.log(res);
      this.valueChange.emit(res.data);
    })
  }

}
