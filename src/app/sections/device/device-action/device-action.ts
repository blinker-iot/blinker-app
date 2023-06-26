import { Component, Input, OnInit } from '@angular/core';
import { DataService } from 'src/app/core/services/data.service';
import { ActivatedRoute } from '@angular/router';
import { NoticeService } from 'src/app/core/services/notice.service';
import { DeviceService } from 'src/app/core/services/device.service';

@Component({
  selector: 'blinker-device-action',
  templateUrl: './device-action.html',
  styleUrls: ['./device-action.scss'],
})
export class DeviceActionComponent implements OnInit {

  id;


  @Input() device;

  configData;
  layouterData;

  get dashboard() {
    return this.layouterData['dashboard']
  }

  subscription;

  constructor(
    private noticeService: NoticeService,
    private deviceService: DeviceService,
    private activatedRoute: ActivatedRoute,
    private dataService: DataService
  ) { }

  ngOnInit(): void {

    this.subscription = this.dataService.userDataLoader.subscribe(loaded => {
      if (loaded) {
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
        if (typeof this.layouterData.actions == 'undefined') {
          this.configData = `[\n]`
          return
        }
        this.configData = JSON.stringify(this.layouterData.actions)
      }
    })
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  // 通过Layouter布局自动生成动作列表
  layouter2Actions() {
    let actions = []
    this.dashboard.map(widget => {
      if (widget.type == 'btn') {
        switch (widget.mode) {
          case 0:
            let cmd = {}
            cmd[widget.key] = 'tap'
            actions.push({
              "cmd": cmd,
              "text": widget.t0
            })
            break;
          case 1:
            let cmd_on = {}
            let cmd_off = {}
            cmd_on[widget.key] = 'on'
            cmd_off[widget.key] = 'off'
            actions.push({
              "cmd": cmd_on,
              "text": '打开' + widget.t0
            })
            actions.push({
              "cmd": cmd_off,
              "text": '关闭' + widget.t0
            })
            break;
          default:
            break;
        }
      }
    })
    this.configData = JSON.stringify(actions)
  }

  saveData() {
    try {
      this.layouterData.actions = JSON.parse(this.configData);
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
