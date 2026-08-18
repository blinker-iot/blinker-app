import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalController } from '@ionic/angular';
import { Act2TextPipe } from 'src/app/core/pipes/actcmd2text';

@Component({
  selector: 'blinker-action-selector-modal',
  standalone: true,
  templateUrl: './action-selector-modal.component.html',
  styleUrls: ['./action-selector-modal.component.scss'],
  imports: [CommonModule, Act2TextPipe, TranslatePipe],
})
export class ActionSelectorModalComponent implements OnInit {


  @Input() data = '0000000';
  @Output() dataChange = new EventEmitter()

  @Output() done = new EventEmitter()
  @Output() cancel = new EventEmitter()

  @Input() device;
  @Output() updateAct = new EventEmitter;

  selectedItem;

  actions = []

  constructor(
    private modalController: ModalController
  ) { }

  ngOnInit(): void {
    if (!this.device?.config?.layouter) return;
    const deviceConfig = JSON.parse(this.device.config.layouter)
    this.actions = deviceConfig?.actions ?? [];
    // console.log(this.actions);

  }

  updateSelectedAction(event) {
    // console.log(event[0]);
    this.done.emit(event[0])
    this.modalController.dismiss(event[0])
  }

  clickConfirm() {
    this.done.emit(this.data)
    this.modalController.dismiss(this.data)
  }

  clickCancel() {
    this.cancel.emit()
    this.modalController.dismiss()
  }

  genActs(){
    
  }
}
