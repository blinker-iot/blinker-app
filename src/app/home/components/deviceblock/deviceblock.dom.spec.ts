import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { BDeviceImgComponent } from '../../../core/components/b-device-img/b-device-img.component';
import { DeviceUiPort, DeviceUiSnapshot, DeviceUiConnectivitySnapshot } from '../../../core/device-v2/device-ui.port';
import { Deviceblock } from './deviceblock';
import type { HomeCardBinding } from '../../device-card-preferences';

@Component({ selector: 'b-device-img', template: '<img alt="" />' })
class DeviceImageStub { @Input() filename?: string; }

describe('device card production template (state/connectivity/image doubles)', () => {
  let fixture: ComponentFixture<Deviceblock>;
  let state: BehaviorSubject<DeviceUiSnapshot>;
  let connectivity: BehaviorSubject<DeviceUiConnectivitySnapshot>;
  let port: { watchState: ReturnType<typeof vi.fn>; watchConnectivity: ReturnType<typeof vi.fn>; appActive: BehaviorSubject<boolean> };
  const source = () => ({ deviceName: 'device', cloudEnabled: true, config: { customName: '旧名', card: {
    metrics: ['temperature', 'power', 'humidity', 'level'].map(key => ({ key })),
  } }, name: '客厅设备', data: { cloudReachable: true }, subject: new Subject() });

  beforeEach(async () => {
    state = new BehaviorSubject<DeviceUiSnapshot>({ manifestRevision: 1, manifestFingerprint: 'ab', manifestAccepted: true,
      stateRevision: 1, stateFresh: true, endpoints: ['temperature', 'power', 'humidity', 'level'].map((key, id) => ({
        id, key, role: 'property', valueType: 'number', manifestKind: 0, manifestType: 3,
        readable: true, writable: false, notifies: true, value: id,
      })),
    });
    connectivity = new BehaviorSubject<DeviceUiConnectivitySnapshot>({ activeTransport: 'cloud', directConnectAllowed: true,
      bleAccess: true, bleAdapterEnabled: true, bleNearby: false, bleState: 'idle', cloudSessionState: 'ready' });
    port = { watchState: vi.fn(() => state), watchConnectivity: vi.fn(() => connectivity), appActive: new BehaviorSubject(true) };
    TestBed.overrideComponent(Deviceblock, { remove: { imports: [BDeviceImgComponent] }, add: { imports: [DeviceImageStub] } });
    await TestBed.configureTestingModule({ imports: [Deviceblock], providers: [{ provide: DeviceUiPort, useValue: port }] }).compileComponents();
    fixture = TestBed.createComponent(Deviceblock);
    fixture.componentRef.setInput('device', source());
    fixture.detectChanges();
  });

  afterEach(() => { fixture.destroy(); vi.unstubAllGlobals(); });

  const card = () => fixture.nativeElement.querySelector('.device-card') as HTMLElement;

  it('uses measured pixels on old WebViews, including wide cards and resizing', () => {
    vi.stubGlobal('CSS', { supports: () => false });
    const bounds = vi.spyOn(card(), 'getBoundingClientRect');
    bounds.mockReturnValue({ width: 136 } as DOMRect);
    (fixture.componentInstance as any).measureCard();
    expect(card().style.getPropertyValue('--device-card-side')).toBe('136px');
    fixture.componentRef.setInput('wide', true);
    bounds.mockReturnValue({ width: 284 } as DOMRect);
    (fixture.componentInstance as any).measureCard();
    expect(card().style.getPropertyValue('--device-card-side')).toBe('136px');
    bounds.mockReturnValue({ width: 360 } as DOMRect);
    (fixture.componentInstance as any).measureCard();
    expect(card().style.getPropertyValue('--device-card-side')).toBe('174px');
  });

  it('leaves supported container sizing to native CSS', () => {
    vi.stubGlobal('CSS', { supports: () => true });
    vi.spyOn(card(), 'getBoundingClientRect').mockReturnValue({ width: 136 } as DOMRect);
    (fixture.componentInstance as any).measureCard();
    expect(card().style.getPropertyValue('--device-card-side')).toBe('');
  });

  it('uses one header, image and single footer in either size, leaving the wide side empty', () => {
    expect(card().children.length).toBe(3);
    expect(card().querySelector('.device-heading .device-name-text')?.textContent).toBe('客厅设备');
    expect(card().querySelector('.device-heading .device-status')?.getAttribute('aria-label')).toBe('云端已同步');
    expect(card().querySelectorAll('.device-metrics').length).toBe(1);
    expect(card().querySelectorAll('.device-metric').length).toBe(2);
    expect(card().querySelector('.device-metric-more')).not.toBeNull();
    fixture.componentRef.setInput('wide', true); fixture.detectChanges();
    expect(card().classList.contains('wide')).toBe(true);
    expect(card().querySelectorAll('.device-metric').length).toBe(4);
    expect(card().querySelector('.device-extension')).toBeNull();
    expect(card().querySelector('.device-metric-more')).toBeNull();
    expect(Object.keys(port)).toEqual(['watchState', 'watchConnectivity', 'appActive']);
  });

  it('does not collapse a wide card with no configured data or missing values', () => {
    fixture.componentRef.setInput('wide', true);
    fixture.componentRef.setInput('device', { ...source(), config: { card: { metrics: [] } } });
    fixture.detectChanges();
    expect(card().classList.contains('wide')).toBe(true);
    expect(card().querySelector('.device-visual')).not.toBeNull();
    expect(card().querySelector('.device-metrics')).not.toBeNull();
    expect(card().querySelectorAll('.device-metric').length).toBe(0);
  });

  it('keeps a single reading in one base column rather than stretching it across the footer', () => {
    fixture.componentRef.setInput('wide', true);
    fixture.componentRef.setInput('bindings', [{ key: 'temperature', kind: 0, type: 3 }]);
    fixture.detectChanges();
    const footer = card().querySelector('.device-metrics') as HTMLElement;
    expect(footer.style.gridTemplateColumns).toContain('repeat(4,');
    expect(footer.querySelectorAll('.device-metric').length).toBe(1);
  });

  it.each([2, 3])('distributes %i ordinary blocks across the row without changing admission capacity', count => {
    fixture.componentRef.setInput('wide', true);
    fixture.componentRef.setInput('bindings', state.value.endpoints.slice(0, count).map(field => ({
      key: field.key, kind: field.manifestKind!, type: field.manifestType!,
    })));
    fixture.detectChanges();
    const footer = card().querySelector('.device-metrics') as HTMLElement;
    expect(footer.style.gridTemplateColumns).toContain(`repeat(${count},`);
    expect(footer.querySelectorAll('.device-metric')).toHaveLength(count);
    expect(footer.querySelectorAll('.device-metric > .device-metric-visual')).toHaveLength(count);
    expect(fixture.componentInstance.columns).toBe(4);
    expect(fixture.componentInstance.rowColumns).toBe(count);
    expect(card().querySelector('.device-extension')).toBeNull();
  });

  it('shows only the reading and unit while retaining its complete accessible name and description', () => {
    fixture.componentRef.setInput('bindings', [{ key: 'temperature', kind: 0, type: 3 }]);
    state.next({ ...state.value, endpoints: [{ ...state.value.endpoints[0], value: 23.5, unit: '℃' }] });
    fixture.detectChanges();
    const metric = card().querySelector('.device-metric') as HTMLElement;
    expect(metric.textContent?.replace(/\s/g, '')).toBe('23.5℃');
    expect(metric.querySelector('small')).toBeNull();
    expect(metric.getAttribute('aria-label')).toBe('temperature：23.5℃');
    expect(metric.getAttribute('title')).toBe('temperature：23.5℃');
    state.next({ ...state.value, endpoints: [{ ...state.value.endpoints[0], value: 0 }] });
    fixture.detectChanges();
    expect(metric.textContent?.replace(/\s/g, '')).toBe('0℃');
  });

  it('does not gray a nearby-only BLE device, but separates confirmed offline from unknown', () => {
    fixture.componentRef.setInput('device', { ...source(), cloudEnabled: false, data: { cloudReachable: false } });
    connectivity.next({ ...connectivity.value, activeTransport: 'ble', bleNearby: true }); fixture.detectChanges();
    expect(card().classList.contains('status-reachable')).toBe(true);
    expect(card().classList.contains('status-offline')).toBe(false);
    connectivity.next({ ...connectivity.value, bleNearby: false }); fixture.detectChanges();
    expect(card().classList.contains('status-offline')).toBe(false);
    connectivity.next({ ...connectivity.value, bleAdapterEnabled: false }); fixture.detectChanges();
    expect(card().classList.contains('status-offline')).toBe(true);
  });

  it('marks old readings as cached without removing their positions', () => {
    state.next({ ...state.value, stateFresh: false }); fixture.detectChanges();
    expect(card().querySelector('.device-data-hint')?.textContent).toBe('缓存');
    state.next({ ...state.value, stateFresh: false, endpoints: [] }); fixture.detectChanges();
    expect(card().querySelector('.device-metrics')?.getAttribute('aria-label')).toContain('缓存');
    expect(card().querySelector('.device-metric strong')?.textContent?.trim()).toBe('—');
    expect(card().querySelectorAll('.device-metric').length).toBe(2);
    expect(card().querySelector('.device-data-hint')).toBeNull();
  });

  it('retains the More entry for legacy configurations containing more than four bindings', () => {
    fixture.componentRef.setInput('device', { ...source(), config: { card: { metrics: [
      'temperature', 'power', 'humidity', 'level', 'voltage', 'current',
    ].map(key => ({ key })) } } });
    fixture.componentRef.setInput('wide', true); fixture.detectChanges();
    expect(card().querySelectorAll('.device-metric').length).toBe(4);
    expect(card().querySelector('.device-metric-more')).not.toBeNull();
  });

  it('unsubscribes the old device before rebinding and ignores its later changes', () => {
    const previous = fixture.componentInstance.device;
    const nextState = new BehaviorSubject({ ...state.value, endpoints: [] });
    const nextConnectivity = new BehaviorSubject({ ...connectivity.value });
    port.watchState.mockReturnValue(nextState); port.watchConnectivity.mockReturnValue(nextConnectivity);
    fixture.componentRef.setInput('device', { ...source(), deviceName: 'next' }); fixture.detectChanges();
    expect(state.observed).toBe(false); expect(connectivity.observed).toBe(false);
    expect(previous.subject.observed).toBe(false);
    previous.subject.next({ key: 'customName', value: '不能污染新设备' });
    expect(fixture.componentInstance.displayName).toBe('客厅设备');
  });

  it('reflows the same footer, reports measured capacity and releases its ResizeObserver', async () => {
    let callback!: ResizeObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(listener: ResizeObserverCallback) { callback = listener; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    fixture.destroy();
    fixture = TestBed.createComponent(Deviceblock);
    const capacities: number[] = [];
    fixture.componentInstance.capacityChange.subscribe(capacity => capacities.push(capacity));
    fixture.componentRef.setInput('device', source()); fixture.detectChanges();
    const target = card();
    const measure = vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ width: 240 } as DOMRect);
    const entry: ResizeObserverEntry = { target, contentRect: target.getBoundingClientRect(),
      borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] };
    callback([entry], {} as ResizeObserver); fixture.detectChanges();
    await Promise.resolve();
    expect(target.querySelectorAll('.device-metric').length).toBe(4);
    expect(target.querySelector('.device-metric-more')).toBeNull();
    measure.mockReturnValue({ width: 160 } as DOMRect);
    callback([entry], {} as ResizeObserver); fixture.detectChanges();
    await Promise.resolve();
    expect(target.querySelectorAll('.device-metric').length).toBe(2);
    expect(target.querySelector('.device-metric-more')).not.toBeNull();
    expect(target.querySelectorAll('.device-metrics').length).toBe(1);
    expect(capacities).toEqual([4, 2]);
    fixture.destroy(); expect(disconnect).toHaveBeenCalledOnce();
  });

  it('releases state and connectivity subscriptions when the component is destroyed', () => {
    expect(state.observed).toBe(true); expect(connectivity.observed).toBe(true);
    fixture.destroy();
    expect(state.observed).toBe(false); expect(connectivity.observed).toBe(false);
  });

  it('keeps normal tile clicks bubbling but emits configuration only for editing clicks and keyboard activation', () => {
    fixture.componentRef.setInput('bindings', [{ key: 'temperature', kind: 0, type: 3 }]);
    fixture.detectChanges();
    const navigate = vi.fn(), configure = vi.fn();
    fixture.nativeElement.addEventListener('click', navigate);
    fixture.componentInstance.configure.subscribe(configure);
    (card().querySelector('.device-metric') as HTMLElement).click();
    expect(navigate).toHaveBeenCalledOnce(); expect(configure).not.toHaveBeenCalled();
    fixture.componentRef.setInput('editing', true); fixture.detectChanges();
    const metric = card().querySelector('.device-metric') as HTMLElement;
    expect(metric.getAttribute('role')).toBe('button'); expect(metric.tabIndex).toBe(0);
    metric.click();
    metric.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledOnce();
    expect(configure.mock.calls).toEqual([['temperature'], ['temperature']]);
    fixture.componentRef.setInput('bindings', []); fixture.detectChanges();
    expect(card().querySelector('.device-metric-empty')).not.toBeNull();
    expect(card().querySelector('.device-metric-empty')?.textContent?.trim()).toBe('＋');
    expect(card().querySelector('.device-metric-empty')?.getAttribute('aria-label')).toBe('设置卡片显示内容');
    (card().querySelector('.device-metric-empty') as HTMLElement).click();
    expect(configure).toHaveBeenLastCalledWith(undefined);
  });

  it('uses the editing More tile to configure the bounded row without navigating', () => {
    fixture.componentRef.setInput('editing', true); fixture.detectChanges();
    const navigate = vi.fn(), configure = vi.fn();
    fixture.nativeElement.addEventListener('click', navigate);
    fixture.componentInstance.configure.subscribe(configure);
    const more = card().querySelector('.device-metric-more') as HTMLElement;
    expect(more.getAttribute('aria-label')).toBe('设置卡片显示内容');
    expect(more.textContent?.trim()).toBe('···');
    more.click();
    expect(configure).toHaveBeenCalledWith(undefined); expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps full-reference positions unavailable after type changes or Manifest loss without exposing old readings', () => {
    fixture.componentRef.setInput('bindings', [{ key: 'temperature', kind: 0, type: 0 }]);
    fixture.detectChanges();
    let metric = card().querySelector('.device-metric') as HTMLElement;
    expect(metric.textContent).toContain('不可用');
    expect(metric.querySelector('.device-metric-hint')?.textContent?.trim()).toBe('不可用');
    expect(metric.textContent).not.toContain('temperature');
    expect(metric.querySelector('strong')?.textContent).toBe('—');
    expect(metric.getAttribute('aria-label')).toContain('类型已变化');
    fixture.componentRef.setInput('bindings', [{ key: 'temperature', kind: 0, type: 3 }]);
    state.next({ ...state.value, manifestAccepted: false, stateFresh: false,
      endpoints: [{ ...state.value.endpoints[0], value: 98765, unit: 'W' }] });
    fixture.detectChanges(); metric = card().querySelector('.device-metric') as HTMLElement;
    expect(metric.textContent).toContain('不可用');
    expect(metric.querySelector('strong')?.textContent).toBe('—');
    expect(metric.querySelector('.device-metric-unit')).toBeNull();
    expect(metric.textContent).not.toContain('98765');
    expect(metric.getAttribute('aria-label')).toContain('尚未获取');
  });

  const controls: HomeCardBinding[] = [
    { key: 'power', kind: 0, type: 0, mode: 'toggle' },
    { key: 'button', kind: 1, type: 9, mode: 'action' },
    { key: 'level', kind: 0, type: 2, mode: 'range' },
  ];
  function controlFixture(fresh = true, enabled = true): void {
    state.next({ ...state.value, stateFresh: fresh, endpoints: [
      { id: 1, key: 'power', manifestKind: 0, manifestType: 0, role: 'property', valueType: 'boolean',
        readable: true, writable: true, notifies: true, value: false },
      { id: 2, key: 'button', manifestKind: 1, manifestType: 9, role: 'action', valueType: 'null',
        readable: false, writable: true, notifies: false },
      { id: 3, key: 'level', manifestKind: 0, manifestType: 2, role: 'property', valueType: 'integer',
        readable: true, writable: true, notifies: true, minimum: 0, maximum: 100, step: 5, value: 0 },
    ] });
    Object.assign(fixture.componentInstance, { measuredWidth: 360 }); // Explicit layout-measurement double.
    fixture.componentRef.setInput('bindings', controls);
    fixture.componentRef.setInput('controlsEnabled', enabled);
    fixture.detectChanges();
  }
  function pointer(element: HTMLElement, type: string): void {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, button: { value: 0 } });
    element.dispatchEvent(event);
  }
  function input(value: number): HTMLInputElement {
    const element = card().querySelector('input[type="range"]') as HTMLInputElement;
    element.value = String(value); element.dispatchEvent(new Event('input', { bubbles: true }));
    return element;
  }

  it('retains two-column ranges and uses actual visible spans for a mixed row and its More fallback', () => {
    controlFixture();
    fixture.componentRef.setInput('bindings', [controls[0], controls[2]]); fixture.detectChanges();
    const footer = () => card().querySelector('.device-metrics') as HTMLElement;
    expect(footer().style.gridTemplateColumns).toContain('repeat(3,');
    expect((footer().querySelector('.device-range') as HTMLElement).style.gridColumn).toBe('span 2');
    expect(fixture.componentInstance.columns).toBe(4); expect(fixture.componentInstance.rangeFits).toBe(true);
    expect(footer().querySelector('input[type="range"]')).not.toBeNull();
    expect(footer().querySelector('.device-metric-more')).toBeNull();

    fixture.componentRef.setInput('bindings', [controls[2]]); fixture.detectChanges();
    expect(footer().style.gridTemplateColumns).toContain('repeat(4,');
    expect((footer().querySelector('.device-range') as HTMLElement).style.gridColumn).toBe('span 2');

    Object.assign(fixture.componentInstance, { measuredWidth: 284 });
    fixture.componentRef.setInput('bindings', controls); fixture.detectChanges();
    expect(fixture.componentInstance.columns).toBe(4); expect(fixture.componentInstance.rangeFits).toBe(false);
    expect(footer().style.gridTemplateColumns).toContain('repeat(3,');
    expect(footer().querySelectorAll('.device-metric')).toHaveLength(3);
    expect(footer().querySelector('.device-range')).toBeNull();
    expect(footer().querySelector('.device-metric-more .device-metric-visual')?.textContent?.trim()).toBe('···');
  });

  it('keeps all controls disabled in a preview and emits witnessed toggle/Action intents without changing State', () => {
    controlFixture(true, false);
    const emitted = vi.fn(), navigate = vi.fn();
    fixture.componentInstance.control.subscribe(emitted); fixture.nativeElement.addEventListener('click', navigate);
    expect([...card().querySelectorAll('button.device-control')].every(element => (element as HTMLButtonElement).disabled)).toBe(true);
    expect(card().querySelector('button[role="switch"]')?.textContent?.trim()).toBe('');
    expect(card().querySelector('.device-action-icon')).not.toBeNull();
    fixture.componentRef.setInput('controlsEnabled', true); fixture.detectChanges();
    const buttons = card().querySelectorAll('button.device-control');
    (buttons[0] as HTMLButtonElement).click(); (buttons[1] as HTMLButtonElement).click();
    expect(emitted.mock.calls.map(call => call[0])).toEqual(controls.slice(0, 2).map(binding => ({ binding,
      manifestFingerprint: 'ab', stateRevision: 1, stateFresh: true })));
    expect(navigate).not.toHaveBeenCalled(); expect(state.value.endpoints[0].value).toBe(false);
    expect((buttons[1] as HTMLButtonElement).textContent?.trim()).toBe('');
    expect((buttons[1] as HTMLButtonElement).getAttribute('aria-label')).toContain('button：执行');
  });

  it('renders a visible switch whose accessible state follows actual State rather than a click or ACK', () => {
    controlFixture();
    const emitted = vi.fn(); fixture.componentInstance.control.subscribe(emitted);
    const toggle = () => card().querySelector('button[role="switch"]') as HTMLButtonElement;
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(toggle().querySelector('.device-control-body.device-metric-visual')).not.toBeNull();
    expect(toggle().querySelector('.device-switch-track')).not.toBeNull();
    expect(toggle().querySelector('.device-switch-thumb')).not.toBeNull();
    expect(toggle().querySelector('.device-switch-track')?.classList.contains('is-on')).toBe(false);
    toggle().click(); fixture.detectChanges();
    expect(emitted).toHaveBeenCalledOnce();
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(toggle().querySelector('.device-switch-track')?.classList.contains('is-on')).toBe(false);
    fixture.componentRef.setInput('controlStates', { power: {
      phase: 'accepted', message: '已接受，等待新鲜状态', busy: true, blocked: false,
    } }); fixture.detectChanges();
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(toggle().querySelector('.device-control-feedback')?.textContent?.trim()).toBe('已接受');
    state.next({ ...state.value, stateRevision: 2, endpoints: state.value.endpoints.map(field =>
      field.key === 'power' ? { ...field, value: true } : field) });
    fixture.componentRef.setInput('controlStates', {}); fixture.detectChanges();
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(toggle().querySelector('.device-switch-track')?.classList.contains('is-on')).toBe(true);
    expect(emitted).toHaveBeenCalledOnce();
  });

  it('omits the visible name and keeps full confirmation text in the accessible description', () => {
    controlFixture();
    const message = '已接受，状态未确认；请在设备页核对，不要重复操作';
    fixture.componentRef.setInput('controlStates', { power: {
      phase: 'accepted', message, busy: false, blocked: true,
    } }); fixture.detectChanges();
    const toggle = card().querySelector('button[role="switch"]') as HTMLButtonElement;
    expect(toggle.querySelector(':scope > small')).toBeNull();
    expect(toggle.querySelector('.device-control-body')?.getAttribute('aria-hidden')).toBe('true');
    expect(toggle.querySelector('.device-control-body')?.textContent?.trim()).toBe('已接受');
    expect(toggle.textContent).not.toContain(message);
    expect(toggle.getAttribute('aria-label')).toContain(message);
    expect(toggle.getAttribute('title')).toContain(message);
    expect(toggle.disabled).toBe(true);
  });

  it('shows only the Action graphic while preserving its accessible name and explicit Null and Boolean action intents', () => {
    controlFixture();
    const emitted = vi.fn(); fixture.componentInstance.control.subscribe(emitted);
    const action = () => [...card().querySelectorAll('button.device-control')]
      .find(button => button.getAttribute('role') !== 'switch') as HTMLButtonElement;
    expect(action().querySelector(':scope > small')).toBeNull();
    expect(action().querySelector('.device-control-body .device-action-icon')).not.toBeNull();
    expect(action().querySelector('.device-control-body strong')).toBeNull();
    expect(action().textContent?.trim()).toBe('');
    expect(action().getAttribute('aria-label')).toContain('button：执行');
    expect(action().getAttribute('aria-checked')).toBeNull();
    action().click();
    expect(emitted).toHaveBeenLastCalledWith({ binding: controls[1],
      manifestFingerprint: 'ab', stateRevision: 1, stateFresh: true });
    const booleanAction = { ...controls[1], type: 0 };
    state.next({ ...state.value, manifestFingerprint: 'cd', endpoints: state.value.endpoints.map(field =>
      field.key === 'button' ? { ...field, manifestType: 0, valueType: 'boolean' } : field) });
    fixture.componentRef.setInput('bindings', [controls[0], booleanAction, controls[2]]); fixture.detectChanges();
    action().click();
    expect(emitted).toHaveBeenLastCalledWith({ binding: booleanAction,
      manifestFingerprint: 'cd', stateRevision: 1, stateFresh: true });
    expect(emitted.mock.calls.every(([intent]) => !Object.hasOwn(intent, 'value'))).toBe(true);
    expect(state.value.endpoints[0].value).toBe(false);
  });

  it('keeps bounded safety feedback visible without restoring the endpoint name or long request message', () => {
    controlFixture();
    const feedback = { connecting: '连接中', pending: '待确认', accepted: '已接受', unknown: '未确认', rejected: '请检查' } as const;
    for (const [phase, text] of Object.entries(feedback)) {
      const message = `${text}，请核对设备状态，不要重复操作`;
      fixture.componentRef.setInput('controlStates', { power: { phase, message, busy: true, blocked: false } });
      fixture.detectChanges();
      const toggle = card().querySelector('button[role="switch"]') as HTMLButtonElement;
      expect(toggle.textContent?.trim()).toBe(text);
      expect(toggle.querySelector('small')).toBeNull();
      expect(toggle.getAttribute('aria-label')).toContain('power');
      expect(toggle.getAttribute('aria-label')).toContain(message);
      expect(toggle.getAttribute('title')).toContain(message);
      expect(toggle.disabled).toBe(true);
    }
  });

  it('uses the same value-only range preview and keeps the stale preparation hint without exposing the name', () => {
    controlFixture(true, false);
    state.next({ ...state.value, endpoints: state.value.endpoints.map(field => field.key === 'level' ? { ...field, unit: '%' } : field) });
    fixture.detectChanges();
    expect(card().querySelector('.device-range-info')?.textContent?.trim()).toBe('0%');
    expect(card().querySelector('.device-range-info small')).toBeNull();
    const slider = card().querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider.disabled).toBe(true); expect(slider.getAttribute('aria-label')).toBe('level：0%');
    expect(slider.getAttribute('aria-valuetext')).toBe('0%');
    state.next({ ...state.value, stateFresh: false }); fixture.detectChanges();
    const prepare = card().querySelector('.device-range-prepare') as HTMLButtonElement;
    expect(prepare.textContent?.trim()).toBe('连接调节');
    expect(prepare.querySelector('small')).toBeNull(); expect(prepare.getAttribute('aria-label')).toContain('level');
    expect(prepare.disabled).toBe(true);
  });

  it('removes live switch, Action body and slider in editing and emits configuration only', () => {
    controlFixture();
    const emitted = vi.fn(), configure = vi.fn();
    fixture.componentInstance.control.subscribe(emitted); fixture.componentInstance.configure.subscribe(configure);
    fixture.componentRef.setInput('editing', true); fixture.detectChanges();
    expect(card().querySelector('button.device-control,[role="switch"],.device-control-body,input[type="range"]')).toBeNull();
    const tiles = [...card().querySelectorAll('.device-metric')] as HTMLElement[];
    expect(tiles).toHaveLength(3);
    expect(tiles[0].querySelector('.device-switch-track')).not.toBeNull();
    expect(tiles[0].textContent?.trim()).toBe(''); expect(tiles[0].getAttribute('aria-label')).toContain('power');
    expect(tiles[1].querySelector('.device-action-icon')).not.toBeNull();
    expect(tiles[1].textContent?.trim()).toBe(''); expect(tiles[1].getAttribute('aria-label')).toContain('button');
    for (const tile of tiles) tile.click();
    expect(configure.mock.calls).toEqual([['power'], ['button'], ['level']]);
    expect(emitted).not.toHaveBeenCalled();
  });

  it('blocks shared read-only/endpoint ACL and busy/unknown writes but keeps editing as configuration only', () => {
    controlFixture();
    const emitted = vi.fn(), configure = vi.fn();
    fixture.componentInstance.control.subscribe(emitted); fixture.componentInstance.configure.subscribe(configure);
    fixture.componentRef.setInput('device', { ...source(), config: { ...source().config, isShared: true },
      data: { cloudReachable: true, canCommand: false } }); fixture.detectChanges();
    expect((card().querySelector('button.device-control') as HTMLButtonElement).disabled).toBe(true);
    fixture.componentRef.setInput('device', source());
    fixture.componentRef.setInput('controlStates', { power: { phase: 'unknown', message: '结果未确认', busy: false, blocked: true } });
    fixture.detectChanges();
    const blocked = card().querySelector('button.device-control') as HTMLButtonElement;
    expect(blocked.disabled).toBe(true); expect(blocked.getAttribute('aria-label')).toContain('结果未确认');
    fixture.componentRef.setInput('editing', true); fixture.detectChanges();
    (card().querySelector('.device-metric') as HTMLElement).click();
    expect(configure).toHaveBeenCalledWith('power'); expect(emitted).not.toHaveBeenCalled();
    expect(card().querySelector('input[type="range"]')).toBeNull();
  });

  it('uses a stale range tap only to request preparation, not a guessed numeric value', () => {
    controlFixture(false);
    const emitted = vi.fn(); fixture.componentInstance.control.subscribe(emitted);
    expect(card().querySelector('input[type="range"]')).toBeNull();
    (card().querySelector('.device-range-prepare') as HTMLButtonElement).click();
    expect(emitted).toHaveBeenCalledWith({ binding: controls[2], manifestFingerprint: 'ab', stateRevision: 1, stateFresh: false });
    expect(state.value.endpoints[2].value).toBe(0);
  });

  it('previews pointer input locally and submits once at release with the original witness', () => {
    controlFixture();
    const emitted = vi.fn(), interaction = vi.fn();
    fixture.componentInstance.control.subscribe(emitted); fixture.componentInstance.interactionChange.subscribe(interaction);
    const slider = card().querySelector('input[type="range"]') as HTMLInputElement;
    pointer(slider, 'pointerdown'); input(25); fixture.detectChanges();
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    expect(emitted).not.toHaveBeenCalled(); expect(state.value.endpoints[2].value).toBe(0);
    expect(card().querySelector('.device-range-info strong')?.textContent).toBe('25');
    pointer(slider, 'pointerup'); slider.dispatchEvent(new Event('change', { bubbles: true }));
    expect(emitted).toHaveBeenCalledOnce();
    expect(emitted).toHaveBeenCalledWith({ binding: controls[2], value: 25,
      manifestFingerprint: 'ab', stateRevision: 1, stateFresh: true });
    expect(interaction.mock.calls).toEqual([[true], [false]]);
  });

  it('commits keyboard input on keyup and assistive input on change without duplicate trailing changes', () => {
    controlFixture(); const emitted = vi.fn(); fixture.componentInstance.control.subscribe(emitted);
    const slider = card().querySelector('input[type="range"]') as HTMLInputElement;
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); input(5);
    slider.dispatchEvent(new Event('change', { bubbles: true })); expect(emitted).not.toHaveBeenCalled();
    slider.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true })); expect(emitted).toHaveBeenCalledOnce();
    input(10); expect(emitted).toHaveBeenCalledOnce();
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    expect(emitted.mock.calls.map(call => call[0].value)).toEqual([5, 10]);
  });

  it.each(['pointercancel', 'blur', 'editing', 'disabled', 'state', 'manifest', 'background'] as const)(
    'drops the local range draft on %s and ignores its trailing native change', cause => {
      controlFixture(); const emitted = vi.fn(), interaction = vi.fn();
      fixture.componentInstance.control.subscribe(emitted); fixture.componentInstance.interactionChange.subscribe(interaction);
      const slider = card().querySelector('input[type="range"]') as HTMLInputElement;
      pointer(slider, 'pointerdown'); input(30);
      if (cause === 'pointercancel' || cause === 'blur') slider.dispatchEvent(new Event(cause, { bubbles: true }));
      else if (cause === 'editing') fixture.componentRef.setInput('editing', true);
      else if (cause === 'disabled') fixture.componentRef.setInput('controlsEnabled', false);
      else if (cause === 'state') state.next({ ...state.value, stateRevision: 2 });
      else if (cause === 'manifest') state.next({ ...state.value, manifestFingerprint: 'changed' });
      else port.appActive.next(false);
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      expect(emitted).not.toHaveBeenCalled(); expect(interaction.mock.calls).toEqual([[true], [false]]);
      expect(fixture.componentInstance.rangeValue(fixture.componentInstance.metrics[2])).toBe(0);
    });

  it('does not coerce an unsafe integer State into an adjustable native range', () => {
    controlFixture(); state.next({ ...state.value, endpoints: state.value.endpoints.map(field => field.key === 'level'
      ? { ...field, value: 9007199254740993n } : field) }); fixture.detectChanges();
    expect(card().querySelector('input[type="range"]')).toBeNull();
    expect(card().querySelector('.device-range-prepare')).not.toBeNull();
  });
});
