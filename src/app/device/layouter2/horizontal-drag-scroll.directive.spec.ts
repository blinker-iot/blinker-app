import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HorizontalDragScrollDirective } from './horizontal-drag-scroll.directive';

@Component({
  standalone: true,
  imports: [HorizontalDragScrollDirective],
  template: `
    <div class="scroller" appHorizontalDragScroll>
      <button type="button" (click)="selectStyle()">style</button>
    </div>
  `,
})
class HorizontalDragScrollHostComponent {
  selectedStyles = 0;

  selectStyle(): void {
    this.selectedStyles++;
  }
}

describe('HorizontalDragScrollDirective', () => {
  let fixture: ComponentFixture<HorizontalDragScrollHostComponent>;
  let scroller: HTMLElement;
  let styleButton: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HorizontalDragScrollHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HorizontalDragScrollHostComponent);
    fixture.detectChanges();
    scroller = fixture.nativeElement.querySelector('.scroller');
    styleButton = fixture.nativeElement.querySelector('button');
  });

  it('drags horizontal overflow with the primary mouse pointer', () => {
    scroller.scrollLeft = 120;
    scroller.setPointerCapture = vi.fn();
    scroller.hasPointerCapture = vi.fn(() => true);
    scroller.releasePointerCapture = vi.fn();

    dispatchPointer(styleButton, 'pointerdown', {
      clientX: 200,
      buttons: 1,
    });
    const move = dispatchPointer(scroller, 'pointermove', {
      clientX: 150,
      buttons: 1,
    });

    expect(scroller.scrollLeft).toBe(170);
    expect(move.defaultPrevented).toBe(true);
    expect(scroller.classList.contains('is-drag-scrolling')).toBe(true);
    expect(scroller.setPointerCapture).toHaveBeenCalledWith(1);

    dispatchPointer(scroller, 'pointerup', { clientX: 150 });

    expect(scroller.classList.contains('is-drag-scrolling')).toBe(false);
    expect(scroller.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('keeps a plain click selectable after minor pointer movement', () => {
    dispatchPointer(styleButton, 'pointerdown', {
      clientX: 200,
      buttons: 1,
    });
    dispatchPointer(scroller, 'pointermove', {
      clientX: 196,
      buttons: 1,
    });
    dispatchPointer(scroller, 'pointerup', { clientX: 196 });
    styleButton.click();

    expect(fixture.componentInstance.selectedStyles).toBe(1);
  });

  it('suppresses only the click synthesized after a drag', () => {
    dispatchPointer(styleButton, 'pointerdown', {
      clientX: 200,
      buttons: 1,
    });
    dispatchPointer(scroller, 'pointermove', {
      clientX: 150,
      buttons: 1,
    });
    dispatchPointer(scroller, 'pointerup', { clientX: 150 });

    styleButton.click();
    expect(fixture.componentInstance.selectedStyles).toBe(0);

    styleButton.click();
    expect(fixture.componentInstance.selectedStyles).toBe(1);
  });

  it('leaves touch scrolling to the browser', () => {
    scroller.scrollLeft = 120;
    dispatchPointer(styleButton, 'pointerdown', {
      clientX: 200,
      buttons: 1,
      pointerType: 'touch',
    });
    const move = dispatchPointer(scroller, 'pointermove', {
      clientX: 150,
      buttons: 1,
      pointerType: 'touch',
    });

    expect(scroller.scrollLeft).toBe(120);
    expect(move.defaultPrevented).toBe(false);
    expect(scroller.classList.contains('is-drag-scrolling')).toBe(false);
  });

  it('resets mouse dragging when the pointer is cancelled', () => {
    scroller.hasPointerCapture = vi.fn(() => false);
    dispatchPointer(styleButton, 'pointerdown', {
      clientX: 200,
      buttons: 1,
    });
    dispatchPointer(scroller, 'pointermove', {
      clientX: 150,
      buttons: 1,
    });
    dispatchPointer(scroller, 'pointercancel', { clientX: 150 });

    expect(scroller.classList.contains('is-drag-scrolling')).toBe(false);
    styleButton.click();
    expect(fixture.componentInstance.selectedStyles).toBe(1);
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
