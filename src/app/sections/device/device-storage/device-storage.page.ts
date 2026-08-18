import { Component, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonicModule,
  ModalController,
  NavController,
  Platform,
} from '@ionic/angular';
import { MinuteToTimePipe } from 'src/app/core/pipes/minute-to-time';
import { ObjToStrPipe } from 'src/app/core/pipes/obj-to-str';
import { OwnplugAct2strPipe } from 'src/app/core/pipes/ownplug-act2str';
import { MsToDatePipe } from 'src/app/core/pipes/ms-to-date';
import { HtmlPipe } from 'src/app/core/pipes/html.pipe';
import { WrapPipe } from 'src/app/core/pipes/wrap.pipe';
import { Act2TextPipe } from 'src/app/core/pipes/actcmd2text';
import { Days2TextPipe } from 'src/app/core/pipes/days2text';
import { BlinkerDevice } from 'src/app/core/model/device.model';
import { ActivatedRoute } from '@angular/router';
import { UserService } from 'src/app/core/services/user.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { DataService } from 'src/app/core/services/data.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { ImageService } from 'src/app/core/services/image.service';
import { BActcmdListComponent } from 'src/app/core/components/b-actcmd-list/b-actcmd-list.component';
import { BBottomBtnComponent } from 'src/app/core/components/b-bottom-btn/b-bottom-btn.component';
import { BColorpickerDiscComponent } from 'src/app/core/components/b-colorpicker-disc/b-colorpicker-disc.component';
import { BDeviceImgComponent } from 'src/app/core/components/b-device-img/b-device-img.component';
import { MenuListComponent } from 'src/app/core/components/menu-list/menu-list';
import { MenuItemComponent } from 'src/app/core/components/menu-list/menu-item/menu-item';
import { BTipComponent } from 'src/app/core/components/b-tip/b-tip.component';
import { BToastComponent } from 'src/app/core/components/b-toast/b-toast.component';
import { DeviceblockList2Component } from 'src/app/core/components/deviceblock-list2/deviceblock-list2';

@Component({
  selector: 'device-storage',
  templateUrl: './device-storage.page.html',
  styleUrls: ['./device-storage.page.scss'],
  imports: [
    FormsModule,
    IonicModule,
    MinuteToTimePipe,
    ObjToStrPipe,
    OwnplugAct2strPipe,
    MsToDatePipe,
    HtmlPipe,
    WrapPipe,
    Act2TextPipe,
    Days2TextPipe,
    BActcmdListComponent,
    BBottomBtnComponent,
    BColorpickerDiscComponent,
    BDeviceImgComponent,
    MenuListComponent,
    MenuItemComponent,
    BTipComponent,
    BToastComponent,
    DeviceblockList2Component,
  ],
})
export class DeviceStoragePage implements OnInit {
  id;
  device: BlinkerDevice;
  loaded;
  confirm;

  constructor(
    private activatedRoute: ActivatedRoute,
    private userService: UserService,
    private deviceService: DeviceService,
    private dataService: DataService,
    private alertCtrl: AlertController,
    private noticeService: NoticeService,
    public platform: Platform,
    private navCtrl: NavController,
    private modalCtrl: ModalController,
    private imageService: ImageService
  ) {}

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe((loaded) => {
      if (loaded) {
        this.id = this.activatedRoute.snapshot.params['id'];
        this.device = this.dataService.device.dict[this.id];
        this.loaded = loaded;
      }
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    if (this.confirm) {
      this.confirm.dismiss();
    }
  }
}
