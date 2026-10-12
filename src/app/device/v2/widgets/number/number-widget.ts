import { Component, OnChanges } from '@angular/core';
import { UiIconComponent } from '../icon/ui-icon';
import { ReadingWidgetBase } from '../reading-base';
import { compactNumber, formatNumber, numeric } from '../widget-kit';

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

  get displayReading(): { text: string; unit: string } {
    const reading = this.reading;
    const raw = this.card.value;

    if ((this.options.format && this.options.format !== 'number')
      || (typeof raw !== 'number' && typeof raw !== 'bigint')) return reading;

    const scale = this.options.scale ?? 1;
    const value = typeof raw === 'bigint' && scale === 1 ? raw : Number(raw) * scale;
    const magnitude = value < 0 ? -value : value;

    const text = magnitude >= 1000 || (magnitude > 0 && magnitude < 0.01)
      ? compactNumber(value) : typeof value === 'bigint' ? String(value) : reading.text;

    return { text, unit: reading.unit };
  }

  get fullValue(): string {
    const value = this.card.value == null ? this.reading.text : String(this.card.value);

    return this.unit ? `${value} ${this.unit}` : value;
  }

  // Change since the previous different reading on this page.
  get delta(): string {
    if (this.latest === undefined || this.previous === undefined) return '';

    const change = (this.latest - this.previous) * (this.options.scale ?? 1);
    const value = Math.abs(change);

    return (change >= 0 ? '↑' : '↓') + (value >= 1000 ? compactNumber(value) : formatNumber(value, this.options.decimals || 1));
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
