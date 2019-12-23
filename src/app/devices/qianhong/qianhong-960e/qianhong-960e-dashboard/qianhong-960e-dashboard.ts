import { Component, ChangeDetectorRef, Input, ViewChild, ElementRef } from '@angular/core';
import { DeviceService } from 'src/app/core/services/device.service';
import { NativeService } from 'src/app/core/services/native.service';
import { Router } from '@angular/router';
import { CloudStorageService } from 'src/app/core/services/cloudStorage.service';


@Component({
  selector: 'qianhong-960e-dashboard',
  templateUrl: 'qianhong-960e-dashboard.html',
  styleUrls: ['qianhong-960e-dashboard.scss']
})

export class Qianhong960eDashboard {

  @Input() device: BlinkerDevice;

  get switch() {
    if (this.device.data.switch == 'on')
      return true
    return false
  }

  get sleepState() {
    if (typeof this.device.data["sleep"] != 'undefined')
      if (this.device.data['sleep'] == 'on')
        return true
    return false
  }

  get powersaveState() {
    if (typeof this.device.data["powersave"] != 'undefined')
      if (this.device.data['powersave'] == 'on')
        return true
    return false
  }


  get lockState() {
    if (typeof this.device.data["lock"] != 'undefined')
      if (this.device.data['lock'] == 'on')
        return true
    return false
  }

  get state() {
    if (this.device.data.state == 'online')
      return true
    return false
  }

  get power() {
    return this.device.data.power
  }

  get targetTemp() {
    if (typeof this.device.data["t-temp"] == 'undefined')
      this.device.data["t-temp"] = 0;
    return this.device.data["t-temp"]
  }

  set targetTemp(value) {
    if (typeof this.device.data["t-temp"] == 'undefined')
      this.device.data["t-temp"] = 0;
    this.device.data["t-temp"] = value;
  }

  get currentTemp() {
    if (typeof this.device.data["c-temp"] == 'undefined')
      return 0
    return this.device.data["c-temp"]
  }

  get calValue() {
    if (typeof this.device.data["t-cal"] == 'undefined')
      this.device.data["t-cal"] = 0;
    return this.device.data["t-cal"]
  }

  set calValue(value) {
    if (typeof this.device.data["t-cal"] == 'undefined')
      this.device.data["t-cal"] = 0;
    this.device.data["t-cal"] = value;
  }

  sendTemp = 0;
  showSendTemp = false;

  sendCal = 0;

  min = 0;
  max = 500;

  tab = 0;
  // slides;

  @ViewChild('TabSlider', { read: ElementRef, static: true }) tabSlider: ElementRef;

  constructor(
    private deviceService: DeviceService,
    private nativeService: NativeService,
    private router: Router,
    private elementRef: ElementRef,
    private cloudStorageService: CloudStorageService,
  ) {
  }

  ngAfterViewInit() {
    // setTimeout(() => {
    //   this.slides = this.elementRef.nativeElement.querySelector('ion-slides');
    //   this.slides.lockSwipes(true);
    // }, 500);
  }



  turnSwitch() {
    let message;
    if (this.switch) {
      message = `{"switch":"off"}`
    } else {
      message = `{"switch":"on"}`
    }
    this.deviceService.sendData(this.device, message);
    this.nativeService.vibrate();
  }

  turnSleep() {
    let message;
    if (this.sleepState) {
      message = `{"sleep":"off"}`
    } else {
      message = `{"sleep":"on"}`
    }
    this.deviceService.sendData(this.device, message);
    this.nativeService.vibrate();
  }

  turnPowerSave() {
    let message;
    if (this.powersaveState) {
      message = `{"powersave":"off"}`
    } else {
      message = `{"powersave":"on"}`
    }
    this.deviceService.sendData(this.device, message);
    this.nativeService.vibrate();
  }

  turnLock() {
    let message;
    if (this.lockState) {
      message = `{"lock":"off"}`
    } else {
      message = `{"lock":"on"}`
    }
    this.deviceService.sendData(this.device, message);
    this.nativeService.vibrate();
  }

  showSendTempTimer;

  targetTempChange(e) {
    this.sendTemp = e;
    this.showSendTemp = true;
    clearTimeout(this.showSendTempTimer)
    this.showSendTempTimer = setTimeout(() => {
      this.showSendTemp = false;
    }, 5000);
  }

  sendData() {
    this.targetTemp = this.sendTemp;
    this.deviceService.sendData(this.device, `{"t-temp":${this.sendTemp}}`);
  }

  add() {
    if (this.targetTemp > (this.max - 1)) return
    this.targetTemp++;
    this.targetTempChange(this.targetTemp)
  }

  reduce() {
    if (this.targetTemp < (this.min + 1)) return
    this.targetTemp--;
    this.targetTempChange(this.targetTemp)
  }

  selecte(tab) {
    if (this.tab == tab) return;
    if (tab == 2 || tab == 3 || tab == 4 || tab == 7) {
      //  开关按键，不做处理
    } else {
      this.tab = tab;
    }
    if (tab == 0) {
      this.goToSlide(0)
    } else if (tab == 1) {
      this.goToSlide(1)
    } else if (tab == 2) {
      this.router.navigate(['timer', this.device.id]);
    } else if (tab == 3) {

    } else if (tab == 4) {

    } else if (tab == 5) {
      this.goToSlide(2)
    } else if (tab == 6) {
      this.goToSlide(3);
      this.sendCal = this.calValue;
    } else if (tab == 7) {

    }
  }

  showTab = 0;
  goToSlide(index) {
    this.showTab = index
    // if (typeof this.slides != 'undefined') {
    //   this.slides.lockSwipes(false);
    //   this.slides.slideTo(index);
    //   this.slides.lockSwipes(true);
    // }
  }

  reduceCal() {
    // this.sendCal = Math.floor(this.sendCal * 10 - 1) / 10;
    this.sendCal--;
    this.sendCalData()
  }

  resetCal() {
    this.sendCal = 0;
    this.sendCalData()
  }

  addCal() {
    // this.sendCal = Math.floor(this.sendCal * 10 + 1) / 10;
    this.sendCal++;
    this.sendCalData()
  }

  sendCalData() {
    this.deviceService.sendData(this.device, `{"cal":${this.sendCal}}`);
  }

}
