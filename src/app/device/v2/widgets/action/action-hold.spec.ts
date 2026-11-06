import { TestBed } from '@angular/core/testing';
import { ActionWidgetComponent } from './action-widget';
import type { PanelCard } from '../widget-kit';

describe('QA5 action hold ownership', () => {
  const card = (shape: 'circle' | 'card' = 'circle'): PanelCard => ({
    widget: { widgetId: 'action-original', endpointKey: 'action-a', type: 'button', variant: 'action',
      title: '测试动作', grid: { x: 0, y: 0, width: 4, height: 2 }, options: { hold: true, shape } },
    field: { id: 1, key: 'action-a', role: 'action', valueType: 'null', readable: false, writable: true, notifies: false },
    value: null, display: '', draft: '', error: '', disabled: false,
  });

  beforeEach(async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    await TestBed.configureTestingModule({ imports: [ActionWidgetComponent] }).compileComponents();
    vi.useFakeTimers();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  function create(shape: 'circle' | 'card' = 'circle') {
    const fixture = TestBed.createComponent(ActionWidgetComponent), model = card(shape), action = vi.fn();
    fixture.componentRef.setInput('card', model); fixture.detectChanges(); fixture.componentInstance.act.subscribe(action);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    return { fixture, model, action, button,
      event(type: string) { button.dispatchEvent(new Event(type, { bubbles: true, cancelable: true })); fixture.detectChanges(); },
      update(next: PanelCard) { fixture.componentRef.setInput('card', next); fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('button')).toBe(button); },
    };
  }
  function advance(ms: number) { vi.advanceTimersByTime(ms); }

  it.each(['circle', 'card'] as const)('never lets a cancelled %s timer submit the next short hold', shape => {
    const t = create(shape);
    t.event('pointerdown'); advance(400); t.event('pointercancel'); advance(100); t.event('pointerdown');
    advance(300); expect(t.action).not.toHaveBeenCalled(); expect(t.fixture.componentInstance.holding()).toBe(true);
    advance(499); expect(t.action).not.toHaveBeenCalled();
    advance(1); expect(t.action).toHaveBeenCalledExactlyOnceWith({ kind: 'invoke' });
    expect(t.model.value).toBeNull();
  });

  it.each(['widget', 'endpoint', 'field-id'] as const)('discards the pending hold when %s binding changes', binding => {
    const t = create(); t.event('pointerdown'); advance(400);
    t.update(binding === 'widget' ? { ...t.model, widget: { ...t.model.widget, widgetId: 'new-action' } }
      : binding === 'endpoint' ? { ...t.model, widget: { ...t.model.widget, endpointKey: 'action-b' }, field: { ...t.model.field, key: 'action-b' } }
      : { ...t.model, field: { ...t.model.field, id: 2 } });
    expect(t.fixture.componentInstance.holding()).toBe(false); advance(400); expect(t.action).not.toHaveBeenCalled();
    t.event('pointerdown'); advance(799); expect(t.action).not.toHaveBeenCalled();
    advance(1); expect(t.action).toHaveBeenCalledExactlyOnceWith({ kind: 'invoke' });
  });

  it('does not resurrect a pending hold across disabled then enabled inputs', () => {
    const t = create(); t.event('pointerdown'); advance(400);
    t.update({ ...t.model, disabled: true }); expect(t.fixture.componentInstance.holding()).toBe(false);
    t.update({ ...t.model }); advance(400); expect(t.action).not.toHaveBeenCalled();
    t.event('pointerdown'); advance(799); expect(t.action).not.toHaveBeenCalled();
    advance(1); expect(t.action).toHaveBeenCalledExactlyOnceWith({ kind: 'invoke' });
  });

  it('does not resurrect a pending hold when hold is removed then restored', () => {
    const t = create(); t.event('pointerdown'); advance(400);
    t.update({ ...t.model, widget: { ...t.model.widget, options: { hold: false } } });
    expect(t.fixture.componentInstance.holding()).toBe(false);
    t.update({ ...t.model }); advance(400); expect(t.action).not.toHaveBeenCalled();
    t.event('pointerdown'); advance(800); expect(t.action).toHaveBeenCalledExactlyOnceWith({ kind: 'invoke' });
  });

  it('preserves the original deadline across same-binding cosmetic refresh', () => {
    const t = create(); t.event('pointerdown'); advance(400);
    t.update({ ...t.model, display: '新显示', widget: { ...t.model.widget, title: '新标题' } });
    expect(t.fixture.componentInstance.holding()).toBe(true);
    advance(399); expect(t.action).not.toHaveBeenCalled();
    advance(1); expect(t.action).toHaveBeenCalledExactlyOnceWith({ kind: 'invoke' });
  });

  it('ignores duplicate press starts without postponing the active deadline', () => {
    const t = create(); t.event('pointerdown'); advance(400); t.event('pointerdown');
    advance(400); expect(t.action).toHaveBeenCalledExactlyOnceWith({ kind: 'invoke' });
    advance(400); expect(t.action).toHaveBeenCalledTimes(1);
  });

  it('cleans pending long presses on destruction without any invoke', () => {
    const t = create(); t.event('pointerdown'); advance(400); t.fixture.destroy();
    advance(1000); expect(t.action).not.toHaveBeenCalled();
  });

  it('preserves ordinary click invoke when hold is off', () => {
    const t = create(); t.update({ ...t.model, widget: { ...t.model.widget, options: { hold: false } } });
    t.event('pointerdown'); t.event('pointerup'); t.button.click(); t.fixture.detectChanges();
    expect(t.action).toHaveBeenCalledExactlyOnceWith({ kind: 'invoke' });
  });
});
