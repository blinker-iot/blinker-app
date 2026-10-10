import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { WidgetBase } from '../widget-base';
import { clamp } from '../widget-kit';

const CONFIRM_WINDOW_MS = 3000;
const SLIDE_THRESHOLD = 0.85;

@Component({
  selector: 'app-switch-widget',
  standalone: true,
  imports: [UiIconComponent, NgTemplateOutlet],
  templateUrl: './switch-widget.html',
  styleUrls: ['./switch-widget.scss'],
  host: { '[class.on]': 'on', '[class.off]': '!on', '[class.bleed]': 'variant === "tile" || variant === "lock"' },
})
export class SwitchWidgetComponent extends WidgetBase implements OnDestroy {
  // Signals refresh this view from timers and drags even under OnPush ancestors.
  readonly armed = signal(false);
  readonly slidePosition = signal<number | null>(null);

  private timer?: ReturnType<typeof setTimeout>;
  private drag?: { pointerId: number; startX: number; travel: number };

  get on(): boolean { return this.card.value === true; }

  get icon(): string {
    if (this.options.icon) return this.options.icon;
    if (this.variant === 'lock') return this.on ? 'lock' : 'unlock';
    return 'power';
  }

  get onText(): string {
    return this.options.onText ?? (this.variant === 'lock' ? '已上锁' : this.variant === 'segment' ? '开' : '已开启');
  }

  get offText(): string {
    return this.options.offText ?? (this.variant === 'lock' ? '已解锁' : this.variant === 'segment' ? '关' : '已关闭');
  }

  get state(): string {
    if (this.armed()) return '再次点击确认';
    return this.on ? this.onText : this.offText;
  }

  get thumb(): number { return this.slidePosition() ?? (this.on ? 1 : 0); }

  toggle(next = !this.on, confirmed = false): void {
    if (this.card.disabled || next === this.on) return;
    clearTimeout(this.timer);

    if (this.options.confirm && !confirmed && !this.armed()) {
      this.armed.set(true);
      this.timer = setTimeout(() => this.armed.set(false), CONFIRM_WINDOW_MS);
      return;
    }

    this.armed.set(false);
    this.act.emit({ kind: 'toggle', value: next });
  }

  // Slide-to-switch: dragging the thumb across is itself the confirmation.
  slideStart(event: PointerEvent): void {
    if (this.card.disabled || this.drag) return;
    const track = (event.currentTarget as HTMLElement).parentElement!;
    const thumb = event.currentTarget as HTMLElement;
    thumb.setPointerCapture(event.pointerId);
    this.drag = { pointerId: event.pointerId, startX: event.clientX, travel: track.clientWidth - thumb.offsetWidth - 8 };
  }

  slideMove(event: PointerEvent): void {
    if (this.drag?.pointerId !== event.pointerId) return;
    const base = this.on ? 1 : 0;
    this.slidePosition.set(clamp(base + (event.clientX - this.drag.startX) / Math.max(1, this.drag.travel), 0, 1));
  }

  slideEnd(event: PointerEvent): void {
    if (this.drag?.pointerId !== event.pointerId) return;
    this.drag = undefined;
    const position = this.slidePosition() ?? (this.on ? 1 : 0);
    this.slidePosition.set(null);
    if (this.on ? position <= 1 - SLIDE_THRESHOLD : position >= SLIDE_THRESHOLD) this.toggle(!this.on, true);
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }
}
