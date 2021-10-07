import { Component, OnInit, Input, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
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
    private router: Router
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

}
