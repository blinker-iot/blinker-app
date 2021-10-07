import { Component, OnInit } from '@angular/core';
import { ViewService } from '../core/services/view.service';

@Component({
  selector: 'blinker-view',
  templateUrl: './view.page.html',
  styleUrls: ['./view.page.scss'],
})
export class BlinkerView implements OnInit {

  get menuSwipeEnable() {
    return this.viewService.menuSwipeEnable;
  }

  constructor(
    private viewService: ViewService,
  ) { }

  ngOnInit() {
  }

  menuDidOpen() {
    this.viewService.enableMenuSwipe();
  }

  menuDidClose() {
    this.viewService.disableMenuSwipe();
  }

}
