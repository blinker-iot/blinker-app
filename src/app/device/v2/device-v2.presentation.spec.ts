import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { By } from '@angular/platform-browser';
import { DEVICE_CONSOLE_HOST } from '../../core/device-v2/console-host';
import { DeviceUiPort } from '../../core/device-v2/device-ui.port';
import { DeviceConsoleService } from '../../core/services/device-console.service';
import { DeviceV2PageLayoutService } from '../../core/services/device-v2-page-layout.service';
import { DeviceV2Page } from './device-v2.page';
import { PageLayoutPanelComponent } from './panel/page-layout-panel';
import type { PanelCard } from './widgets/widget-kit';

describe('Default device control presentation preserves layout and telemetry ownership', () => {
  async function render(active = true, shared = false, degraded = false) {
    // Exercise the production template with known state; lifecycle/connection
    // behaviour is independently covered by device-v2.page.spec.ts.
    vi.spyOn(DeviceV2Page.prototype, 'ngOnInit').mockImplementation(() => undefined);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const port = { openTelemetry: vi.fn(), sendCommand: vi.fn() };
    await TestBed.configureTestingModule({ imports: [DeviceV2Page],
      providers: [provideRouter([]), provideIonicAngular({ animated: false }),
        { provide: DeviceUiPort, useValue: port },
        { provide: DeviceV2PageLayoutService, useValue: {} },
        { provide: DeviceConsoleService, useValue: {} },
        { provide: DEVICE_CONSOLE_HOST, useValue: { sessionVersion: 0 } }] }).compileComponents();
    const fixture = TestBed.createComponent(DeviceV2Page);
    const page = fixture.componentInstance;
    const widget = { widgetId: 'saved-temperature', endpointKey: 'temperature', type: 'value' as const,
      variant: 'number' as const, title: '舱内温度', grid: { x: 2, y: 4, width: 2, height: 2 } };
    const saved = { schemaVersion: 1 as const, columns: 8 as const, revision: 7,
      manifestFingerprint: 'a'.repeat(64), widgets: [widget] };
    const before = structuredClone(saved);
    const card: PanelCard = { widget, field: { id: 1, key: 'temperature', role: 'property',
      valueType: 'number', readable: true, writable: false, notifies: true, unit: '°C' },
      value: 24, display: '24', draft: '', error: '', disabled: false };
    fixture.componentRef.setInput('device', { deviceName: 'ui-geometry-fixture',
      config: { mode: 'bbp2', customName: '已保存设备', isShared: shared },
      data: { canCommand: !shared } });
    fixture.componentRef.setInput('embedded', true);
    page.layout = saved;
    page.telemetryActive = active;
    if (degraded) {
      page.error = '原请求未确认，请只读查询恢复';
      page.telemetryError = '实时来源暂不可用';
    }
    vi.spyOn(page, 'panelCards', 'get').mockReturnValue([card]);
    vi.spyOn(page, 'endpoint').mockReturnValue(card.field);
    vi.spyOn(page, 'display').mockReturnValue('24');
    vi.spyOn(page, 'telemetrySummary', 'get').mockReturnValue('蓝牙直连 · 实际间隔 1 秒');
    vi.spyOn(page, 'telemetryField').mockReturnValue({ status: 'fresh', ageMs: 0,
      effectiveIntervalMs: 1000, missedSamples: 0, points: [] });
    fixture.detectChanges();
    return { fixture, page, element: fixture.nativeElement as HTMLElement, saved, before, port };
  }

  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('keeps the saved component panel first, with source visible and secondary curves collapsed', async () => {
    const f = await render();
    const details = f.element.querySelector<HTMLDetailsElement>('.live-data')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toContain('实时数据');
    expect(details.querySelector('summary')?.textContent).toContain('蓝牙直连');
    expect(details.querySelector('summary')?.textContent).toContain('1 秒');
    expect(details.querySelector('.live-fields strong')?.textContent).toBe('舱内温度');
    expect(f.element.querySelector('main')?.firstElementChild?.tagName.toLowerCase()).toBe('app-page-layout-panel');
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    f.fixture.detectChanges();
    expect(f.port.openTelemetry).not.toHaveBeenCalled();
    expect(f.port.sendCommand).not.toHaveBeenCalled();
    expect(f.saved).toEqual(f.before);
  });

  it('does not create an empty live-data panel when no lease is active', async () => {
    const f = await render(false);
    expect(f.element.querySelector('app-page-layout-panel')).not.toBeNull();
    expect(f.element.querySelector('.live-data')).toBeNull();
    expect(f.saved).toEqual(f.before);
  });

  it('retains read-only gating and keeps degraded/error feedback outside the collapsed curves', async () => {
    const f = await render(true, true, true);
    const panel = f.fixture.debugElement.query(By.directive(PageLayoutPanelComponent)).componentInstance;
    expect(panel.interactive).toBe(false);
    expect(f.element.querySelector('[role="alert"]')?.textContent).toContain('原请求未确认');
    expect(f.element.querySelector('.notice[role="status"]')?.textContent).toContain('实时来源暂不可用');
    expect(f.element.querySelector('.live-data [role="alert"]')).toBeNull();
    expect(f.saved).toEqual(f.before);
  });
});
