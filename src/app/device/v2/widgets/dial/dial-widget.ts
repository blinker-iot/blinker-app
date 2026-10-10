import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { DotTextComponent } from '../dot-text/dot-text';
import { RangeWidgetBase } from '../range-base';
import { arcPath, clamp, polar } from '../widget-kit';

const DEFAULT_SWEEP = 270;
const KNOB_TICKS = 24;

@Component({
  selector: 'app-dial-widget',
  standalone: true,
  imports: [UiIconComponent, DotTextComponent],
  templateUrl: './dial-widget.html',
  styleUrls: ['./dial-widget.scss'],
})
export class DialWidgetComponent extends RangeWidgetBase {
  private pointer?: { id: number; startValue: number };

  // Half of the face's sweep, centred on the top.
  get half(): number { return (this.options.sweep ?? DEFAULT_SWEEP) / 2; }
  get angle(): number { return -this.half + this.level * this.half * 2; }
  get track(): string { return arcPath(100, 100, 80, -this.half, this.half); }

  get valueArc(): string {
    return this.level > 0.002 ? arcPath(100, 100, 80, -this.half, this.angle) : '';
  }

  get knob() { return polar(100, 100, 80, this.angle); }

  get ticks(): number[] {
    const count = this.options.ticks ?? (this.variant === 'knob' ? KNOB_TICKS : 0);
    return count < 2 ? [] : Array.from({ length: count }, (_, index) => index / (count - 1));
  }

  tickPoint(position: number, radius = 96) { return polar(100, 100, radius, -this.half + position * this.half * 2); }

  start(event: PointerEvent): void {
    if (this.card.disabled || this.dragging) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.dragging = true;
    this.pointer = { id: event.pointerId, startValue: this.value };
    this.move(event);
  }

  // The pointer angle around the centre of the face is the value.
  move(event: PointerEvent): void {
    if (this.pointer?.id !== event.pointerId) return;
    const box = (event.currentTarget as Element).getBoundingClientRect();
    const angle = Math.atan2(event.clientX - (box.left + box.width / 2), (box.top + box.height / 2) - event.clientY)
      * 180 / Math.PI;
    if (Math.abs(angle) > this.half + 15) return;
    const position = (clamp(angle, -this.half, this.half) + this.half) / (this.half * 2);
    this.preview(this.min + position * (this.max - this.min));
  }

  end(event: PointerEvent): void {
    if (this.pointer?.id !== event.pointerId) return;
    const start = this.pointer.startValue;
    this.pointer = undefined;
    this.settle(start);
  }
}
