import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { locale as enLang } from 'src/app/configs/i18n/en';
import { locale as chLang } from 'src/app/configs/i18n/ch';
import { CONFIG } from 'src/app/configs/app.config';

export interface Locale {
  lang: string;
  data: Object;
}

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  language;
  constructor(private translate: TranslateService) {
  }

  init() {
    this.translate.setDefaultLang(CONFIG.I18N.DEFAULT);
    this.translate.setTranslation(enLang.lang, enLang.data, true);
    this.translate.setTranslation(chLang.lang, chLang.data, true);
    if (CONFIG.I18N.ENABLE)
      this.setLanguage(this.getSelectedLanguage());
  }

  setLanguage(lang) {
    if (lang) {
      this.translate.use(this.translate.getDefaultLang());
      this.translate.use(lang);
      localStorage.setItem('language', lang);
    }
  }

  getLanguageList() {
    return this.translate.getLangs()
  }

  getSelectedLanguage() {
    return localStorage.getItem('language') || this.translate.getDefaultLang();
  }
}
