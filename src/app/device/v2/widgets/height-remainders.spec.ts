import { TestBed } from '@angular/core/testing';
import { ActionWidgetComponent } from './action/action-widget';
import { KeysWidgetComponent } from './keys/keys-widget';
import type { PanelCard } from './widget-kit';

describe('QA5 final two height remainders', () => {
  function card(rows = 3, count = 6): PanelCard {
    return {
      widget: { widgetId: 'saved-keypad', endpointKey: 'keys', title: '原遥控器', type: 'button', variant: 'keys',
        grid: { x: 0, y: 0, width: 4, height: rows }, options: {} },
      field: { id: 1, key: 'keys', role: 'action', valueType: 'text', readable: false, writable: true,
        notifies: false, choices: Array.from({ length: count }, (_, index) => `键${index + 1}`) },
      value: undefined, display: '', draft: '', error: '', disabled: false,
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ActionWidgetComponent, KeysWidgetComponent] }).compileComponents();
  });

  it('lets the one-row action card consume the common padding budget without changing invoke', () => {
    const fixture = TestBed.createComponent(ActionWidgetComponent), value = card(1);
    value.widget = { ...value.widget, variant: 'action', options: { shape: 'card' } };
    value.field = { ...value.field, valueType: 'null', choices: undefined };
    const original = structuredClone(value);
    fixture.componentRef.setInput('card', value); fixture.detectChanges();
    expect(fixture.nativeElement.classList.contains('wide')).toBe(true);
    expect(fixture.nativeElement.classList.contains('op-card')).toBe(true);
    const button = fixture.nativeElement.querySelector('.op');
    expect(getComputedStyle(button).paddingBlock).toContain('--ui-card-pad-block');
    const action = vi.fn(); fixture.componentInstance.act.subscribe(action);
    button.click(); expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'invoke' });
    expect(value).toEqual(original);
  });

  it.each([
    { count: 0, actualRows: 1 }, { count: 2, actualRows: 2 },
    { count: 6, actualRows: 3 }, { count: 10, actualRows: 3 },
  ])('exposes actual keypad rows without overwriting saved geometry: %j', ({ count, actualRows }) => {
    const fixture = TestBed.createComponent(KeysWidgetComponent), value = card(3, count), original = structuredClone(value);
    fixture.componentRef.setInput('card', value); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).style.getPropertyValue('--ui-keypad-rows')).toBe(String(actualRows));
    expect((fixture.nativeElement as HTMLElement).style.getPropertyValue('--rows')).toBe('');
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.key')];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(value.field.choices);
    for (const button of buttons) {
      expect(getComputedStyle(button).minWidth).toBe('48px');
      expect(getComputedStyle(button).minHeight).toBe('48px');
    }
    if (count) {
      const action = vi.fn(); fixture.componentInstance.act.subscribe(action);
      buttons[count - 1].click();
      expect(action).toHaveBeenCalledExactlyOnceWith({ kind: 'select', value: `键${count}` });
    }
    expect(value).toEqual(original);
  });

  it('budgets a multi-row keypad from its 48px targets, gaps and existing fill height', () => {
    const fixture = TestBed.createComponent(KeysWidgetComponent);
    fixture.componentRef.setInput('card', card()); fixture.detectChanges();
    const style = getComputedStyle(fixture.nativeElement);
    const content = style.getPropertyValue('--ui-keypad-min-height');
    expect(content).toContain('--ui-keypad-rows'); expect(content).toContain('48px'); expect(content).toContain('8px');
    expect(style.paddingBlock).toContain('--fill-h');
    expect(style.paddingBlock).toContain('34px');
    expect(style.paddingBlock).toContain('--ui-card-pad-block');
    // This checks only emitted CSS. Real pixel fit is a separate phone check.
    expect(getComputedStyle(fixture.nativeElement.querySelector('.keys')).overflow).toBe('auto');
  });

  it('keeps a single-row keypad on the shared card budget', () => {
    const fixture = TestBed.createComponent(KeysWidgetComponent), value = card(1, 3);
    fixture.componentRef.setInput('card', value); fixture.detectChanges();
    expect(fixture.nativeElement.classList.contains('inline')).toBe(true);
    expect((fixture.nativeElement as HTMLElement).style.getPropertyValue('--ui-keypad-rows')).toBe('1');
    expect(getComputedStyle(fixture.nativeElement).getPropertyValue('--ui-keypad-min-height')).toBe('');
    expect(fixture.nativeElement.querySelectorAll('.key')).toHaveLength(3);
  });
});
