import { Component, OnChanges } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { ReadingWidgetBase } from '../reading-base';
import { formatNumber, numeric } from '../widget-kit';

// 大数字读数: one reading in large figures, with its change and a note below.
@Component({
  selector: 'app-number-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './number-widget.html',
  styleUrls: ['./number-widget.scss'],
})
export class NumberWidgetComponent extends ReadingWidgetBase implements OnChanges {
  private latest?: number;
  private previous?: number;

  get size(): string { return this.options.size ?? 'lg'; }

  // Change since the previous different reading on this page.
  get delta(): string {
    if (this.latest === undefined || this.previous === undefined) return '';
    const change = (this.latest - this.previous) * (this.options.scale ?? 1);
    return (change >= 0 ? '↑' : '↓') + formatNumber(Math.abs(change), this.options.decimals || 1);
  }

  get note(): string {
    if (this.alert && this.options.warnAbove !== undefined && (this.number ?? 0) > this.options.warnAbove) return '高于设定阈值';
    if (this.alert) return '低于设定阈值';
    return this.options.caption ?? '';
  }

  ngOnChanges(): void {
    const value = numeric(this.card.value);
    if (value === undefined || value === this.latest) return;
    this.previous = this.latest;
    this.latest = value;
  }
}
