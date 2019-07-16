import { Component } from '@angular/core';
// import { HeweatherProvider } from '../../providers/weather/heweather';
import { Skycons } from './skycons';
import { UserProvider } from '../../providers/user/user';

@Component({
  selector: 'weatherblock',
  templateUrl: 'weatherblock.html'
})
export class Weatherblock {
  loaded: boolean = false;
  showCol = false;
  constructor(
    // public weatherProvider: HeweatherProvider,
    public userProvider: UserProvider
  ) {
  }
  icon = "";
  ngOnInit() {
    this.loadWeather();
  }

  // ngAfterViewInit() {

  // }

  async loadWeather() {
    // console.log('get weather data');
    // await this.weatherProvider.getLocation();
    // await this.weatherProvider.getWeather();
    // await this.weatherProvider.getAir();
    if (await this.userProvider.getWeather() && await this.userProvider.getAir())
      this.loaded = true;
    if (this.loaded) {
      this.icon = this.code2icon(this.userProvider.weather.data.cond_code)
      window.setTimeout(() => {
        this.play();
      }, 500)
    }
  }

  // loadWeather2() {
  //   this.weatherProvider.weather = 100;
  //   this.weatherProvider.aqi = 100;
  //   this.weatherProvider.province = '四川';
  //   this.weatherProvider.city = '成都';
  //   this.weatherProvider.temperature = 1;
  //   this.weatherProvider.humidity = 4;
  //   this.weatherProvider.pm25 = 200;
  //   this.weatherProvider.pm10 = 33;
  //   this.weather = true;
  // }

  weather = {
    clearDay: [100],
    cloudy: [101, 102],
    partlyCloudy: [103],
    wind: [200, 202, 203, 204, 205, 206, 207, 208, 209],
    rain: [300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312],
    sleet: [],
    snow: [],
    fog: [],
  }

  code2icon(codeStr) {
    let hour = (new Date()).getHours();
    let code = parseInt(codeStr);
    if (code == 100 && hour < 18 && hour > 6)
      return 'clear-day'
    if (code == 100)
      return 'clear-night'
    if (code == 103 && hour < 18 && hour > 6)
      return 'partly-cloudy-day'
    if (code == 103)
      return 'partly-cloudy-night'
    if (code == 101 || code == 104)
      return 'cloudy'
    if (code == 305 || code == 306 || code == 309 || code == 314 || code == 399)
      return 'rain'
    if (code >= 300 && code <= 399)
      return 'sleet'
    if (code >= 400 && code <= 499)
      return 'snow'
    if (code >= 200 && code <= 213)
      return 'wind'
    if (code >= 500 && code <= 515)
      return 'fog'
  }

  play() {
    var icons = new Skycons({ color: "#FFF" });
    let list = [
      "clear-day", "clear-night", "partly-cloudy-day",
      "partly-cloudy-night", "cloudy", "rain", "sleet", "snow", "wind",
      "fog"
    ]

    for (let i = list.length; i--;)
      icons.set(list[i], list[i]);
    icons.play();
  }

}
