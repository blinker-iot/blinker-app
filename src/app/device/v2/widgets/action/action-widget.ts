import { Component, OnDestroy, signal } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { WidgetBase } from '../widget-base';

// Matches the hold progress of .act.holding and .op-hold.
const HOLD_MS = 800;
const RUN_MS = 650;
const DONE_MS = 1600;

type Status = 'idle' | 'run' | 'done';

// 场景按钮: an action endpoint as a round key, or as an action card (a card
// two rows tall, a bar one row tall) that is pressed as a whole.
@Component({
  selector: 'app-action-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './action-widget.html',
  styleUrls: ['./action-widget.scss'],
  host: {
    '[class.op-card]': 'shape === "card"',
    '[class.wide]': 'rows === 1',
    '[class.done]': 'status() === "done"',
  },
})
export class ActionWidgetComponent extends WidgetBase implements OnDestroy {
  readonly status = signal<Status>('idle');
  readonly holding = signal(false);
  readonly count = signal(0);
  readonly lastAt = signal<string>('');
  private timers: ReturnType<typeof setTimeout>[] = [];

  get shape(): string { return this.options.shape ?? 'circle'; }
  get icon(): string { return this.options.icon ?? 'play'; }

  get caption(): string {
    const status = this.status();
    if (status === 'run') return '执行中…';
    if (status === 'done') return `${this.options.doneText ?? '已执行'} · ${this.lastAt()}`;
    const how = this.options.hold ? `长按 ${HOLD_MS / 1000} 秒执行` : '轻点执行';
    return this.lastAt() ? `上次 ${this.lastAt()} · ${how}` : how;
  }

  // Taller round keys have room for the caption; a one-row card shows it in its copy.
  get showCaption(): boolean { return this.shape === 'card' || this.rows > 1; }

  tap(): void {
    if (!this.options.hold) this.run();
  }

  holdStart(event: Event): void {
    if (!this.options.hold || this.card.disabled || this.status() === 'run') return;
    event.preventDefault();
    this.holding.set(true);
    this.later(() => { if (this.holding()) { this.holding.set(false); this.run(); } }, HOLD_MS);
  }

  holdEnd(): void {
    this.holding.set(false);
  }

  private run(): void {
    if (this.card.disabled || this.status() === 'run') return;
    this.act.emit({ kind: 'invoke' });
    this.status.set('run');
    this.later(() => {
      this.status.set('done');
      this.count.update(count => count + 1);
      this.lastAt.set(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }));
      this.later(() => { if (this.status() === 'done') this.status.set('idle'); }, DONE_MS);
    }, RUN_MS);
  }

  private later(callback: () => void, delay: number): void {
    this.timers.push(setTimeout(callback, delay));
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
  }
}
