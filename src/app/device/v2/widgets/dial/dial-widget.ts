import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { RangeWidgetBase } from '../range-base';
import { arcPath, clamp, polar } from '../widget-kit';

const CENTER = 110;
const RADIUS = 84;
const MAX_TICKS = 40;
// Room under the centre for the reading, however open the arc is.
const MIN_BELOW = 40;

// 环形旋钮: a range on a 240–300° arc, dragged around its centre.
@Component({
  selector: 'app-dial-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './dial-widget.html',
  styleUrls: ['./dial-widget.scss'],
})
export class DialWidgetComponent extends RangeWidgetBase {
  private pointerId?: number;
  private startValue = 0;

  get half(): number { return (this.options.sweep ?? 270) / 2; }
  get thickness(): number { return this.options.thickness ?? 12; }
  get angle(): number { return -this.half + this.level * this.half * 2; }

  get track(): string { return arcPath(CENTER, CENTER, RADIUS, -this.half, this.half); }
  get progress(): string { return arcPath(CENTER, CENTER, RADIUS, -this.half, this.angle); }
  get knob() { return polar(CENTER, CENTER, RADIUS, this.angle); }

  // The viewBox ends just under the lowest part of the arc (its ends, knob or
  // ticks), so an open dial leaves no empty band above the buttons.
  get viewHeight(): number {
    const drop = Math.max(0, -Math.cos(this.half * Math.PI / 180));
    const knob = RADIUS * drop + this.thickness / 2 + 4;
    const ticks = this.options.showTicks === false ? 0 : (RADIUS + this.thickness / 2 + 12) * drop;
    return Math.ceil(CENTER + Math.max(knob, ticks, MIN_BELOW) + 2);
  }

  // One tick per unit up to 40, every fifth one longer.
  get ticks(): { x1: number; y1: number; x2: number; y2: number; on: boolean }[] {
    if (this.options.showTicks === false) return [];
    const count = clamp(Math.round(this.max - this.min), 2, MAX_TICKS);
    const inner = RADIUS + this.thickness / 2 + 6;
    return Array.from({ length: count + 1 }, (_, index) => {
      const angle = -this.half + index / count * this.half * 2;
      const from = polar(CENTER, CENTER, inner, angle);
      const to = polar(CENTER, CENTER, inner + (index % 5 === 0 ? 6 : 3), angle);
      return { x1: from.x, y1: from.y, x2: to.x, y2: to.y, on: angle <= this.angle };
    });
  }

  turnStart(event: PointerEvent): void {
    if (this.card.disabled || this.dragging) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.dragging = true;
    this.pointerId = event.pointerId;
    this.startValue = this.value;
    this.turnMove(event);
  }

  turnMove(event: PointerEvent): void {
    if (this.pointerId !== event.pointerId) return;
    const box = (event.currentTarget as Element).getBoundingClientRect();
    const x = event.clientX - box.left - box.width / 2;
    const y = event.clientY - box.top - box.height * CENTER / this.viewHeight;
    const degrees = Math.atan2(x, -y) * 180 / Math.PI;
    const angle = clamp(degrees, -this.half, this.half);
    this.preview(this.min + (angle + this.half) / (this.half * 2) * (this.max - this.min));
  }

  turnEnd(event: PointerEvent): void {
    if (this.pointerId !== event.pointerId) return;
    this.pointerId = undefined;
    this.settle(this.startValue);
  }
}
