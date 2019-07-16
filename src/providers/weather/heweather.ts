import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Geolocation } from '@ionic-native/geolocation';

/*
需要获取的信息：
天气、温度、空气质量、湿度、体感温度、更新时间

天气：https://free-api.heweather.com/s6/weather/now?location=30.63586,103.97584&key=xxx
空气：https://free-api.heweather.com/s6/air?location=30.63586,103.97584&key=xxx
*/
@Injectable()
export class HeweatherProvider {

  key = '';
  serverUrl = 'https://free-api.heweather.com/s6/';

  latitude: string;
  longitude: string;
  province;
  city;
  district;
  weather;
  temperature;
  humidity;
  aqi;
  pm25;
  pm10;

  constructor(
    public http: HttpClient,
    private geolocation: Geolocation
  ) {
    console.log('Hello HeweatherProvider Provider');
  }

  getLocation(): Promise<void> {
    return this.geolocation.getCurrentPosition({enableHighAccuracy: true}).then(resp => {
      console.log(resp);
      this.latitude = resp.coords.latitude.toString();
      this.longitude = resp.coords.longitude.toString();
    }).catch((error) => {
      console.log('Error getting location', error);
    });
  }

  getWeather(): Promise<boolean> {
    return this.http
      .get(this.serverUrl + "weather/now?" +
        "location=" + this.latitude + ',' + this.longitude +
        "&key=" + this.key
      )
      .toPromise()
      .then(response => {
        console.log(JSON.stringify(response));
        let data = JSON.parse(JSON.stringify(response));
        if (data.HeWeather6[0].status == 'ok') {

          this.province = data.HeWeather6[0].basic.admin_area;
          this.city = data.HeWeather6[0].basic.parent_city;
          this.district = data.HeWeather6[0].basic.location;
          this.weather = data.HeWeather6[0].now.cond_code;
          this.humidity = data.HeWeather6[0].now.hum;
          this.temperature = data.HeWeather6[0].now.tmp;

          return true;
        } else {
          console.log('Weather error');
          return false;
        }
      })
      .catch(this.handleError);
  }

  getAir(): Promise<boolean> {
    return this.http
      .get(this.serverUrl + "air/now?" +
        "location=" + this.city +
        "&key=" + this.key
      )
      .toPromise()
      .then(response => {
        console.log(JSON.stringify(response));
        let data = JSON.parse(JSON.stringify(response));
        if (data.HeWeather6[0].status == 'ok') {
          this.aqi = data.HeWeather6[0].air_now_city.aqi;
          this.pm25 = data.HeWeather6[0].air_now_city.pm25;
          this.pm10 = data.HeWeather6[0].air_now_city.pm10;
          return true;
        } else {
          console.log('Air error');
          return false;
        }
      })
      .catch(this.handleError);
  }

  private handleError(error: any): Promise<boolean> {
    console.error('An error occurred', error);
    return Promise.reject(false);
  }

}

