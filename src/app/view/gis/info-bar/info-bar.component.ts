import { Component, OnInit, Input, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController } from '@ionic/angular';
import { deviceName12 } from 'src/app/core/functions/func';

@Component({
  selector: 'map-info-bar',
  templateUrl: './info-bar.component.html',
  styleUrls: ['./info-bar.component.scss']
})
export class InfoBarComponent implements OnInit {

  @Input() device;

  hide = false;

  get id() {
    return deviceName12(this.device.deviceName)
  }

  constructor(
    private router: Router,
    private actionSheetController: ActionSheetController
  ) { }

  ngOnInit() {

  }

  ngOnChanges(changes: SimpleChanges): void {
    this.hide = false
  }

  gotoDashboard() {
    this.router.navigate(['device/' + deviceName12(this.device.deviceName)])
  }

  close() {
    this.hide = true
  }

  // https://lbs.amap.com/api/amap-mobile/guide/android/navigation
  // https://lbsyun.baidu.com/index.php?title=uri/api/android#service-page-anchor10
  async gotoNav() {
    let longitude = this.device.config.position.location[0]
    let latitude = this.device.config.position.location[1]
    const actionSheet = await this.actionSheetController.create({
      buttons: [{
        text: '高德地图',
        handler: () => {
          window.open(`androidamap://viewMap?sourceApplication=iot.diandeng.tech&lat=${latitude}&lon=${longitude}&poiname=${this.device.config.customName}&dev=0`)
        }
      }, {
        text: '百度地图',
        handler: () => {
          window.open(`bdapp://map/marker?location=${latitude},${longitude}&title=${this.device.config.customName}&coord_type=wgs84&src=iot.diandeng.tech`)
        }
      }]
    });
    await actionSheet.present();
  }

}
