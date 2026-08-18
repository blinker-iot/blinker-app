import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  TabSelectorComponent,
  TabSelectorOption,
} from './tab-selector.component';

describe('TabSelectorComponent', () => {
  let fixture: ComponentFixture<TabSelectorComponent>;

  const options: TabSelectorOption[] = [
    { value: 'first', label: '第一个', icon: 'fa-light fa-list' },
    { value: 'second', label: '第二个', badge: 2 },
    { value: 'disabled', label: '已禁用', disabled: true },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabSelectorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TabSelectorComponent);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('value', 'first');
    fixture.componentRef.setInput('ariaLabel', '测试分类');
    fixture.detectChanges();
  });

  it('renders selected, badge and disabled states', () => {
    const element = fixture.nativeElement as HTMLElement;
    const tabs = element.querySelectorAll<HTMLButtonElement>('[role="tab"]');

    expect(element.querySelector('[role="tablist"]')?.getAttribute('aria-label'))
      .toBe('测试分类');
    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].querySelector('.tab-badge')?.textContent).toContain('2');
    expect(tabs[2].disabled).toBe(true);
  });

  it('emits enabled tab changes only', () => {
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    const element = fixture.nativeElement as HTMLElement;
    const tabs = element.querySelectorAll<HTMLButtonElement>('[role="tab"]');

    tabs[1].click();
    tabs[2].click();

    expect(changed).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledWith('second');
  });

  it('moves the selected background to the active tab', () => {
    fixture.componentRef.setInput('value', 'second');
    fixture.detectChanges();

    const indicator = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('.tab-indicator');

    expect(indicator?.style.transform).toContain('100%');
    expect(indicator?.style.transform).toContain('5px');
  });
});
