import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PageWidgetComponent } from '../panel/page-widget';
import { SlideWidgetComponent } from './slide/slide-widget';
import { TileWidgetComponent } from './tile/tile-widget';
import { ToggleWidgetComponent } from './toggle/toggle-widget';
import type { PanelCard } from './widget-kit';

describe('QA5 confirmation ownership', () => {
  function card(variant: 'tile' | 'toggle' | 'slide' = 'tile'): PanelCard {
    return {
      widget: { widgetId: 'original-switch', endpointKey: 'power', type: 'switch', variant,
        title: '电源', grid: { x: 0, y: 0, width: 4, height: 2 }, options: { confirm: true } },
      field: { id: 1, key: 'power', role: 'property', valueType: 'boolean', readable: true, writable: true, notifies: true },
      value: false, display: 'false', draft: '', error: '', disabled: false,
    };
  }
  beforeEach(async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    await TestBed.configureTestingModule({ imports: [TileWidgetComponent, ToggleWidgetComponent, SlideWidgetComponent, PageWidgetComponent] }).compileComponents();
    vi.useFakeTimers();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  function create(variant: 'tile' | 'toggle' = 'tile') {
    const fixture = TestBed.createComponent<TileWidgetComponent | ToggleWidgetComponent>(variant === 'tile' ? TileWidgetComponent : ToggleWidgetComponent);
    let model = card(variant);
    fixture.componentRef.setInput('card', model); fixture.detectChanges();
    const action = vi.fn(); fixture.componentInstance.act.subscribe(action);
    return { fixture, action, get model() { return model; },
      update(next: PanelCard) { model = next; fixture.componentRef.setInput('card', model); fixture.detectChanges(); },
      click() { (variant === 'tile' ? fixture.nativeElement : fixture.nativeElement.querySelector('button.sw')).click(); fixture.detectChanges(); },
    };
  }

  it.each(['tile', 'toggle'] as const)('requires fresh %s confirmation when a new State reverses the intended operation', variant => {
    const t = create(variant), original = structuredClone(t.model);
    t.click(); expect(t.fixture.componentInstance.armed()).toBe(true); expect(t.action).not.toHaveBeenCalled();
    t.update({ ...t.model, value: true, display: 'true' });
    expect(t.fixture.componentInstance.armed()).toBe(false); expect(t.action).not.toHaveBeenCalled();
    t.click(); expect(t.fixture.componentInstance.armed()).toBe(true); expect(t.action).not.toHaveBeenCalled();
    t.click(); expect(t.action.mock.calls).toEqual([[{ kind: 'toggle', value: false }]]);
    expect(t.fixture.componentInstance.card.value).toBe(true); expect(original.value).toBe(false);
  });

  it.each(['tile', 'toggle'] as const)('does not reuse %s confirmation after an observed disabled interval', variant => {
    const t = create(variant); t.click();
    t.update({ ...t.model, disabled: true });
    expect(t.fixture.componentInstance.armed()).toBe(false);
    t.click(); expect(t.action).not.toHaveBeenCalled();
    t.update({ ...t.model, disabled: false });
    t.click(); expect(t.action).not.toHaveBeenCalled();
    t.click(); expect(t.action.mock.calls).toEqual([[{ kind: 'toggle', value: true }]]);
  });

  it.each(['widget', 'endpoint', 'field-id'] as const)('invalidates only the old %s confirmation on rebinding', binding => {
    const t = create(); t.click();
    const model = t.model;
    t.update(binding === 'widget' ? { ...model, widget: { ...model.widget, widgetId: 'new-widget' } }
      : binding === 'endpoint' ? { ...model, widget: { ...model.widget, endpointKey: 'relay' }, field: { ...model.field, key: 'relay' } }
      : { ...model, field: { ...model.field, id: 2 } });
    expect(t.fixture.componentInstance.armed()).toBe(false); expect(t.action).not.toHaveBeenCalled();
    t.click(); expect(t.action).not.toHaveBeenCalled();
    t.click(); expect(t.action.mock.calls).toEqual([[{ kind: 'toggle', value: true }]]);
  });

  it('does not resurrect confirmation when the confirm setting is removed then restored', () => {
    const t = create(); t.click();
    t.update({ ...t.model, widget: { ...t.model.widget, options: { confirm: false } } });
    expect(t.fixture.componentInstance.armed()).toBe(false);
    t.update({ ...t.model, widget: { ...t.model.widget, options: { confirm: true } } });
    t.click(); expect(t.action).not.toHaveBeenCalled();
  });

  it.each(['tile', 'toggle'] as const)('preserves %s confirmation and its original deadline across cosmetic same-state refresh', variant => {
    const t = create(variant); t.click(); vi.advanceTimersByTime(2000);
    t.update({ ...t.model, display: '关闭', widget: { ...t.model.widget, title: '新昵称' } });
    expect(t.fixture.componentInstance.armed()).toBe(true);
    t.click(); expect(t.action.mock.calls).toEqual([[{ kind: 'toggle', value: true }]]);
    t.click(); expect(t.fixture.componentInstance.armed()).toBe(true);
    vi.advanceTimersByTime(2000);
    t.update({ ...t.model }); vi.advanceTimersByTime(1000);
    expect(t.fixture.componentInstance.armed()).toBe(false);
    expect(t.action).toHaveBeenCalledTimes(1);
  });

  it('expires without emitting and requires a new first click after the original three-second window', () => {
    const t = create(); t.click(); vi.advanceTimersByTime(3000);
    expect(t.fixture.componentInstance.armed()).toBe(false); expect(t.action).not.toHaveBeenCalled();
    t.click(); expect(t.action).not.toHaveBeenCalled(); t.fixture.destroy();
    vi.advanceTimersByTime(3000); expect(t.action).not.toHaveBeenCalled();
  });

  it('keeps the slide completed-gesture confirmation path explicit rather than requiring two extra clicks', () => {
    const fixture = TestBed.createComponent(SlideWidgetComponent), action = vi.fn(), model = card('slide');
    fixture.componentRef.setInput('card', model); fixture.detectChanges(); fixture.componentInstance.act.subscribe(action);
    fixture.componentInstance.toggle(true, true);
    expect(action.mock.calls).toEqual([[{ kind: 'toggle', value: true }]]);
    expect(fixture.componentInstance.armed()).toBe(false); expect(model.value).toBe(false);
  });

  it('keeps the shared preview inert while State and disabled inputs change', () => {
    const fixture = TestBed.createComponent(PageWidgetComponent), action = vi.fn();
    fixture.componentRef.setInput('card', card()); fixture.detectChanges(); fixture.componentInstance.action.subscribe(action);
    const child = fixture.debugElement.query(By.directive(TileWidgetComponent)).componentInstance as TileWidgetComponent;
    child.toggle(); fixture.componentRef.setInput('card', { ...card(), value: true, disabled: true }); fixture.detectChanges();
    fixture.componentRef.setInput('card', { ...card(), value: true }); fixture.detectChanges(); child.toggle();
    expect(fixture.nativeElement.hasAttribute('inert')).toBe(true); expect(action).not.toHaveBeenCalled();
  });
});
