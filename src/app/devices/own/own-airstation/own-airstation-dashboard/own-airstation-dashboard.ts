import { Component, ViewChild, ElementRef, Input } from '@angular/core';
import { NavController } from '@ionic/angular';
import { deviceName12 } from 'src/app/core/functions/func';
import { ViewService } from 'src/app/core/services/view.service';
import { ActivatedRoute } from '@angular/router';
import { DeviceService } from 'src/app/core/services/device.service';
import { DataService } from 'src/app/core/services/data.service';
import { DeviceComponent } from 'src/app/core/model/device.model';


@Component({
  selector: 'own-airstation-dashboard',
  templateUrl: 'own-airstation-dashboard.html',
  styleUrls: ['own-airstation-dashboard.scss']
})
export class OwnAirStationDashboard implements DeviceComponent {

  id;
  device;

  get geolocation() {
    return this.device.config.position.address
  }

  dataList1 = [
    { name: '温度', unit: '℃', key: 'temp' },
    { name: '湿度', unit: '%', key: 'humi' },
    { name: '气压', unit: 'hPa', key: 'pressure' },
    { name: '风速', unit: 'm/s', key: 'speed' },
    { name: '风向', unit: '', key: 'direction' },
    { name: '光照', unit: 'lx', key: 'lux' }
  ];

  dataList2 = [
    { name: 'SO₂(二氧化硫)', unit: 'ug/m³', icon: 'so2.svg', key: 'so2' },
    { name: 'NO₂(二氧化氮)', unit: 'ug/m³', icon: 'no2.svg', key: 'no2' },
    { name: 'CO(一氧化碳)', unit: 'mg/m³', icon: 'co.svg', key: 'co' },
    { name: 'O₃(臭氧)', unit: 'ug/m³', icon: 'o3.svg', key: 'o3' },
    { name: 'PM10', unit: 'ug/m³', icon: 'pm10.svg', key: 'pm10' },
    { name: 'PM2.5', unit: 'ug/m³', icon: 'pm2_5.svg', key: 'pm2_5' },
  ];

  @ViewChild('chart',{ read: ElementRef, static: true }) chart: ElementRef

  constructor(
    private activatedRoute: ActivatedRoute,
    private navCtrl: NavController,
    private viewService: ViewService,
    private deviceService: DeviceService,
    private dataService: DataService,
  ) {
  }

  ngOnInit() {
    this.id = this.activatedRoute.snapshot.params['id'];
    this.device = this.dataService.device.dict[this.id]
  }

  ngAfterViewInit() {
    this.viewService.setDarkStatusBar();
    this.initChart();
  }

  initChart() {
    // var chart = new F2.Chart({
    //   id: 'myChart',
    //   pixelRatio: window.devicePixelRatio
    // });

    // chart.source(this.data);
    // chart.tooltip({
    //   showCrosshairs: true,
    //   showItemMarker: false,
    //   background: {
    //     radius: 2,
    //     fill: '#1890FF',
    //     padding: [3, 5]
    //   },
    //   nameStyle: {
    //     fill: '#fff'
    //   },
    //   onShow: function onShow(ev) {
    //     var items = ev.items;
    //     items[0].name = items[0].title;
    //   }
    // });
    // chart.line().position('date*value');
    // chart.point().position('date*value').style({
    //   lineWidth: 1,
    //   stroke: '#fff'
    // });

    // chart.interaction('pan');
    // // 定义进度条
    // chart.scrollBar({
    //   mode: 'x',
    //   xStyle: {
    //     offsetY: -5
    //   }
    // });

    // // 绘制 tag
    // // chart.guide().tag({
    // //   position: [1969, 1344],
    // //   withPoint: false,
    // //   content: '1,344',
    // //   limitInPlot: true,
    // //   offsetX: 5,
    // //   direct: 'cr'
    // // });
    // chart.render();
  }

  changeToday() {
    // for (let item of data) {
    //   date
    // }
  }

  change48Hour() {

  }

  changeWeek() {

  }

  changeYear() {

  }

  changeMonth() {

  }

}
