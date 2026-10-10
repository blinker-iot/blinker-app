import { Component, EventEmitter, Input, Output } from '@angular/core';

import type { PageLayoutWidget, PageWidgetAppearance } from '../../../core/device-v2/page-layout';
import {
  COMMON_WIDGET_OPTIONS, OptionRule, PAGE_WIDGET_OPTION_RULES, PAGE_WIDGET_TONES, PAGE_WIDGET_VARIANTS,
  PageWidgetOptionKey, PageWidgetOptions, PageWidgetVariant, VARIANT_WIDGET_OPTIONS, validOption,
} from '../../../core/device-v2/page-widget';
import { UiIconComponent } from '../../../device/v2/widgets/icon/ui-icon';
import { UI_ICONS } from '../../../device/v2/widgets/icon/ui-icons';
import { OPTION_HINTS, OPTION_LABELS, TYPE_LABELS, VALUE_LABELS, VARIANT_LABELS } from './widget-labels';

const CONTROL_ICONS = new Set(['plus', 'minus', 'send', 'chevron', 'check']);
const OWN_COMMON: readonly PageWidgetOptionKey[] = ['caption', 'showTitle', 'size', 'align'];

// Edits one widget's presentation: variant, size, common and variant options.
// Every change emits a new widget; invalid text input is kept local until fixed.
@Component({
  selector: 'app-widget-inspector',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './widget-inspector.html',
  styleUrls: ['./widget-inspector.scss'],
})
export class WidgetInspectorComponent {
  @Input({ required: true }) widget!: PageLayoutWidget;
  @Output() widgetChange = new EventEmitter<PageLayoutWidget>();

  readonly tones = PAGE_WIDGET_TONES;
  readonly icons = Object.keys(UI_ICONS).filter(name => !CONTROL_ICONS.has(name));
  readonly widths = [2, 4, 6, 8];
  readonly heights = [1, 2, 3, 4];
  readonly appearances: { id: PageWidgetAppearance; label: string }[] = [
    { id: 'default', label: '默认' }, { id: 'compact', label: '紧凑' }, { id: 'emphasized', label: '强调' },
  ];
  readonly optionLabels = OPTION_LABELS;
  readonly hints = OPTION_HINTS;
  invalid = new Set<PageWidgetOptionKey>();

  get typeLabel(): string { return TYPE_LABELS[this.widget.type]; }
  get variant(): string { return this.widget.variant ?? PAGE_WIDGET_VARIANTS[this.widget.type][0]; }
  get variants(): readonly string[] { return PAGE_WIDGET_VARIANTS[this.widget.type]; }
  get options(): PageWidgetOptions { return this.widget.options ?? {}; }

  // Common options with dedicated controls are left out of the generic list.
  get specific(): PageWidgetOptionKey[] {
    return [
      ...OWN_COMMON,
      ...(VARIANT_WIDGET_OPTIONS[`${this.widget.type}:${this.variant}`] ?? []),
    ];
  }

  get json(): string { return JSON.stringify(this.widget, null, 2); }

  variantLabel(variant: string): string { return VARIANT_LABELS[`${this.widget.type}:${variant}`] ?? variant; }
  valueLabel(value: string): string { return VALUE_LABELS[value] ?? value; }
  rule(key: PageWidgetOptionKey): OptionRule { return PAGE_WIDGET_OPTION_RULES[key]; }
  enumValues(key: PageWidgetOptionKey): readonly string[] {
    const rule = this.rule(key);
    return rule.kind === 'enum' ? rule.values : [];
  }

  text(key: PageWidgetOptionKey): string {
    const value = this.options[key];
    return value === undefined ? '' : String(value);
  }

  setVariant(variant: string): void {
    // Keep only the options the new variant still reads.
    const keep = new Set([...COMMON_WIDGET_OPTIONS, ...(VARIANT_WIDGET_OPTIONS[`${this.widget.type}:${variant}`] ?? [])]);
    const options = Object.fromEntries(Object.entries(this.options).filter(([key]) => keep.has(key as PageWidgetOptionKey)));
    this.invalid.clear();
    this.emit({
      ...this.widget,
      variant: variant === this.variants[0] ? undefined : variant as PageWidgetVariant,
      options,
    });
  }

  setTitle(title: string): void {
    this.emit({ ...this.widget, title: title.trim() || undefined });
  }

  setSize(width: number, height: number): void {
    this.emit({ ...this.widget, grid: { ...this.widget.grid, x: Math.min(this.widget.grid.x, 8 - width), width, height } });
  }

  setAppearance(appearance: PageWidgetAppearance): void {
    this.emit({ ...this.widget, appearance: appearance === 'default' ? undefined : appearance });
  }

  // Raw input from a control; empty clears the option back to its default.
  setOption(key: PageWidgetOptionKey, raw: string | boolean | undefined): void {
    const rule = this.rule(key);
    let value: unknown = raw;
    if (raw === '' || raw === undefined) value = undefined;
    else if (rule.kind === 'integer' || rule.kind === 'number') value = Number(raw);
    else if (rule.kind === 'text') value = String(raw).trim() || undefined;

    if (value !== undefined && !validOption(rule, value)) {
      this.invalid.add(key);
      return;
    }
    this.invalid.delete(key);
    const options: Record<string, unknown> = { ...this.options, [key]: value };
    if (value === undefined) delete options[key];
    this.emit({ ...this.widget, options: options as PageWidgetOptions });
  }

  private emit(widget: PageLayoutWidget): void {
    const cleaned = { ...widget };
    if (!cleaned.options || !Object.keys(cleaned.options).length) delete cleaned.options;
    if (!cleaned.variant) delete cleaned.variant;
    if (!cleaned.appearance) delete cleaned.appearance;
    if (cleaned.title === undefined) delete cleaned.title;
    this.widgetChange.emit(cleaned);
  }
}
