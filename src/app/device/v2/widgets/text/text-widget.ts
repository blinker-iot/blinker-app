import { Component, Input } from '@angular/core';
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
  host: { '[class.compact-multiline]': 'multiline && rows <= 2' },
})

export class TextWidgetComponent extends WidgetBase {
  @Input() readOnly = false;

  get numeric(): boolean { return this.card.field.valueType !== 'text'; }
  get limit(): number | null { return this.card.field.maxLength ?? null; }

  get last(): string {
    const value = this.card.value;

    if (value === undefined || value === null) return '尚未发送';
    if (value === '') return this.numeric ? '尚未发送' : '当前（空文本）';

    return `当前 ${this.card.display}`;
  }

  get multiline(): boolean { return !!this.options.multiline && !this.numeric; }

  get canSend(): boolean {
    return !this.readOnly && !this.card.disabled && (!this.numeric || this.card.draft.trim() !== '');
  }

  get counter(): string {
    const length = [...this.card.draft].length;

    return this.limit ? `${length}/${this.limit}` : String(length);
  }

  draft(value: string): void {
    if (!this.readOnly) this.act.emit({ kind: 'draft', value });
  }

  send(event?: Event): void {
    // Enter may confirm an IME candidate, including legacy WebView's 229 key.
    // Leave its default action intact; only an explicit submit emits commit.
    const keyboard = event as KeyboardEvent | undefined;
    if (keyboard?.isComposing || keyboard?.keyCode === 229) return;

    if (this.canSend) this.act.emit({ kind: 'commit' });
  }
}
