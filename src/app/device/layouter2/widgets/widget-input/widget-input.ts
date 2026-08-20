import { Component, Input } from '@angular/core';
import { Layouter2Widget } from '../config';
import { AlertController } from '@ionic/angular';
import { LayouterService } from '../../../layouter.service';
import { NgStyle } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'widget-input',
  templateUrl: 'widget-input.html',
  styleUrls: ['widget-input.scss'],
  imports: [NgStyle, FormsModule],
})
export class WidgetInputComponent implements Layouter2Widget {
  @Input() widget;
  @Input() device;
  @Input() isDemo = false;

  get key() {
    return this.widget.key;
  }

  get t0() {
    return this.getValue(['tex', 't0']);
  }

  get t1() {
    return this.getValue(['tex1', 't1']);
  }

  get ico() {
    return this.getValue(['ico', 'icon']);
  }

  get color() {
    return this.getValue(['clr', 'col', 'color']);
  }

  getValue(valueKeys: string[]): any {
    if (this.isDemo) {
      for (let valueKey of valueKeys) {
        if (typeof this.widget[valueKey] != 'undefined')
          return this.widget[valueKey];
      }
    }

    for (let valueKey of valueKeys) {
      if (typeof this.device.data[this.key] != 'undefined')
        if (typeof this.device.data[this.key][valueKey] != 'undefined')
          return this.device.data[this.key][valueKey];
      if (typeof this.widget[valueKey] != 'undefined')
        return this.widget[valueKey];
    }
    return;
  }

  _lstyle;
  @Input()
  set lstyle(lstyle) {
    this._lstyle = lstyle;
  }
  get lstyle() {
    if (typeof this._lstyle != 'undefined') return this._lstyle;
    if (typeof this.widget.lstyle != 'undefined') return this.widget.lstyle;
    return 0;
  }

  sendmess;

  constructor(
    private alertCtrl: AlertController,
    private layouterService: LayouterService
  ) {}

  send() {}

  async showInputModal() {
    const alert = await this.alertCtrl.create({
      header: '发送数据',
      inputs: [
        {
          name: 'message',
          type: 'text',
          value: this.sendmess,
          placeholder: '请输入要发送的内容',
        },
      ],
      buttons: [
        '取消',
        {
          text: '发送',
          handler: (data) => {
            this.sendmess = data.message;
            if (this.sendmess) {
              this.layouterService.send(
                JSON.stringify({ [this.key]: this.sendmess })
              );
            }
          },
        },
      ],
    });
    await alert.present();
  }
}
