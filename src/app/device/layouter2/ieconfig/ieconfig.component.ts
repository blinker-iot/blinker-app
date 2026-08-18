import { Component, Input } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { stringify, parse } from 'zipson';
import { Clipboard } from '@capacitor/clipboard';
import { NoticeService } from 'src/app/core/services/notice.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'layouter-ieconfig',
  templateUrl: './ieconfig.component.html',
  styleUrls: ['./ieconfig.component.scss'],
  imports: [FormsModule],
})
export class IeconfigComponent {
  // id;
  // get device() {
  //   return this.deviceService.devices[this.id]
  // }

  @Input() device;

  configData;

  constructor(
    private deviceService: DeviceService,
    private noticeService: NoticeService
  ) { }

  ngOnInit() {
    this.exportData();
  }

  async importData() {
    this.device.config.layouter = JSON.stringify(parse(this.configData))
    console.log(this.device.config.layouter);
    let layouterDataConfig = {
      "layouter": this.device.config.layouter
    }
    this.deviceService.saveDeviceConfig(this.device, layouterDataConfig).then(result => {
      if (result)
        this.noticeService.showToast('importSuccess')
    });
  }

  exportData() {
    this.configData = stringify(JSON.parse(this.device.config.layouter))
  }

  async copy() {
    await Clipboard.write({ string: this.configData });
    this.noticeService.showToast('copySuccess')
  }

}
