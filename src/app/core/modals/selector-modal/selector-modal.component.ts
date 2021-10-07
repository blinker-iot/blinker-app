import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'blinker-selector-modal',
  templateUrl: './selector-modal.component.html',
  styleUrls: ['./selector-modal.component.scss'],
})
export class SelectorModalComponent implements OnInit {

  @Output() dataChange = new EventEmitter()

  @Output() done = new EventEmitter()
  @Output() cancel = new EventEmitter()


  @Input() items: { text: string, value: any }[] = [];

  actions = []

  constructor(
    private modalController: ModalController
  ) { }

  ngOnInit(): void {

  }

  selectItem(item) {
    this.done.emit(item)
    this.modalController.dismiss(item)
  }

  // clickConfirm() {
  //   this.done.emit(this.data)
  //   this.modalController.dismiss(this.data)
  // }

  clickCancel() {
    this.cancel.emit()
    this.modalController.dismiss()
  }

}
