import { Directive, OnDestroy, signal } from '@angular/core';

import { WidgetBase } from './widget-base';

const CONFIRM_WINDOW_MS = 3000;

// Shared state of writable booleans (tile, toggle and slide).
@Directive()
export abstract class SwitchWidgetBase extends WidgetBase implements OnDestroy {
  readonly armed = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  get on(): boolean { return this.card.value === true; }
  get onText(): string { return this.options.onText ?? '已开启'; }
  get offText(): string { return this.options.offText ?? '已关闭'; }

  get state(): string {
    if (this.armed()) return '再次点击确认';
    return this.on ? this.onText : this.offText;
  }

  // With `confirm`, the first tap arms the switch and a second one within the window sends.
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

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }
}
