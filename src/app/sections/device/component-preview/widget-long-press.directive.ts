import { Directive, ElementRef, EventEmitter, OnDestroy, Output, inject } from '@angular/core';

const PRESS_MS = 500;
// Movement that turns a press into a scroll or a drag.
const SLOP_PX = 8;

// Long press (or the context menu) on a widget cell emits its widget id, so a
// tap stays the widget's own action. When the press fires, the gesture the
// widget began is cancelled and the click that follows release is swallowed.
@Directive({
  selector: '[appWidgetLongPress]',
  standalone: true,
  host: {
    '(pointerdown)': 'start($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'stop()',
    '(pointercancel)': 'stop()',
    '(contextmenu)': 'menu($event)',
  },
})
export class WidgetLongPressDirective implements OnDestroy {
  @Output() readonly widgetLongPress = new EventEmitter<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private press?: { timer: ReturnType<typeof setTimeout>; x: number; y: number };
  private swallowClick = false;

  // Capture phase, so the click never reaches the widget.
  private readonly onClick = (event: MouseEvent): void => {
    if (!this.swallowClick) return;
    this.swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  };

  constructor() {
    this.host.addEventListener('click', this.onClick, true);
  }

  start(event: PointerEvent): void {
    this.stop();
    this.swallowClick = false;
    const id = widgetId(event.target);
    if (!id || event.button !== 0) return;

    const { target, pointerId } = event;
    const timer = setTimeout(() => {
      this.press = undefined;
      this.swallowClick = true;
      target?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId }));
      this.widgetLongPress.emit(id);
    }, PRESS_MS);
    this.press = { timer, x: event.clientX, y: event.clientY };
  }

  move(event: PointerEvent): void {
    if (this.press && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > SLOP_PX) this.stop();
  }

  stop(): void {
    if (this.press) clearTimeout(this.press.timer);
    this.press = undefined;
  }

  menu(event: MouseEvent): void {
    const id = widgetId(event.target);
    if (!id) return;
    event.preventDefault();
    this.stop();
    this.widgetLongPress.emit(id);
  }

  ngOnDestroy(): void {
    this.stop();
    this.host.removeEventListener('click', this.onClick, true);
  }
}

function widgetId(target: EventTarget | null): string | undefined {
  return (target as HTMLElement | null)?.closest<HTMLElement>('[data-widget-id]')?.dataset['widgetId'];
}
