import { NgTemplateOutlet } from '@angular/common';
import { Component, signal } from '@angular/core';

import { parseList } from '../../../../core/device-v2/page-widget';
import { UiIconComponent } from '../icon/ui-icon';
import { ValueTransitionDirective } from '../value-transition.directive';
import { WidgetBase } from '../widget-base';
import { hexOf, hueOf, isLight, numeric, rgbOfHsl } from '../widget-kit';

const DEFAULT_PALETTE = '#FF5A4E,#FF9A1F,#FFD43B,#2DBE7E,#15B8C2,#3482FF,#8467F5';
// The wheel picks a hue at a fixed, vivid saturation and lightness.
const SATURATION = 88;
const LIGHTNESS = 58;

// 色盘: a 24-bit RGB endpoint as a hue ring, preset swatches, or both.
@Component({
  selector: 'app-picker-widget',
  standalone: true,
  imports: [ValueTransitionDirective, UiIconComponent, NgTemplateOutlet],
  templateUrl: './picker-widget.html',
  styleUrls: ['./picker-widget.scss'],
})
export class PickerWidgetComponent extends WidgetBase {
  readonly local = signal<number | null>(null);
  private pointerId?: number;

  get mode(): string { return this.options.mode ?? 'both'; }
  get ring(): number { return this.options.thickness ?? 18; }
  get rgb(): number { return this.local() ?? numeric(this.card.value) ?? 0x3482ff; }
  get hex(): string { return hexOf(this.rgb); }
  get hue(): number { return Math.round(hueOf(this.rgb)); }
  get light(): boolean { return isLight(this.rgb); }

  get swatches(): string[] {
    return parseList(this.options.palette ?? DEFAULT_PALETTE).filter(hex => /^#[0-9a-f]{6}$/i.test(hex)).map(hex => hex.toUpperCase());
  }

  pick(hex: string): void {
    this.send(parseInt(hex.slice(1), 16));
  }

  turnStart(event: PointerEvent): void {
    if (this.card.disabled || this.pointerId !== undefined) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.pointerId = event.pointerId;
    this.turnMove(event);
  }

  turnMove(event: PointerEvent): void {
    if (this.pointerId !== event.pointerId) return;
    const box = (event.currentTarget as Element).getBoundingClientRect();
    const degrees = Math.atan2(event.clientX - box.left - box.width / 2, -(event.clientY - box.top - box.height / 2)) * 180 / Math.PI;
    this.local.set(rgbOfHsl((degrees + 360) % 360, SATURATION, LIGHTNESS));
  }

  turnEnd(event: PointerEvent): void {
    if (this.pointerId !== event.pointerId) return;
    this.pointerId = undefined;
    const value = this.local();
    if (value !== null) this.send(value);
  }

  key(event: KeyboardEvent): void {
    const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    this.send(rgbOfHsl((this.hue + direction * 10 + 360) % 360, SATURATION, LIGHTNESS));
  }

  private send(rgb: number): void {
    this.local.set(null);
    if (!this.card.disabled && rgb !== numeric(this.card.value)) this.act.emit({ kind: 'range', value: rgb });
  }
}
