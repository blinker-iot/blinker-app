import { Component } from '@angular/core';
import { DevicelistService } from 'src/app/core/services/devicelist.service';
import { Router } from '@angular/router';
import { AdddeviceService } from './adddevice.service';

@Component({
  selector: 'page-adddevice',
  templateUrl: 'adddevice.html',
  styleUrls: ['adddevice.scss'],
})
export class AddDevicePage {
  searchQuery: string = '';

  _items;
  get items() {
    if (typeof this._items == 'undefined')
      return this.devicelistService.addDeviceList
    return this._items;
  }
  set items(items) {
    this._items = items;
  }

  constructor(
    private devicelistService: DevicelistService,
    private router: Router,
    private addservice: AdddeviceService
  ) { }

  ngAfterViewInit(): void {
    this.devicelistService.loaded.subscribe(loaded => {
      if (loaded) console.log(this.items);
    })
  }

  getItems(e: any) {
    this.items = this.devicelistService.addDeviceList
    let items2 = [];
    let val = e.target.value;
    if (val && val.trim() != '') {
      this.items.filter((item) => {
        let itemVendername = item.vendername;
        let itemDevices = item.devices.filter((device) => {
          return (device.name.toLowerCase().indexOf(val.toLowerCase()) > -1);
        });
        if (itemDevices.length > 0) {
          let result = {
            vendername: itemVendername,
            devices: itemDevices
          }
          items2.push(result);
        }
      });
      this.items = items2;
    }
  }

  isShowSearchbar = false;
  switchSearchbar() {
    this.isShowSearchbar = !this.isShowSearchbar;
  }

  gotoGuide(device) {
    // console.log(device);
    this.addservice.isDev = device.isDev
    this.router.navigate(['/adddevice', device.deviceType])
  }

}
