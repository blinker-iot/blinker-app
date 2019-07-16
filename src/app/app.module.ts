import { NgModule, ErrorHandler } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { IonicApp, IonicModule, IonicErrorHandler } from 'ionic-angular';
import { MyApp } from './app.component';
import { StatusBar } from '@ionic-native/status-bar';
import { SplashScreen } from '@ionic-native/splash-screen';
import { IonicStorageModule } from '@ionic/storage';
import { ComponentsModule } from '../components/components.module';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FileTransfer, FileTransferObject } from '@ionic-native/file-transfer';
import { File } from '@ionic-native/file';

import { LoginPage } from '../pages/login/login';
// import { RegisterPage } from '../pages/register/register';
// import { RetrievePage } from '../pages/retrieve/retrieve';
import { DeviceLoadingPage } from '../pages/device-loading/device-loading';
// import { AutoPage } from '../pages/auto/auto';
import { UserPage } from '../pages/user/user';
import { HomePage } from '../pages/home/home';
import { TabsPage } from '../pages/tabs/tabs';
import { DeviceProvider } from '../providers/device/device';
import { UserProvider } from '../providers/user/user';
import { Zeroconf } from '@ionic-native/zeroconf';
import { Network } from '@ionic-native/network';
import { Camera } from '@ionic-native/camera';
import { ServerInterceptor } from '../injectable/server.interceptor';
import { NoticeProvider } from '../providers/notice/notice';
import { AmapProvider } from '../providers/weather/amap';
import { HeweatherProvider } from '../providers/weather/heweather';
import { Geolocation } from '@ionic-native/geolocation';
import { BLE } from '@ionic-native/ble';
import { Diagnostic } from '@ionic-native/diagnostic';
import { OpenNativeSettings } from '@ionic-native/open-native-settings';
import { PusherProvider } from '../providers/pusher/pusher';
import { Autostart } from '@ionic-native/autostart';
import { AppMinimize } from '@ionic-native/app-minimize';
import { SpeechProvider } from '../providers/speech/speech';
import { AutoProvider } from '../providers/auto/auto';
import { GridsterModule } from 'angular-gridster2';
import { NativeProvider } from '../providers/native/native';
import { JPush } from '@jiguang-ionic/jpush';
import { Deeplinks } from '@ionic-native/deeplinks';

@NgModule({
  declarations: [
    MyApp,
    LoginPage,
    // RegisterPage,
    // RetrievePage,
    UserPage,
    HomePage,
    // AutoPage,
    TabsPage,
    DeviceLoadingPage
  ],
  imports: [
    BrowserModule,
    IonicModule.forRoot(MyApp, { 
      tabsHideOnSubPages: true,
      backButtonText: '',
      iconMode: 'ios',
      mode:'ios'
     }),
    IonicStorageModule.forRoot(),
    ComponentsModule,
    HttpClientModule,
    GridsterModule,
  ],
  bootstrap: [IonicApp],
  entryComponents: [
    MyApp,
    LoginPage,
    // RegisterPage,
    // RetrievePage,
    UserPage,
    // AutoPage,
    HomePage,
    TabsPage,
    DeviceLoadingPage
  ],
  providers: [
    FileTransfer,
    File,
    FileTransferObject,
    StatusBar,
    SplashScreen,
    Zeroconf,
    Network,
    { provide: ErrorHandler, useClass: IonicErrorHandler },
    { provide: HTTP_INTERCEPTORS, useClass: ServerInterceptor, multi: true },
    UserProvider,
    DeviceProvider,
    Camera,
    NoticeProvider,
    AmapProvider,
    HeweatherProvider,
    Geolocation,
    Autostart,
    AppMinimize,
    BLE,
    Diagnostic,
    OpenNativeSettings,
    PusherProvider,
    SpeechProvider,
    AutoProvider,
    NativeProvider,
    JPush,
    Deeplinks
  ]
})
export class AppModule { }
