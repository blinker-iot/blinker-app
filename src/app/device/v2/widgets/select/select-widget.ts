import { NgTemplateOutlet } from '@angular/common';
import { Component, signal } from '@angular/core';

import { parsePairs } from '../../../../core/device-v2/page-widget';
import { UiIconComponent } from '../icon/ui-icon';
import { WidgetBase } from '../widget-base';
import { clamp } from '../widget-kit';

const WHEEL_ROW = 36;
const WHEEL_REACH = 2;

@Component({
  selector: 'app-select-widget',
  standalone: true,
  imports: [UiIconComponent, NgTemplateOutlet],
  templateUrl: './select-widget.html',
  styleUrls: ['./select-widget.scss'],
})
export class SelectWidgetComponent extends WidgetBase {
  readonly wheelIndex = signal<number | null>(null);
  private wheel?: { pointerId: number; startY: number; startIndex: number; moved: boolean };

  get choices(): string[] { return this.card.field.choices ?? []; }
  // Icon per choice from "名称:图标" pairs; hidden when showIcons is off.
  iconOf(choice: string): string | undefined {
    if (this.options.showIcons === false) return undefined;
    return parsePairs(this.options.choiceIcons).find(([name]) => name === choice)?.[1] || undefined;
  }

  get current(): string { return typeof this.card.value === 'string' ? this.card.value : ''; }
  get index(): number { return this.wheelIndex() ?? Math.max(0, this.choices.indexOf(this.current)); }

  // Rows visible in the wheel, relative to the centred one.
  get wheelRows(): { choice: string; offset: number }[] {
    const rows = [];
    for (let offset = -WHEEL_REACH; offset <= WHEEL_REACH; offset += 1) {
      const choice = this.choices[this.index + offset];
      if (choice !== undefined) rows.push({ choice, offset });
    }
    return rows;
  }

  choose(choice: string): void {
    if (!this.card.disabled && choice !== this.current) this.act.emit({ kind: 'select', value: choice });
  }

  wheelStart(event: PointerEvent): void {
    if (this.card.disabled || this.wheel) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.wheel = { pointerId: event.pointerId, startY: event.clientY, startIndex: this.index, moved: false };
  }

  wheelMove(event: PointerEvent): void {
    const wheel = this.wheel;
    if (wheel?.pointerId !== event.pointerId) return;
    const shift = Math.round((wheel.startY - event.clientY) / WHEEL_ROW);
    if (shift) wheel.moved = true;
    this.wheelIndex.set(clamp(wheel.startIndex + shift, 0, this.choices.length - 1));
  }

  // A drag selects the centred row; a tap selects the tapped row.
  wheelEnd(event: PointerEvent, tapped?: string): void {
    const wheel = this.wheel;
    if (wheel?.pointerId !== event.pointerId) return;
    this.wheel = undefined;
    const index = this.index;
    this.wheelIndex.set(null);
    if (wheel.moved) this.choose(this.choices[index]);
    else if (tapped !== undefined) this.choose(tapped);
  }

  wheelKey(event: KeyboardEvent): void {
    const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const next = this.choices[clamp(this.index + direction, 0, this.choices.length - 1)];
    if (next !== undefined) this.choose(next);
  }

  tappedChoice(event: PointerEvent): string | undefined {
    return (event.target as HTMLElement).closest<HTMLElement>('[data-choice]')?.dataset['choice'];
  }
}
