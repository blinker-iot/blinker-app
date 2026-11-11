import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertController, ModalController, provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { CONFIG } from '../configs/app.config';
import { DocPage } from '../core/pages/doc/doc.page';
import { GeocodingService } from '../core/services/geocoding.service';
import { ThirdPartyServicesService } from '../core/services/third-party-services.service';
import { WeatherService } from '../core/services/weather.service';
import { AboutPage } from './about/about.page';
import { ThirdPartyServicesPage } from './third-party-services/third-party-services.page';

// Production Angular templates and their existing handlers; all persistence,
// validation and overlays below are local doubles, never real keys or requests.
const weatherKeys = () => ({ seniverse: 'saved-weather', openWeather: 'saved-open', weatherApi: '', visualCrossing: '' });
const geolocationKeys = () => ({ tianditu: 'saved-location', geoapify: 'saved-geo', locationIq: '' });
const groups = [
  { name: 'weather', select: '#active-weather-provider', prefix: 'weather', first: 'seniverse', second: 'openWeather', index: 0 },
  { name: 'geolocation', select: '#active-geolocation-provider', prefix: 'geolocation', first: 'tianditu', second: 'geoapify', index: 1 },
] as const;

function normalize<T extends { selectedProvider: string; keys: object }>(config: T): T {
  // Match the existing service's trim contract, without writing localStorage.
  return { ...config, keys: Object.fromEntries(Object.entries(config.keys).map(([key, value]) => [key, String(value).trim()])) } as T;
}

