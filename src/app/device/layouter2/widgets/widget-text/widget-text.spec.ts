import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WidgetTextComponent } from './widget-text';

describe('WidgetTextComponent', () => {
  let fixture: ComponentFixture<WidgetTextComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WidgetTextComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WidgetTextComponent);
  });

  it('renders only one line of text and ignores removed presentation fields', () => {
    fixture.componentRef.setInput('widget', {
      type: 'tex',
      key: 'message',
      t0: '单行文本',
      t1: '不应显示的文本2',
      ico: 'fal fa-font',
      clr: '#ff0000',
      size: 14,
      align: 'right',
    });
    fixture.componentRef.setInput('device', { data: {} });
    fixture.componentRef.setInput('isDemo', true);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const title = element.querySelector<HTMLElement>('.title');

    expect(title?.textContent?.trim()).toBe('单行文本');
    expect(title?.style.fontSize).toBe('14px');
    expect(element.querySelector('.text-widget')?.getAttribute('data-align')).toBe(
      'right'
    );
    expect(element.textContent).not.toContain('不应显示的文本2');
    expect(element.querySelector('i')).toBeNull();
    expect(element.querySelectorAll('.title')).toHaveLength(1);
  });

  it('uses live text first and clamps a live oversized font', () => {
    fixture.componentRef.setInput('widget', {
      type: 'tex',
      key: 'message',
      t0: '配置文本',
      size: 12,
    });
    fixture.componentRef.setInput('device', {
      data: { message: { tex: '实时文本', size: 999, align: 'right' } },
    });
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.title') as HTMLElement;
    expect(title.textContent?.trim()).toBe('实时文本');
    expect(title.style.fontSize).toBe('24px');
    expect(
      fixture.nativeElement
        .querySelector('.text-widget')
        ?.getAttribute('data-align')
    ).toBe('left');
  });
});
