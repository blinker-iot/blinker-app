import { Component } from '@angular/core';

import { PAGE_WIDGET_TONES, parsePairs } from '../../../../core/device-v2/page-widget';
import { UiIconComponent } from '../icon/ui-icon';
import { WidgetBase } from '../widget-base';

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
    const icons = new Map(parsePairs(this.options.choiceIcons));
    const tones = new Map(parsePairs(this.options.choiceTones));
    return (this.card.field.choices ?? []).map(label => ({
      label,
      icon: icons.get(label) || (this.style === 'tiles' ? 'auto' : ''),
      tone: (PAGE_WIDGET_TONES as readonly string[]).includes(tones.get(label) ?? '') ? tones.get(label)! : '',
    }));
  }

  pick(choice: string): void {
    if (!this.card.disabled && choice !== this.current) this.act.emit({ kind: 'select', value: choice });
  }
}
