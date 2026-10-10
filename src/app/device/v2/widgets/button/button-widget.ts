import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { WidgetBase } from '../widget-base';

const CONFIRM_WINDOW_MS = 3000;
const PULSE_MS = 600;
const DEFAULT_HOLD_MS = 1200;

@Component({
  selector: 'app-button-widget',
  standalone: true,
  imports: [UiIconComponent, NgTemplateOutlet],
  templateUrl: './button-widget.html',
  styleUrls: ['./button-widget.scss'],
  host: {
    '[class.on]': 'pulsing() || armed()',
    '[class.bleed]': 'variant === "tile"',
  },
})
export class ButtonWidgetComponent extends WidgetBase implements OnDestroy {
  // Signals refresh this view from timers even under OnPush ancestors.
  readonly armed = signal(false);
  readonly pulsing = signal(false);
  readonly held = signal(0);
  readonly count = signal(0);

  private timer?: ReturnType<typeof setTimeout>;
  private frame = 0;

  get icon(): string { return this.options.icon ?? (this.variant === 'hold' ? 'spark' : 'bolt'); }

  get label(): string {
    if (this.armed()) return '再次点击确认';
    return this.options.actionText ?? (this.variant === 'hold' ? '长按执行' : '执行');
  }

  // Secondary line: confirmation, completion, run count, then the caption.
  get status(): string {
    if (this.armed()) return this.label;
    if (this.pulsing()) return this.options.doneText ?? '已执行';
    if (this.options.showCount && this.count()) return `已执行 ${this.count()} 次`;
    return this.options.caption || this.label;
  }

  // Circumference of the hold ring (r = 46).
  readonly ring = 2 * Math.PI * 46;

  press(): void {
    if (this.card.disabled) return;
    clearTimeout(this.timer);

    // A confirmed action needs a second press within the window.
    if (this.options.confirm && !this.armed()) {
      this.armed.set(true);
      this.timer = setTimeout(() => this.armed.set(false), CONFIRM_WINDOW_MS);
      return;
    }

    this.fire();
  }

  // Hold: the action fires only after the press lasts holdMs.
  holdStart(event: Event): void {
    if (this.card.disabled || this.frame) return;
    event.preventDefault();
    const duration = this.options.holdMs ?? DEFAULT_HOLD_MS;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      this.held.set(progress);
      if (progress < 1) {
        this.frame = requestAnimationFrame(step);
        return;
      }
      this.frame = 0;
      this.held.set(0);
      this.fire();
    };
    this.frame = requestAnimationFrame(step);
  }

  holdEnd(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.held.set(0);
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
  }

  private fire(): void {
    this.armed.set(false);
    this.pulsing.set(true);
    this.count.update(count => count + 1);
    this.timer = setTimeout(() => this.pulsing.set(false), PULSE_MS);
    this.act.emit({ kind: 'invoke' });
  }
}
