import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
// import { NoticeService } from 'src/app/core/services/notice.service';
import { DevcenterService } from '../../devcenter.service';

@Component({
  selector: 'devcenter-prodevice',
  templateUrl: './prodevice.component.html',
  styleUrls: ['./prodevice.component.scss']
})
export class ProdeviceComponent implements OnInit {

  get proDeviceList() {
    return this.devcenterService.proDeviceList
  }

  get showAddBtn() {
    return this.devcenterService.developerInfo.proDeviceNum < this.devcenterService.developerInfo.proDeviceMaxNum && this.proDeviceList.length < this.devcenterService.developerInfo.proDeviceMaxNum
  }

  constructor(
    private router: Router,
    private devcenterService: DevcenterService,
    // private notice: NoticeService
  ) { }

  ngOnInit() {
    this.devcenterService.getProDevices()
  }

  add() {
    this.router.navigate(['/devcenter/prodevice/add'])
    // this.notice.showToast('该功能已迁移到点灯管理台')
  }

  edit(prodevice) {
    this.router.navigate(['/devcenter', 'prodevice', prodevice.deviceType])
  }

  trackByFn(index, prodevice) {
    return prodevice.deviceType
  }

}
