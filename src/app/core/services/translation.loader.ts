import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { TranslateLoader, TranslationObject } from '@ngx-translate/core';
import { Observable, throwError } from 'rxjs';

export const SUPPORTED_LANGUAGE_CODES = [
  'zh_cn',
  'zh_hk',
  'en',
  'ar',
  'de',
  'es',
  'fr',
  'ja',
  'ko',
  'pt',
  'ru',
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGE_CODES);

@Injectable()
export class StaticTranslationLoader extends TranslateLoader {
  private readonly http = inject(HttpClient);

  override getTranslation(lang: string): Observable<TranslationObject> {
    if (!SUPPORTED_LANGUAGE_SET.has(lang)) {
      return throwError(() => new Error(`Unsupported language: ${lang}`));
    }

    return this.http.get<TranslationObject>(`i18n/${lang}/${lang}.json`);
  }
}
