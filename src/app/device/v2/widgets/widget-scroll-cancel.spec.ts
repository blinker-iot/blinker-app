import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialWidgetComponent } from './dial/dial-widget';
import { DpadWidgetComponent } from './dpad/dpad-widget';
import { GradientWidgetComponent } from './gradient/gradient-widget';
import { HoldWidgetComponent } from './hold/hold-widget';
import { LevelWidgetComponent } from './level/level-widget';
import { PickerWidgetComponent } from './picker/picker-widget';
import { SlideWidgetComponent } from './slide/slide-widget';
import { StepperWidgetComponent } from './stepper/stepper-widget';
import type { WidgetBase } from './widget-base';
import type { PanelCard } from './widget-kit';

const components = { gradient: GradientWidgetComponent, level: LevelWidgetComponent, dial: DialWidgetComponent,
  picker: PickerWidgetComponent, slide: SlideWidgetComponent, stepper: StepperWidgetComponent,
  hold: HoldWidgetComponent, dpad: DpadWidgetComponent };
type Kind = keyof typeof components;

describe('QA5 scroll cancellation preserves explicit control actions', () => {
  function setup(kind: Kind) {
    const boolean = kind === 'slide' || kind === 'hold';
    const card: PanelCard = {
      widget: { widgetId: `saved-${kind}`, endpointKey: 'original', type: boolean ? 'switch' : kind === 'picker' ? 'color'
        : kind === 'dpad' ? 'button' : 'slider', variant: kind,
        grid: { x: 0, y: 0, width: 4, height: 2 }, options: kind === 'dpad' ? { momentary: true } : {} },
      field: { id: 1, key: 'original', role: kind === 'dpad' ? 'action' : 'property',
        valueType: boolean ? 'boolean' : kind === 'dpad' ? 'text' : 'integer', readable: true, writable: true,
        notifies: true, minimum: 0, maximum: kind === 'picker' ? 0xffffff : 100, step: 1,
        ...(kind === 'dpad' ? { choices: ['前进', '后退', '左转', '右转', '停止'] } : {}) },
      value: boolean ? false : kind === 'picker' ? 0x3482ff : kind === 'dpad' ? '' : 40,
      display: '', draft: '', disabled: false, error: '',
    };
    const fixture = TestBed.createComponent(components[kind] as Type<WidgetBase>);
    fixture.componentRef.setInput('card', card);
    fixture.detectChanges();
    const action = vi.fn();
    fixture.componentInstance.act.subscribe(action);
    return { fixture, action, card, original: structuredClone(card) };
  }

  function target(element: HTMLElement): HTMLElement {
    element.setPointerCapture = vi.fn();
    element.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);
    return element;
  }

  function pointer(element: HTMLElement, type: string, x = 20, y = 50, pointerId = 7): void {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { pointerId: { value: pointerId }, clientX: { value: x }, clientY: { value: y },
      button: { value: 0 }, pointerType: { value: 'touch' } });
    element.dispatchEvent(event);
  }

  beforeEach(async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    await TestBed.configureTestingModule({ imports: Object.values(components) }).compileComponents();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each([
    ['gradient', '.gs-track'], ['level', '.lvl-track'], ['dial', '.dl-svg'],
    ['picker', '.cw-box'], ['slide', '.slide-knob'],
  ] as const)('drops %s preview on native scroll cancellation and accepts a fresh explicit release', (kind, selector) => {
    const { fixture, action, card, original } = setup(kind);
    const element = target(fixture.nativeElement.querySelector(selector));
    if (kind === 'slide') {
      element.parentElement!.style.paddingLeft = '4px';
      Object.defineProperty(element.parentElement, 'clientWidth', { value: 200 });
      Object.defineProperty(element, 'offsetWidth', { value: 48 });
    }
    pointer(element, 'pointerdown', 50, 0);
    pointer(element, 'pointermove', 190, 20);
    expect(action).not.toHaveBeenCalled();
    pointer(element, 'pointercancel', 190, 20);
    pointer(element, 'pointerup', 190, 20);
    expect(action).not.toHaveBeenCalled();
    const state = fixture.componentInstance as WidgetBase & { local?: () => unknown; position?: () => unknown };
    expect((state.local ?? state.position)!()).toBeNull();
    pointer(element, 'pointerdown', 50, 0, 8);
    pointer(element, 'pointermove', 190, 20, 8);
    pointer(element, 'pointerup', 190, 20, 8);
    pointer(element, 'pointerup', 190, 20, 8);
    expect(action).toHaveBeenCalledTimes(1);
    expect(card).toEqual(original);
  });

  it('does not cancel another active range pointer', () => {
    const { fixture, action } = setup('gradient');
    const element = target(fixture.nativeElement.querySelector('.gs-track'));
    pointer(element, 'pointerdown');
    pointer(element, 'pointermove', 80);
    pointer(element, 'pointercancel', 80, 50, 99);
    expect(action).not.toHaveBeenCalled();
    pointer(element, 'pointerup', 80);
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 80 });
  });

  it.each(['stepper', 'dial'] as const)('cancels %s repeat without submission, late ticks or lost ownership', kind => {
    vi.useFakeTimers();
    const { fixture, action } = setup(kind);
    const element = target(fixture.nativeElement.querySelector('button[aria-label="增加"],button[aria-label="升高"]'));
    pointer(element, 'pointerdown');
    vi.advanceTimersByTime(450);
    pointer(element, 'pointercancel');
    pointer(element, 'pointerup');
    expect(action).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect((fixture.componentInstance as StepperWidgetComponent).value).toBe(40);
    pointer(element, 'pointerdown', 20, 50, 8);
    pointer(element, 'pointercancel', 20, 50, 99);
    pointer(element, 'pointerup', 20, 50, 8);
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 41 });
  });

  it.each(['hold', 'dpad'] as const)('still safely releases an already pressed %s on scroll cancellation', kind => {
    const { fixture, action } = setup(kind);
    const element = target(fixture.nativeElement.querySelector(kind === 'hold' ? '.hw' : '.dp-key.up'));
    pointer(element, 'pointerdown');
    pointer(element, 'pointercancel');
    pointer(element, 'lostpointercapture');
    pointer(element, 'pointerup');
    expect(action.mock.calls).toEqual(kind === 'hold'
      ? [[expect.objectContaining({ kind: 'toggle', value: true, hold: expect.objectContaining({ phase: 'press' }) })],
        [expect.objectContaining({ kind: 'toggle', value: false, hold: expect.objectContaining({ phase: 'release' }) })]]
      : [[{ kind: 'select', value: '前进' }], [{ kind: 'select', value: '停止' }]]);
  });

  it('preserves an action-stepper draft when the next press becomes a scroll', () => {
    const { fixture, action, card } = setup('stepper');
    fixture.componentRef.setInput('card', { ...card, field: { ...card.field, role: 'action' } });
    fixture.detectChanges();
    const element = target(fixture.nativeElement.querySelector('button[aria-label="增加"]'));
    pointer(element, 'pointerdown');
    pointer(element, 'pointerup');
    expect((fixture.componentInstance as StepperWidgetComponent).value).toBe(41);
    expect(action).not.toHaveBeenCalled();
    pointer(element, 'pointerdown', 20, 50, 8);
    pointer(element, 'pointercancel', 20, 50, 8);
    expect((fixture.componentInstance as StepperWidgetComponent).value).toBe(41);
    expect(action).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('.ns-go').click();
    expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 41 });
  });

  it.each([['gradient', '.gs-track'], ['dial', '.dl-svg']] as const)(
    'preserves earlier local %s confirmation while discarding only the cancelled gesture', (kind, selector) => {
      const { fixture, action, card, original } = setup(kind);
      const element = target(fixture.nativeElement.querySelector(selector));
      pointer(element, 'pointerdown', 50, 0);
      pointer(element, 'pointerup', 50, 0);
      const component = fixture.componentInstance as DialWidgetComponent;
      const previous = component.local();
      expect(previous).not.toBeNull();
      expect(action).toHaveBeenCalledTimes(1);
      action.mockClear();
      pointer(element, 'pointerdown', 20, 80, 8);
      pointer(element, 'pointermove', 190, 20, 8);
      pointer(element, 'pointercancel', 190, 20, 8);
      expect(component.local()).toBe(previous);
      expect(action).not.toHaveBeenCalled();
      expect(card).toEqual(original);
    });
});
