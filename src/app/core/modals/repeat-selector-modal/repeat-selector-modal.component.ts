import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'blinker-repeat-selector-modal',
  templateUrl: './repeat-selector-modal.component.html',
  styleUrls: ['./repeat-selector-modal.component.scss'],
})
export class RepeatSelectorModalComponent implements OnInit {

  dayList = [
    'TIMING.SUNDAY',
    'TIMING.MONDAY',
    'TIMING.TUESDAY',
    'TIMING.WEDNESDAY',
    'TIMING.THURSDAY',
    'TIMING.FRIDAY',
    'TIMING.SATURDAY',
  ]

  @Input() data = '0000000';
  @Output() dataChange = new EventEmitter()

  @Output() done = new EventEmitter()
  @Output() cancel = new EventEmitter()

  constructor(
    private modalController: ModalController
  ) { }

  ngOnInit() { }

  choseDay(num) {
    let days = '';
    for (let i = 0; i < this.data.length; i++) {
      if (num == i) {
        days = days + (this.data[num] == '1' ? '0' : '1');
      } else {
        days = days + this.data[i];
      }
    }
    this.data = days;
    console.log(this.data);

    this.dataChange.emit(this.data)
  }

  clickConfirm() {
    this.done.emit(this.data)
    this.modalController.dismiss(this.data)
  }

  clickCancel() {
    this.cancel.emit()
    this.modalController.dismiss()
  }

}
