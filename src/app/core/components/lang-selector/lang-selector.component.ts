import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

import { TranslationService } from '../../services/translation.service';
import { CONFIG } from 'src/app/configs/app.config';
import { LanguageCode } from '../../services/translation.loader';

@Component({
  standalone: true,
  imports: [],
  selector: 'blinker-lang-selector',
  templateUrl: './lang-selector.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./lang-selector.component.scss'],
})
export class LangSelectorComponent implements OnInit {
  supportI18n = false;
  languageList = this.translationService.getLanguageList();
  selectedLanguage: LanguageCode = CONFIG.I18N.DEFAULT;

  showMore = false;

  constructor(private translationService: TranslationService) {}

  ngOnInit() {
    this.getLanguageSetting();
    this.supportI18n = CONFIG.I18N.ENABLE;
  }

  async changeLanguage(lang: LanguageCode): Promise<void> {
    await this.translationService.setLanguage(lang);
    this.getLanguageSetting();
  }

  getLanguageImage(lang: LanguageCode): string {
    return this.translationService.getLanguageImage(lang);
  }

  getLanguageName(lang: LanguageCode): string {
    return this.languageList.find(({ code }) => code === lang)?.name || lang;
  }

  getLanguageSetting() {
    this.selectedLanguage = this.translationService.getSelectedLanguage();
  }
}
