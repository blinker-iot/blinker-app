import { Component } from '@angular/core';
import { DataService } from 'src/app/core/services/data.service';


@Component({
  selector: 'page-device-manager',
  templateUrl: 'device-manager.html',
  styleUrls: ['device-manager.scss']
})
export class DeviceManagerPage {

  loaded = false;

  get deviceDataList() {
    return this.dataService.device.list
  }

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  constructor(
    private dataService: DataService,
  ) { }


  ngOnInit(): void {
    this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) this.loaded = loaded
    })
  }
}
