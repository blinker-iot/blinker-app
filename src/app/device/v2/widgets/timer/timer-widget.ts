import { Component, OnChanges, OnDestroy, OnInit, signal } from '@angular/core';

import { parseList } from '../../../../core/device-v2/page-widget';
import { UiIconComponent } from '../icon/ui-icon';
import { RangeWidgetBase } from '../range-base';
import { arcPath, duration, numeric } from '../widget-kit';

const DEFAULT_PRESETS = '15,30,60,120';

// 定时 / 倒计时: a writable number of seconds left. Idle it offers presets;
// running it counts down locally between device reports.
@Component({
  selector: 'app-timer-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './timer-widget.html',
  styleUrls: ['./timer-widget.scss'],
})
export class TimerWidgetComponent extends RangeWidgetBase implements OnInit, OnChanges, OnDestroy {
  readonly now = signal(Date.now());
  private reportedAt = Date.now();
  private total = 0;
  private ticker?: ReturnType<typeof setInterval>;

  get style(): string { return this.options.style ?? 'ring'; }

  get presets(): number[] {
    return parseList(this.options.presets ?? DEFAULT_PRESETS).map(Number).filter(minutes => minutes > 0).slice(0, 6);
  }

  get left(): number {
    const reported = numeric(this.card.value) ?? 0;
    return Math.max(0, Math.round(reported - (this.now() - this.reportedAt) / 1000));
  }

  get share(): number { return this.left / Math.max(1, this.total || this.max); }
  get time(): string { return duration(this.left); }
  get ring(): string { return arcPath(32, 32, 27, 0, this.share * 360); }
  get ringTrack(): string { return arcPath(32, 32, 27, 0, 360); }

  get finish(): string {
    const at = new Date(this.now() + this.left * 1000);
    return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  }

  get actionText(): string { return this.options.actionText ?? '后关闭'; }

  presetLabel(minutes: number): { value: number; unit: string } {
    return minutes >= 60 && minutes % 60 === 0 ? { value: minutes / 60, unit: '小时' } : { value: minutes, unit: '分钟' };
  }

  ngOnInit(): void {
    this.ticker = setInterval(() => { if (this.left > 0) this.now.set(Date.now()); }, 1000);
  }

  override ngOnChanges(): void {
    super.ngOnChanges();
    this.reportedAt = Date.now();
    this.now.set(this.reportedAt);
  }

  start(minutes: number): void {
    this.total = Math.min(this.max, minutes * 60);
    this.commit(this.total);
  }

  cancel(): void {
    this.commit(this.min);
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    clearInterval(this.ticker);
  }
}
