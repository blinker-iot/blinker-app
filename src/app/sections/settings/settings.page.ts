import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { ViewService } from '../../core/services/view.service';
import {
  LanguageOption,
  TranslationService,
} from '../../core/services/translation.service';
import { LanguageCode } from '../../core/services/translation.loader';
import { AppTheme } from '../../core/theme/theme';
import { HeroCardComponent } from '../../core/components/hero-card/hero-card.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [IonicModule, TranslatePipe, HeroCardComponent],
})
export class SettingsPage {
  readonly languageList: readonly LanguageOption[];
  readonly defaultBackHref: string;

  get currentTheme(): AppTheme {
    return this.viewService.theme;
  }

  get currentLanguage(): LanguageCode {
    return this.translationService.getSelectedLanguage();
  }

  constructor(
    private viewService: ViewService,
    private translationService: TranslationService,
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

  getLanguageImage(language: LanguageCode): string {
    return this.translationService.getLanguageImage(language);
  }
}
