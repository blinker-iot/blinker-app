import { NgTemplateOutlet } from '@angular/common';
import { Component, OnChanges } from '@angular/core';

import { parsePairs } from '../../../../core/device-v2/page-widget';
import { DotTextComponent } from '../dot-text/dot-text';
import { UiIconComponent } from '../icon/ui-icon';
import { ReadingWidgetBase } from '../reading-base';
import { duration, formatNumber, numeric } from '../widget-kit';

type Semantic = 'ok' | 'off' | 'warn' | 'info';
const SEMANTICS: readonly string[] = ['ok', 'off', 'warn', 'info'];

@Component({
  selector: 'app-value-widget',
  standalone: true,
  imports: [UiIconComponent, DotTextComponent, NgTemplateOutlet],
  templateUrl: './value-widget.html',
  styleUrls: ['./value-widget.scss'],
  host: {
    '[class.on]': 'card.value === true',
    '[class.bleed]': 'variant === "chip"',
    '[attr.data-status]': 'variant === "status" ? statusStyle : null',
    '[style.--state]': 'variant === "status" ? "var(--ui-" + (semantic === "warn" ? "alert" : semantic) + ")" : null',
  },
})
export class ValueWidgetComponent extends ReadingWidgetBase implements OnChanges {
  private latest?: number;
  private previous?: number;

  get icon(): string { return this.options.icon ?? 'gauge'; }

  // Change since the previous different reading on this page.
  get delta(): string {
    if (this.latest === undefined || this.previous === undefined) return '';
    const change = (this.latest - this.previous) * (this.options.scale ?? 1);
    return (change > 0 ? '+' : '') + formatNumber(change, this.options.decimals ?? 1);
  }

  get statusStyle(): string { return this.options.statusStyle ?? 'dot'; }

  // Semantic colour of a status: explicit mapping, then alerts, then on/off.
  get semantic(): Semantic {
    const mapped = parsePairs(this.options.states).find(([name]) => name === this.reading.text)?.[1];
    if (mapped && SEMANTICS.includes(mapped)) return mapped as Semantic;
    if (this.alert) return 'warn';
    if (typeof this.card.value === 'boolean') return this.card.value ? 'ok' : 'off';
    return 'info';
  }

  // Countdown reads seconds remaining; its progress is the share of `max` left.
  get remaining(): string { return this.number === undefined ? '—' : duration(this.number * (this.options.scale ?? 1)); }

  ngOnChanges(): void {
    const value = numeric(this.card.value);
    if (value === undefined || value === this.latest) return;
    this.previous = this.latest;
    this.latest = value;
  }
}
