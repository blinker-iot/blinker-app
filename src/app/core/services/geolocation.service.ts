import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Geolocation } from '@ionic-native/geolocation/ngx';
import { Diagnostic } from '@awesome-cordova-plugins/diagnostic/ngx';
import { Platform } from '@ionic/angular';
import coordtransform from 'coordtransform';


@Injectable({
  providedIn: 'root'
})
export class GeolocationService {

  // gaode
  amapKey = ''
  amapUrl = 'https://restapi.amap.com/v3/';

  currentPosition = [103.9787507031, 30.6336840719]

  get latitude() {
    return this.currentPosition[1]
  }

  set latitude(latitude) {
    this.currentPosition[1] = latitude
  }

  get longitude() {
    return this.currentPosition[0]
  }

  set longitude(longitude) {
    this.currentPosition[0] = longitude
  }

  address;
  addressString;

  constructor(
    private geolocation: Geolocation,
    private diagnostic: Diagnostic,
    private http: HttpClient,
    private platform: Platform
  ) { }

  async getUserPosition(): Promise<boolean> {
    if (this.platform.is('cordova') && this.platform.is('android')) {
      if (await this.diagnostic.isNetworkLocationEnabled() && await this.diagnostic.isGpsLocationEnabled()) {
        return this.geolocation.getCurrentPosition({ enableHighAccuracy: true })
          .then(resp => {
            this.currentPosition = coordtransform.wgs84togcj02(resp.coords.longitude, resp.coords.latitude)
            console.log(this.currentPosition);
            return true
          })
          .catch((error) => {
            console.log('Error getting location', error);
            console.log(error.message);
            return false
          });
      }
    } else {
      // console.info('当前为浏览器运行或ios运行，使用高德ip定位');
      return this.http.get(this.amapUrl + "ip", {
        params: {
          key: this.amapKey,
          output: 'JSON'
        }
      }).toPromise().then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.status == 1) {
          if (data.rectangle.length > 0) {
            let pArray = data.rectangle.split(";")
            let p0 = pArray[0].split(",")
            let p1 = pArray[1].split(",")
            this.longitude = (Number(p1[0]) - Number(p0[0])) / 2 + Number(p0[0]);
            this.latitude = (Number(p1[1]) - Number(p0[1])) / 2 + Number(p0[1]);
            this.address = data.province + data.city
            return true;
          } else {
            this.longitude = 108.919338
            this.latitude = 34.539994
            return true;
          }
        } else
          return false;
      })
        .catch(this.handleError);
    }
  }

  getAddress(position): Promise<boolean> {
    return this.http
      .get(this.amapUrl + "geocode/regeo" +
        "?key=" + this.amapKey +
        '&output=JSON' +
        '&location=' + position[0] + ',' + position[1]
      )
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.status == 1) {
          // this.addressJson = {
          //   country: data.regeocode.addressComponent.country,
          //   province: data.regeocode.addressComponent.province,
          //   city: data.regeocode.addressComponent.city,
          //   district: data.regeocode.addressComponent.district,
          //   township: data.regeocode.addressComponent.township,
          // }
          this.address = data.regeocode.formatted_address;
          return true;
        } else
          return false;
      })
      .catch(this.handleError);
  }

  private handleError(error: any): boolean {
    console.error('An error occurred', error);
    return false;
  }

}
