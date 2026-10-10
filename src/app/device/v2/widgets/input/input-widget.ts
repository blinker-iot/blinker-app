import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { WidgetBase } from '../widget-base';

@Component({
  selector: 'app-input-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './input-widget.html',
  styleUrls: ['./input-widget.scss'],
})
export class InputWidgetComponent extends WidgetBase {
  get text(): boolean { return this.card.field.valueType === 'text'; }
  get sendLabel(): string { return this.options.actionText ?? '发送'; }
  get counter(): string { return `${this.card.draft.length}${this.card.field.maxLength ? ' / ' + this.card.field.maxLength : ''}`; }

  // The keypad only edits numbers; text endpoints fall back to the field.
  get layout(): string { return this.variant === 'keypad' && this.text ? 'field' : this.variant; }

  get keys(): string[] {
    const decimal = this.card.field.valueType === 'number' ? '.' : '';
    const sign = (this.card.field.minimum ?? 0) < 0 ? '±' : '';
    return ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimal || sign, '0', '⌫'];
  }

  draft(value: string): void {
    this.act.emit({ kind: 'draft', value });
  }

  press(key: string): void {
    if (this.card.disabled || !key) return;
    const current = this.card.draft;
    if (key === '⌫') this.draft(current.slice(0, -1));
    else if (key === '±') this.draft(current.startsWith('-') ? current.slice(1) : `-${current}`);
    else if (key !== '.' || !current.includes('.')) this.draft(current + key);
  }

  commit(): void {
    if (!this.card.disabled) this.act.emit({ kind: 'commit' });
  }
}
