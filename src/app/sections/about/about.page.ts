import { Component, OnInit } from '@angular/core';
import { CONFIG } from 'src/app/configs/app.config';

@Component({
  selector: 'blinker-about',
  templateUrl: './about.page.html',
  styleUrls: ['./about.page.scss'],
})
export class AboutPage implements OnInit {

  LOGO = CONFIG.LOGIN_LOGO;
  TELEPHONE = CONFIG.TELEPHONE;
  ABOUT_US = CONFIG.ABOUT_US
  constructor() { }

  ngOnInit() {
  }

}
