import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { ReadingWidgetBase } from '../reading-base';
import { arcPath } from '../widget-kit';

const SEGMENTS = 10;

// Indicator geometry in viewBox units. The half ring's box is cut to its ink:
// the arch (radius 15, stroke 4) and the round caps under its ends.
const RING = { box: '0 0 36 36', cx: 18, cy: 18, radius: 14, start: 0, sweep: 360 };
const HALF = { box: '3 4 34 19', cx: 20, cy: 21, radius: 15, start: -90, sweep: 180 };

// 环形进度: a bounded reading led by its value, as on the number card. The ring
// or half ring is a small indicator beside the title; segments sit under the value.
@Component({
  selector: 'app-ring-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './ring-widget.html',
  styleUrls: ['./ring-widget.scss'],
})
export class RingWidgetComponent extends ReadingWidgetBase {
  get shape(): string { return this.options.shape === 'half' || this.options.shape === 'segments' ? this.options.shape : 'ring'; }
  private get geometry() { return this.shape === 'half' ? HALF : RING; }

  get viewBox(): string { return this.geometry.box; }

  get track(): string {
    const { cx, cy, radius, start, sweep } = this.geometry;
    return arcPath(cx, cy, radius, start, start + sweep);
  }

  get progress(): string {
    const { cx, cy, radius, start, sweep } = this.geometry;
    return this.level > 0 ? arcPath(cx, cy, radius, start, start + this.level * sweep) : '';
  }

  get segments(): boolean[] {
    const lit = Math.round(this.level * SEGMENTS);
    return Array.from({ length: SEGMENTS }, (_, index) => index < lit);
  }

  get note(): string { return this.alert ? '超出设定阈值' : this.options.caption ?? ''; }
}
