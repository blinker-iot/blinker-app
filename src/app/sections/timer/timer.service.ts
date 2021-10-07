import { Injectable } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { NoticeService } from 'src/app/core/services/notice.service';

@Injectable()
export class TimerService {

  currentDevice;

  // currentCmdList;
  // currentCmdByText;
  // currentCmdByAct;

  constructor(
    private deviceService: DeviceService,
    private notice: NoticeService,
  ) { }

  loadTask(task = 'timing') {
    this.notice.showLoading('loadingTiming')
    window.setTimeout(() => {
      this.notice.hideLoading()
    }, 1000);
    this.deviceService.sendData(this.currentDevice, `{"get":"${task}"}`)
  }

}
