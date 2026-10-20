import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { ViewService } from '../../core/services/view.service';
import {
  LanguageOption,
  TranslationService,
} from '../../core/services/translation.service';
import { LanguageCode } from '../../core/services/translation.loader';
import { AppTheme } from '../../core/theme/theme';
import {
  getServiceRegion,
  SERVICE_REGIONS,
  ServiceRegion,
} from '../../configs/service-region.config';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    TranslatePipe,
  ],
})
export class SettingsPage {
  readonly languageList: readonly LanguageOption[];
  readonly defaultBackHref: string;
  readonly serviceRegions = SERVICE_REGIONS;

  switchingRegion = false;

  get currentTheme(): AppTheme {
    return this.viewService.theme;
  }

  get currentLanguage(): LanguageCode {
    return this.translationService.getSelectedLanguage();
  }

  get currentRegion(): ServiceRegion {
    return getServiceRegion();
  }

  constructor(
    private viewService: ViewService,
    private translationService: TranslationService,
    private authService: AuthService,
    route: ActivatedRoute
  ) {
    this.languageList = this.translationService.getLanguageList();
    this.defaultBackHref =
      route.snapshot.queryParamMap.get('from') === 'login'
        ? '/login'
        : '/home/profile';
  }

  selectTheme(theme: AppTheme): void {
    this.viewService.setTheme(theme);
  }

  selectLanguage(language: LanguageCode): void {
    void this.translationService.setLanguage(language);
  }

  async selectRegion(region: ServiceRegion): Promise<void> {
    if (this.switchingRegion || region === this.currentRegion) return;

    this.switchingRegion = true;

    try {
      await this.authService.logout(region);
    } finally {
      this.switchingRegion = false;
    }
  }

  getLanguageImage(language: LanguageCode): string {
    return this.translationService.getLanguageImage(language);
  }
}
