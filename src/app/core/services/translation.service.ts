import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { CONFIG } from 'src/app/configs/app.config';
import {
  LanguageCode,
  SUPPORTED_LANGUAGE_CODES,
} from './translation.loader';

export interface LanguageOption {
  name: string;
  code: LanguageCode;
}

const LEGACY_LANGUAGE_CODES: Readonly<Record<string, LanguageCode>> = {
  ch: 'zh_cn',
  '中文': 'zh_cn',
  '简体中文': 'zh_cn',
  English: 'en',
};

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGE_CODES);

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private readonly languageList: LanguageOption[] = [];

  constructor(
    private translate: TranslateService,
    private http: HttpClient
  ) {}

  async init(): Promise<void> {
    await this.loadLanguageList();
    this.translate.addLangs(this.languageList.map(({ code }) => code));
    this.translate.setFallbackLang(CONFIG.I18N.DEFAULT);

    if (CONFIG.I18N.ENABLE) {
      await this.setLanguage(this.getSelectedLanguage());
    }
  }

  async setLanguage(language: string): Promise<void> {
    const code = this.normalizeLanguageCode(language);
    if (!code) return;

    await firstValueFrom(this.translate.use(code));
    localStorage.setItem('language', code);

    if (typeof document !== 'undefined') {
      document.documentElement.lang = code.replace('_', '-');
      document.documentElement.dir = 'ltr';
    }
  }

  getLanguageList(): readonly LanguageOption[] {
    return this.languageList;
  }

  getSelectedLanguage(): LanguageCode {
    const storedLanguage = localStorage.getItem('language');
    const normalizedStoredLanguage = this.normalizeLanguageCode(storedLanguage);
    if (normalizedStoredLanguage) {
      return normalizedStoredLanguage;
    }

    return this.getSystemLanguage()
      || this.normalizeLanguageCode(this.translate.getFallbackLang())
      || CONFIG.I18N.DEFAULT;
  }

  getLanguageImage(code: LanguageCode): string {
    return `i18n/${code}/${code}.jpg`;
  }

  private async loadLanguageList(): Promise<void> {
    try {
      const languageList = await firstValueFrom(
        this.http.get<LanguageOption[]>('i18n/i18n.json')
      );
      const supportedLanguages = languageList.filter(({ code }) =>
        SUPPORTED_LANGUAGE_SET.has(code)
      );
      this.languageList.splice(0, this.languageList.length, ...supportedLanguages);
    } catch (error) {
      console.error('Failed to load the language list:', error);
      this.languageList.splice(
        0,
        this.languageList.length,
        { name: '中文简体', code: 'zh_cn' },
        { name: 'English', code: 'en' }
      );
    }
  }

  private getSystemLanguage(): LanguageCode | undefined {
    if (typeof navigator === 'undefined') return undefined;

    const locales = navigator.languages?.length
      ? navigator.languages
      : [navigator.language];

    for (const locale of locales) {
      const normalizedLocale = locale.toLowerCase().replace(/-/g, '_');
      if (normalizedLocale.startsWith('zh_')) {
        return /zh_(hant|hk|mo|tw)/.test(normalizedLocale) ? 'zh_hk' : 'zh_cn';
      }

      const languageCode = normalizedLocale.split('_')[0];
      if (SUPPORTED_LANGUAGE_SET.has(languageCode)) {
        return languageCode as LanguageCode;
      }
    }

    return undefined;
  }

  private normalizeLanguageCode(
    language: string | null | undefined
  ): LanguageCode | undefined {
    if (!language) return undefined;

    const migratedCode =
      LEGACY_LANGUAGE_CODES[language]
      || language.toLowerCase().replace(/-/g, '_');
    if (SUPPORTED_LANGUAGE_SET.has(migratedCode)) {
      return migratedCode as LanguageCode;
    }

    return undefined;
  }
}
