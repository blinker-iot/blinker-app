import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSpinner,
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
    IonSpinner,
    IonTitle,
    IonToolbar,
    TranslatePipe,
  ],
})
export class SettingsPage {
  readonly languageList: readonly LanguageOption[];
  readonly defaultBackHref: string;
  readonly serviceRegions = SERVICE_REGIONS;

  languageSaveFailed = false;
  regionChangeFailed = false;
  private readonly pendingLanguage = signal<LanguageCode | undefined>(undefined);
  private readonly pendingRegion = signal<ServiceRegion | undefined>(undefined);

  get languageSaving(): boolean {
    return this.pendingLanguage() !== undefined;
  }

  get switchingRegion(): boolean {
    return this.pendingRegion() !== undefined;
  }

  get currentTheme(): AppTheme {
    return this.viewService.theme;
  }

  get currentLanguage(): LanguageCode {
    return this.translationService.getSelectedLanguage();
  }

  get currentLanguageName(): string {
    return this.languageList.find(language => language.code === this.currentLanguage)?.name
      || this.currentLanguage;
  }

  get selectedLanguage(): LanguageCode {
    return this.pendingLanguage() ?? this.currentLanguage;
  }

  get selectedRegion(): ServiceRegion {
    return this.pendingRegion() ?? this.currentRegion;
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
    if (theme !== 'light' && theme !== 'dark') return;
    this.viewService.setTheme(theme);
  }

  async selectLanguage(language: LanguageCode): Promise<void> {
    if (this.languageSaving || language === this.currentLanguage
      || !this.languageList.some(option => option.code === language)) return;
    this.pendingLanguage.set(language);
    this.languageSaveFailed = false;
    try {
      await this.translationService.setLanguage(language);
    } catch {
      this.languageSaveFailed = true;
    } finally {
      this.pendingLanguage.set(undefined);
    }
  }

  async selectRegion(region: ServiceRegion): Promise<void> {
    if (this.switchingRegion || region === this.currentRegion || !this.serviceRegions.includes(region)) return;

    this.pendingRegion.set(region);
    this.regionChangeFailed = false;

    try {
      await this.authService.logout(region);
    } catch {
      this.regionChangeFailed = true;
    } finally {
      this.pendingRegion.set(undefined);
    }
  }
}
