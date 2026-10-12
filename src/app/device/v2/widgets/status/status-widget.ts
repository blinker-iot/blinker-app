import { NgTemplateOutlet } from '@angular/common';
import { Component } from '@angular/core';

import { parsePairs } from '../../../../core/device-v2/page-widget';
import { UiIconComponent } from '../icon/ui-icon';
import { ReadingWidgetBase } from '../reading-base';
import type { HistoryPoint } from '../widget-kit';

type Semantic = 'ok' | 'off' | 'warn' | 'info';
const SEMANTICS: readonly string[] = ['ok', 'off', 'warn', 'info'];
// A new event flashes the dot when it arrives within this window.
const FRESH_MS = 5000;
const COLORS: Readonly<Record<Semantic, string>> = {
  ok: 'var(--ui-ok)', off: 'var(--ui-off)', warn: 'var(--ui-alert)', info: 'var(--ui-info)',
};

// 状态徽章: a state as a dot, a pill or a whole tinted banner.
// Bound to an event it shows the latest occurrence: its payload (or 已触发),
// when it happened and how often today, from the card's history.
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
  get event(): boolean { return this.card.field.role === 'event'; }
  get lastEvent(): HistoryPoint | undefined { return this.event ? this.card.history?.at(-1) : undefined; }
  get fresh(): boolean { return !!this.lastEvent && Date.now() - this.lastEvent.at < FRESH_MS; }

  override get reading(): { text: string; unit: string } {
    if (!this.event) return super.reading;
    const last = this.lastEvent;
    if (!last) return { text: '尚未触发', unit: '' };
    return last.value === null ? { text: '已触发', unit: '' } : this.describe(last.value);
  }

  // The note line: for an event, when it last happened and how often today.
  get note(): string {
    const last = this.lastEvent;
    if (!last) return this.options.caption ?? '';
    const today = new Date().setHours(0, 0, 0, 0);
    const count = this.card.history!.filter(point => point.at >= today).length;
    return `${timeOf(last.at)} · 今日 ${count} 次`;
  }

  // Explicit mapping first, then thresholds, then on/off.
  get semantic(): Semantic {
    const mapped = parsePairs(this.options.states).find(([name]) => name === this.reading.text)?.[1];
    if (mapped && SEMANTICS.includes(mapped)) return mapped as Semantic;
    if (this.alert) return 'warn';
    if (this.event) return this.lastEvent ? 'info' : 'off';
    if (typeof this.card.value === 'boolean') return this.card.value ? 'ok' : 'off';
    return 'info';
  }

  get color(): string { return COLORS[this.semantic]; }
  get pulse(): boolean { return this.options.pulse !== false && this.semantic !== 'off'; }
}

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
}
