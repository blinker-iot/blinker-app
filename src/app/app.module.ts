import { NgModule } from '@angular/core';
import { RouteReuseStrategy } from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { PermissionService } from 'src/app/core/services/permission.service';
import { PusherService } from 'src/app/core/services/pusher.service';
import { ServerInterceptor } from './core/injectable/server.interceptor';
import { GridsterModule } from 'angular-gridster2';
import { ViewService } from './core/services/view.service';
import { BlinkerDeviceManagerModule } from './sections/device/device-manager-routing.module';
import { BlinkerRoomManagerModule } from './sections/room/room-manager-routing.module';
import { BlinkerUserModule } from './sections/user/user.module';
import { BlinkerMessageModule } from './sections/message/message.module';
import { ComponentsModule } from './core/components/components.module';
// import { DeviceConfigService } from './core/services/device-config.service';
import { DebugModule } from './debug/debug.module';
import { DocModule } from './core/pages/doc/doc.module';
import { MarkdownModule } from 'ngx-markdown';
import { DataService } from './core/services/data.service';
import { AuthService } from './core/services/auth.service';
import { BlinkerFeedbackModule } from './sections/feedback/feedback.module';
// import { BlinkerAutoModule } from './sections/auto/auto.module';
import { NetworkService } from './core/services/network.service';
import { AboutModule } from './sections/about/about.module';
import { ImageService } from './core/services/image.service';
import { BlinkerSceneManagerModule } from './sections/scene/scene.module';
import { BrowserModule } from '@angular/platform-browser';
import { TranslatePipe } from '@ngx-translate/core';
import { BlinkerDeviceModule } from './device/device.module';

@NgModule({
  bootstrap: [AppComponent], imports: [
    BrowserModule,
    IonicModule.forRoot({
      mode: 'ios',
      scrollAssist: true,
      scrollPadding: false
    }),
    TranslatePipe,
    MarkdownModule.forRoot(),
    AppRoutingModule,
    GridsterModule,
    ComponentsModule,
    AppComponent,
    // --blinker module--
    BlinkerUserModule,
    BlinkerDeviceModule,
    BlinkerDeviceManagerModule,
    BlinkerRoomManagerModule,
    BlinkerSceneManagerModule,
    BlinkerMessageModule,
    DebugModule,
    DocModule,
    AboutModule,
    BlinkerFeedbackModule
  ],
  providers: [
    // StatusBar,
    // SplashScreen,
    // ScreenOrientation,
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: HTTP_INTERCEPTORS, useClass: ServerInterceptor, multi: true },
    AuthService,
    DataService,
    UserService,
    DeviceService,
    NetworkService,
    NoticeService,
    // UpdateService,
    ViewService,
    PermissionService,
    PusherService,
    // DeviceConfigService,
    ImageService,
    provideHttpClient(withInterceptorsFromDi()),
  ]
})
export class AppModule { }
