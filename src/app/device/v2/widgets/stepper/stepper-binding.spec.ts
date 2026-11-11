import { TestBed } from '@angular/core/testing';
import { StepperWidgetComponent } from './stepper-widget';
import type { PanelCard } from '../widget-kit';

describe('QA5 stepper draft binding', () => {
  function create(role: 'action' | 'property' = 'action') {
    let model: PanelCard = {
      widget: { widgetId: 'stepper-original', endpointKey: 'value-a', type: 'slider', variant: 'stepper',
        title: '数值动作', grid: { x: 0, y: 0, width: 4, height: 2 } },
      field: { id: 1, key: 'value-a', role, valueType: 'integer', readable: true, writable: true, notifies: true,
        minimum: 0, maximum: 100, step: 1 },
      value: 40, display: '40', draft: '', error: '', disabled: false,
    };
    const fixture = TestBed.createComponent(StepperWidgetComponent), action = vi.fn();
    fixture.componentRef.setInput('card', model); fixture.detectChanges(); fixture.componentInstance.act.subscribe(action);
    const component = fixture.componentInstance;
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[aria-label="增加"]');
    button.setPointerCapture = vi.fn();
    const pointer = (type: string, pointerId = 7) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { pointerId: { value: pointerId }, button: { value: 0 } });
      button.dispatchEvent(event); fixture.detectChanges();
    };
    return { fixture, component, action, get model() { return model; }, pointer,
      update(next: PanelCard) { model = next; fixture.componentRef.setInput('card', next); fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('button[aria-label="增加"]')).toBe(button); },
      nudge() { pointer('pointerdown'); pointer('pointerup'); },
      send() { fixture.nativeElement.querySelector('button[aria-label="发送"]').click(); fixture.detectChanges(); },
    };
  }
  const rebound = (model: PanelCard): PanelCard => ({ ...model,
    widget: { ...model.widget, endpointKey: 'value-b' }, field: { ...model.field, key: 'value-b', id: 2 } });

  beforeEach(async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    await TestBed.configureTestingModule({ imports: [StepperWidgetComponent] }).compileComponents();
    vi.useFakeTimers();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each(['widget', 'endpoint', 'field-id'] as const)('does not send the old action draft after %s rebinding at the same reported value', binding => {
    const t = create(); t.nudge(); expect(t.component.value).toBe(41); expect(t.action).not.toHaveBeenCalled();
    t.update(binding === 'widget' ? { ...t.model, widget: { ...t.model.widget, widgetId: 'stepper-new' } }
      : binding === 'endpoint' ? rebound(t.model) : { ...t.model, field: { ...t.model.field, id: 2 } });
    expect(t.action).not.toHaveBeenCalled();
    t.send(); expect(t.action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 40 });
    expect(t.component.value).toBe(40);
    expect(t.model.value).toBe(40);
  });

  it('preserves an unsent draft across same-binding title and display refresh', () => {
    const t = create(); t.nudge();
    t.update({ ...t.model, display: '四十', widget: { ...t.model.widget, title: '新标题' } });
    expect(t.component.value).toBe(41); expect(t.action).not.toHaveBeenCalled();
    t.send(); expect(t.action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 41 });
  });

  it('discards the old repeat and late release on rebinding without writing the new target', () => {
    const t = create(); t.pointer('pointerdown'); vi.advanceTimersByTime(450); expect(t.component.value).toBe(42);
    t.update(rebound(t.model)); expect(t.component.value).toBe(40);
    vi.advanceTimersByTime(1000); t.pointer('pointerup');
    expect(t.component.value).toBe(40); expect(t.action).not.toHaveBeenCalled();
    t.nudge(); expect(t.component.value).toBe(41); expect(t.action).not.toHaveBeenCalled();
    t.send(); expect(t.action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 41 });
  });

  it('cannot turn the old action hold into a property command after a mode change', () => {
    const t = create(); t.pointer('pointerdown');
    t.update({ ...t.model, field: { ...t.model.field, role: 'property' } });
    expect(t.component.value).toBe(40); t.pointer('pointerup');
    vi.advanceTimersByTime(500); expect(t.action).not.toHaveBeenCalled();
    t.nudge(); expect(t.action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 41 });
  });

  it('does not let a previous property settle timer erase a new action draft', () => {
    const t = create('property'); t.nudge(); expect(t.action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 41 });
    vi.advanceTimersByTime(500);
    t.update({ ...rebound(t.model), field: { ...rebound(t.model).field, role: 'action' } });
    expect(t.component.value).toBe(40); t.action.mockClear(); t.nudge(); expect(t.component.value).toBe(41);
    vi.advanceTimersByTime(1000); expect(t.component.value).toBe(41); expect(t.action).not.toHaveBeenCalled();
    t.send(); expect(t.action).toHaveBeenCalledExactlyOnceWith({ kind: 'range', value: 41 });
  });

  it.each(['action', 'property'] as const)('keeps the existing same-binding %s report-following behavior', role => {
    const t = create(role); t.nudge(); t.action.mockClear();
    t.update({ ...t.model, value: 55, display: '55' });
    expect(t.component.local()).toBeNull(); expect(t.component.value).toBe(55);
    expect(t.fixture.nativeElement.querySelector('[aria-valuenow]').getAttribute('aria-valuenow')).toBe('55');
    vi.advanceTimersByTime(1600); expect(t.component.value).toBe(55); expect(t.action).not.toHaveBeenCalled();
  });

  it('clears sent feedback on rebinding without leaking its old timeout', () => {
    const t = create(); t.send(); expect(t.component.sent()).toBe(true); vi.advanceTimersByTime(400);
    t.update(rebound(t.model)); expect(t.component.sent()).toBe(false); expect(t.action).toHaveBeenCalledTimes(1);
    t.send(); vi.advanceTimersByTime(800); expect(t.component.sent()).toBe(true);
    vi.advanceTimersByTime(399); expect(t.component.sent()).toBe(true);
    vi.advanceTimersByTime(1); expect(t.component.sent()).toBe(false);
    expect(t.action).toHaveBeenCalledTimes(2);
  });
});
