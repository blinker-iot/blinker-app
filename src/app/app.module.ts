import { NgModule, Injectable } from '@angular/core';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';

import { IonicStorageModule } from '@ionic/storage';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { PermissionService } from 'src/app/core/services/permission.service';
import { PusherService } from 'src/app/core/services/pusher.service';

import { ServerInterceptor } from './core/injectable/server.interceptor';
import { OpenNativeSettings } from '@ionic-native/open-native-settings/ngx';
import { Zeroconf } from '@awesome-cordova-plugins/zeroconf/ngx';
import { Network } from '@ionic-native/network/ngx';
import { BLE } from '@awesome-cordova-plugins/ble/ngx';
import { Diagnostic } from '@awesome-cordova-plugins/diagnostic/ngx';

import { GridsterModule } from 'angular-gridster2';
import { Geolocation } from '@ionic-native/geolocation/ngx';
import { AndroidPermissions } from '@awesome-cordova-plugins/android-permissions/ngx';

import { AppMinimize } from '@ionic-native/app-minimize/ngx';
import { ViewService } from './core/services/view.service';
import { BlinkerViewModule } from './view/view.module';
import { BlinkerAddDeviceModule } from './sections/adddevice/adddevice.module';
import { BlinkerAccountModule } from './sections/account/account-routing.module';
import { BlinkerDeviceManagerModule } from './sections/device/device-manager-routing.module';
import { BlinkerRoomManagerModule } from './sections/room/room-manager-routing.module';
import { BlinkerShareManagerModule } from './sections/share/share.module';
import { BlinkerSettingsModule } from './sections/settings/settings.module';
import { BlinkerTimerModule } from './sections/timer/timer.module';
import { BlinkerUserModule } from './sections/user/user.module';
import { Brightness } from '@ionic-native/brightness/ngx';
import { BlinkerMessageModule } from './sections/message/message.module';
import { BlinkerDevCenterModule } from './sections/devcenter/devcenter.module';
import { ComponentsModule } from './core/components/components.module';
import { UpdateService } from './core/services/update.service';
import { DeviceConfigService } from './core/services/device-config.service';
import { DebugModule } from './debug/debug.module';
import { DocModule } from './core/pages/doc/doc.module';
import { MarkdownModule } from 'ngx-markdown';
import { Vibration } from '@ionic-native/vibration/ngx';
import { AppVersion } from '@ionic-native/app-version/ngx';
import { FileOpener } from '@ionic-native/file-opener/ngx';
import { FileTransfer } from '@ionic-native/file-transfer/ngx';
import { File } from '@ionic-native/file/ngx';
import { BlinkerSpeechModule } from './sections/speech/speech.module';
import { DataService } from './core/services/data.service';
import { AuthService } from './core/services/auth.service';
import { AdddeviceService } from './sections/adddevice/adddevice.service';
import { BlinkerFeedbackModule } from './sections/feedback/feedback.module';
import { BlinkerAutoModule } from './sections/auto/auto.module';
import { NetworkService } from './core/services/network.service';
import { AboutModule } from './sections/about/about.module';
import { ScreenOrientation } from '@ionic-native/screen-orientation/ngx';
import { ImageService } from './core/services/image.service';
import { BlinkerSceneManagerModule } from './sections/scene/scene.module';
import { AliyunPush } from 'libs/@ionic-native/aliyun-push/ngx';
import { BrowserModule, HAMMER_GESTURE_CONFIG, HammerGestureConfig, HammerModule } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { ServiceWorkerModule } from '@angular/service-worker';
import { environment } from '../environments/environment';
import { BlinkerDeviceModule } from './device/device.module';

declare var Hammer: any;
@Injectable()
export class MyHammerConfig extends HammerGestureConfig {
  overrides = <any>{
    'pan': { direction: Hammer.DIRECTION_ALL, threshold: 5 },
    'press': { time: 300, threshold: 99 }
  }
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    IonicModule.forRoot({
      mode: 'ios'
    }),
    // NgZorroAntdMobileModule,
    TranslateModule.forRoot(),
    AppRoutingModule,
    IonicStorageModule.forRoot(),
    HttpClientModule,
    GridsterModule,
    MarkdownModule.forRoot(),
    ComponentsModule,
    // --blinker module--
    BlinkerAccountModule,
    BlinkerUserModule,
    BlinkerSettingsModule,
    BlinkerViewModule,
    BlinkerDeviceModule,
    BlinkerAddDeviceModule,
    BlinkerDeviceManagerModule,
    BlinkerRoomManagerModule,
    BlinkerSceneManagerModule,
    BlinkerShareManagerModule,
    BlinkerTimerModule,
    BlinkerMessageModule,
    BlinkerDevCenterModule,
    BlinkerAutoModule,
    DebugModule,
    DocModule,
    AboutModule,
    BlinkerSpeechModule,
    BlinkerFeedbackModule,
    HammerModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerWhenStable:30000'
    })
  ],
  providers: [
    StatusBar,
    SplashScreen,
    // ScreenOrientation,
    { provide: HAMMER_GESTURE_CONFIG, useClass: HammerGestureConfig },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: HTTP_INTERCEPTORS, useClass: ServerInterceptor, multi: true },
    { provide: HAMMER_GESTURE_CONFIG, useClass: MyHammerConfig },
    AuthService,
    DataService,
    UserService,
    AdddeviceService,
    DeviceService,
    NetworkService,
    NoticeService,
    UpdateService,
    ViewService,
    PermissionService,
    PusherService,
    DeviceConfigService,
    ImageService,
    OpenNativeSettings,
    Zeroconf,
    Network,
    BLE,
    Diagnostic,
    Vibration,
    // Deeplinks,
    Geolocation,
    AndroidPermissions,
    AppMinimize,
    Brightness,
    AppVersion,
    FileTransfer,
    FileOpener,
    File,
    ScreenOrientation,
    AliyunPush,
    // InAppBrowser
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
