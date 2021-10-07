import { Component, Input, Output, EventEmitter, SimpleChanges } from '@angular/core';
import { DeviceConfigService } from 'src/app/core/services/device-config.service';

@Component({
  selector: 'b-actcmd-list',
  templateUrl: './b-actcmd-list.component.html',
  styleUrls: ['./b-actcmd-list.component.scss'],
})
export class BActcmdListComponent {

  @Input() device;
  @Output() updateAct = new EventEmitter;

  selectedItem;

  cmdList = [];

  get deviceConfig() {
    return this.device.config.isDev ? this.deviceConfigService.devDeviceConfig : this.deviceConfigService.deviceConfigs;
  }

  get isDiy() {
    if (this.device.deviceType.indexOf('Diy') > -1)
      return true
    else
      return false
  }

  constructor(
    private deviceConfigService: DeviceConfigService,
  ) { }

  ngOnChanges(changes: SimpleChanges) {
    if (this.isDiy) return
    // console.log(changes);
    let deviceConfig = this.deviceConfigService.getDeviceConfig(this.device)
    if (typeof deviceConfig.actions == 'undefined') deviceConfig['actions'] = '[]';
    console.log(deviceConfig.actions);
    this.cmdList = JSON.parse(deviceConfig.actions)
  }

  updateSelectedAction(event) {
    this.selectedItem = event[0]
    if (typeof event[0] == 'string')
      this.updateAct.emit([event[0]]);
    else
      this.updateAct.emit([JSON.stringify(event[0])]);
  }

}
