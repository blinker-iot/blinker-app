import {
  Component,
  ViewChild,
  // ViewContainerRef,
  // ElementRef,
  // Renderer2,
  // ViewChildren,
  // QueryList,
  // ChangeDetectorRef,
} from '@angular/core';
import {
  NavController,
  App,
  // Refresher,
  Events,
  Platform,
  PopoverController,
  Refresher
} from 'ionic-angular';
import { AddDevicePage } from '../adddevice/adddevice';
import { DeviceProvider } from '../../providers/device/device';
import { UserProvider } from '../../providers/user/user';
import { LoginPage } from '../login/login';
import { Example } from '../../examples/testDate';
import { PusherProvider } from '../../providers/pusher/pusher';
import { AutoProvider } from '../../providers/auto/auto';

@Component({
  selector: 'page-home',
  templateUrl: 'home.html',
})

export class HomePage {

  roomid = -1;
  HomeRefresherEnabled: boolean = true;
  loaded = false;
  // loaded2 = false;
  showSceneButtonGroup = false;
  showSpinner = false;

  // refresher;
  @ViewChild(Refresher) refresher: Refresher;
  // @ViewChild(Content) content: Content;

  isIos = false;
  isIphonex = false;
  bstyle = 0;

  constructor(
    public navCtrl: NavController,
    private deviceProvider: DeviceProvider,
    private userProvider: UserProvider,
    private app: App,
    public events: Events,
    public pusherProvider: PusherProvider,
    public autoProvider: AutoProvider,
    // private renderer: Renderer2,
    public plt: Platform,
    public popoverCtrl: PopoverController,
    // private elementRef: ElementRef
  ) {
    // 判断是否为ios、iphonex，以便做适配
    if (this.plt.is('ios')) {
      this.isIos = true;
      if ((window.screen.width == 375) && (window.screen.height == 812)) {
        this.isIphonex = true;
      }
    }

  }

  // scrollContent;
  ionViewDidLoad() {
    this.loadData();

    this.events.subscribe('page:home', message => {
      console.log(message);
      if (message == 'refresh') {
        this.refresh();
      } else if (message == 'token test') {
        this.userProvider.getUserInfo();
      } else if (message == 'unauthorized user') {
        this.gotoLoginPage();
      } else if (message == 'display mode:grid') {
        this.bstyle = 0
      } else if (message == 'display mode:list') {
        this.bstyle = 1
      } else if (typeof message.goto != 'undefined') {
        if (message.goto == 'RoomManagerPage') {
          this.events.publish('provider:notice', 'canNotBeUsed2')
          return
        }
        this.navCtrl.push(message.goto);
      }
    });

    this.pusherProvider.init();
  }

  ngOnDestroy() {
    this.events.unsubscribe('page:home');
  }

  async loadData() {
    this.loaded = await this.userProvider.getAllInfo();
    if (!this.loaded) return;
    this.deviceProvider.init();

    if (this.autoProvider.sceneButtonList.length > 0) {
      this.showSceneButtonGroup = true;
    }
  }

  async refresh() {
    if (!this.loaded) {
      this.loadData();
      return;
    }
    await this.userProvider.getAllInfo({ showLoading: false, onlyGetDevices: true });
    this.deviceProvider.searchDevice();
    this.deviceProvider.queryDevices();
  }

  startRefresh() {

  }

  doRefresh() {
    this.refresh();
    window.setTimeout(() => {
      this.refresher.complete();
      // this.enableSortable();
    }, 1000);
  }

  gotoLoginPage() {
    console.log('返回登陆页面');
    if (this.app.getActiveNavs()[0].getViews()[0].name == "ModalCmp")
      this.app.getActiveNavs()[0].pop();
    this.deviceProvider.disconnectMqttBroker();
    this.userProvider.logout();
    this.app.getRootNav().setRoot(LoginPage);
    this.navCtrl.goToRoot;
  }

  presentPopover(myEvent) {
    let popover = this.popoverCtrl.create('PopoverPage');
    popover.present({
      ev: myEvent
    });
  }

  gotoAddDevice() {
    this.navCtrl.push(AddDevicePage);
  }

  refresherEnabled(e) {
    // console.log(e);
    this.HomeRefresherEnabled = e;
  }

  getTestDeviceInfo() {
    this.deviceProvider.brokers = Example.brokers;
    this.deviceProvider.devices = Example.devices;
  }

  gotoTestDevice() {
    this.navCtrl.push('OwnPlugDashboardPage');
  }

  gotoTestDevice1() {
    this.navCtrl.push('OwnPlugDashboardPage');
  }

  gotoTestDevice2() {
    this.navCtrl.push('OwnLightDashboardPage');
  }

  gotoTestDevice3() {
    this.navCtrl.push('OwnAirdetectorDashboardPage');
  }

}
