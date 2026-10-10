import { NgTemplateOutlet } from '@angular/common';
import { Component, OnChanges, OnDestroy } from '@angular/core';

import { parseList } from '../../../../core/device-v2/page-widget';
import { DotTextComponent } from '../dot-text/dot-text';
import { UiIconComponent } from '../icon/ui-icon';
import { RangeWidgetBase } from '../range-base';
import { duration, formatNumber, quantize } from '../widget-kit';

const MAX_STEPS = 12;
const RULER_PITCH = 12;
const RULER_REACH = 18;
const REPEAT_DELAY_MS = 400;
const REPEAT_MS = 110;
const DEFAULT_PRESETS = [15, 30, 60, 120];

@Component({
  selector: 'app-slider-widget',
  standalone: true,
  imports: [UiIconComponent, DotTextComponent, NgTemplateOutlet],
  templateUrl: './slider-widget.html',
  styleUrls: ['./slider-widget.scss'],
  host: {
    '[attr.data-orientation]': 'vertical ? "vertical" : null',
    '[class.bleed]': 'variant === "fill"',
    '[class.off]': 'level === 0',
  },
})
export class SliderWidgetComponent extends RangeWidgetBase implements OnChanges, OnDestroy {
  private ruler?: { pointerId: number; startX: number; startValue: number };
  private repeat?: ReturnType<typeof setTimeout>;
  private timerTotal = 0;

  get vertical(): boolean { return this.variant === 'fill' && this.options.orientation === 'vertical'; }
  get icon(): string { return this.options.icon ?? (this.variant === 'timer' ? 'timer' : 'sun'); }

  // Evenly spaced positions 0..1, e.g. tick labels or fill markers.
  get ticks(): number[] {
    const count = this.options.ticks ?? 0;
    return count < 2 ? [] : Array.from({ length: count }, (_, index) => index / (count - 1));
  }

  tickLabel(position: number): string {
    return formatNumber(this.min + position * (this.max - this.min), 0);
  }

  // Discrete levels: every step when there are few, otherwise `ticks` (or 5) evenly spaced.
  get levels(): number[] {
    const count = Math.round((this.max - this.min) / this.step) + 1;
    const size = count <= MAX_STEPS ? count : Math.max(2, Math.min(MAX_STEPS, this.options.ticks ?? 5));
    return Array.from({ length: size }, (_, index) =>
      quantize(this.min + index * (this.max - this.min) / (size - 1), this.min, this.max, this.step));
  }

  get levelIndex(): number {
    return this.levels.reduce((best, level, index) => level <= this.value + 1e-9 ? index : best, 0);
  }

  get levelText(): string {
    return parseList(this.options.labels)[this.levelIndex] ?? this.reading.text + this.reading.unit;
  }

  chooseLevel(index: number): void {
    // Tapping the current level again turns it off when allowed.
    if (this.options.allowOff && index === this.levelIndex && index > 0) this.commit(this.min);
    else this.commit(this.levels[index]);
  }

  // Ruler marks around the current value, in steps.
  get marks(): { value: number; offset: number; major: boolean }[] {
    const marks = [];
    const base = Math.round((this.value - this.min) / this.step);
    for (let index = -RULER_REACH; index <= RULER_REACH; index += 1) {
      const value = this.min + (base + index) * this.step;
      if (value < this.min - 1e-9 || value > this.max + 1e-9) continue;
      marks.push({ value: +value.toFixed(4), offset: (value - this.value) / this.step * RULER_PITCH, major: (base + index) % 5 === 0 });
    }
    return marks;
  }

  rulerStart(event: PointerEvent): void {
    if (this.card.disabled || this.dragging) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging = true;
    this.ruler = { pointerId: event.pointerId, startX: event.clientX, startValue: this.value };
  }

  rulerMove(event: PointerEvent): void {
    if (this.ruler?.pointerId !== event.pointerId) return;
    this.preview(this.ruler.startValue - (event.clientX - this.ruler.startX) / RULER_PITCH * this.step);
  }

  rulerEnd(event: PointerEvent): void {
    if (this.ruler?.pointerId !== event.pointerId) return;
    const start = this.ruler.startValue;
    this.ruler = undefined;
    this.settle(start);
  }

  // Stepper buttons repeat while held when `longPress` is on.
  stepStart(direction: number): void {
    this.nudge(direction);
    if (!this.options.longPress) return;
    const again = (delay: number) => this.repeat = setTimeout(() => {
      const next = this.value + direction * this.step;
      if (next < this.min || next > this.max) return;
      this.nudge(direction);
      again(REPEAT_MS);
    }, delay);
    again(REPEAT_DELAY_MS);
  }

  stepEnd(): void {
    clearTimeout(this.repeat);
  }

  // Timer: the value is the remaining seconds; presets are minutes.
  get presets(): number[] {
    const presets = parseList(this.options.presets).map(Number).filter(minutes => minutes > 0);
    return (presets.length ? presets : DEFAULT_PRESETS).filter(minutes => minutes * 60 <= this.max);
  }

  get remaining(): string { return duration(this.value); }

  get timerProgress(): number {
    return this.timerTotal ? Math.min(1, this.value / this.timerTotal) : 0;
  }

  // A countdown started elsewhere defines its own total.
  override ngOnChanges(): void {
    super.ngOnChanges();
    if (this.variant === 'timer') this.timerTotal = Math.max(this.timerTotal, this.value);
  }

  startTimer(minutes: number): void {
    this.timerTotal = minutes * 60;
    this.commit(minutes * 60);
  }

  cancelTimer(): void {
    this.timerTotal = 0;
    this.commit(this.min);
  }

  override ngOnDestroy(): void {
    clearTimeout(this.repeat);
    super.ngOnDestroy();
  }
}
