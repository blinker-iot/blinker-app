import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LanguageOption,
  TranslationService,
} from '../../core/services/translation.service';
import { LanguageCode } from '../../core/services/translation.loader';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [IonicModule, TranslatePipe],
})
export class SettingsPage {
  readonly languageList: readonly LanguageOption[];
  readonly defaultBackHref: string;

  get currentLanguage(): LanguageCode {
    return this.translationService.getSelectedLanguage();
  }

  constructor(
    private translationService: TranslationService,
    route: ActivatedRoute
  ) {
    this.languageList = this.translationService.getLanguageList();
    this.defaultBackHref =
      route.snapshot.queryParamMap.get('from') === 'login' ? '/login' : '/home';
  }

  selectLanguage(language: LanguageCode): void {
    void this.translationService.setLanguage(language);
  }

  getLanguageImage(language: LanguageCode): string {
    return this.translationService.getLanguageImage(language);
  }
}
