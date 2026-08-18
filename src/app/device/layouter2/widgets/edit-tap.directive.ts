import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  Output,
} from '@angular/core';

interface PointerStart {
  pointerId: number;
  clientX: number;
  clientY: number;
}

@Directive({
  selector: '[appLayouter2EditTap]',
  standalone: true,
})
export class Layouter2EditTapDirective implements OnDestroy {
  @Output() appLayouter2EditTap = new EventEmitter<void>();

  private readonly movementTolerance = 8;
  private pointerStart?: PointerStart;
  private moved = false;
  private emitTimer?: number;

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) {
      this.resetPointer();
      return;
    }

    this.pointerStart = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    this.moved = false;

    const element = this.elementRef.nativeElement;
    if (element.setPointerCapture) {
      element.setPointerCapture(event.pointerId);
    }
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    const start = this.pointerStart;
    if (!start || start.pointerId !== event.pointerId) return;

    this.moved ||=
      Math.abs(event.clientX - start.clientX) > this.movementTolerance ||
      Math.abs(event.clientY - start.clientY) > this.movementTolerance;
  }

  @HostListener('pointerup', ['$event'])
  onPointerUp(event: PointerEvent): void {
    const start = this.pointerStart;
    if (!start || start.pointerId !== event.pointerId) return;

    this.onPointerMove(event);
    const shouldEdit = !this.moved;
    this.releasePointer(event.pointerId);
    this.resetPointer();

    if (!shouldEdit) return;

    if (typeof this.emitTimer !== 'undefined') {
      window.clearTimeout(this.emitTimer);
    }
    // Gridster finishes its mouse/touch drag in the same input sequence.
    // Emit on the next task so the modal is not created mid-drag.
    this.emitTimer = window.setTimeout(() => {
      this.emitTimer = undefined;
      this.appLayouter2EditTap.emit();
    });
  }

  @HostListener('pointercancel', ['$event'])
  onPointerCancel(event: PointerEvent): void {
    if (this.pointerStart?.pointerId !== event.pointerId) return;
    this.releasePointer(event.pointerId);
    this.resetPointer();
  }

  ngOnDestroy(): void {
    if (typeof this.emitTimer !== 'undefined') {
      window.clearTimeout(this.emitTimer);
    }
  }

  private releasePointer(pointerId: number): void {
    const element = this.elementRef.nativeElement;
    if (element.hasPointerCapture?.(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  }

  private resetPointer(): void {
    this.pointerStart = undefined;
    this.moved = false;
  }
}
