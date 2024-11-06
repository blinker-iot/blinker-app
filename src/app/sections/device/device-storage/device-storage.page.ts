import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AlertController, IonicModule, ModalController, NavController, Platform } from "@ionic/angular";
import { PipesModule } from "src/app/core/pipes/pipes.module";
import { BlinkerDevice } from "src/app/core/model/device.model";
import { ActivatedRoute } from "@angular/router";
import { UserService } from "src/app/core/services/user.service";
import { DeviceService } from "src/app/core/services/device.service";
import { DataService } from "src/app/core/services/data.service";
import { NoticeService } from "src/app/core/services/notice.service";
import { ImageService } from "src/app/core/services/image.service";
import { ComponentsModule } from "src/app/core/components/components.module";

@Component({
  selector: "device-storage",
  templateUrl: "./device-storage.page.html",
  styleUrls: ["./device-storage.page.scss"],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PipesModule,
    ComponentsModule
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
    private imageService: ImageService,
  ) {}

  subscription;
  ngOnInit() {
    this.subscription = this.dataService.userDataLoader.subscribe((loaded) => {
      if (loaded) {
        this.id = this.activatedRoute.snapshot.params["id"];
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
