import { Component } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { WidgetBase } from '../widget-base';
import { choicesOf } from '../widget-kit';

// 模式宫格: an enumerated text endpoint as icon tiles, a segmented bar or chips.
// Choices may carry their own icon and tone (choiceIcons, choiceTones).
@Component({
  selector: 'app-mode-widget',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './mode-widget.html',
  styleUrls: ['./mode-widget.scss'],
})
export class ModeWidgetComponent extends WidgetBase {
  get style(): string { return this.options.style ?? 'tiles'; }
  get current(): string { return typeof this.card.value === 'string' ? this.card.value : ''; }
  get showIcons(): boolean { return this.options.showIcons !== false; }

  // Tiles always draw an icon; segments and chips only the ones configured.
  get choices(): { label: string; icon: string; tone: string }[] {
    const tiles = this.style === 'tiles';
    return choicesOf(this.card).map(choice => ({ ...choice, icon: choice.icon || (tiles ? 'auto' : '') }));
  }

  pick(choice: string): void {
    if (!this.card.disabled && choice !== this.current) this.act.emit({ kind: 'select', value: choice });
  }
}
