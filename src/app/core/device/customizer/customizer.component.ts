import { Component, OnInit, ViewChild, ElementRef, Input, Renderer2 } from '@angular/core';
import { BlinkerDevice } from '../../model/device.model';
import { DeviceService } from '../../services/device.service';
import { DomSanitizer } from '@angular/platform-browser';
import { CloudStorageService } from '../../services/cloudStorage.service';

@Component({
  selector: 'blinker-customizer',
  templateUrl: './customizer.component.html',
  styleUrls: ['./customizer.component.scss'],
})
export class Customizer implements OnInit {

  id;
  url;
  loaded = false;
  isFailed = false;
  headerHeight;
  deviceSubject;
  el: any;
  @Input() device: BlinkerDevice;
  @Input() customizerUrl;
  @ViewChild('iframeBox', { read: ElementRef, static: false }) iframeBox: ElementRef;

  constructor(
    private render: Renderer2,
    private deviceService: DeviceService,
    private sanitizer: DomSanitizer,
    private cloudStorageService: CloudStorageService
  ) { }

  ngOnInit() {
    this.url = this.sanitizer.bypassSecurityTrustResourceUrl(this.customizerUrl);
  }

  ngAfterViewInit() {
    this.init()
  }

  ngOnDestroy() {
    this.deviceSubject.unsubscribe()
    this.unlistenMessage();
  }

  unlistenMessage: Function;
  failTimer;

  init() {
    // this.url = this.sanitizer.bypassSecurityTrustResourceUrl(this.customizerUrl);
    this.deviceSubject = this.device.subject.subscribe(() => {
      this.sendDeviceData()
    })
    this.failTimer = setTimeout(() => {
      this.isFailed = true;
    }, 10000);
    this.unlistenMessage = this.render.listen(window, "message", e => {
      console.log(e.data);
      let message = e.data;
      let messageString = JSON.stringify(e.data);
      // 初次加载
      if (messageString == '{}') {
        this.sendHeaderHeight()
        this.hideLoading();
      } else
        // 获取历史数据
        if (typeof message.get != 'undefined') {
          if (message.get == "history") {
            this.getDataFromCloud(message.key, message.quickCode)
          }
        } else
          // 转发数据到设备
          this.send2device(e.data)
    })

    // 这个没啥用
    // this.iframeBox.nativeElement.onload = (e) => {
    //   console.log('iframe loaded');
    // }
  }

  sendHeaderHeight() {
    let headerlist = document.querySelectorAll('ion-header')
    this.el = headerlist[headerlist.length - 1];
    this.send2iframe({ headerHeight: this.el.offsetTop + this.el.offsetHeight })
  }

  send2device(data) {
    this.deviceService.sendData(this.device, typeof data == 'string' ? data : JSON.stringify(data))
  }

  send2iframe(data) {
    this.iframeBox.nativeElement.contentWindow.postMessage(data, '*')
  }

  sendDeviceData() {
    this.send2iframe({ deviceData: this.device.data })
  }

  showLoading = true;
  hideLoading() {
    if (this.loaded == true) return
    clearTimeout(this.failTimer)
    this.loaded = true;
    setTimeout(() => {
      this.showLoading = false
    }, 1000);
  }

  data = [];
  getDataFromCloud(selectedKey: string, quickCode: string) {
    if (typeof selectedKey != 'undefined')
      return this.cloudStorageService.getTimeSeriesData(this.device, selectedKey, quickCode)
        .then(result => {
          if (result) {
            if (this.device.data['history'][selectedKey][quickCode].length > 0) {
              this.data = [];
              this.device.data['history'][selectedKey][quickCode].forEach(element => {
                let date = new Date(element.date * 1000);
                this.data.push({ date: date, value: element.value })
              });
            }
          }
          this.send2iframe(this.data)
          return this.data
        });
  }
}
