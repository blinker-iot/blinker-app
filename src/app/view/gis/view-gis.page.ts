import { Component, ViewChild, ElementRef } from '@angular/core';
import { GeolocationService } from 'src/app/core/services/geolocation.service';
import { DeviceService } from 'src/app/core/services/device.service';
import { Router } from '@angular/router';
import { ViewService } from '../../core/services/view.service';
import { DataService } from 'src/app/core/services/data.service';

declare var L;
declare var HeatmapOverlay;

@Component({
  selector: 'view-gis',
  templateUrl: './view-gis.page.html',
  styleUrls: ['./view-gis.page.scss'],
})
export class ViewGisPage {

  mymap;
  get latitude() {
    return this.geolocationService.latitude
  }

  get longitude() {
    return this.geolocationService.longitude
  }

  get deviceDataDict() {
    return this.dataService.device.dict
  }

  get deviceDataList() {
    return this.dataService.device.list
  }

  selectedDevice;

  @ViewChild('mapView', { read: ElementRef, static: true }) mapView: ElementRef

  constructor(
    private geolocationService: GeolocationService,
    private deviceService: DeviceService,
    private router: Router,
    private viewService: ViewService,
    private dataService: DataService
  ) { }

  ngAfterViewInit() {
    this.viewService.disableMenuSwipe();
    this.geolocationService.getUserPosition().then(result => {
      if (result) {
        setTimeout(() => {
          this.initMap();
        }, 200);
        setTimeout(() => {
          this.loadDevicePosition();
        }, 1500);
      }
    })
  }

  ngOnDestroy(): void {
    if (typeof this.mymap != 'undefined')
      this.mymap.remove();
  }

  initMap() {
    this.mymap = L.map(this.mapView.nativeElement, {
      center: [this.latitude, this.longitude],
      zoom: 13,
      attributionControl: false,
      zoomControl: false
    });
    L.tileLayer.chinaProvider('GaoDe.Normal.Map', {
      maxZoom: 18,
      minZoom: 5
    }).addTo(this.mymap);
    let myIcon = L.icon({
      iconUrl: 'assets/img/map-me.png',
      iconSize: [36, 36],
      className: 'mapicon'
    });
    let marker = L.marker([this.latitude, this.longitude], { icon: myIcon }).addTo(this.mymap);
    marker.bindPopup("<b>您的位置</b>");
  }

  loadDevicePosition() {
    let deviceIcon = L.icon({
      iconUrl: 'assets/img/map-device.png',
      iconSize: [36, 36],
      className: 'mapicon'
    });

    let markers = L.markerClusterGroup();
    for (let deviceId of this.deviceDataList) {
      if (this.deviceDataDict[deviceId].config.position.location.length == 0) continue;
      let longitude = this.deviceDataDict[deviceId].config.position.location[0]
      let latitude = this.deviceDataDict[deviceId].config.position.location[1]
      let marker = L.marker([latitude, longitude], { icon: deviceIcon });
      marker.bindPopup(
        `<div>${this.deviceDataDict[deviceId].config.customName}</div>`
      );
      marker.on('click', () => {
        this.selectedDevice = this.deviceDataDict[deviceId]
      })
      marker.on('popupclose', () => {
        this.selectedDevice = null
      })
      markers.addLayer(marker)
    }
    this.mymap.addLayer(markers);
  }

  showDeviceInfo() {

  }

  showDefaultInfo() {

  }

  searchDevice() {

  }

  heatmapLayer;
  initHeatmap() {
    let cfg = {
      "radius": 0.05,
      "maxOpacity": .6,
      "scaleRadius": true,
      "useLocalExtrema": true,
      latField: 'lat',
      lngField: 'lng',
      valueField: 'count',
    };
    this.heatmapLayer = new HeatmapOverlay(cfg);
    this.mymap.addLayer(this.heatmapLayer);
  }

  loadHeatData(heatkey) {
    let heatData = {
      max: 5,
      min: 1,
      data: []
    }
    for (let deviceName of this.deviceDataList) {
      if (this.deviceDataDict[deviceName].config.position.location.length == 0) continue;
      if (typeof this.deviceDataDict[deviceName].data[heatkey] != 'number') continue;
      let longitude = this.deviceDataDict[deviceName].config.position.location[0]
      let latitude = this.deviceDataDict[deviceName].config.position.location[1]
      let deviceHeat = { lng: longitude, lat: latitude, count: this.deviceDataDict[deviceName].data[heatkey] }
      heatData.data.push(deviceHeat);
    }
    this.heatmapLayer.setData(heatData);
  }

  goto(page) {
    this.router.navigate([page])
  }

  changeView() {
    this.viewService.changeView()
  }

  waiting = false;
  refresh() {
    this.waiting = true;
    setTimeout(() => {
      this.waiting = false;
    }, 1000);
    this.deviceService.queryDevices();
  }

  heatmap = false;
  heatmapLoaded = false;
  switchHeatmap() {
    if (!this.heatmapLoaded) {
      this.initHeatmap();
      this.heatmapLoaded = true;
    }
    this.heatmap = !this.heatmap;
    if (this.heatmap) {
      this.loadHeatData('aqi')
    } else {
      this.loadHeatData('')
    }

  }

  switchSearchbar() {

  }

}
