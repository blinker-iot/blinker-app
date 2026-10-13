import { Directive, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';

// Animate displayed values independently of their numeric or discrete meaning.
// The control value, precision, and units stay unchanged.
@Directive({
  selector: '[valueTransition]',
  standalone: true,
})

export class ValueTransitionDirective implements OnChanges, OnDestroy {
  @Input({ required: true }) valueTransition!: unknown;

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private animation?: Animation;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['valueTransition'].firstChange || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Continue the current transition when readings change on consecutive frames.
    if (this.animation?.playState === 'running') return;

    this.animation = this.element.animate([
      { opacity: 0.5 },
      { opacity: 1 },
    ], { duration: 160, easing: 'ease-out' });
  }

  ngOnDestroy(): void { this.animation?.cancel(); }
}
