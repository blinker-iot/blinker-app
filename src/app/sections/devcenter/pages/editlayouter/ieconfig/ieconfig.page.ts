import { Component, Input } from '@angular/core';
import { stringify, parse } from 'zipson';
import { DevcenterService } from '../../../devcenter.service';
import { ActivatedRoute } from '@angular/router';
import { Clipboard } from '@ionic-native/clipboard/ngx';
import { Device } from 'src/app/core/model/device.model';
import { NoticeService } from 'src/app/core/services/notice.service';

@Component({
  selector: 'blinker-ieconfig',
  templateUrl: './ieconfig.page.html',
  styleUrls: ['./ieconfig.page.scss'],
  providers: [Clipboard]
})
export class IeconfigPage {

  deviceType = '';
  device = new Device;
  editMode = false;

  showLayouter = false;
  layouterData;

  default = `{¨config¨{¨headerColor¨¨transparent¨¨headerStyle¨¨light¨¨background¨{¨img¨¨assets/img/headerbg.jpg¨¨isFull¨«}}¨dashboard¨|{¨type¨¨btn¨¨ico¨¨fal fa-power-off¨¨mode¨É¨t0¨¨点我开关灯¨¨t1¨¨文本2¨¨bg¨É¨cols¨Ë¨rows¨Ë¨key¨¨btn-abc¨´x´Ï´y´Ê¨speech¨|÷¨lstyle¨É}{ßA¨tex¨ßF¨blinker入门示例¨ßHßIßJËßC´´ßKÍßLÊßM¨tex-272¨´x´É´y´ÉßO|÷ßPÊ¨clr¨¨#FFF¨}{ßA¨num¨ßF¨点击按键¨ßC¨fal fa-comment-dots¨ßT¨#389BEE¨¨min¨É¨max¨¢1c¨uni¨´次´ßJÉßKËßLËßM¨num-abc¨´x´É´y´ÊßO|÷}{ßAßBßC¨fal fa-pencil-alt¨ßEÉßF¨点我计数¨ßHßIßJÉßKËßLËßM¨btn-123¨´x´Í´y´ÊßO|÷ßPÉßT¨#595959¨}÷}`

  configData;

  constructor(
    private clipboard: Clipboard,
    private devcenterService: DevcenterService,
    private activatedRoute: ActivatedRoute,
    private noticeService: NoticeService,
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

  async importData() {
    let data = JSON.stringify(parse(this.configData));
    let layouterConfig = {
      "layouter": data
    }
    this.devcenterService.setProDeviceConfig(this.deviceType, layouterConfig).then(result => {
      if (result) this.noticeService.showToast("importSuccess")
    });
  }

  exportData() {
    this.configData = stringify(JSON.parse(this.layouterData))
    this.clipboard.copy(this.configData);
    this.noticeService.showToast("copySuccess")
  }

}
