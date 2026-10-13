import { Component } from '@angular/core';
import { UiIconComponent } from '../icon/ui-icon';
import { WidgetBase } from '../widget-base';
import { numeric, present } from '../widget-kit';

@Component({
  selector: 'app-memory-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './memory-widget.html',
  styleUrls: ['./memory-widget.scss'],
})

export class MemoryWidgetComponent extends WidgetBase {
  get free(): number | undefined {
    const value = numeric(this.card.value);

    return value !== undefined && value >= 0 ? value : undefined;
  }

  get total(): number | undefined {
    // A bound total is authoritative; missing telemetry must not become a made-up capacity.
    const value = this.card.extras?.length ? numeric(this.card.extras[0].value) : this.options.max;

    return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
  }

  get level(): number | undefined {
    const free = this.free;
    const total = this.total;

    return free !== undefined && total !== undefined && free <= total ? free / total : undefined;
  }

  get percent(): string {
    const level = this.level;

    return level === undefined ? '—' : String(Math.round(level * 100));
  }

  bytes(value: number | undefined): string {
    if (value === undefined) return '—';

    const reading = present(value, { format: 'bytes', decimals: this.options.decimals ?? 1 }, this.card.field);

    return `${reading.text} ${reading.unit}`;
  }
}
