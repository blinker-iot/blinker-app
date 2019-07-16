import { Component, ViewChild } from '@angular/core';
import { Platform, Tabs, IonicApp, Events, App, NavController } from 'ionic-angular';

import { HomePage } from '../home/home';
import { UserPage } from '../user/user';
// import { NewsPage } from '../news/news';
// import { AutoPage } from '../auto/auto';
// import { DocPage } from '../doc/doc';
import { AppMinimize } from '@ionic-native/app-minimize';

@Component({
  templateUrl: 'tabs.html',
  selector: 'tabs'
})
export class TabsPage {
  tab1Root: any = HomePage;
  tab3Root: any = UserPage;
  @ViewChild('myTabs') tabRef: Tabs;

  isIphonex = false;

  backButtonPressed: boolean = false;

  constructor(
    // public backButtonService: BackButtonProvider,
    public ionicApp: IonicApp,
    public platform: Platform,
    public app: App,
    public events: Events,
    private appMinimize: AppMinimize
  ) {
    //判断是否为ios、iphonex，以便适配
    if (this.platform.is('ios')) {
      // this.isIos = true;
      if ((window.screen.width == 375) && (window.screen.height == 812)) {
        this.isIphonex = true;
      }
    }
    
    this.platform.ready().then(() => {
      this.registerBackButtonAction(this.tabRef);
    });
  }

  registerBackButtonAction(tabRef: Tabs): void {

    this.platform.registerBackButtonAction(() => {
      // 处理modal
      let activeModal = this.ionicApp._modalPortal.getActive();
      if (activeModal) {
        activeModal.dismiss()
        return;
      }
      //获取NavController
      let activeNav: NavController = this.app.getActiveNavs()[0];
      // try {
      //   activeNav.getViews()[0].dismiss();
      //   return;
      // } catch (err) {
      //   // console.log(err);
      // }
      // alert(Object.getPrototypeOf(activeNav.getViews()[0]));
      // console.log(activeNav.getViews()[0]);
      if (activeNav.canGoBack()) {
        this.events.publish('notice:hide', 'hide');
        activeNav.pop();
      } else {
        // console.log(tabRef)
        if (tabRef == null || tabRef._selectHistory[tabRef._selectHistory.length - 1] === tabRef.getByIndex(0).id) {
          //执行退出
          this.showExit();
        } else {
          //选择首页第一个的标签
          tabRef.select(0);
        }
      }
    });
  }

  //退出应用方法
  private showExit(): void {
    //如果为true，退出
    if (this.backButtonPressed) {
      this.platform.exitApp();
    } else {
      // 最小化
      this.appMinimize.minimize();
      // //第一次按，弹出 双击退出提示
      // this.events.publish('provider:notice', 'doubleClickExit');
      // //标记为true
      // this.backButtonPressed = true;
      // //两秒后标记为false，如果退出的话，就不会执行了
      // setTimeout(() => this.backButtonPressed = false, 2000);
    }
  }

}
