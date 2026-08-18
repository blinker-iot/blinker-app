import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

export interface TabSelectorOption {
  value: string;
  label: string;
  icon?: string;
  badge?: string | number | null;
  disabled?: boolean;
}

@Component({
  selector: 'app-tab-selector',
  templateUrl: './tab-selector.component.html',
  styleUrls: ['./tab-selector.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabSelectorComponent {
  private readonly tabGap = 5;
  private readonly containerPadding = 4;

  @Input() options: readonly TabSelectorOption[] = [];
  @Input() value = '';
  @Input() ariaLabel = '分类选择';

  @Output() readonly valueChange = new EventEmitter<string>();

  get indicatorWidth(): string {
    const count = Math.max(1, this.options.length);
    const unavailableWidth = this.containerPadding * 2 + this.tabGap * (count - 1);
    return `calc((100% - ${unavailableWidth}px) / ${count})`;
  }

  get indicatorTransform(): string {
    const index = Math.max(0, this.options.findIndex((option) => option.value === this.value));
    return `translateX(calc(${index * 100}% + ${index * this.tabGap}px))`;
  }

  select(option: TabSelectorOption): void {
    if (option.disabled || option.value === this.value) return;
    this.valueChange.emit(option.value);
  }

  hasBadge(option: TabSelectorOption): boolean {
    return option.badge !== null
      && option.badge !== undefined
      && option.badge !== '';
  }
}
