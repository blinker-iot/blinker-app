import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';

import { DataService } from 'src/app/core/services/data.service';
import { LayouterService } from '../../layouter.service';
import { WidgetListbarComponent } from './widget-listbar.component';

describe('WidgetListbarComponent', () => {
  let fixture: ComponentFixture<WidgetListbarComponent>;
  let addWidget: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    addWidget = vi.fn();

    await TestBed.configureTestingModule({
      imports: [WidgetListbarComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { params: { id: 'device-1' } } },
        },
        {
          provide: DataService,
          useValue: { device: { dict: { 'device-1': {} } } },
        },
        {
          provide: LayouterService,
          useValue: { addWidget },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WidgetListbarComponent);
    fixture.detectChanges();
  });

  it('scrolls by mouse drag without adding a widget', () => {
    const bar: HTMLElement = fixture.nativeElement.querySelector('.bar');
    const button: HTMLElement = fixture.nativeElement.querySelector('.btn-inner');
    bar.scrollLeft = 120;
    bar.setPointerCapture = vi.fn();
    bar.hasPointerCapture = vi.fn(() => true);
    bar.releasePointerCapture = vi.fn();

    dispatchPointer(button, 'pointerdown', { clientX: 200, buttons: 1 });
    dispatchPointer(bar, 'pointermove', { clientX: 150, buttons: 1 });
    dispatchPointer(bar, 'pointerup', { clientX: 150 });
    button.click();

    expect(bar.scrollLeft).toBe(170);
    expect(addWidget).not.toHaveBeenCalled();

    button.click();
    expect(addWidget).toHaveBeenCalledOnce();
  });
});

function dispatchPointer(
  target: Element,
  type: string,
  overrides: Partial<PointerEventInit> = {}
): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 0,
    clientX: 0,
    ...overrides,
  });
  target.dispatchEvent(event);
  return event;
}
