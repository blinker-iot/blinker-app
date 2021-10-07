import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DevcenterService } from '../../devcenter.service';
import { Observable, of } from 'rxjs';
import { Mode } from 'src/app/core/device/layouter2/layouter2-mode';
import { Device } from 'src/app/core/model/device.model';
import { LayouterService } from 'src/app/core/device/layouter.service';

@Component({
  selector: 'prodevice-editlayouter',
  templateUrl: './editlayouter.page.html',
  styleUrls: ['./editlayouter.page.scss'],
})
export class EditlayouterPage implements OnInit {
  deviceType = '';
  device = new Device;
  editMode = false;

  showLayouter = false;
  layouterData;

  constructor(
    private devcenterService: DevcenterService,
    private activatedRoute: ActivatedRoute,
    private LayouterService: LayouterService
  ) { }

  ngOnInit() {
    this.deviceType = this.activatedRoute.snapshot.params['deviceType'];
    this.device.deviceName = '????????????????????????'
    this.device.deviceType = this.deviceType;
    this.device.config = {
      broker: 'local',
      mode: 'test',
      layouter: null
    }
    this.device.data = {

    }
    this.devcenterService.getProDeviceLayouter(this.deviceType)
      .then(data => {
        // this.device.config.layouter = data;
        this.layouterData = data;
        this.showLayouter = true;
      })


  }

  lock() {
    this.LayouterService.changeMode(Mode.Default)
    this.editMode = false;
    this.saveLayouterData();
  }

  saveLayouterData() {
    let data = JSON.stringify(this.device.data['layouterData']);
    let layouterConfig = {
      "layouter": data
    }
    this.devcenterService.setProDeviceConfig(this.deviceType, layouterConfig)
  }

  unlock() {
    this.LayouterService.changeMode(Mode.Edit)
    this.editMode = true;
  }

  editBackground() {
    this.LayouterService.changeMode(Mode.EditBackground)
  }

  async cleanWidgets() {
    this.LayouterService.cleanWidgets()
  }

  canDeactivate(): Observable<boolean> | boolean {
    if (!this.editMode) return true;
    return this.confirm();
  }

  confirm(message?: string): Observable<boolean> {
    const confirmation = window.confirm("界面布局未保存，是否放弃保存并退出？");
    return of(confirmation);
  };

  gotoIeConfig() {

  }

}
