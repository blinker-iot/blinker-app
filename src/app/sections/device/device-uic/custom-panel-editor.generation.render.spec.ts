import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController, NavController } from '@ionic/angular';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { API } from '../../../configs/api.config';
import { DEVICE_CONSOLE_HOST } from '../../../core/device-v2/console-host';
import type { BlinkerDevice } from '../../../core/model/device.model';
import { DeviceConsoleService } from '../../../core/services/device-console.service';
import { DevicePanelService } from '../../../core/services/device-panel.service';
import { DeviceService } from '../../../core/services/device.service';
import type { PanelCard } from '../../../device/v2/widgets/widget-kit';
import { CustomPanelEditorComponent } from './custom-panel-editor.component';

// Exercise the production template and real HttpClient cancellation. The empty
// runtime is only a preview asset fixture: it cannot execute atoms or device I/O.
// No closed RxJS observer or private generation handler is invoked by these tests.
describe('QA5 custom editor generation owner and cancellation production template', () => {
  let fixture: ComponentFixture<CustomPanelEditorComponent> | undefined;
  let http: HttpTestingController;
  let host: { authenticated: boolean; sessionVersion: number;
    activeChanges: BehaviorSubject<boolean>; sessionChanges: Subject<void> };

  function device(id: string, saved: string): BlinkerDevice {
    return { id, deviceName: id, config: { mode: 'bbp2', broker: '', customName: id,
      customPanel: { version: 1, theme: 'natural', html: `<main><p>${saved}</p></main>` } },
      data: {}, storage: {}, subject: new Subject() };
  }

  function card(value = false): PanelCard {
    return { widget: { widgetId: 'power-widget', endpointKey: 'power', type: 'switch', variant: 'toggle',
      title: 'Power', grid: { x: 0, y: 0, width: 2, height: 2 } },
      field: { id: 1, key: 'power', role: 'property', valueType: 'boolean', readable: true,
        writable: true, notifies: true, value }, value, display: String(value), draft: '', error: '', disabled: false };
  }

  beforeEach(async () => {
    host = { authenticated: true, sessionVersion: 1,
      activeChanges: new BehaviorSubject(true), sessionChanges: new Subject<void>() };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ script: '', styles: '' }) })));
    await TestBed.configureTestingModule({ imports: [CustomPanelEditorComponent], providers: [
      provideIonicAngular({ animated: false }), provideHttpClient(), provideHttpClientTesting(),
      { provide: DEVICE_CONSOLE_HOST, useValue: host },
      { provide: DeviceService, useValue: { saveDeviceConfig: vi.fn() } },
      { provide: DevicePanelService, useValue: { save: vi.fn(), install: vi.fn() } },
      { provide: DeviceConsoleService, useValue: { save: vi.fn() } },
      { provide: NavController, useValue: { navigateRoot: vi.fn() } },
      { provide: AlertController, useValue: { create: vi.fn() } },
    ] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    if (fixture && !fixture.componentRef.hostView.destroyed) fixture.destroy();
    fixture = undefined;
    http.verify({ ignoreCancelled: true });
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  function render(model = device('device-a', 'saved-A')) {
    fixture = TestBed.createComponent(CustomPanelEditorComponent);
    const f = fixture;
    const busy = vi.fn();
    f.componentInstance.busy.subscribe(busy);
    f.componentRef.setInput('device', model);
    f.componentRef.setInput('cards', [card()]);
    f.componentRef.setInput('ready', true);
    f.detectChanges();
    const detect = () => { f.changeDetectorRef.markForCheck(); f.detectChanges(); };
    const generate = () => {
      const button = f.nativeElement.querySelector('.generate-button') as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      button.click(); detect();
      return http.expectOne({ method: 'POST', url: API.INTERFACE_WORKFLOW });
    };
    return { f, busy, detect, generate,
      preview: () => f.componentInstance.preview?.html,
      setInput: (name: string, value: unknown) => { f.componentRef.setInput(name, value); detect(); },
      cancel: () => {
        const button = [...f.nativeElement.querySelectorAll('.preview-loading button') as NodeListOf<HTMLButtonElement>]
          .find(item => item.textContent?.trim() === '取消生成');
        expect(button).toBeDefined(); button!.click(); detect();
      },
    };
  }

  function complete(html: string) {
    return JSON.stringify({ type: 'complete', mode: 'custom', data: { html } });
  }

  it('projects only the HTML request fields and preserves zero, false and empty optional values', () => {
    const t = render(), source = card();
    const marker = 'SYNTHETIC_HTML_PROJECTION_SECRET';
    Object.assign(source.field, {
      manifestKind: 1, manifestType: 1, value: false,
      futureInternal: { secret: marker }, futureSecret: marker,
      readable: false, writable: false, notifies: false,
      minimum: 0, maximum: 0, step: 0, maxLength: 0, unit: '', choices: [], telemetryMinimumIntervalMs: 0,
    });
    t.setInput('cards', [source]);
    const pending = t.generate();
    expect(pending.request.body.fields).toEqual([{
      id: 1, key: 'power', label: 'Power', role: 'property', valueType: 'boolean',
      readable: false, writable: false, notifies: false,
      minimum: 0, maximum: 0, step: 0, maxLength: 0, unit: '', choices: [], telemetryMinimumIntervalMs: 0,
    }]);
    const wire = JSON.stringify(pending.request.body.fields);
    for (const forbidden of ['manifestKind', 'manifestType', '"value"', 'futureInternal', 'futureSecret', marker]) {
      expect(wire).not.toContain(forbidden);
    }
    pending.flush(complete('<main>projected-result</main>')); t.detect();
    expect(t.preview()).toContain('projected-result'); http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('keeps first-key order, last-card values and the existing title-or-key fallback when projecting duplicates', () => {
    const t = render(), first = card(), middle = card(), last = card();
    first.widget.title = 'earlier-title';
    middle.field = { ...middle.field, id: 2, key: 'auxiliary' };
    middle.widget = { ...middle.widget, widgetId: 'auxiliary-widget', endpointKey: 'auxiliary', title: 'Auxiliary' };
    last.field = { ...last.field, id: 3, writable: false };
    last.widget = { ...last.widget, widgetId: 'last-power-widget', title: '' };
    t.setInput('cards', [first, middle, last]);
    const pending = t.generate();
    expect(pending.request.body.fields).toEqual([
      { id: 3, key: 'power', label: 'power', role: 'property', valueType: 'boolean', readable: true, writable: false, notifies: true },
      { id: 2, key: 'auxiliary', label: 'Auxiliary', role: 'property', valueType: 'boolean', readable: true, writable: true, notifies: true },
    ]);
    pending.flush(complete('<main>deduplicated-result</main>')); t.detect();
    expect(t.preview()).toContain('deduplicated-result'); http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('does not cancel same-owner generation when only internal metadata and live readings change', () => {
    const t = render(), original = card();
    t.setInput('manifestFingerprint', 'a'.repeat(64));
    Object.assign(original.field, { manifestKind: 1, manifestType: 1, futureInternal: 'old-metadata' });
    t.setInput('cards', [original]);
    const pending = t.generate(), refreshed = card(true);
    Object.assign(refreshed.field, { manifestKind: 2, manifestType: 2,
      futureInternal: 'new-metadata', futureSecret: 'SYNTHETIC_METADATA_NOT_FOR_AI' });
    t.setInput('cards', [refreshed]);
    expect(pending.cancelled).toBe(false); expect(t.f.componentInstance.generating).toBe(true);
    pending.flush(complete('<main>same-owner-metadata-result</main>')); t.detect();
    expect(t.preview()).toContain('same-owner-metadata-result');
    expect(t.f.nativeElement.querySelector('.generation-summary')?.textContent).toContain('界面已生成');
    http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('still cancels generation after a real field permission change without an automatic retry', () => {
    const t = render(), pending = t.generate(), changed = card();
    changed.field.writable = false;
    t.setInput('cards', [changed]);
    expect(pending.cancelled).toBe(true); expect(t.f.componentInstance.generating).toBe(false);
    expect(t.preview()).toContain('saved-A');
    http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('still cancels generation after a real field constraint change without an automatic retry', () => {
    const t = render(), original = card();
    original.field = { ...original.field, valueType: 'integer', minimum: 0, maximum: 100, step: 1, value: 0 };
    original.widget = { ...original.widget, type: 'value', variant: 'number' };
    original.value = 0;
    t.setInput('cards', [original]);
    const pending = t.generate();
    t.setInput('cards', [{ ...original, field: { ...original.field, maximum: 200 } }]);
    expect(pending.cancelled).toBe(true); expect(t.f.componentInstance.generating).toBe(false);
    expect(t.preview()).toContain('saved-A');
    http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('cancels on a same-capability device change and loads only the new device saved draft', () => {
    const t = render(), old = t.generate();
    expect(old.request.body.fields).toEqual([{ id: 1, key: 'power', role: 'property', valueType: 'boolean',
      readable: true, writable: true, notifies: true, label: 'Power' }]);
    t.setInput('device', device('device-b', 'saved-B'));
    expect(old.cancelled).toBe(true);
    expect(t.preview()).toContain('saved-B'); expect(t.preview()).not.toContain('saved-A');
    expect(t.f.componentInstance.generating).toBe(false); expect(t.busy).toHaveBeenLastCalledWith(false);
    http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('retires the old account request and draft before accepting a same-ID new account input', () => {
    const t = render(), old = t.generate();
    host.sessionVersion++; host.sessionChanges.next(); t.detect();
    expect(old.cancelled).toBe(true);
    expect(t.preview()).toBeUndefined();
    t.setInput('device', device('device-a', 'new-account-saved'));
    expect(t.preview()).toContain('new-account-saved'); expect(t.preview()).not.toContain('saved-A');
    expect(t.f.componentInstance.generating).toBe(false);
    http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('does not treat a same-session notification as an account change or abort its response', () => {
    const t = render(), pending = t.generate();
    host.sessionChanges.next(); t.detect();
    expect(pending.cancelled).toBe(false); expect(t.f.componentInstance.generating).toBe(true);
    pending.flush(complete('<main>same-session-result</main>')); t.detect();
    expect(t.preview()).toContain('same-session-result');
    expect(t.f.nativeElement.querySelector('.generation-summary')?.textContent).toContain('界面已生成');
    http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('uses the original cancel button to abort once, preserve the good preview, and never restart', () => {
    const t = render(), good = t.preview(), pending = t.generate();
    t.cancel();
    expect(pending.cancelled).toBe(true); expect(t.preview()).toBe(good);
    expect(t.f.nativeElement.querySelector('.preview-loading')).toBeNull();
    expect(t.f.nativeElement.querySelector('app-custom-panel-frame')).not.toBeNull();
    expect(t.busy.mock.calls).toEqual([[true], [false]]);
    http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('aborts on host background and retains its good preview without restarting on foreground', () => {
    const t = render(), good = t.preview(), pending = t.generate();
    host.activeChanges.next(false); t.detect();
    expect(pending.cancelled).toBe(true); expect(t.preview()).toBe(good);
    expect(t.f.componentInstance.generating).toBe(false); expect(t.busy).toHaveBeenLastCalledWith(false);
    host.activeChanges.next(true); t.detect();
    expect(t.preview()).toBe(good); http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('new parent active input cancels a cached hidden page without dropping its good preview or restarting', () => {
    // This is the new parent-child wiring contract, not an existing input claim.
    const t = render(), good = t.preview(), pending = t.generate();
    t.setInput('active', false);
    expect(pending.cancelled).toBe(true); expect(t.preview()).toBe(good);
    expect(t.f.componentInstance.generating).toBe(false);
    t.setInput('active', true);
    expect(t.preview()).toBe(good); http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('new manifest identity input cancels the request without generating for changed capabilities', () => {
    // Manifest identity is explicit even if the selected fields happen to match.
    const t = render(); t.setInput('manifestFingerprint', 'a'.repeat(64));
    const pending = t.generate(); t.setInput('manifestFingerprint', 'b'.repeat(64));
    expect(pending.cancelled).toBe(true); expect(t.f.componentInstance.generating).toBe(false);
    http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('does not cancel same-owner live State refresh when the generation capability contract is unchanged', () => {
    const t = render(), pending = t.generate();
    t.setInput('cards', [card(true)]);
    expect(pending.cancelled).toBe(false); expect(t.f.componentInstance.generating).toBe(true);
    pending.flush(complete('<main>fresh-result</main>')); t.detect();
    expect(t.preview()).toContain('fresh-result'); http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('retains the good preview after a real HTTP failure without an automatic retry', () => {
    const t = render(), good = t.preview(), pending = t.generate();
    pending.flush('unavailable', { status: 503, statusText: 'Service Unavailable' }); t.detect();
    expect(t.preview()).toBe(good); expect(t.f.componentInstance.generating).toBe(false);
    expect(t.f.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('当前预览已保留');
    http.expectNone(API.INTERFACE_WORKFLOW);
  });

  it('destroys the real HTTP subscription and never restarts from later lifecycle signals', () => {
    const t = render(), pending = t.generate();
    t.f.destroy();
    expect(pending.cancelled).toBe(true);
    host.activeChanges.next(false); host.activeChanges.next(true);
    host.sessionVersion++; host.sessionChanges.next();
    http.expectNone(API.INTERFACE_WORKFLOW);
  });
});
