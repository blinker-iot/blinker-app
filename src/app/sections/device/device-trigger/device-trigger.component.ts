import { Component, Input, OnInit } from '@angular/core';
import { DataService } from 'src/app/core/services/data.service';
import { ActivatedRoute } from '@angular/router';
import { NoticeService } from 'src/app/core/services/notice.service';
import { DeviceService } from 'src/app/core/services/device.service';

@Component({
  selector: 'blinker-device-trigger',
  templateUrl: './device-trigger.component.html',
  styleUrls: ['./device-trigger.component.scss'],
})
export class DeviceTriggerComponent implements OnInit {
  id;


  @Input() device;

  configData;
  layouterData;

  constructor(
    private noticeService: NoticeService,
    private deviceService: DeviceService,
    private activatedRoute: ActivatedRoute,
    private dataService: DataService
  ) { }

  ngOnInit(): void {
    this.id = this.activatedRoute.snapshot.params['id'];
    this.device = this.dataService.device.dict[this.id]
    console.log(this.id);
    console.log(this.device);
    this.layouterData = JSON.parse(this.device.config.layouter);
    console.log(this.device);
    console.log(this.layouterData);
    if (this.layouterData == null) {
      this.configData = `[\n]`
      return
    }
    if (typeof this.layouterData.triggers == 'undefined') {
      this.configData = `[\n]`
      return
    }
    this.configData = JSON.stringify(this.layouterData.triggers)
  }

  saveData() {
    try {
      this.layouterData.triggers = JSON.parse(this.configData);
      let layouterDataString = JSON.stringify(this.layouterData);
      let layouterDataConfig = {
        "layouter": layouterDataString
      }
      this.deviceService.saveDeviceConfig(this.device, layouterDataConfig).then(result => {
        this.device.config['layouter'] = layouterDataString;
        if (result) this.noticeService.showToast("importSuccess")
      });
    } catch (error) {
      this.noticeService.showToast("notJson")
    }
  }

}
