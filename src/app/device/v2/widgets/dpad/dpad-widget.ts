import { Component, OnDestroy, signal } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { WidgetBase } from '../widget-base';

// The allowed values of a direction pad, in declaration order.
const DIRECTIONS = ['up', 'down', 'left', 'right', 'center'] as const;
type Direction = typeof DIRECTIONS[number];
const SENT_MS = 1200;

// 方向键: an action whose four or five allowed values are, in order, up, down,
// left, right and the centre key, e.g. a car or a pan-tilt head. A tap sends a
// direction once. With `momentary` a direction runs while held and its release
// sends the centre key (stop), which must always go out.
@Component({
  selector: 'app-dpad-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './dpad-widget.html',
  styleUrls: ['./dpad-widget.scss'],
})
export class DpadWidgetComponent extends WidgetBase implements OnDestroy {
  readonly directions = DIRECTIONS;
  // The direction held down, or the key just sent.
  readonly active = signal<Direction | null>(null);
  private held = false;
  private timer?: ReturnType<typeof setTimeout>;

  // A held direction is never disabled under the finger: its release still has to arrive.
  override get disabled() { return this.card.disabled && !this.held ? 'true' : null; }

  get momentary(): boolean { return this.options.momentary === true && !!this.choice('center'); }

  get status(): string {
    const direction = this.active();
    if (!direction) return '';
    return this.held ? `${this.choice(direction)} 中` : `已发送 ${this.choice(direction)}`;
  }

  choice(direction: Direction): string | undefined {
    return this.card.field.choices?.[DIRECTIONS.indexOf(direction)];
  }

  // Momentary: pressing a direction sends it at once and keeps the pointer.
  press(event: PointerEvent, direction: Direction): void {
    if (!this.momentary || direction === 'center' || this.card.disabled || this.held || event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.held = true;
    this.clear();
    this.active.set(direction);
    this.send(direction);
  }

  release(): void {
    if (!this.held) return;
    this.held = false;
    this.active.set(null);
    this.send('center');
  }

  // A tap: every key without momentary, the centre key with it.
  tap(direction: Direction): void {
    if ((this.momentary && direction !== 'center') || this.card.disabled) return;
    this.send(direction);
    this.active.set(direction);
    this.clear();
    this.timer = setTimeout(() => this.active.set(null), SENT_MS);
  }

  ngOnDestroy(): void {
    this.clear();
    this.release();
  }

  private send(direction: Direction): void {
    const value = this.choice(direction);
    if (value !== undefined) this.act.emit({ kind: 'select', value });
  }

  private clear(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
