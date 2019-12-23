import { Component, OnInit, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DeviceService } from 'src/app/core/services/device.service';
import { stringify, parse } from 'zipson';
import { Clipboard } from '@ionic-native/clipboard/ngx';
import { Events } from '@ionic/angular';
import { UserService } from 'src/app/core/services/user.service';

@Component({
  selector: 'layouter-ieconfig',
  templateUrl: './ieconfig.component.html',
  styleUrls: ['./ieconfig.component.scss'],
  providers: [Clipboard]
})
export class IeconfigComponent {
  // id;
  // get device() {
  //   return this.deviceService.devices[this.id]
  // }

  @Input() device;


  default = `{¨config¨{¨headerColor¨¨transparent¨¨headerStyle¨¨light¨¨background¨{¨img¨¨assets/img/headerbg.jpg¨¨isFull¨«}}¨dashboard¨|{¨type¨¨btn¨¨ico¨¨fal fa-power-off¨¨mode¨É¨t0¨¨点我开关灯¨¨t1¨¨文本2¨¨bg¨É¨cols¨Ë¨rows¨Ë¨key¨¨btn-abc¨´x´Ï´y´Ê¨speech¨|÷¨lstyle¨É}{ßA¨tex¨ßF¨blinker入门示例¨ßHßIßJËßC´´ßKÍßLÊßM¨tex-272¨´x´É´y´ÉßO|÷ßPÊ¨clr¨¨#FFF¨}{ßA¨num¨ßF¨点击按键¨ßC¨fal fa-comment-dots¨ßT¨#389BEE¨¨min¨É¨max¨¢1c¨uni¨´次´ßJÉßKËßLËßM¨num-abc¨´x´É´y´ÊßO|÷}{ßAßBßC¨fal fa-pencil-alt¨ßEÉßF¨点我计数¨ßHßIßJÉßKËßLËßM¨btn-123¨´x´Í´y´ÊßO|÷ßPÉßT¨#595959¨}÷}`

  configData;

  constructor(
    private clipboard: Clipboard,
    private events: Events,
    private userService: UserService,
    private deviceService:DeviceService
  ) { }

  ngOnInit() {
    // this.id = this.activatedRoute.snapshot.params['id'];
  }

  async importData() {
    this.device.config.layouter = JSON.stringify(parse(this.configData))
    console.log(this.device.config.layouter);
    let layouterDataConfig = {
      "layouter": this.device.config.layouter
    }
    this.deviceService.saveDeviceConfig(this.device, layouterDataConfig).then(result => {
      if (result) this.events.publish("provider:notice", "importSuccess")
    });
  }

  exportData() {
    this.configData = stringify(JSON.parse(this.device.config.layouter))
    this.clipboard.copy(this.configData);
    this.events.publish("provider:notice", "copySuccess");
  }

}
