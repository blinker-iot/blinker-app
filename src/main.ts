import { enableProdMode, provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { defineCustomElement as defineIonBackButton } from '@ionic/core/components/ion-back-button.js';
import { defineCustomElement as defineIonPopover } from '@ionic/core/components/ion-popover.js';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

// Legacy IonicModule pages still use the Angular ion-back-button wrapper,
// while the app itself is bootstrapped with the standalone Ionic providers.
// Register the underlying web component once so every routed header hydrates.
defineIonBackButton();
defineIonPopover();

// Keep Android's existing inset behavior, but let the iOS web view paint
// behind the status bar. Page-level safe-area padding still keeps headers and
// controls below the Dynamic Island while their backgrounds fill the top edge.
if (Capacitor.getPlatform() === 'ios') {
  void StatusBar.setOverlaysWebView({ overlay: true });
  void StatusBar.setStyle({ style: Style.Light });
}

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [provideZoneChangeDetection(), ...appConfig.providers],
}).catch((err) => console.log(err));
