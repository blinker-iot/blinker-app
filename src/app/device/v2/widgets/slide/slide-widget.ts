import { Component, signal } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { SwitchWidgetBase } from '../switch-base';
import { clamp } from '../widget-kit';

// Share of the travel past which a released drag switches.
const SLIDE_THRESHOLD = 0.85;

// 滑动开关: dragging the knob across is itself the confirmation (relays, motors).
@Component({
  selector: 'app-slide-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './slide-widget.html',
  styleUrls: ['./slide-widget.scss'],
})
export class SlideWidgetComponent extends SwitchWidgetBase {
  readonly position = signal<number | null>(null);
  private drag?: { pointerId: number; startX: number; travel: number };

  get thumb(): number { return this.position() ?? (this.on ? 1 : 0); }

  start(event: PointerEvent): void {
    if (this.card.disabled || this.drag) return;
    const knob = event.currentTarget as HTMLElement;
    const track = knob.parentElement!;
    const gap = parseFloat(getComputedStyle(track).paddingLeft);
    knob.setPointerCapture(event.pointerId);
    this.drag = { pointerId: event.pointerId, startX: event.clientX, travel: track.clientWidth - knob.offsetWidth - 2 * gap };
  }

  move(event: PointerEvent): void {
    if (this.drag?.pointerId !== event.pointerId) return;
    const base = this.on ? 1 : 0;
    this.position.set(clamp(base + (event.clientX - this.drag.startX) / Math.max(1, this.drag.travel), 0, 1));
  }

  end(event: PointerEvent): void {
    if (this.drag?.pointerId !== event.pointerId) return;
    this.drag = undefined;
    const position = this.position() ?? (this.on ? 1 : 0);
    this.position.set(null);
    if (this.on ? position <= 1 - SLIDE_THRESHOLD : position >= SLIDE_THRESHOLD) this.toggle(!this.on, true);
  }
}
