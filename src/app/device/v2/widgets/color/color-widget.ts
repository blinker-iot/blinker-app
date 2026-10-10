import { NgTemplateOutlet } from '@angular/common';
import { Component, OnChanges, OnDestroy, signal } from '@angular/core';

import { COLOR_MAXIMUM, parseList } from '../../../../core/device-v2/page-widget';
import { UiIconComponent } from '../icon/ui-icon';
import { WidgetBase } from '../widget-base';
import { clamp, numeric } from '../widget-kit';

const SETTLE_MS = 1500;

export const COLOR_SWATCHES = [
  0xffffff, 0xffe4b5, 0xffb347, 0xff7043, 0xff3b30, 0xff4f9a,
  0xb05cff, 0x5b6cff, 0x2f9bff, 0x22c6d8, 0x2fcf6f, 0xd4e83a,
];

interface Hsv { h: number; s: number; v: number }
type Channel = 'hue' | 'saturation' | 'brightness';

@Component({
  selector: 'app-color-widget',
  standalone: true,
  imports: [UiIconComponent, NgTemplateOutlet],
  templateUrl: './color-widget.html',
  styleUrls: ['./color-widget.scss'],
  host: { '[style.--color]': 'css' },
})
export class ColorWidgetComponent extends WidgetBase implements OnChanges, OnDestroy {
  readonly local = signal<Hsv | null>(null);

  private reported?: number;
  private timer?: ReturnType<typeof setTimeout>;
  private drag?: { pointerId: number; channel: Channel | 'wheel'; start: number };

  get rgb(): number { return clamp(Math.round(numeric(this.card.value) ?? COLOR_MAXIMUM), 0, COLOR_MAXIMUM); }
  get hsv(): Hsv { return this.local() ?? toHsv(this.rgb); }
  get current(): number { return fromHsv(this.hsv); }
  get css(): string { return hex(this.current); }
  get hueCss(): string { return hex(fromHsv({ h: this.hsv.h, s: 1, v: 1 })); }
  get marker() { return { x: 50 + 42 * Math.sin(this.hsv.h * Math.PI / 180), y: 50 - 42 * Math.cos(this.hsv.h * Math.PI / 180) }; }

  // Rounded channel values for assistive technology.
  get channels() {
    const { h, s, v } = this.hsv;
    return { hue: Math.round(h), saturation: Math.round(s * 100), brightness: Math.round(v * 100) };
  }

  hex(value: number): string { return hex(value); }

  // The `palette` option replaces the built-in swatches.
  get swatches(): number[] {
    const palette = parseList(this.options.palette).map(color => parseInt(color.slice(1), 16));
    return palette.length ? palette : COLOR_SWATCHES;
  }

  get caption(): string {
    if (this.options.showHex === false) return this.options.caption ?? '';
    return this.options.caption ? `${this.options.caption} · ${this.css.toUpperCase()}` : this.css.toUpperCase();
  }

  ngOnChanges(): void {
    const reported = numeric(this.card.value);
    if (reported === this.reported) return;
    this.reported = reported;
    if (!this.drag) this.local.set(null);
  }

  pick(value: number): void {
    if (this.card.disabled) return;
    this.local.set(toHsv(value));
    this.commit();
  }

  start(event: PointerEvent, channel: Channel | 'wheel'): void {
    if (this.card.disabled || this.drag) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.drag = { pointerId: event.pointerId, channel, start: this.current };
    this.move(event);
  }

  move(event: PointerEvent): void {
    const drag = this.drag;
    if (drag?.pointerId !== event.pointerId) return;
    const box = (event.currentTarget as Element).getBoundingClientRect();
    const base = { ...this.hsv };
    // A hue picked from black or white would be invisible; lift it to a full colour.
    if (drag.channel === 'wheel' || drag.channel === 'hue') {
      const hue = drag.channel === 'wheel'
        ? Math.atan2(event.clientX - (box.left + box.width / 2), (box.top + box.height / 2) - event.clientY) * 180 / Math.PI
        : clamp((event.clientX - box.left) / box.width, 0, 1) * 360;
      this.local.set({ h: (hue + 360) % 360, s: base.s || 1, v: base.v || 1 });
      return;
    }
    const position = clamp((event.clientX - box.left) / box.width, 0, 1);
    this.local.set(drag.channel === 'saturation' ? { ...base, s: position } : { ...base, v: Math.max(0.04, position) });
  }

  end(event: PointerEvent): void {
    const drag = this.drag;
    if (drag?.pointerId !== event.pointerId) return;
    this.drag = undefined;
    if (this.current !== drag.start) this.commit();
    else this.local.set(null);
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  private commit(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.local.set(null), SETTLE_MS);
    this.act.emit({ kind: 'range', value: this.current });
  }
}

function hex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

function toHsv(value: number): Hsv {
  const [r, g, b] = [16, 8, 0].map(shift => (value >> shift & 0xff) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? delta / max : 0, v: max };
}

function fromHsv({ h, s, v }: Hsv): number {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return channel(5) << 16 | channel(3) << 8 | channel(1);
}
