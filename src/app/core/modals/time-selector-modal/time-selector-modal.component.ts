import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ModalController } from '@ionic/angular';
import Picker from 'pickerjs';

@Component({
  selector: 'blinker-time-selector-modal',
  templateUrl: './time-selector-modal.component.html',
  styleUrls: ['./time-selector-modal.component.scss'],
})
export class TimeSelectorModalComponent implements OnInit {
  timePicker;

  @Input() time: string = "00:00";

  @Input() data;
  @Output() dataChange = new EventEmitter()

  @Output() done = new EventEmitter()
  @Output() cancel = new EventEmitter()

  constructor(
    private modalController: ModalController
  ) { }

  ngOnInit() { }

  ngOnDestroy() {
    this.timePicker.destroy()
  }

  ngAfterViewInit() {
    this.timePicker = new Picker(document.querySelector('.js-inline-picker'), {
      inline: true,
      controls: true,
      format: 'HH:mm',
      text: {
        hour: '时',
        minute: '分',
      }
    });
  }

  clickConfirm() {
    this.done.emit(this.timePicker.getDate('HH:mm'))
    this.modalController.dismiss(this.timePicker.getDate('HH:mm'))
  }

  clickCancel() {
    this.cancel.emit()
    this.modalController.dismiss()
  }

}
