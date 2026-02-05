import { ApplicationConfig, Injectable, importProvidersFrom } from '@angular/core';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { HAMMER_GESTURE_CONFIG, HammerGestureConfig } from '@angular/platform-browser';

import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { PermissionService } from 'src/app/core/services/permission.service';
import { PusherService } from 'src/app/core/services/pusher.service';
import { ServerInterceptor } from './core/injectable/server.interceptor';
import { ViewService } from './core/services/view.service';
import { DataService } from './core/services/data.service';
import { AuthService } from './core/services/auth.service';
import { AdddeviceService } from './sections/adddevice/adddevice.service';
import { NetworkService } from './core/services/network.service';
import { ImageService } from './core/services/image.service';

import { routes } from './app.routes';
import { provideMarkdown } from 'ngx-markdown';
import { TranslateModule } from '@ngx-translate/core';

declare var Hammer: any;
@Injectable()
export class MyHammerConfig extends HammerGestureConfig {
  override overrides = <any>{
    'pan': { direction: Hammer.DIRECTION_ALL, threshold: 5 },
    'press': { time: 500, threshold: 99 }
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideIonicAngular({
      mode: 'ios',
      scrollAssist: true,
      scrollPadding: false
    }),
    provideAnimations(),
    provideHttpClient(withInterceptorsFromDi()),
    provideMarkdown(),
    importProvidersFrom(TranslateModule.forRoot()),
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
    ViewService,
    PermissionService,
    PusherService,
    ImageService,
  ]
};
