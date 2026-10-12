import { NgTemplateOutlet } from '@angular/common';
import { Component } from '@angular/core';

import { parsePairs } from '../../../../core/device-v2/page-widget';
import { UiIconComponent } from '../icon/ui-icon';
import { ReadingWidgetBase } from '../reading-base';

type Semantic = 'ok' | 'off' | 'warn' | 'info';
const SEMANTICS: readonly string[] = ['ok', 'off', 'warn', 'info'];
const COLORS: Readonly<Record<Semantic, string>> = {
  ok: 'var(--ui-ok)', off: 'var(--ui-off)', warn: 'var(--ui-alert)', info: 'var(--ui-info)',
};

// 状态徽章: a state as a dot, a pill or a whole tinted banner.
@Component({
  selector: 'app-status-widget',
  standalone: true,
  imports: [UiIconComponent, NgTemplateOutlet],
  templateUrl: './status-widget.html',
  styleUrls: ['./status-widget.scss'],
  host: {
    '[class.inline]': 'rows === 1',
    '[class.banner]': 'style === "banner"',
    '[style.--sc]': 'color',
  },
})
export class StatusWidgetComponent extends ReadingWidgetBase {
  get style(): string { return this.options.style ?? 'dot'; }

  // Explicit mapping first, then thresholds, then on/off.
  get semantic(): Semantic {
    const mapped = parsePairs(this.options.states).find(([name]) => name === this.reading.text)?.[1];
    if (mapped && SEMANTICS.includes(mapped)) return mapped as Semantic;
    if (this.alert) return 'warn';
    if (typeof this.card.value === 'boolean') return this.card.value ? 'ok' : 'off';
    return 'info';
  }

  get color(): string { return COLORS[this.semantic]; }
  get pulse(): boolean { return this.options.pulse !== false && this.semantic !== 'off'; }
}
