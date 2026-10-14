import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-generation-duration',
  standalone: true,
  template: `
    @if (seconds !== undefined) {
      <span aria-label="生成耗时">{{ minutes }}m {{ seconds % 60 }}s</span>
    } @else {
      <ng-content />
    }
  `,
  styles: [`:host { color: var(--studio-muted); font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class GenerationDurationComponent implements OnChanges, OnDestroy {
  @Input() running = false;

  seconds?: number;
  private startedAt?: number;
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly cd: ChangeDetectorRef) {}

  get minutes(): number { return Math.floor((this.seconds ?? 0) / 60); }

  ngOnChanges(): void {
    clearInterval(this.timer);

    if (this.running) {
      this.startedAt = performance.now();
      this.seconds = 0;
      this.timer = setInterval(() => this.update(), 1000);
    } else {
      this.update();
    }
  }

  ngOnDestroy(): void { clearInterval(this.timer); }

  private update(): void {
    if (this.startedAt === undefined) return;

    this.seconds = Math.floor((performance.now() - this.startedAt) / 1000);

    this.cd.markForCheck();
  }
}
