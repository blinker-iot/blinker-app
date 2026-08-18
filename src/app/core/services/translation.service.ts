import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
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

const TIME_ZONE_LANGUAGE_MAP: Readonly<Partial<Record<string, LanguageCode>>> = {
  // Chinese time zones
  'Asia/Shanghai': 'zh_cn',
  'Asia/Chongqing': 'zh_cn',
  'Asia/Harbin': 'zh_cn',
  'Asia/Urumqi': 'zh_cn',
  'Asia/Beijing': 'zh_cn',
  PRC: 'zh_cn',
  'Asia/Hong_Kong': 'zh_hk',
  'Asia/Macau': 'zh_hk',
  'Asia/Taipei': 'zh_hk',

  // Other supported languages with an unambiguous primary time zone
  'Asia/Tokyo': 'ja',
  'Asia/Seoul': 'ko',
  'Asia/Pyongyang': 'ko',
  'Europe/Berlin': 'de',
  'Europe/Vienna': 'de',
  'Europe/Madrid': 'es',
  'Europe/Paris': 'fr',
  'Europe/Lisbon': 'pt',
  'Europe/Moscow': 'ru',
  'Africa/Cairo': 'ar',
  'Asia/Baghdad': 'ar',
  'Asia/Dubai': 'ar',
  'Asia/Riyadh': 'ar',
};

export function getLanguageForTimeZone(timeZone: string | undefined): LanguageCode {
  if (!timeZone) return 'en';
  return TIME_ZONE_LANGUAGE_MAP[timeZone] || 'en';
}

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
    const selectedLanguage = this.getSelectedLanguage();
    this.translate.setFallbackLang(selectedLanguage);
    await this.setLanguage(selectedLanguage);
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

    return this.getTimeZoneLanguage();
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

  private getTimeZoneLanguage(): LanguageCode {
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return getLanguageForTimeZone(timeZone);
    } catch {
      return 'en';
    }
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
