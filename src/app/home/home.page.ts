import {
  Component,
  AfterViewInit,
  ChangeDetectionStrategy,
} from '@angular/core';

import {
  IonLabel,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { ViewService } from '../core/services/view.service';

@Component({
  selector: 'blinker-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    IonTabs,
    IonTabBar,
    IonTabButton,
    IonLabel,
    TranslatePipe,
  ],
})
export class HomePage implements AfterViewInit {
  isIos = false;
  isIphonex = false;
  isCordova = false;

  constructor(private viewService: ViewService) {}

  ngAfterViewInit() {
    this.viewService.disableMenuSwipe();
  }

  // 弹出视图模式菜单
  changeView() {
    this.viewService.changeView();
  }
}
