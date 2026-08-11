import {
  Component,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { ViewService } from '../core/services/view.service';
import { TabDeviceComponent } from './components/tab-device/tab-device';
import { TabCommunityComponent } from './components/tab-community/tab-community';
import { TabProfileComponent } from './components/tab-profile/tab-profile';

@Component({
  selector: 'blinker-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    IonicModule,
    RouterModule,
    TabDeviceComponent,
    TabCommunityComponent,
    TabProfileComponent,
  ],
})
export class HomePage {
  isIos = false;
  isIphonex = false;
  isCordova = false;

  constructor(
    private router: Router,
    private viewService: ViewService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {}

  ngAfterViewInit() {
    this.viewService.disableMenuSwipe();
    if ('webkitSpeechRecognition' in window) {
      // this.speech()
    } else {
      alert('语音识别API不可用');
    }
  }

  goto(page) {
    this.router.navigate([page]);
  }

  // 弹出视图模式菜单
  changeView() {
    this.viewService.changeView();
  }
}
