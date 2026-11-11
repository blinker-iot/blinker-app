import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PageWidgetComponent } from '../panel/page-widget';
import { DialWidgetComponent } from './dial/dial-widget';
import { KeysWidgetComponent } from './keys/keys-widget';
import { LevelsWidgetComponent } from './levels/levels-widget';
import { PickerWidgetComponent } from './picker/picker-widget';
import type { PanelCard, WidgetAct } from './widget-kit';

describe('UI3 remaining touch families retain the shared preview boundary', () => {
  beforeEach(async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    await TestBed.configureTestingModule({ imports: [PageWidgetComponent] }).compileComponents();
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['keys', KeysWidgetComponent, 'button'], ['levels', LevelsWidgetComponent, 'slider'],
    ['picker', PickerWidgetComponent, 'color'], ['dial', DialWidgetComponent, 'slider'],
  ] as const)('keeps %s inert unless explicitly interactive, without changing its saved card', (variant, component, type) => {
    const card: PanelCard = {
      widget: { widgetId: `saved-${variant}`, type, variant, endpointKey: 'original-binding',
        title: '保留的名称', grid: { x: 4, y: 6, width: 4, height: 3 }, options: { showTitle: false } },
      field: { id: 3, key: 'original-binding', role: type === 'button' ? 'action' : 'property',
        valueType: type === 'button' ? 'text' : 'integer', readable: true, writable: true, notifies: true,
        minimum: 0, maximum: type === 'color' ? 0xffffff : 10, step: 1, choices: ['开机', '静音'] },
      value: type === 'button' ? '' : 2, display: '原状态', draft: '', error: '原未确认请求保留', disabled: false,
    };
    const original = structuredClone(card);
    const fixture = TestBed.createComponent(PageWidgetComponent);
    fixture.componentRef.setInput('card', card);
    fixture.detectChanges();
    const child = fixture.debugElement.query(By.directive(component)).componentInstance;
    const action = vi.fn();
    fixture.componentInstance.action.subscribe(action);
    const event: WidgetAct = type === 'button' ? { kind: 'select', value: '开机' } : { kind: 'range', value: 3 };

    expect(child.card).toBe(card);
    expect(fixture.nativeElement.hasAttribute('inert')).toBe(true);
    child.act.emit(event);
    expect(action).not.toHaveBeenCalled();

    fixture.componentRef.setInput('interactive', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.hasAttribute('inert')).toBe(false);
    child.act.emit(event);
    expect(action).toHaveBeenCalledExactlyOnceWith(event);

    fixture.componentRef.setInput('interactive', false);
    fixture.detectChanges();
    child.act.emit(event);
    expect(action).toHaveBeenCalledTimes(1);
    expect(card).toEqual(original);
    fixture.destroy();
  });
});
