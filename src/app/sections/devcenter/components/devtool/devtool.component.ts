import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'devcenter-devtool',
  templateUrl: './devtool.component.html',
  styleUrls: ['./devtool.component.scss']
})
export class DevtoolComponent implements OnInit {

  tools = [
    {
      img: 'assets/img/icon/esp-logo.png',
      name: 'EspTouch/SmartConfig',
      desp: '通过广播wifi热点及密码进行配网',
      url: 'tool/esptouch'
    },
    {
      img: 'assets/img/icon/apconfig.png',
      name: 'ApConfig',
      desp: '通过广播wifi热点及密码进行配网',
      url: 'tool/apconfig'
    },
    {
      img: 'assets/img/icon/tool-qrscanner.png',
      name: '二维码扫描器beta',
      desp: '通过扫描二维码添加设备',
      url: 'tool/qrscanner',
      color: '#0ec254'
    },
    {
      img: 'assets/img/icon/tool-bleconfig.png',
      name: 'BleConfig',
      desp: '通过蓝牙传输进行配网',
      url: 'tool/bleconfig',
      color: '#3880ff'
    }
  ]

  constructor(
    private router: Router
  ) { }

  ngOnInit() {
  }

  goto(page) {
    this.router.navigate(['devcenter', 'tool', page])
  }

}
