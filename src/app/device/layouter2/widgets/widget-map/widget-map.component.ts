import { Component, Input, ViewChild, ElementRef } from '@angular/core';
import { UserService } from 'src/app/core/services/user.service';
import { GeolocationService } from 'src/app/core/services/geolocation.service';
import { Layouter2Widget } from '../config';
import { ActionSheetController } from '@ionic/angular';
declare var L;

@Component({
  selector: 'widget-map',
  templateUrl: './widget-map.component.html',
  styleUrls: ['./widget-map.component.scss']
})
export class WidgetMapComponent implements Layouter2Widget {

  mymap;

  @Input() device;
  @Input() widget;

  get key() {
    return this.widget.key;
  }

  get longitude() {
    if (typeof this.device.config.position == 'undefined')
      return 104.07
    return this.device.config.position.location[0]
  }

  get latitude() {
    if (typeof this.device.config.position == 'undefined')
      return 30.67
    return this.device.config.position.location[1]
  }

  get address() {
    if (typeof this.device.config.position == 'undefined')
      return ''
    return this.device.config.position.address
  }

  getValue(valueKey) {
    if (typeof this.device.data[this.key] != 'undefined')
      if (typeof this.device.data[this.key][valueKey] != 'undefined')
        return this.device.data[this.key][valueKey]
    if (typeof this.widget[valueKey] != 'undefined')
      return this.widget[valueKey]
    return ''
  }

  _lstyle
  @Input()
  set lstyle(lstyle) {
    this._lstyle = lstyle
  }
  get lstyle() {
    if (typeof this._lstyle != 'undefined')
      return this._lstyle
    if (typeof this.widget.lstyle != 'undefined')
      return this.widget.lstyle
    return 0;
  }

  @ViewChild('widgetmap', { read: ElementRef, static: true }) map: ElementRef;

  constructor(
    private actionSheetController: ActionSheetController
  ) { }

  ngOnInit() {
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.initMap();
    }, 100);
  }

  initMap() {
    this.mymap = L.map(this.map.nativeElement, {
      center: [this.latitude, this.longitude],
      zoom: 10,
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
    let marker = L.marker([this.latitude, this.longitude], { icon: markerIcon }).addTo(this.mymap);
    marker.bindPopup(this.device.config.customName);
  }

  loadRoutingData() {
    L.Routing.control({
      waypoints: [
        L.latLng(57.74, 11.94),
        L.latLng(57.6792, 11.949)
      ]
    }).addTo(this.mymap);
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
