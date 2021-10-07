import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { GeolocationService } from 'src/app/core/services/geolocation.service';
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular';
import { DataService } from 'src/app/core/services/data.service';
import { NoticeService } from 'src/app/core/services/notice.service';
declare var L;

@Component({
  selector: 'app-device-location',
  templateUrl: './device-location.page.html',
  styleUrls: ['./device-location.page.scss'],
})
export class DeviceLocationPage implements OnInit {

  mymap;
  centerPosition;
  btnDisabled = true;
  id;
  device;

  get isDiyDevice() {
    return this.device.config.isDiy
  }

  get latitude() {
    return this.geolocationService.latitude
  }

  get longitude() {
    return this.geolocationService.longitude
  }

  get address() {
    return this.geolocationService.address
  }

  @ViewChild('mapbox', { read: ElementRef, static: true }) map: ElementRef;

  constructor(
    private deviceService: DeviceService,
    private dataService: DataService,
    private geolocationService: GeolocationService,
    private activatedRoute: ActivatedRoute,
    private navCtrl: NavController,
    private noticeService: NoticeService
  ) { }

  ngOnInit() {

  }

  ngAfterViewInit(): void {
    this.dataService.initCompleted.subscribe(result => {
      if (result) {
        this.id = this.activatedRoute.snapshot.params['id'];
        this.device = this.dataService.device.dict[this.id]
        this.geolocationService.getUserPosition().then(result => {
          if (result) {
            // setTimeout(() => {
              this.initMap();
              this.getAddress();
            // }, 100);
          }
        })
      }
    })
  }

  initMap() {
    let longitude, latitude
    if (typeof this.device.config.position.location != 'undefined' && this.device.config.position.location.length != 0) {
      longitude = this.device.config.position.location[0]
      latitude = this.device.config.position.location[1]
      console.log(longitude, latitude);
    } else {
      longitude = this.longitude
      latitude = this.latitude
    }
    this.mymap = L.map(this.map.nativeElement, {
      center: [latitude, longitude],
      zoom: 13,
      attributionControl: false
    });
    L.tileLayer.chinaProvider('GaoDe.Normal.Map', {
      maxZoom: 18,
      minZoom: 5
    }).addTo(this.mymap);
    let markerIcon = L.icon({
      iconUrl: 'assets/img/marker.png',
      iconSize: [36, 36],
      className: 'mapicon'
    });
    let marker = L.marker([latitude, longitude], { icon: markerIcon }).addTo(this.mymap);
    marker.bindPopup(this.device.config.customName);
    this.mymap.on('move', () => {
      marker.setLatLng(this.mymap.getCenter())
    });
    this.mymap.on('moveend', () => {
      this.getAddress();
      this.btnDisabled = false;
    });
  }

  getAddress() {
    this.centerPosition = this.mymap.getCenter();
    this.geolocationService.getAddress([this.centerPosition.lng, this.centerPosition.lat]);
  }

  async saveGeolocation() {
    let newConfig = {
      "position": {
        "location": [this.centerPosition.lng, this.centerPosition.lat],
        "address": this.address
      }
    }
    console.log(newConfig);
    if (await this.deviceService.saveDeviceConfig(this.device, newConfig)) {
      this.deviceService.loadDeviceConfig(this.device);
      this.noticeService.showToast('geolocationUpdated')
      this.navCtrl.pop();
    }
  }

  get publicMode() {
    return this.device.config.public != 0
  }

  set publicMode(val) {
    this.device.config.public = val ? 1 : 0;
  }

  changePublicMode() {
    let newConfig = {
      "public": this.publicMode
    }
    this.deviceService.saveDeviceConfig(this.device, newConfig)
  }


}
