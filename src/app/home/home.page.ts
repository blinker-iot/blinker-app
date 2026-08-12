import {
  Component,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  AfterViewInit,
  ViewChild,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import {
  IonLabel,
  IonTab,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/angular/standalone';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ViewService } from '../core/services/view.service';
import { TabDeviceComponent } from './components/tab-device/tab-device';
import { TabCommunityComponent } from './components/tab-community/tab-community';
import { TabToolsComponent } from './components/tab-tools/tab-tools';
import { TabProfileComponent } from './components/tab-profile/tab-profile';

@Component({
  selector: 'blinker-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    IonTabs,
    IonTab,
    IonTabBar,
    IonTabButton,
    IonLabel,
    RouterModule,
    TranslatePipe,
    TabDeviceComponent,
    TabCommunityComponent,
    TabToolsComponent,
    TabProfileComponent,
  ],
})
export class HomePage implements AfterViewInit {
  @ViewChild(IonTabs) private tabs?: IonTabs;

  isIos = false;
  isIphonex = false;
  isCordova = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private viewService: ViewService,
    private cd: ChangeDetectorRef
  ) {}

  ionViewWillEnter() {
    this.selectRequestedTab();
  }

  ngAfterViewInit() {
    this.viewService.disableMenuSwipe();
    this.selectRequestedTab();
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

  private selectRequestedTab() {
    const requestedTab = this.route.snapshot.queryParamMap.get('tab');
    if (requestedTab) {
      void this.tabs?.select(requestedTab);
    }
  }
}
