import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable()
export class AmapProvider {

  key = '';
  serverUrl = 'http://restapi.amap.com/v3/';
  province: string;
  city: string;
  adcode: string;
  weather: any;
  constructor(public http: HttpClient) {
    console.log('Hello AmapProvider Provider');
  }

  getLocation(): Promise<boolean> {
    return this.http
      .get(this.serverUrl + "ip?" +
      "key=" + this.key
      )
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.infocode == 10000) {
          this.province = data.province;
          this.city = data.city;
          this.adcode = data.adcode;
          return true;
        } else
          return false;
      })
      .catch(this.handleError);
  }

  getWeather(): Promise<boolean> {
    return this.http
      .get(this.serverUrl + "weather/weatherInfo?" +
      "key=" + this.key +
      "&city=" + this.adcode +
      "&extensions=all"
      )
      .toPromise()
      .then(response => {
        console.log(response);
        let data = JSON.parse(JSON.stringify(response));
        if (data.infocode == 10000) {
          this.weather = data.forecasts[0];
          return true;
        } else
          return false;
      })
      .catch(this.handleError);
  }

  private handleError(error: any): Promise<boolean> {
    console.error('An error occurred', error);
    // this.events.publish('server:error', error);
    // this.toastProvider.present('server error');
    return Promise.reject(false);
  }



}
