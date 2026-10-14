import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { WidgetBase } from '../widget-base';

// 文本输入: a writable text or number in a one-piece composer: the field, its
// counter and the send key share one box; the head shows what the device holds.
@Component({
  selector: 'app-text-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './text-widget.html',
  styleUrls: ['./text-widget.scss'],
})
export class TextWidgetComponent extends WidgetBase {
  get numeric(): boolean { return this.card.field.valueType !== 'text'; }
  get limit(): number | null { return this.card.field.maxLength ?? null; }

  get last(): string {
    const value = this.card.value;
    if (value === undefined || value === null || value === '') return '尚未发送';
    return `当前 ${this.card.display}`;
  }

  get multiline(): boolean { return !!this.options.multiline && !this.numeric; }

  get counter(): string {
    const length = [...this.card.draft].length;
    return this.limit ? `${length}/${this.limit}` : String(length);
  }

  draft(value: string): void {
    this.act.emit({ kind: 'draft', value });
  }

  send(): void {
    if (!this.card.disabled) this.act.emit({ kind: 'commit' });
  }
}
