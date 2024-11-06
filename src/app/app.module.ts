import { NgModule, Injectable } from '@angular/core';
import { RouteReuseStrategy } from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { PermissionService } from 'src/app/core/services/permission.service';
import { PusherService } from 'src/app/core/services/pusher.service';
import { ServerInterceptor } from './core/injectable/server.interceptor';
import { GridsterModule } from 'angular-gridster2';
import { ViewService } from './core/services/view.service';
import { BlinkerViewModule } from './view/view.module';
import { BlinkerAddDeviceModule } from './sections/adddevice/adddevice.module';
import { BlinkerAccountModule } from './sections/account/account-routing.module';
import { BlinkerDeviceManagerModule } from './sections/device/device-manager-routing.module';
import { BlinkerRoomManagerModule } from './sections/room/room-manager-routing.module';
import { BlinkerUserModule } from './sections/user/user.module';
import { BlinkerMessageModule } from './sections/message/message.module';
import { BlinkerDevCenterModule } from './sections/devcenter/devcenter.module';
import { ComponentsModule } from './core/components/components.module';
import { DeviceConfigService } from './core/services/device-config.service';
import { DebugModule } from './debug/debug.module';
import { DocModule } from './core/pages/doc/doc.module';
import { MarkdownModule } from 'ngx-markdown';
import { BlinkerSpeechModule } from './sections/speech/speech.module';
import { DataService } from './core/services/data.service';
import { AuthService } from './core/services/auth.service';
import { AdddeviceService } from './sections/adddevice/adddevice.service';
import { BlinkerFeedbackModule } from './sections/feedback/feedback.module';
// import { BlinkerAutoModule } from './sections/auto/auto.module';
import { NetworkService } from './core/services/network.service';
import { AboutModule } from './sections/about/about.module';
import { ImageService } from './core/services/image.service';
import { BlinkerSceneManagerModule } from './sections/scene/scene.module';
import { BrowserModule, HAMMER_GESTURE_CONFIG, HammerGestureConfig, HammerModule } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
// import { environment } from '../environments/environment';
import { BlinkerDeviceModule } from './device/device.module';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

declare var Hammer: any;
@Injectable()
export class MyHammerConfig extends HammerGestureConfig {
  override overrides = <any>{
    'pan': { direction: Hammer.DIRECTION_ALL, threshold: 5 },
    'press': { time: 300, threshold: 99 }
  }
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    IonicModule.forRoot({
      mode: 'ios',
      scrollAssist: true,
      scrollPadding: false
    }),
    BrowserAnimationsModule,
    TranslateModule.forRoot(),
    MarkdownModule.forRoot(),
    AppRoutingModule,
    HttpClientModule,
    GridsterModule,
    ComponentsModule,
    HammerModule,
    // --blinker module--
    BlinkerAccountModule,
    BlinkerUserModule,
    BlinkerViewModule,
    BlinkerDeviceModule,
    BlinkerAddDeviceModule,
    BlinkerDeviceManagerModule,
    BlinkerRoomManagerModule,
    BlinkerSceneManagerModule,
    BlinkerMessageModule,
    BlinkerDevCenterModule,
    DebugModule,
    DocModule,
    AboutModule,
    BlinkerSpeechModule,
    BlinkerFeedbackModule,
  ],
  providers: [
    // StatusBar,
    // SplashScreen,
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
    // UpdateService,
    ViewService,
    PermissionService,
    PusherService,
    DeviceConfigService,
    ImageService,
    // Zeroconf,
    // Network,
    // BLE,
    // Diagnostic,
    // Deeplinks,
    // Geolocation,
    // AndroidPermissions,
    // AppVersion,
    // FileTransfer,
    // FileOpener,
    // File,
    // ScreenOrientation,
    // AliyunPush
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
