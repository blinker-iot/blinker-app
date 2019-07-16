import { Component, Output, EventEmitter, Input } from '@angular/core';
import { DeviceProvider } from '../../providers/device/device';
import { UserProvider } from '../../providers/user/user';

@Component({
  selector: 'deviceblock-list',
  templateUrl: 'deviceblock-list.html'
})
export class DeviceblockListComponent {
  selectedDeviceIndex;
  selectedDevice;
  @Input() max = 2;
  @Output() update = new EventEmitter();

  constructor(
    public deviceProvider: DeviceProvider,
    public userProvider: UserProvider,
  ) { }

  selectDevice(id, device) {
    this.selectedDeviceIndex = id;
    this.update.emit(device);
  }


}
