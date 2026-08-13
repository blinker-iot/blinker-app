import { enableProdMode, provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { defineCustomElement as defineIonBackButton } from '@ionic/core/components/ion-back-button.js';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

// Legacy IonicModule pages still use the Angular ion-back-button wrapper,
// while the app itself is bootstrapped with the standalone Ionic providers.
// Register the underlying web component once so every routed header hydrates.
defineIonBackButton();

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [provideZoneChangeDetection(), ...appConfig.providers],
}).catch((err) => console.log(err));
