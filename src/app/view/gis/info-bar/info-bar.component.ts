import { Component, OnInit, Input } from '@angular/core';
import { Router } from '@angular/router';
import { deviceName12 } from 'src/app/core/functions/func';

@Component({
  selector: 'map-info-bar',
  templateUrl: './info-bar.component.html',
  styleUrls: ['./info-bar.component.scss']
})
export class InfoBarComponent implements OnInit {

  @Input() device;

  get id() {
    return deviceName12(this.device.deviceName)
  }

  constructor(
    private router: Router
  ) { }

  ngOnInit() {

  }

  gotoDashboard() {
    this.router.navigate(['device/' + deviceName12(this.device.deviceName)])
  }

}
