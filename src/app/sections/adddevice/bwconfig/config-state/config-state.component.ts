import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'ble-scan-state',
  templateUrl: './config-state.component.html',
  styleUrls: ['./config-state.component.scss'],
})
export class ConfigStateComponent implements OnInit {

  @Input() state = 0;
  @Output() retry = new EventEmitter

  constructor(
    private navCtrl: NavController
  ) { }

  ngOnInit() { }

  cancel() {
    this.navCtrl.back()
  }

  onRetry() {
    this.retry.emit()
  }
}
