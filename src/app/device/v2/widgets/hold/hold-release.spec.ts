import { TestBed } from '@angular/core/testing';
import { PageLayoutPanelComponent } from '../../panel/page-layout-panel';
import { HoldWidgetComponent } from './hold-widget';
import type { PanelAction, PanelCard, WidgetAct } from '../widget-kit';

describe('QA5 Hold original-target release', () => {
  const card = (): PanelCard => ({
    widget: { widgetId: 'saved-hold', endpointKey: 'a', type: 'switch', variant: 'hold', grid: { x: 0, y: 0, width: 2, height: 2 } },
    field: { id: 1, key: 'a', role: 'property', valueType: 'boolean', readable: true, writable: true, notifies: true },
    value: false, display: '', draft: '', error: '', disabled: false, controlScope: 'device-a:1', controlAvailable: true,
  });
  function pointer(button: HTMLElement, type: string, pointerId = 7) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { pointerId: { value: pointerId }, button: { value: 0 } });
    button.dispatchEvent(event);
  }
  function mount() {
    const fixture = TestBed.createComponent(HoldWidgetComponent), initial = card();
    fixture.componentRef.setInput('card', initial); fixture.detectChanges();
    const actions: WidgetAct[] = [];
    fixture.componentInstance.act.subscribe(action => actions.push(action));
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.setPointerCapture = vi.fn();
    return { fixture, initial, actions, button };
  }
  beforeEach(async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    await TestBed.configureTestingModule({ imports: [HoldWidgetComponent, PageLayoutPanelComponent] }).compileComponents();
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([true, false])('releases A, never newly bound B (available=%s), through the original panel template', available => {
    const fixture = TestBed.createComponent(PageLayoutPanelComponent), a = card();
    fixture.componentRef.setInput('cards', [a]); fixture.componentRef.setInput('interactive', true); fixture.detectChanges();
    const actions: PanelAction[] = [];
    fixture.componentInstance.action.subscribe(action => actions.push(action));
    const button: HTMLElement = fixture.nativeElement.querySelector('.hw'); button.setPointerCapture = vi.fn();
    pointer(button, 'pointerdown');
    fixture.componentRef.setInput('cards', [{ ...a, widget: { ...a.widget, endpointKey: 'b' },
      field: { ...a.field, id: 2, key: 'b' }, controlAvailable: available, disabled: !available }]);
    fixture.detectChanges();
    pointer(button, 'pointerup');
    expect(actions.map(action => [action.field.key, action.value])).toEqual([['a', true], ['a', false]]);
    expect(actions[1]?.hold?.id).toBe(actions[0]?.hold?.id);
    fixture.destroy();
  });

  it('makes one original-target release when the held widget is removed in the same owner', () => {
    const fixture = TestBed.createComponent(PageLayoutPanelComponent), a = card();
    fixture.componentRef.setInput('cards', [a]); fixture.componentRef.setInput('interactive', true); fixture.detectChanges();
    const actions: PanelAction[] = []; fixture.componentInstance.action.subscribe(action => actions.push(action));
    const button: HTMLElement = fixture.nativeElement.querySelector('.hw'); button.setPointerCapture = vi.fn();
    pointer(button, 'pointerdown'); fixture.componentRef.setInput('cards', []); fixture.detectChanges(); fixture.destroy();
    expect(actions.map(action => [action.field.key, action.value])).toEqual([['a', true], ['a', false]]);
  });

  it('allows one busy release while preserving actual State and same-binding refresh', () => {
    const { fixture, initial, actions, button } = mount();
    pointer(button, 'pointerdown');
    const echo = { ...initial, field: { ...initial.field }, value: true, disabled: true };
    fixture.componentRef.setInput('card', echo); fixture.detectChanges();
    expect(fixture.componentInstance.pressed()).toBe(true);
    pointer(button, 'pointerup'); pointer(button, 'lostpointercapture'); button.dispatchEvent(new Event('blur'));
    fixture.destroy();
    expect(actions.map(action => action.value)).toEqual([true, false]);
    expect(echo.value).toBe(true);
  });

  it('ignores other pointer tails and keyboard keyup while a pointer owns the hold', () => {
    const { fixture, actions, button } = mount();
    pointer(button, 'pointerdown'); pointer(button, 'pointercancel', 99); pointer(button, 'pointerup', 99);
    button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    expect(actions.map(action => action.value)).toEqual([true]);
    pointer(button, 'pointerup');
    expect(actions.map(action => action.value)).toEqual([true, false]); fixture.destroy();
  });

  it('retires once on cancellation, ignores orphan tails and keeps keyboard release available', () => {
    const { fixture, actions, button } = mount();
    pointer(button, 'pointerup'); pointer(button, 'pointerdown'); pointer(button, 'pointercancel');
    pointer(button, 'lostpointercapture'); pointer(button, 'pointerup'); button.dispatchEvent(new Event('blur'));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    fixture.destroy();
    expect(actions.map(action => action.value)).toEqual([true, false, true, false]);
  });

  it('does not start the rebound target from a still-held keyboard repeat', () => {
    const { fixture, initial, actions, button } = mount();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    fixture.componentRef.setInput('card', { ...initial, field: { ...initial.field, id: 2, key: 'b' } });
    fixture.detectChanges();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    expect(actions.map(action => [action.hold?.target.field.key, action.value])).toEqual([['a', true], ['a', false]]);
    fixture.destroy();
  });

  it.each(['scope', 'unavailable', 'interactive'] as const)('retires %s without replay, retarget or fake State', boundary => {
    const { fixture, initial, actions, button } = mount();
    pointer(button, 'pointerdown');
    if (boundary === 'interactive') fixture.componentRef.setInput('interactive', false);
    else fixture.componentRef.setInput('card', { ...initial, ...(boundary === 'scope' ? { controlScope: 'device-b:2' } : { controlAvailable: false, disabled: true }) });
    fixture.detectChanges();
    expect(fixture.componentInstance.pressed()).toBe(false);
    fixture.componentRef.setInput('card', { ...initial, controlScope: 'device-b:3' });
    if (boundary === 'interactive') fixture.componentRef.setInput('interactive', true);
    fixture.detectChanges(); pointer(button, 'pointerup'); fixture.destroy();
    expect(actions.map(action => action.value)).toEqual([true]);
    expect(initial.value).toBe(false);
  });
});
