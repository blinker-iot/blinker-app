import { Component } from '@angular/core';
import { UiIconComponent } from '../icon/ui-icon';
import { WidgetBase } from '../widget-base';
import { numeric } from '../widget-kit';

@Component({
  selector: 'app-uptime-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './uptime-widget.html',
  styleUrls: ['./uptime-widget.scss'],
  host: { '[class.compact]': 'rows === 1' },
})

export class UptimeWidgetComponent extends WidgetBase {
  get parts(): string[] {
    const raw = numeric(this.card.value);
    const seconds = raw === undefined ? undefined : raw * (this.options.scale ?? 1);

    if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return ['—', '—', '—'];

    const total = Math.floor(seconds);

    return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
      .map(value => String(value).padStart(2, '0'));
  }

  readonly units = ['时', '分', '秒'];
}
