import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { ViewService } from '../../core/services/view.service';
import { TranslationService } from '../../core/services/translation.service';
import type { LanguageCode } from '../../core/services/translation.loader';
import { setServiceRegion } from '../../configs/service-region.config';
import { SettingsPage } from './settings.page';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('Settings grouped production UI and existing preference actions', () => {
  let originalRegion: string | null;
  beforeEach(() => {
    originalRegion = localStorage.getItem('service-region');
    setServiceRegion('China');
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    if (originalRegion === null) localStorage.removeItem('service-region');
    else localStorage.setItem('service-region', originalRegion);
  });

  async function render(from = '') {
    let language: LanguageCode = 'en';
    const translations = {
      getLanguageList: () => [{ code: 'en', name: 'English' }, { code: 'zh_cn', name: '简体中文' }],
      getSelectedLanguage: () => language,
      setLanguage: vi.fn(async (next: LanguageCode) => { language = next; }),
    };
    const view = { theme: 'light', setTheme: vi.fn((theme: string) => { view.theme = theme; }) };
    const auth = { logout: vi.fn(async (_region: string) => undefined) };
    await TestBed.configureTestingModule({ imports: [SettingsPage], providers: [
      provideRouter([]), provideIonicAngular({ animated: false }), provideTranslateService(),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => from } } } },
      { provide: ViewService, useValue: view },
      { provide: TranslationService, useValue: translations },
      { provide: AuthService, useValue: auth },
    ] }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('ui2-test', { SETTINGS: {
      TITLE: '设置', LANGUAGE_SECTION: '语言', LANGUAGE_HINT: '选择界面语言',
      APPEARANCE: '外观', THEME_HINT: '选择显示风格', LIGHT: '浅色', DARK: '深色',
      LIGHT_DESC: '明亮', DARK_DESC: '柔和', SAVED_HINT: '选择自动保存',
      SERVICE_REGION: '服务地区', SERVICE_REGION_HINT: '切换后需要重新登录',
      LANGUAGE_SAVE_FAILED: '未能应用语言，请重试', REGION_CHANGE_FAILED: '切换未完成，请核对后重试',
    } });
    translate.use('ui2-test');
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, page: fixture.componentInstance, translations, view, auth };
  }

  it.each([['', '/home/profile'], ['login', '/login']])('preserves the %s return destination', async (from, href) => {
    const f = await render(from);
    expect(f.page.defaultBackHref).toBe(href);
    expect(f.element.querySelector('ion-back-button')?.getAttribute('ng-reflect-default-href')
      ?? (f.element.querySelector('ion-back-button') as any)?.defaultHref).toBe(href);
  });

  it('opens low-frequency choices without changing any preference or service scope', async () => {
    const f = await render();
    const details = Array.from(f.element.querySelectorAll<HTMLDetailsElement>('details'));
    expect(details).toHaveLength(3);
    expect(details.every(detail => !detail.open)).toBe(true);
    details.forEach(detail => detail.open = true);
    f.fixture.detectChanges();
    expect(f.translations.setLanguage).not.toHaveBeenCalled();
    expect(f.view.setTheme).not.toHaveBeenCalled();
    expect(f.auth.logout).not.toHaveBeenCalled();
    for (const fieldset of f.element.querySelectorAll('fieldset')) {
      for (const id of (fieldset.getAttribute('aria-labelledby') || '').split(' ')) {
        expect(f.element.querySelector(`#${id}`)?.textContent?.trim()).toBeTruthy();
      }
    }
    expect(f.element.querySelector('#service-region-hint')?.textContent).toContain('重新登录');
    expect(Array.from(f.element.querySelectorAll<HTMLInputElement>('input[name="app-theme"]')).map(el => el.value))
      .toEqual(['light', 'dark']);
  });

  it('applies theme immediately through the existing service without switching account or language', async () => {
    const f = await render();
    f.element.querySelector<HTMLInputElement>('input[name="app-theme"][value="dark"]')!.click();
    await f.fixture.whenStable();
    expect(f.view.setTheme).toHaveBeenCalledExactlyOnceWith('dark');
    expect(f.page.currentTheme).toBe('dark');
    expect(f.translations.setLanguage).not.toHaveBeenCalled();
    expect(f.auth.logout).not.toHaveBeenCalled();
    f.page.selectTheme('system' as any);
    expect(f.view.setTheme).toHaveBeenCalledOnce();
  });

  it('uses supported native language choices and saves only a changed selection', async () => {
    const f = await render();
    expect(f.page.currentLanguageName).toBe('English');
    f.element.querySelector<HTMLInputElement>('input[name="app-language"][value="zh_cn"]')!.click();
    await f.fixture.whenStable();
    expect(f.translations.setLanguage).toHaveBeenCalledExactlyOnceWith('zh_cn');
    expect(f.page.currentLanguageName).toBe('简体中文');
    await f.page.selectLanguage('zh_cn');
    await f.page.selectLanguage('invalid' as any);
    expect(f.translations.setLanguage).toHaveBeenCalledOnce();
    expect(f.auth.logout).not.toHaveBeenCalled();
  });

  it('blocks duplicate language changes while pending and restores the real radio on failure', async () => {
    const f = await render(), pending = deferred();
    f.translations.setLanguage.mockReturnValueOnce(pending.promise);
    const next = f.element.querySelector<HTMLInputElement>('input[name="app-language"][value="zh_cn"]')!;
    next.click(); f.fixture.detectChanges();
    expect(f.page.languageSaving).toBe(true);
    expect(f.element.querySelector<HTMLFieldSetElement>('.language-options')!.disabled).toBe(true);
    expect(next.checked).toBe(true);
    await f.page.selectLanguage('zh_cn');
    expect(f.translations.setLanguage).toHaveBeenCalledOnce();
    pending.reject(new Error('offline'));
    await vi.waitFor(() => expect(f.element.querySelector<HTMLInputElement>('input[name="app-language"][value="en"]')!.checked).toBe(true));
    expect(f.page.languageSaving).toBe(false);
    expect(f.page.currentLanguage).toBe('en');
    expect(f.element.querySelector<HTMLInputElement>('input[name="app-language"][value="en"]')!.checked).toBe(true);
    expect(next.checked).toBe(false);
    expect(f.element.querySelector('[role="alert"]')?.textContent).toContain('请重试');
    f.translations.setLanguage.mockResolvedValueOnce(undefined);
    await f.page.selectLanguage('zh_cn'); f.fixture.detectChanges();
    expect(f.element.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps the region logout contract, busy exclusion and failure recovery without promising migration', async () => {
    const f = await render(), pending = deferred();
    f.auth.logout.mockReturnValueOnce(pending.promise);
    const next = f.element.querySelector<HTMLInputElement>('input[name="service-region"][value="Global"]')!;
    next.click(); f.fixture.detectChanges();
    expect(f.auth.logout).toHaveBeenCalledExactlyOnceWith('Global');
    expect(f.page.currentRegion).toBe('China');
    expect(f.page.selectedRegion).toBe('Global');
    expect(f.element.querySelector<HTMLFieldSetElement>('.service-region-options')!.disabled).toBe(true);
    await f.page.selectRegion('Development');
    expect(f.auth.logout).toHaveBeenCalledOnce();
    pending.reject(new Error('unavailable'));
    await vi.waitFor(() => expect(f.element.querySelector<HTMLInputElement>('input[name="service-region"][value="China"]')!.checked).toBe(true));
    expect(f.page.switchingRegion).toBe(false);
    expect(f.page.regionChangeFailed).toBe(true);
    expect(f.element.querySelector<HTMLInputElement>('input[name="service-region"][value="China"]')!.checked).toBe(true);
    expect(next.checked).toBe(false);
    expect(f.element.querySelector('[role="alert"]')?.textContent).toContain('核对');
    await f.page.selectRegion('China');
    await f.page.selectRegion('invalid' as any);
    expect(f.auth.logout).toHaveBeenCalledOnce();
    f.auth.logout.mockResolvedValueOnce(undefined);
    await f.page.selectRegion('Global');
    expect(f.auth.logout).toHaveBeenCalledTimes(2);
    expect(f.page.regionChangeFailed).toBe(false);
  });

  it('renders a delayed accepted language without another user event', async () => {
    const f = await render(), pending = deferred();
    f.translations.setLanguage.mockReturnValueOnce(pending.promise);
    f.element.querySelector<HTMLInputElement>('input[name="app-language"][value="zh_cn"]')!.click();
    f.fixture.detectChanges();
    expect(f.element.querySelector('summary ion-spinner')).not.toBeNull();
    vi.spyOn(f.translations, 'getSelectedLanguage').mockReturnValue('zh_cn');
    pending.resolve();
    await vi.waitFor(() => expect(f.element.querySelector('summary ion-spinner')).toBeNull());
    expect(f.page.currentLanguageName).toBe('简体中文');
    expect(f.element.querySelector<HTMLInputElement>('input[name="app-language"][value="zh_cn"]')!.checked).toBe(true);
    expect(f.element.querySelector('.row-value')?.textContent).toContain('简体中文');
  });
});
