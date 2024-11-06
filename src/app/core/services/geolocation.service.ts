import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Platform } from "@ionic/angular";

@Injectable({
  providedIn: "root",
})
export class GeolocationService {
  currentPosition = [103.9787507031, 30.6336840719];

  get latitude() {
    return this.currentPosition[1];
  }

  set latitude(latitude) {
    this.currentPosition[1] = latitude;
  }

  get longitude() {
    return this.currentPosition[0];
  }

  set longitude(longitude) {
    this.currentPosition[0] = longitude;
  }

  address;
  addressString;

  constructor(
    // private geolocation: Geolocation,
    // private diagnostic: Diagnostic,
    private http: HttpClient,
    private platform: Platform,
  ) {}

  getDevicePosition(device) {
    return new Promise<any>(async (resolve, reject) => {
      if (device.config.position.location[0]) {
        resolve(device.config.position.location);
      } else {
        resolve(await this.getUserPosition());
      }
    });
  }

  getUserPosition() {
    return new Promise<any>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition((position) => {
        let longitude = position.coords.longitude;
        let latitude = position.coords.latitude;
        resolve([longitude, latitude]);
      }, (error) => {
        console.log("Error getting geolocation: " + error.message);
      }, { enableHighAccuracy: true });
    });
  }
}
