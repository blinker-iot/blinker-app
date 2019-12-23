import { NgModule } from '@angular/core';
import { BrowserModule, HAMMER_GESTURE_CONFIG, HammerGestureConfig } from '@angular/platform-browser';
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
import { Zeroconf } from '@ionic-native/zeroconf/ngx';
import { Network } from '@ionic-native/network/ngx';
import { BLE } from '@ionic-native/ble/ngx';
import { Diagnostic } from '@ionic-native/diagnostic/ngx';
// import { CodePush } from '@ionic-native/code-push/ngx';

import { GridsterModule } from 'angular-gridster2';
import { Geolocation } from '@ionic-native/geolocation/ngx';
import { AndroidPermissions } from '@ionic-native/android-permissions/ngx';

import { AppMinimize } from '@ionic-native/app-minimize/ngx';
import { ViewService } from './view/view.service';
import { BlinkerViewModule } from './view/view.module';
import { BlinkerAddDeviceModule } from './sections/adddevice/adddevice.module';
import { BlinkerAccountModule } from './sections/account/account-routing.module';
import { BlinkerDeviceManagerModule } from './sections/device/device-manager-routing.module';
import { BlinkerRoomManagerModule } from './sections/room/room-manager-routing.module';
import { BlinkerSceneManagerModule } from './sections/scene/scene-manager-routing.module';
import { BlinkerShareManagerModule } from './sections/share/share-manager-routing.module';
import { BlinkerSettingsModule } from './sections/settings/settings.module';
import { BlinkerTimerModule } from './sections/timer/timer.module';
import { BlinkerUserModule } from './sections/user/user.module';
import { JPush } from '@jiguang-ionic/jpush/ngx';
import { Brightness } from '@ionic-native/brightness/ngx';
import { BlinkerMessageModule } from './sections/message/message.module';
import { BlinkerDevCenterModule } from './sections/devcenter/devcenter.module';
import { ComponentsModule } from './core/components/components.module';
import { UpdateService } from './core/services/update.service';
import { DevicelistService } from './core/services/devicelist.service';
import { DebugModule } from './debug/debug.module';
import { DocModule } from './core/pages/doc/doc.module';
import { BlinkerDeviceModule } from './core/device/device.module';
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
// import { NgxsModule } from '@ngxs/store';

@NgModule({
  declarations: [AppComponent],
  entryComponents: [],
  imports: [
    BrowserModule,
    IonicModule.forRoot({
      mode: 'ios',
      _forceStatusbarPadding: true
    }),
    AppRoutingModule,
    IonicStorageModule.forRoot(),
    HttpClientModule,
    GridsterModule,
    MarkdownModule.forRoot(),
    ComponentsModule,
    // --状态管理--
    // NgxsModule.forRoot([

    // ]),
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
    BlinkerFeedbackModule
    // --PWA support--
    // ServiceWorkerModule.register('ngsw-worker.js', { enabled: environment.production }),
  ],
  providers: [
    StatusBar,
    SplashScreen,
    // ScreenOrientation,
    { provide: HAMMER_GESTURE_CONFIG, useClass: HammerGestureConfig },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: HTTP_INTERCEPTORS, useClass: ServerInterceptor, multi: true },
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
    DevicelistService,
    OpenNativeSettings,
    Zeroconf,
    Network,
    BLE,
    Diagnostic,
    // CodePush,
    Vibration,
    // Deeplinks,
    Geolocation,
    AndroidPermissions,
    AppMinimize,
    JPush,
    Brightness,
    AppVersion,
    FileTransfer,
    FileOpener,
    File,
    ScreenOrientation
    // InAppBrowser
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
