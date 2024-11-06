import { Component } from "@angular/core";
import { AlertController, IonicModule } from "@ionic/angular";
import { DeviceService } from "src/app/core/services/device.service";
import { UserService } from "src/app/core/services/user.service";
import { deviceName12 } from "src/app/core/functions/func";
import { ActivatedRoute } from "@angular/router";
import { ShareService } from "./share.service";
import { DataService } from "src/app/core/services/data.service";
import { API } from "src/app/configs/api.config";
import { NoticeService } from "src/app/core/services/notice.service";
import { CommonModule } from "@angular/common";
import { ComponentsModule } from "src/app/core/components/components.module";
import { TranslateModule } from "@ngx-translate/core";

@Component({
  selector: "device-share",
  templateUrl: "device-share.html",
  styleUrls: ["device-share.scss"],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    ComponentsModule,
    TranslateModule
  ],
})
export class DeviceSharePage {
  id;
  device;

  alert;

  get shareData() {
    return this.dataService.share;
  }

  get deviceName() {
    return deviceName12(this.device.deviceName);
  }

  get AVATAR_API() {
    return API.USER.AVATAR + "/";
  }

  constructor(
    private activatedRoute: ActivatedRoute,
    public userService: UserService,
    public deviceService: DeviceService,
    private dataService: DataService,
    private shareService: ShareService,
    public alertCtrl: AlertController,
    private noticeService: NoticeService,
  ) {
  }

  ngOnInit(): void {
    this.dataService.initCompleted.subscribe(async (result) => {
      if (result) {
        this.id = this.activatedRoute.snapshot.params["id"];
        this.device = this.dataService.device.dict[this.id];
      }
    });
  }

  ngOnDestroy(): void {
    if (typeof this.alert != "undefined") {
      this.alert.dismiss();
    }
  }

  async addShare() {
    // 一个设备最多分享给9个用户，超出后弹出提示
    let share0Length = 0, shareLength = 0;
    if (typeof this.shareData.share0[this.deviceName] != "undefined") {
      share0Length = this.shareData.share0[this.deviceName].length;
    }
    if (typeof this.shareData.share[this.deviceName] != "undefined") {
      shareLength = this.shareData.share[this.deviceName].length;
    }
    if (share0Length + shareLength >= 9) {
      this.noticeService.showToast("deviceShareLimit");
      return;
    }

    this.alert = await this.alertCtrl.create({
      header: "指定接受用户",
      subHeader: "请输入接受该设备的用户手机号",
      inputs: [{ name: "phone", placeholder: "用户手机号" }],
      buttons: [
        {
          text: "取消",
          handler: (data) => {
            console.log("Cancel clicked");
          },
        },
        {
          text: "确认",
          handler: (data) => {
            this.shareService.shareDevice2User(this.device, data.phone);
          },
        },
      ],
    });
    this.alert.present();
  }

  shareSelected = 99;
  share0Selected = 99;
  cancel0(uuid, index) {
    this.share0Selected = index;
    setTimeout(() => {
      this.shareService.deleteShareDevice2User(this.deviceName, uuid).then(
        () => {
          this.share0Selected = 99;
        },
      );
    }, 500);
  }

  cancel(uuid, index) {
    this.shareSelected = index;
    setTimeout(() => {
      this.shareService.deleteShareDevice2User(this.deviceName, uuid).then(
        () => {
          this.shareSelected = 99;
        },
      );
    }, 500);
  }
}