async function renderServices() {
  const weatherValidation = new Subject<boolean>(), geolocationValidation = new Subject<boolean>();
  const services = {
    getWeatherServiceConfig: vi.fn(() => ({ selectedProvider: 'seniverse', keys: weatherKeys() })),
    getGeolocationServiceConfig: vi.fn(() => ({ selectedProvider: 'tianditu', keys: geolocationKeys() })),
    saveWeatherServiceConfig: vi.fn(normalize), saveGeolocationServiceConfig: vi.fn(normalize),
    clearWeatherServiceConfig: vi.fn(), clearGeolocationServiceConfig: vi.fn(),
  };
  const weather = { validateCurrentService: vi.fn(() => weatherValidation) };
  const geocoding = { validateCurrentService: vi.fn(() => geolocationValidation) };
  const present = vi.fn(async () => undefined);
  const alerts = { create: vi.fn(async (_options: any) => ({ present })) };
  await TestBed.configureTestingModule({ imports: [ThirdPartyServicesPage], providers: [
    provideRouter([]), provideIonicAngular({ animated: false }),
    { provide: ThirdPartyServicesService, useValue: services },
    { provide: WeatherService, useValue: weather }, { provide: GeocodingService, useValue: geocoding },
    { provide: AlertController, useValue: alerts },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(ThirdPartyServicesPage);
  fixture.autoDetectChanges(); await fixture.whenStable();
  return { fixture, page: fixture.componentInstance, element: fixture.nativeElement as HTMLElement,
    services, weather, geocoding, weatherValidation, geolocationValidation, alerts, present };
}

async function type(fixture: ComponentFixture<unknown>, input: HTMLInputElement, value: string) {
  input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
  await fixture.whenStable();
}

async function select(fixture: ComponentFixture<unknown>, input: HTMLSelectElement, index: number) {
  input.value = input.options[index].value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await fixture.whenStable();
}

function identifiedInput(element: HTMLElement, id: string): HTMLInputElement | undefined {
  // `name` is an NgModel directive input here. Locate the native field by its
  // real, label-associated id rather than assuming name attribute reflection.
  return Array.from(element.querySelectorAll<HTMLInputElement>('input')).find(input => input.id === id);
}

describe('UI34 support pages retain their existing data and interaction contracts', () => {
  afterEach(() => TestBed.resetTestingModule());

  for (const group of groups) {
    it(`${group.name}: restores saved keys masked and toggles only this provider's visibility`, async () => {
      const f = await renderServices();
      const input = () => identifiedInput(f.element, `${group.prefix}-${group.first}`)!;
      const form = f.element.querySelectorAll<HTMLFormElement>('form.service-card')[group.index];
      expect(input().type).toBe('password');
      expect(input().value).toBe(group.index === 0 ? 'saved-weather' : 'saved-location');
      expect(form.querySelector('.key-toggle')?.getAttribute('aria-label')).toContain('显示');
      form.querySelector<HTMLButtonElement>('.key-toggle')!.click(); await f.fixture.whenStable();
      expect(input().type).toBe('text');
      expect(form.querySelector('.key-toggle')?.getAttribute('aria-label')).toContain('隐藏');
      const other = f.element.querySelectorAll<HTMLFormElement>('form.service-card')[1 - group.index];
      expect(other.querySelector<HTMLInputElement>('input')?.type).toBe('password');
      expect(f.services.saveWeatherServiceConfig).not.toHaveBeenCalled();
      expect(f.services.saveGeolocationServiceConfig).not.toHaveBeenCalled();
    });

    it(`${group.name}: provider switching preserves exact unsaved input and does not save`, async () => {
      const f = await renderServices();
      const input = () => identifiedInput(f.element, `${group.prefix}-${group.first}`)!;
      const selector = f.element.querySelector<HTMLSelectElement>(group.select)!;
      const exact = '  LOCAL_FIXTURE_KEY with spaces  ';
      await type(f.fixture, input(), exact);
      await select(f.fixture, selector, 1);
      expect(identifiedInput(f.element, `${group.prefix}-${group.first}`)).toBeUndefined();
      expect(identifiedInput(f.element, `${group.prefix}-${group.second}`)?.value)
        .toBe(group.index === 0 ? 'saved-open' : 'saved-geo');
      await select(f.fixture, selector, 0);
      expect(input().value).toBe(exact);
      expect(f.services.saveWeatherServiceConfig).not.toHaveBeenCalled();
      expect(f.services.saveGeolocationServiceConfig).not.toHaveBeenCalled();
    });

    it(`${group.name}: validation stays busy until its result, and false retains the saved normalized key`, async () => {
      const f = await renderServices();
      const form = f.element.querySelectorAll<HTMLFormElement>('form.service-card')[group.index];
      const input = form.querySelector<HTMLInputElement>('input')!;
      const exact = '  LOCAL_FIXTURE_validation  ';
      await type(f.fixture, input, exact);
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await f.fixture.whenStable();
      const save = group.index === 0 ? f.services.saveWeatherServiceConfig : f.services.saveGeolocationServiceConfig;
      const validator = group.index === 0 ? f.weather : f.geocoding;
      expect(save).toHaveBeenCalledTimes(1);
      expect((save.mock.calls[0][0].keys as Record<string, string>)[group.first]).toBe(exact);
      expect(form.querySelector<HTMLButtonElement>('.save-button')?.disabled).toBe(true);
      expect(form.querySelector('[role="status"]')?.textContent).toContain('验证中');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await f.fixture.whenStable();
      expect(save).toHaveBeenCalledTimes(1); expect(validator.validateCurrentService).toHaveBeenCalledTimes(1);
      (group.index === 0 ? f.weatherValidation : f.geolocationValidation).next(false);
      await f.fixture.whenStable();
      expect(form.querySelector<HTMLButtonElement>('.save-button')?.disabled).toBe(false);
      expect(form.querySelector('[role="status"]')?.textContent).toContain('验证失败');
      expect(form.querySelector<HTMLInputElement>('input')?.value).toBe(exact.trim());
      expect(form.querySelector<HTMLInputElement>('input')?.type).toBe('password');
      expect(f.services.clearWeatherServiceConfig).not.toHaveBeenCalled();
      expect(f.services.clearGeolocationServiceConfig).not.toHaveBeenCalled();
    });

    it(`${group.name}: opening clear exposes a non-mutating cancel option and preserves the draft`, async () => {
      const f = await renderServices();
      const form = f.element.querySelectorAll<HTMLFormElement>('form.service-card')[group.index];
      const exact = '  LOCAL_FIXTURE_unsaved  ';
      await type(f.fixture, form.querySelector<HTMLInputElement>('input')!, exact);
      form.querySelector<HTMLButtonElement>('.clear-button')!.click(); await f.fixture.whenStable();
      expect(f.present).toHaveBeenCalledTimes(1);
      const options = f.alerts.create.mock.calls[0][0];
      expect(options.buttons[0]).toEqual({ text: '取消', role: 'cancel' });
      expect(options.buttons[1]).toMatchObject({ text: '清除', role: 'destructive' });
      expect(options.buttons[0].handler).toBeUndefined();
      expect(form.querySelector<HTMLInputElement>('input')?.value).toBe(exact);
      expect(f.services.clearWeatherServiceConfig).not.toHaveBeenCalled();
      expect(f.services.clearGeolocationServiceConfig).not.toHaveBeenCalled();
      expect(f.services.saveWeatherServiceConfig).not.toHaveBeenCalled();
      expect(f.services.saveGeolocationServiceConfig).not.toHaveBeenCalled();
    });
  }

  it('keeps a changed provider draft when an older validation result arrives', async () => {
    const f = await renderServices();
    const form = f.element.querySelector<HTMLFormElement>('form.service-card')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await f.fixture.whenStable();
    await select(f.fixture, f.element.querySelector<HTMLSelectElement>('#active-weather-provider')!, 1);
    const input = identifiedInput(f.element, 'weather-openWeather')!;
    await type(f.fixture, input, '  LOCAL_FIXTURE_new_draft  ');
    f.weatherValidation.next(false); await f.fixture.whenStable();
    expect(f.page.weatherValidationStatus).toBe('idle');
    expect(input.value).toBe('  LOCAL_FIXTURE_new_draft  ');
    expect(form.querySelector('.validation-label')).toBeNull();
    expect(f.services.saveWeatherServiceConfig).toHaveBeenCalledTimes(1);
  });

  it('keeps both service groups, all provider choices and the original return destination', async () => {
    const f = await renderServices();
    expect(f.element.querySelectorAll('form.service-card')).toHaveLength(2);
    for (const form of f.element.querySelectorAll<HTMLFormElement>('form.service-card')) {
      const heading = form.getAttribute('aria-labelledby');
      expect(heading).toBeTruthy();
      expect(f.element.querySelector(`#${heading}`)?.tagName).toBe('H2');
    }
    expect(f.element.querySelector<HTMLSelectElement>('#active-weather-provider')?.options).toHaveLength(4);
    expect(f.element.querySelector<HTMLSelectElement>('#active-geolocation-provider')?.options).toHaveLength(3);
    expect(f.element.querySelector('ion-back-button')?.getAttribute('defaultHref')).toBe('/home/profile');
    expect(f.element.querySelector('.privacy-tip')?.textContent).toContain('仅保存在当前设备');
  });

  async function renderAbout() {
    const present = vi.fn(async () => undefined);
    const modal = { create: vi.fn(async (_options: any) => ({ present })) };
    await TestBed.configureTestingModule({ imports: [AboutPage], providers: [
      provideRouter([]), provideIonicAngular({ animated: false }), provideTranslateService(),
      { provide: ModalController, useValue: modal },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(AboutPage);
    fixture.autoDetectChanges(); await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement, modal, present };
  }

  it('about retains the entire configured introduction, existing capability content and return destination', async () => {
    const f = await renderAbout();
    expect(f.element.querySelector('.about-description')?.textContent).toBe(CONFIG.ABOUT_US);
    expect(f.element.querySelectorAll('.capability-grid article')).toHaveLength(3);
    expect(f.element.querySelector('.capability-grid')?.textContent).toContain('开放开发');
    expect(f.element.querySelector('.capability-grid')?.textContent).toContain('多端协同');
    expect(f.element.querySelector('.capability-grid')?.textContent).toContain('快速落地');
    const legalHeading = f.element.querySelector('.legal-card')?.getAttribute('aria-labelledby');
    expect(legalHeading).toBeTruthy();
    expect(f.element.querySelector(`#${legalHeading}`)?.textContent).toContain('协议与隐私');
    expect(f.element.querySelector('ion-back-button')?.getAttribute('defaultHref')).toBe('/home/profile');
    expect(f.modal.create).not.toHaveBeenCalled();
  });

  for (const [index, url, title] of [[0, CONFIG.USER_AGREEMENT, '用户协议'], [1, CONFIG.PRIVACY_POLICY, '隐私政策']] as const) {
    it(`about opens the existing ${title} document in the original non-backdrop-dismissible modal`, async () => {
      const f = await renderAbout();
      f.element.querySelectorAll<HTMLButtonElement>('.legal-card button')[index].click();
      await f.fixture.whenStable();
      expect(f.modal.create).toHaveBeenCalledWith({ component: DocPage, cssClass: 'about-document-modal', backdropDismiss: false,
        componentProps: { docTitle: title, docUrl: url } });
      expect(f.present).toHaveBeenCalledTimes(1);
    });
  }
});
