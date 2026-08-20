import {
  Directive,
  ElementRef,
  HostListener,
  OnDestroy,
} from '@angular/core';

interface MouseDragState {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  dragging: boolean;
}

@Directive({
  selector: '[appHorizontalDragScroll]',
  standalone: true,
})
export class HorizontalDragScrollDirective implements OnDestroy {
  private readonly movementTolerance = 8;
  private dragState?: MouseDragState;
  private suppressNextClick = false;
  private clickSuppressionTimer?: number;

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {
    this.element.addEventListener('click', this.onClickCapture, true);
  }

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    if (
      event.pointerType !== 'mouse' ||
      !event.isPrimary ||
      event.button !== 0
    ) {
      return;
    }

    this.finishDrag();
    this.dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: this.element.scrollLeft,
      dragging: false,
    };
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    const state = this.dragState;
    if (!state || state.pointerId !== event.pointerId) return;

    if ((event.buttons & 1) === 0) {
      this.finishDrag();
      return;
    }

    const deltaX = event.clientX - state.startX;
    if (!state.dragging) {
      if (Math.abs(deltaX) <= this.movementTolerance) return;

      state.dragging = true;
      this.element.classList.add('is-drag-scrolling');
      try {
        this.element.setPointerCapture?.(event.pointerId);
      } catch {
        // The pointer can already be inactive when the browser cancels input.
      }
    }

    this.element.scrollLeft = state.startScrollLeft - deltaX;
    event.preventDefault();
  }

  @HostListener('pointerup', ['$event'])
  onPointerUp(event: PointerEvent): void {
    const state = this.dragState;
    if (!state || state.pointerId !== event.pointerId) return;

    const shouldSuppressClick = state.dragging;
    this.finishDrag();
    if (shouldSuppressClick) this.armClickSuppression();
  }

  @HostListener('pointercancel', ['$event'])
  onPointerCancel(event: PointerEvent): void {
    if (this.dragState?.pointerId !== event.pointerId) return;
    this.finishDrag();
  }

  @HostListener('lostpointercapture', ['$event'])
  onLostPointerCapture(event: PointerEvent): void {
    if (this.dragState?.pointerId !== event.pointerId) return;
    this.finishDrag(false);
  }

  ngOnDestroy(): void {
    this.element.removeEventListener('click', this.onClickCapture, true);
    this.clearClickSuppression();
    this.finishDrag();
  }

  private get element(): HTMLElement {
    return this.elementRef.nativeElement;
  }

  private finishDrag(releasePointer = true): void {
    const state = this.dragState;
    this.dragState = undefined;
    this.element.classList.remove('is-drag-scrolling');

    if (
      releasePointer &&
      state &&
      this.element.hasPointerCapture?.(state.pointerId)
    ) {
      this.element.releasePointerCapture(state.pointerId);
    }
  }

  private armClickSuppression(): void {
    this.clearClickSuppression();
    this.suppressNextClick = true;
    this.clickSuppressionTimer = window.setTimeout(() => {
      this.suppressNextClick = false;
      this.clickSuppressionTimer = undefined;
    });
  }

  private clearClickSuppression(): void {
    this.suppressNextClick = false;
    if (typeof this.clickSuppressionTimer === 'undefined') return;

    window.clearTimeout(this.clickSuppressionTimer);
    this.clickSuppressionTimer = undefined;
  }

  private readonly onClickCapture = (event: MouseEvent): void => {
    if (!this.suppressNextClick) return;

    this.clearClickSuppression();
    event.preventDefault();
    event.stopImmediatePropagation();
  };
}
