import { ApplicationConfig } from '@angular/core';
import {
  RouteReuseStrategy,
  provideRouter,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import {
  IonicRouteStrategy,
  provideIonicAngular,
} from '@ionic/angular/standalone';
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptors,
  withInterceptorsFromDi,
  withXhr,
} from '@angular/common/http';
import { EVENT_MANAGER_PLUGINS } from '@angular/platform-browser';

import { DeviceService } from 'src/app/core/services/device.service';
import { UserService } from 'src/app/core/services/user.service';
import { NoticeService } from 'src/app/core/services/notice.service';
import { PermissionService } from 'src/app/core/services/permission.service';
import { PusherService } from 'src/app/core/services/pusher.service';
import { ServerInterceptor } from './core/injectable/server.interceptor';
import { ViewService } from './core/services/view.service';
import { DataService } from './core/services/data.service';
import { AuthService } from './core/services/auth.service';
import { NetworkService } from './core/services/network.service';
import { ImageService } from './core/services/image.service';
import { HammerGesturesPlugin } from './core/injectable/hammer-gestures.plugin';
import { CONFIG } from './configs/app.config';

import { routes } from './app.routes';
import { provideMarkdown } from 'ngx-markdown';
import {
  provideTranslateLoader,
  provideTranslateService,
} from '@ngx-translate/core';
import { StaticTranslationLoader } from './core/services/translation.loader';
import { gatewayInterceptor } from './core/gateway/gateway.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideIonicAngular({
      mode: 'ios',
      scrollAssist: true,
      scrollPadding: false,
    }),
    provideHttpClient(
      withXhr(),
      withInterceptors([gatewayInterceptor]),
      withInterceptorsFromDi()
    ),
    provideMarkdown(),
    provideTranslateService({
      fallbackLang: CONFIG.I18N.DEFAULT,
      loader: provideTranslateLoader(StaticTranslationLoader),
    }),
    {
      provide: EVENT_MANAGER_PLUGINS,
      useClass: HammerGesturesPlugin,
      multi: true,
    },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: HTTP_INTERCEPTORS, useClass: ServerInterceptor, multi: true },
    AuthService,
    DataService,
    UserService,
    DeviceService,
    NetworkService,
    NoticeService,
    ViewService,
    PermissionService,
    PusherService,
    ImageService,
  ],
};
