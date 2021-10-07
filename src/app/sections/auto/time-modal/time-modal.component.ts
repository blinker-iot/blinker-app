import { Component, OnInit, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'blinker-time-modal',
  templateUrl: './time-modal.component.html',
  styleUrls: ['./time-modal.component.scss'],
})
export class TimeModalComponent implements OnInit {

  @Input() timeData;

  timeInfo1
  timeInfo2
  day = "0000000"

  constructor(
    private modalCtrl: ModalController
  ) { }

  ngOnInit() {
    this.day = this.timeData.day
    this.timeInfo1 = this.timeData.range[0]
    this.timeInfo2 = this.timeData.range[1]
  }

  close() {
    this.modalCtrl.dismiss()
  }

  save() {
    this.timeData = {
      day: this.day,
      range: [this.timeInfo1, this.timeInfo2]
    }
    this.modalCtrl.dismiss(this.timeData)
  }

  choseDay(num) {
    let days = '';
    for (var i = 0; i < this.day.length; i++) {
      if (num == i) {
        days = days + (this.day[num] == '1' ? '0' : '1');
      } else {
        days = days + this.day[i];
      }
    }
    this.day = days;
  }
}
