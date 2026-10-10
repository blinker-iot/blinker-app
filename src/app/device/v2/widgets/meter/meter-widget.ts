import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { DotTextComponent } from '../dot-text/dot-text';
import { ReadingWidgetBase } from '../reading-base';
import { arcPath, polar } from '../widget-kit';

const DEFAULT_SWEEP = 270;
const RING_SEGMENTS = 24;
const DIRECTIONS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

@Component({
  selector: 'app-meter-widget',
  standalone: true,
  imports: [UiIconComponent, DotTextComponent],
  templateUrl: './meter-widget.html',
  styleUrls: ['./meter-widget.scss'],
})
export class MeterWidgetComponent extends ReadingWidgetBase {
  // Half of the gauge sweep, centred on the top.
  get half(): number { return (this.options.sweep ?? DEFAULT_SWEEP) / 2; }
  get gaugeTrack(): string { return arcPath(100, 100, 80, -this.half, this.half); }

  get gaugeArc(): string {
    return this.level > 0.002 ? arcPath(100, 100, 80, -this.half, -this.half + this.level * this.half * 2) : '';
  }

  get ringShape(): string { return this.options.shape ?? 'ring'; }

  // Ring: a full circle (just short of closing) or the upper half.
  get ringTrack(): string {
    return this.ringShape === 'half' ? arcPath(100, 100, 80, -90, 90) : arcPath(100, 100, 80, 0, 359.9);
  }

  get ringArc(): string {
    if (this.level <= 0.002) return '';
    return this.ringShape === 'half'
      ? arcPath(100, 100, 80, -90, -90 + this.level * 180)
      : arcPath(100, 100, 80, 0, Math.min(359.9, this.level * 360));
  }

  // Segmented ring: short arcs with gaps, lit up to the level.
  get ringSegments(): { path: string; lit: boolean }[] {
    const span = 360 / RING_SEGMENTS;
    return Array.from({ length: RING_SEGMENTS }, (_, index) => ({
      path: arcPath(100, 100, 80, index * span + 2, (index + 1) * span - 2),
      lit: index / RING_SEGMENTS < this.level - 0.001,
    }));
  }

  get ticks(): number[] {
    const count = this.options.ticks ?? 0;
    return count < 2 ? [] : Array.from({ length: count }, (_, index) => index / (count - 1));
  }

  tickPoint(position: number) { return polar(100, 100, 96, -this.half + position * this.half * 2); }

  // Segments lit when their start is below the level (level, battery and signal).
  segments(fallback: number): boolean[] {
    const count = this.options.ticks && this.options.ticks >= 2 ? this.options.ticks : fallback;
    return Array.from({ length: count }, (_, index) => index / count < this.level - 0.001);
  }

  get heading(): number {
    return (((this.number ?? 0) * (this.options.scale ?? 1)) % 360 + 360) % 360;
  }

  get direction(): string { return DIRECTIONS[Math.round(this.heading / 45) % 8]; }
}
