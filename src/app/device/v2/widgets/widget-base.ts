import { Directive, EventEmitter, HostBinding, Input, Output } from '@angular/core';

import type { PageWidgetOptions } from '../../../core/device-v2/page-widget';
import { optionsOf, PanelCard, toneOf, variantOf, WidgetAct } from './widget-kit';

// Inputs and host attributes shared by every widget; styles read the attributes.
@Directive()
export abstract class WidgetBase {
  @Input({ required: true }) card!: PanelCard;
  @Output() act = new EventEmitter<WidgetAct>();

  @HostBinding('attr.data-variant') get variant(): string { return variantOf(this.card.widget); }
  @HostBinding('attr.data-appearance') get appearance() { return this.card.widget.appearance ?? null; }
  @HostBinding('attr.data-size') get size() { return this.options.size ?? null; }
  @HostBinding('attr.data-align') get align() { return this.options.align ?? null; }
  @HostBinding('attr.data-icon-style') get iconStyle() { return this.options.iconStyle ?? null; }
  @HostBinding('attr.data-active') get activeStyle() { return this.options.activeStyle ?? null; }
  @HostBinding('attr.data-hide-title') get hideTitle() { return this.options.showTitle === false ? '' : null; }
  @HostBinding('style.--ui-accent') get accent() { return toneOf(this.options); }

  get options(): PageWidgetOptions { return optionsOf(this.card); }
  get title(): string { return this.card.widget.title || this.card.field.key; }
  get unit(): string { return this.card.field.unit ?? ''; }
}
