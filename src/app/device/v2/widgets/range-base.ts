import { Directive, OnChanges, OnDestroy, signal } from '@angular/core';

import { WidgetBase } from './widget-base';
import { clamp, decimalsOf, numeric, present, quantize, ratio } from './widget-kit';

// Keep the dragged value on screen until the device reports back.
const SETTLE_MS = 1500;
// Press-and-hold on − / +: first repeat, then the repeat interval.
const REPEAT_DELAY_MS = 400;
const REPEAT_EVERY_MS = 90;

interface LinearDrag {
  pointerId: number;
  relative: boolean;
  vertical: boolean;
  startValue: number;
  startPosition: number;
  box: DOMRect;
}

// Shared value handling of writable numeric ranges (slider and dial families).
@Directive()
export abstract class RangeWidgetBase extends WidgetBase implements OnChanges, OnDestroy {
  readonly local = signal<number | null>(null);

  protected dragging = false;
  private reported?: number;
  private timer?: ReturnType<typeof setTimeout>;
  private linear?: LinearDrag;
  private repeater?: { start: number; timer?: ReturnType<typeof setTimeout> };

  get min(): number { return this.card.field.minimum ?? 0; }
  get max(): number { return this.card.field.maximum ?? 100; }
  get step(): number { return this.card.field.step && this.card.field.step > 0 ? this.card.field.step : 1; }

  get value(): number {
    return this.local() ?? clamp(numeric(this.card.value) ?? this.min, this.min, this.max);
  }

  get level(): number { return ratio(this.value, this.min, this.max); }

  get reading(): { text: string; unit: string } {
    return present(this.value, { decimals: decimalsOf(this.step), ...this.options }, this.card.field);
  }

  ngOnChanges(): void {
    const reported = numeric(this.card.value);
    if (reported === this.reported) return;
    this.reported = reported;
    if (!this.dragging) this.local.set(null);
  }

  preview(raw: number): void {
    if (Number.isFinite(raw)) this.local.set(quantize(raw, this.min, this.max, this.step));
  }

  commit(raw: number): void {
    if (this.card.disabled || !Number.isFinite(raw)) return;
    const value = quantize(raw, this.min, this.max, this.step);
    this.local.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.local.set(null), SETTLE_MS);
    this.act.emit({ kind: 'range', value });
  }

  nudge(direction: number): void {
    this.commit(this.value + direction * this.step);
  }

  key(event: KeyboardEvent): void {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    if (event.key === 'Home') this.commit(this.min);
    else if (event.key === 'End') this.commit(this.max);
    else if (keys[event.key]) this.nudge(keys[event.key]);
    else return;
    event.preventDefault();
  }

  // Linear drag. Absolute: the pointer position is the value. Relative: the
  // drag distance moves the value, so a tap never jumps it.
  dragStart(event: PointerEvent, relative = false, vertical = false): void {
    if (this.card.disabled || this.dragging) return;
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    this.dragging = true;
    this.linear = {
      pointerId: event.pointerId, relative, vertical, startValue: this.value,
      startPosition: vertical ? event.clientY : event.clientX, box: element.getBoundingClientRect(),
    };
    if (!relative) this.dragMove(event);
  }

  dragMove(event: PointerEvent): void {
    const drag = this.linear;
    if (drag?.pointerId !== event.pointerId) return;
    const span = this.max - this.min;
    const size = Math.max(1, drag.vertical ? drag.box.height : drag.box.width);

    if (drag.relative) {
      const delta = drag.vertical ? drag.startPosition - event.clientY : event.clientX - drag.startPosition;
      this.preview(drag.startValue + delta / size * span);
      return;
    }

    const position = drag.vertical ? drag.box.bottom - event.clientY : event.clientX - drag.box.left;
    this.preview(this.min + clamp(position / size, 0, 1) * span);
  }

  dragEnd(event: PointerEvent): void {
    if (this.linear?.pointerId !== event.pointerId) return;
    const start = this.linear.startValue;
    this.linear = undefined;
    this.settle(start);
  }

  // − / + held down: steps on screen while held, one command on release.
  // Without `hold` each press is a single step.
  repeatStart(event: PointerEvent, direction: number, hold = true): void {
    if (this.card.disabled || this.dragging) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging = true;
    this.repeater = { start: this.value };
    this.preview(this.value + direction * this.step);
    if (hold) this.repeat(direction, REPEAT_DELAY_MS);
  }

  repeatStop(): void {
    if (!this.repeater) return;
    clearTimeout(this.repeater.timer);
    const start = this.repeater.start;
    this.repeater = undefined;
    this.settle(start);
  }

  private repeat(direction: number, delay: number): void {
    const repeater = this.repeater;
    if (!repeater) return;
    repeater.timer = setTimeout(() => {
      this.preview(this.value + direction * this.step);
      this.repeat(direction, REPEAT_EVERY_MS);
    }, delay);
  }

  // Ends any drag: commit a changed value, otherwise drop the preview.
  protected settle(startValue: number): void {
    this.dragging = false;
    const value = this.local();
    if (value !== null && value !== startValue) this.commit(value);
    else this.local.set(null);
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    clearTimeout(this.repeater?.timer);
  }
}
