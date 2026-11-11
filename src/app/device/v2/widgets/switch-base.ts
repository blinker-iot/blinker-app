import { Directive, OnChanges, OnDestroy, signal } from '@angular/core';

import { WidgetBase } from './widget-base';
import type { PanelCard } from './widget-kit';

const CONFIRM_WINDOW_MS = 3000;

interface SwitchConfirmation {
  widgetId: string;
  endpointKey: string;
  fieldId: number;
  fieldKey: string;
  value: PanelCard['value'];
}

// Shared state of writable booleans (tile, toggle and slide).
@Directive()
export abstract class SwitchWidgetBase extends WidgetBase implements OnChanges, OnDestroy {
  readonly armed = signal(false);
  private timer?: ReturnType<typeof setTimeout>;
  private confirmation?: SwitchConfirmation;

  get on(): boolean { return this.card.value === true; }
  get onText(): string { return this.options.onText ?? '已开启'; }
  get offText(): string { return this.options.offText ?? '已关闭'; }

  get state(): string {
    if (this.armed()) return '再次点击确认';
    return this.on ? this.onText : this.offText;
  }

  ngOnChanges(): void {
    this.syncConfirmation();
  }

  // With `confirm`, the first tap arms the switch and a second one within the window sends.
  toggle(next = !this.on, confirmed = false): void {
    this.syncConfirmation();
    if (this.card.disabled || next === this.on) return;

    if (this.options.confirm && !confirmed && !this.armed()) {
      const confirmation: SwitchConfirmation = {
        widgetId: this.card.widget.widgetId, endpointKey: this.card.widget.endpointKey,
        fieldId: this.card.field.id, fieldKey: this.card.field.key, value: this.card.value,
      };
      this.confirmation = confirmation;
      this.armed.set(true);
      this.timer = setTimeout(() => {
        if (this.confirmation === confirmation) this.clearConfirmation();
      }, CONFIRM_WINDOW_MS);
      return;
    }

    this.clearConfirmation();
    this.act.emit({ kind: 'toggle', value: next });
  }

  // A confirmation belongs to the observed operation, not the lifetime of a
  // cached widget. Cosmetic refreshes keep its original deadline unchanged.
  private syncConfirmation(): void {
    const confirmation = this.confirmation;
    if (confirmation && (this.card.disabled || !this.options.confirm
      || confirmation.value !== this.card.value
      || confirmation.widgetId !== this.card.widget.widgetId
      || confirmation.endpointKey !== this.card.widget.endpointKey
      || confirmation.fieldId !== this.card.field.id || confirmation.fieldKey !== this.card.field.key)) this.clearConfirmation();
  }

  private clearConfirmation(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.confirmation = undefined;
    this.armed.set(false);
  }

  ngOnDestroy(): void {
    this.clearConfirmation();
  }
}
