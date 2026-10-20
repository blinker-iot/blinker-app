import { Component, OnDestroy, signal } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { WidgetBase } from '../widget-base';
import { choicesOf } from '../widget-kit';

const SENT_MS = 1200;

// 指令键盘: an action with allowed values, one key per value, e.g. IR remote keys
// or buzzer tunes. A key sends its value; an action keeps no state, so the key
// just sent only glows for a moment.
@Component({
  selector: 'app-keys-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './keys-widget.html',
  styleUrls: ['./keys-widget.scss'],
  host: { '[class.inline]': 'rows === 1' },
})
export class KeysWidgetComponent extends WidgetBase implements OnDestroy {
  readonly sent = signal<string | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  get keys(): { label: string; icon: string; tone: string }[] { return choicesOf(this.card); }

  // As many rows of keys as the card has rows, filled evenly.
  get columns(): number {
    const count = this.keys.length || 1;
    return Math.ceil(count / Math.min(count, this.rows));
  }

  press(label: string): void {
    if (this.card.disabled) return;
    this.act.emit({ kind: 'select', value: label });
    this.sent.set(label);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sent.set(null), SENT_MS);
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }
}
