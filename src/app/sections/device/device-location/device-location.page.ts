import { Component, ElementRef, OnInit, ViewChild } from "@angular/core";
import { DeviceService } from "src/app/core/services/device.service";
import { GeolocationService } from "src/app/core/services/geolocation.service";
import { ActivatedRoute } from "@angular/router";
import { IonicModule, NavController } from "@ionic/angular";
import { DataService } from "src/app/core/services/data.service";
import { NoticeService } from "src/app/core/services/notice.service";
import { DirectivesModule } from "src/app/core/directives/directives.module";
import { FormsModule } from "@angular/forms";
import { CommonModule } from "@angular/common";
import * as maptalks from "maptalks";
import { toBD09, toWsg84 } from "src/app/core/functions/func";

@Component({
  selector: "app-device-location",
  templateUrl: "./device-location.page.html",
  styleUrls: ["./device-location.page.scss"],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DirectivesModule,
  ],
})
export class DeviceLocationPage implements OnInit {
  mymap;
  devicePosition;
  centerPosition;
  btnDisabled = true;
  id;
  device;

  get isDiyDevice() {
    return this.device.config.isDiy;
  }

  get address() {
    return this.geolocationService.address;
  }

  @ViewChild("mapbox", { read: ElementRef, static: true })
  map: ElementRef;

  constructor(
    private deviceService: DeviceService,
    private dataService: DataService,
    private geolocationService: GeolocationService,
    private activatedRoute: ActivatedRoute,
    private navCtrl: NavController,
    private noticeService: NoticeService,
  ) {}

  ngOnInit() {
  }

  ngAfterViewInit(): void {
    this.dataService.initCompleted.subscribe(async (result) => {
      if (result) {
        this.id = this.activatedRoute.snapshot.params["id"];
        this.device = this.dataService.device.dict[this.id];
        this.devicePosition = await this.geolocationService.getDevicePosition(
          this.device,
        );
        this.initMap(this.devicePosition);
      }
    });
  }

  initMap(wsg04Position) {
    let position = toBD09(wsg04Position);
    this.centerPosition = position;
    this.mymap = new maptalks.Map(this.map.nativeElement, {
      center: position,
      zoom: 13,
      minZoom: 1,
      maxZoom: 19,
      spatialReference: {
        projection: "baidu",
      },
      baseLayer: new maptalks.TileLayer("base", {
        "urlTemplate":
          "https://gss{s}.bdstatic.com/8bo_dTSlRsgBo1vgoIiO_jowehsv/tile/?qt=tile&x={x}&y={y}&z={z}&styles=pl&scaler=1&udt=20170927",
        "subdomains": [0, 1, 2, 3],
        "attribution":
          '&copy; <a target="_blank" href="http://map.baidu.com">Baidu</a>',
      }),
    });

    let marker = new maptalks.Marker(
      position,
      {
        "symbol": {
          "markerFile": "./assets/img/map/marker.png",
          "markerWidth": 40,
          "markerHeight": 40,
          "markerDx": 0,
          "markerDy": 0,
          "markerOpacity": 1,
        },
      },
    );
    // let userMarker = new maptalks.Marker(
    //   position,
    //   {
    //     "symbol": {
    //       "markerFile": "./assets/img/map/user.png",
    //       "markerWidth": 30,
    //       "markerHeight": 30,
    //       "markerDx": 0,
    //       "markerDy": 0,
    //       "markerOpacity": 0.5,
    //     },
    //   },
    // );
    // new maptalks.VectorLayer("userMarker", userMarker).addTo(this.mymap);
    new maptalks.VectorLayer("marker", marker).addTo(this.mymap);
    this.mymap.on("moving", (e) => {
      let newPosition = this.mymap.getCenter();
      this.centerPosition = toWsg84([newPosition.x, newPosition.y]);
      marker.setCoordinates(newPosition);
    });
    this.mymap.on("moveend", (e) => {
      this.btnDisabled = false;
    });
  }

  async saveGeolocation() {
    let newConfig = {
      "position": {
        "location": this.centerPosition,
        "address": "",
      },
    };
    if (await this.deviceService.saveDeviceConfig(this.device, newConfig)) {
      this.deviceService.loadDeviceConfig(this.device);
      this.noticeService.showToast("geolocationUpdated");
      this.navCtrl.pop();
    }
  }
}
