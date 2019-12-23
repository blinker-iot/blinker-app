import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { TimerService } from '../../timer.service';
import { DevicelistService } from 'src/app/core/services/devicelist.service';

@Component({
  selector: 'cmdlist',
  templateUrl: './cmdlist.component.html',
  styleUrls: ['./cmdlist.component.scss'],
})
export class CmdlistComponent implements OnInit {

  @Input() device;
  @Output() updateAct = new EventEmitter;

  selectedItem;

  get deviceConfig() {
    return this.device.config.isDev ? this.devicelistService.devDeviceConfig : this.devicelistService.deviceConfig;
  }


  get isDiy() {
    if (this.device.deviceType.indexOf('Diy') > -1)
      // if (this.deviceConfig[this.device.deviceType].component == "Layouter2")
      return true
    else
      return false
  }

  get cmdList() {
    return this.timerService.currentCmdList
  }

  constructor(
    private devicelistService: DevicelistService,
    private timerService: TimerService
  ) { }

  ngOnInit() {

  }

  updateSelectedAction(event) {
    this.selectedItem = event[0]
    // console.log(event);
    this.updateAct.emit(event);
  }

}
