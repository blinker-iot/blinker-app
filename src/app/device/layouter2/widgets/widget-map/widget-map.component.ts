import { Component, Input, ViewChild, ElementRef } from '@angular/core';
import { Layouter2Widget } from '../config';
import { ActionSheetController } from '@ionic/angular';
import coordtransform from 'coordtransform';
import { GeolocationService } from 'src/app/core/services/geolocation.service';

@Component({
  selector: 'widget-map',
  templateUrl: './widget-map.component.html',
  styleUrls: ['./widget-map.component.scss']
})
export class WidgetMapComponent implements Layouter2Widget {

  AMap;
  map;

  @Input() device;
  @Input() widget;

  get key() {
    return this.widget.key;
  }

  get longitude() {
    if (!this.device.config.position.location[0])
      return 104.07
    return this.device.config.position.location[0]
  }

  get latitude() {
    if (!this.device.config.position.location[1])
      return 30.67
    return this.device.config.position.location[1]
  }

  get address() {
    if (typeof this.device.config.position == 'undefined')
      return ''
    return this.device.config.position.address
  }

  userPosition;

  getValue(valueKey) {
    if (typeof this.device.data[this.key] != 'undefined')
      if (typeof this.device.data[this.key][valueKey] != 'undefined')
        return this.device.data[this.key][valueKey]
    if (typeof this.widget[valueKey] != 'undefined')
      return this.widget[valueKey]
    return ''
  }

  @ViewChild('widgetMap', { read: ElementRef, static: true }) mapEl: ElementRef;

  constructor(
    private actionSheetController: ActionSheetController,
    private geolocationService: GeolocationService
  ) { }

  ngOnInit() {
  }

  ngAfterViewInit() {
    this.initMap();
  }

  async initMap() {
    let position;
    if (this.device.config.position.location.length == 2) {
      position = this.device.config.position.location
    } else {
      position = await this.geolocationService.getUserPosition()
    }
    // AMapLoader.load({
    //   "key": "6f02b1056c81d1638ecf21c8469f7b61",
    //   "version": "2.0"
    // }).then((AMap: any) => {
    //   this.AMap = AMap;
    //   this.map = new AMap.Map('map-container', {
    //     center: position,
    //     zoom: 14
    //   });
    //   this.addDeviceMarker()
    //   this.addUserMarker()
    // }).catch((e: any) => {
    //   console.log(e);
    // })
  }

  addDeviceMarker() {
    if (this.device.config.position.location.length == 0) {
      return
    }
    let marker = this.addMarker({
      position: [this.longitude, this.latitude],
      title: this.device.config.customName,
      icon: 'assets/img/map/device.png'
    })
    marker.on('click', () => {
      let infoWindow = new this.AMap.InfoWindow({
        content: this.device.config.customName,
        offset: new this.AMap.Pixel(0, -30)
      });
      infoWindow.open(this.map, marker.getPosition());
    });
  }

  async addUserMarker() {
    let marker = this.addMarker({
      position: await this.geolocationService.getUserPosition(),
      title: '我的位置',
      icon: 'assets/img/map/user.png'
    })
    marker.on('click', () => {
      let infoWindow = new this.AMap.InfoWindow({
        content: marker.getTitle(),
        offset: new this.AMap.Pixel(0, -30)
      });
      infoWindow.open(this.map, marker.getPosition());
    });
  }

  addMarker({ position: [longitude, latitude], title, icon = 'assets/img/map/marker.png' }) {
    let marker = new this.AMap.Marker({
      position: [longitude, latitude],
      title,
      icon,
      anchor: 'center'
    });
    this.map.add(marker)
    return marker
  }

  async gotoNav() {
    const actionSheet = await this.actionSheetController.create({
      buttons: [{
        text: '高德地图',
        handler: () => {
          window.open(`androidamap://viewMap?sourceApplication=iot.diandeng.tech&lat=${this.latitude}&lon=${this.longitude}&poiname=${this.device.config.customName}&dev=0`)
        }
      }, {
        text: '百度地图',
        handler: () => {
          window.open(`bdapp://map/marker?location=${this.latitude},${this.longitude}&title=${this.device.config.customName}&coord_type=wgs84&src=iot.diandeng.tech`)
        }
      }]
    });
    await actionSheet.present();
  }

}
