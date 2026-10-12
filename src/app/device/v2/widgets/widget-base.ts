import { Directive, EventEmitter, HostBinding, Input, Output } from '@angular/core';

import type { PageWidgetOptions } from '../../../core/device-v2/page-widget';
import { optionsOf, PanelCard, toneOf, WidgetAct } from './widget-kit';

// Inputs and host attributes shared by every widget; the host is the card.
@Directive()
export abstract class WidgetBase {
  @Input({ required: true }) card!: PanelCard;
  @Output() act = new EventEmitter<WidgetAct>();

  @HostBinding('attr.data-appearance') get appearance() { return this.card.widget.appearance ?? null; }
  @HostBinding('attr.aria-disabled') get disabled() { return this.card.disabled ? 'true' : null; }
  @HostBinding('style.--ui-accent') get accent() { return toneOf(this.options); }

  get options(): PageWidgetOptions { return optionsOf(this.card); }
  get title(): string { return this.card.widget.title || this.card.field.key; }
  get showTitle(): boolean { return this.options.showTitle !== false; }
  get unit(): string { return this.card.field.unit ?? ''; }
  get rows(): number { return this.card.widget.grid.height; }
}
