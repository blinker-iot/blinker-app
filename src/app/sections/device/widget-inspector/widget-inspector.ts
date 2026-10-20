import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { DeviceUiEndpoint } from '../../../core/device-v2/device-ui.port';
import { variantsFor, type PageLayoutWidget } from '../../../core/device-v2/page-layout';

import {
  COMMON_WIDGET_OPTIONS, OptionRule, PAGE_WIDGET_OPTION_RULES, PAGE_WIDGET_TONES, PAGE_WIDGET_VARIANTS,
  MAX_EXTRA_KEYS, PageWidgetOptionKey, PageWidgetOptions, PageWidgetVariant, VARIANT_OPTION_VALUES, VARIANT_SIZES,
  VARIANT_WIDGET_OPTIONS, acceptsExtras, fitSize, validOption, widgetVariant,
} from '../../../core/device-v2/page-widget';

import { UiIconComponent } from '../../../device/v2/widgets/icon/ui-icon';
import { UI_ICONS } from '../../../device/v2/widgets/icon/ui-icons';
import { OPTION_HINTS, OPTION_LABELS, TYPE_LABELS, VALUE_LABELS, VARIANT_LABELS } from './widget-labels';

const CONTROL_ICONS = new Set(['plus', 'minus', 'send', 'chevron', 'arrow', 'check', 'unlock']);
const OWN_COMMON: readonly PageWidgetOptionKey[] = ['caption', 'showTitle'];

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
  // Fields the host lets this widget show as extra readings (附属读数).
  @Input() extraCandidates: readonly (Pick<DeviceUiEndpoint, 'key' | 'role' | 'valueType'> & { label: string })[] = [];
  // The bound field, when known: some variants fit only some fields.
  @Input() field?: DeviceUiEndpoint;
  @Input() twoColumnLayout = false;
  @Output() widgetChange = new EventEmitter<PageLayoutWidget>();

  readonly tones = PAGE_WIDGET_TONES;
  readonly icons = Object.keys(UI_ICONS).filter(name => !CONTROL_ICONS.has(name));
  readonly optionLabels = OPTION_LABELS;
  readonly hints = OPTION_HINTS;

  invalid = new Set<PageWidgetOptionKey>();

  get typeLabel(): string { return TYPE_LABELS[this.widget.type]; }
  get variant(): PageWidgetVariant { return widgetVariant(this.widget.type, this.widget.variant); }

  // Only the sizes the variant is designed for.
  get widths(): readonly number[] {
    const widths = VARIANT_SIZES[this.variant].widths;

    if (!this.twoColumnLayout) return widths;

    const fullWidth = this.widget.grid.width > 2 && widths.includes(this.widget.grid.width)
      ? this.widget.grid.width : widths.find(width => width > 2);

    return widths.filter(width => width <= 2 || width === fullWidth);
  }

  widthLabel(width: number): string {
    return this.twoColumnLayout ? width <= 2 ? '半宽' : '整宽' : `${width} 栏`;
  }

  get extraKeys(): readonly string[] { return this.widget.extraKeys ?? []; }

  get showExtras(): boolean {
    return acceptsExtras(this.widget.type, this.variant)
      && this.candidates.length > 0;
  }

  get candidates(): readonly { key: string; label: string }[] {
    return this.extraCandidates.filter(candidate => candidate.key !== this.widget.endpointKey
      && (this.variant !== 'memory' || (candidate.role === 'property' && ['integer', 'number'].includes(candidate.valueType))));
  }

  get maxExtras(): number { return this.variant === 'memory' ? 1 : MAX_EXTRA_KEYS; }

  get heights(): readonly number[] { return VARIANT_SIZES[this.variant].heights; }

  get variants(): readonly string[] {
    return this.field ? variantsFor(this.widget.type, this.field) : PAGE_WIDGET_VARIANTS[this.widget.type];
  }

  get options(): PageWidgetOptions { return this.widget.options ?? {}; }

  // Common options with dedicated controls are left out of the generic list.
  get specific(): PageWidgetOptionKey[] {
    return [...OWN_COMMON, ...VARIANT_WIDGET_OPTIONS[this.variant]];
  }

  get json(): string { return JSON.stringify(this.widget, null, 2); }
  variantLabel(variant: string): string { return VARIANT_LABELS[variant as PageWidgetVariant] ?? variant; }
  valueLabel(value: string): string { return VALUE_LABELS[value] ?? value; }

  rule(key: PageWidgetOptionKey): OptionRule { return PAGE_WIDGET_OPTION_RULES[key]; }

  enumValues(key: PageWidgetOptionKey): readonly string[] {
    const rule = this.rule(key);

    return VARIANT_OPTION_VALUES[this.variant]?.[key] ?? (rule.kind === 'enum' ? rule.values : []);
  }

  text(key: PageWidgetOptionKey): string {
    const value = this.options[key];

    return value === undefined ? '' : String(value);
  }

  setVariant(variant: string): void {
    // Keep only the options the new variant still reads.
    const keep = new Set([...COMMON_WIDGET_OPTIONS, ...VARIANT_WIDGET_OPTIONS[variant as PageWidgetVariant]]);
    const options = Object.fromEntries(Object.entries(this.options).filter(([key]) => keep.has(key as PageWidgetOptionKey)));

    // A gauge's numeric upper bound is not a RAM capacity.
    if (variant === 'memory' && this.variant !== 'memory') delete options['max'];
    // The size moves to the nearest one the new variant allows.
    const { width, height } = fitSize(variant as PageWidgetVariant, this.widget.grid.width, this.widget.grid.height);

    this.invalid.clear();

    this.emit({
      ...this.widget,
      variant: variant === widgetVariant(this.widget.type) ? undefined : variant as PageWidgetVariant,
      options,
      grid: { ...this.widget.grid, x: Math.min(this.widget.grid.x, 8 - width), width, height },
      // Only display cards show extra readings.
      extraKeys: variant === 'memory' && this.variant !== 'memory' ? undefined
        : acceptsExtras(this.widget.type, variant as PageWidgetVariant) ? this.widget.extraKeys : undefined,
    });
  }

  setTitle(title: string): void {
    this.emit({ ...this.widget, title: title.trim() || undefined });
  }

  setSize(width: number, height: number): void {
    this.emit({ ...this.widget, grid: { ...this.widget.grid, x: Math.min(this.widget.grid.x, 8 - width), width, height } });
  }

  // Toggle a field in or out of the extra readings, keeping the order of picking.
  toggleExtra(key: string): void {
    const keys = this.extraKeys.includes(key) ? this.extraKeys.filter(item => item !== key)
      : this.variant === 'memory' ? [key] : [...this.extraKeys, key];

    if (keys.length > this.maxExtras) return;

    this.emit({ ...this.widget, extraKeys: keys.length ? keys : undefined });
  }

  // Raw input from a control; empty clears the option back to its default.
  setOption(key: PageWidgetOptionKey, raw: string | boolean | undefined): void {
    const rule = this.rule(key);
    let value: unknown = raw;

    if (raw === '' || raw === undefined) value = undefined;

    else if (rule.kind === 'integer' || rule.kind === 'number') value = Number(raw);
    else if (rule.kind === 'text') value = String(raw).trim() || undefined;

    if (value !== undefined && (!validOption(rule, value)
      || (this.variant === 'memory' && key === 'max' && Number(value) <= 0))) {
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
    if (!cleaned.extraKeys) delete cleaned.extraKeys;

    this.widgetChange.emit(cleaned);
  }
}
