import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { DeviceUiEndpoint } from '../../../core/device-v2/device-ui.port';
import { variantsFor, type PageLayoutWidget } from '../../../core/device-v2/page-layout';

import {
  COMMON_WIDGET_OPTIONS, OptionRule, PAGE_WIDGET_OPTION_RULES, PAGE_WIDGET_TONES, PAGE_WIDGET_VARIANTS,
  PAGE_WIDGET_TITLE_MAX_BYTES,
  MAX_EXTRA_KEYS, PageWidgetOptionKey, PageWidgetOptions, PageWidgetVariant, VARIANT_OPTION_VALUES, VARIANT_SIZES,
  VARIANT_WIDGET_OPTIONS, acceptsExtras, fitSize, validOption, widgetVariant,
} from '../../../core/device-v2/page-widget';

import { UiIconComponent } from '../../../device/v2/widgets/icon/ui-icon';
import { UI_ICONS } from '../../../device/v2/widgets/icon/ui-icons';
import { OPTION_HINTS, OPTION_LABELS, TYPE_LABELS, VALUE_LABELS, VARIANT_LABELS } from './widget-labels';

const CONTROL_ICONS = new Set(['plus', 'minus', 'send', 'chevron', 'arrow', 'check', 'unlock']);
const COMMON_FIELDS: readonly PageWidgetOptionKey[] = ['caption', 'showTitle'];
// Presentation groups only: the option contract remains VARIANT_WIDGET_OPTIONS.
const ADVANCED_OPTIONS = new Set<PageWidgetOptionKey>([
  'choiceIcons', 'choiceTones', 'states', 'labels', 'presets', 'palette', 'scale', 'warnBelow', 'warnAbove',
]);
type EditableField = PageWidgetOptionKey | 'title';
type RawOption = { value: string | boolean | undefined; badInput?: boolean };
let nextInspectorId = 0;

// Edits one widget's presentation: variant, size, common and variant options.
// Every change emits a new widget; invalid text input is kept local until fixed.
@Component({
  selector: 'app-widget-inspector',
  standalone: true,
  imports: [UiIconComponent, NgTemplateOutlet],
  templateUrl: './widget-inspector.html',
  styleUrls: ['./widget-inspector.scss'],
})

export class WidgetInspectorComponent {
  private readonly idPrefix = `widget-inspector-${++nextInspectorId}`;
  private currentWidget!: PageLayoutWidget;
  private rawOptions = new Map<PageWidgetOptionKey, RawOption>();
  private rawTitle?: string;
  private composing = new Set<EditableField>();
  private errors = new Map<EditableField, string>();
  private lastInvalid?: boolean;
  private version = 0;

  @Input({ required: true })
  set widget(widget: PageLayoutWidget) {
    const previous = this.currentWidget;
    const sameWidget = previous?.widgetId === widget.widgetId && previous.type === widget.type
      && previous.endpointKey === widget.endpointKey;
    this.currentWidget = widget;
    if (!sameWidget) this.clearDraft();
    else {
      const allowed = new Set([...COMMON_WIDGET_OPTIONS, ...VARIANT_WIDGET_OPTIONS[this.variant]]);
      for (const [key, raw] of this.rawOptions) {
        if (!allowed.has(key) || (!this.invalid.has(key) && this.parseOption(key, raw) === widget.options?.[key])) {
          this.rawOptions.delete(key);
          this.composing.delete(key);
        }
      }
      if (!this.invalid.has('title') && this.rawTitle?.trim() === (widget.title ?? '')) this.rawTitle = undefined;
    }
    this.validate();
  }
  get widget(): PageLayoutWidget { return this.currentWidget; }

  // An explicit new edit session may reuse the same Ionic page and widget ID.
  @Input()
  set draftVersion(version: number) {
    if (version === this.version) return;
    this.version = version;
    this.clearDraft();
    if (this.currentWidget) this.validate();
  }
  get draftVersion(): number { return this.version; }
  @Input() disabled = false;
  // Fields the host lets this widget show as extra readings (附属读数).
  @Input() extraCandidates: readonly (Pick<DeviceUiEndpoint, 'key' | 'role' | 'valueType'> & { label: string })[] = [];
  // The bound field, when known: some variants fit only some fields.
  @Input() field?: DeviceUiEndpoint;
  @Output() widgetChange = new EventEmitter<PageLayoutWidget>();
  @Output() invalidChange = new EventEmitter<boolean>();

  readonly tones = PAGE_WIDGET_TONES;
  readonly icons = Object.keys(UI_ICONS).filter(name => !CONTROL_ICONS.has(name));
  readonly optionLabels = OPTION_LABELS;
  readonly hints = OPTION_HINTS;

  readonly commonOptions = COMMON_FIELDS;
  readonly titleMaxBytes = PAGE_WIDGET_TITLE_MAX_BYTES;
  invalid = new Set<EditableField>();

  get typeLabel(): string { return TYPE_LABELS[this.widget.type]; }
  get variant(): PageWidgetVariant { return widgetVariant(this.widget.type, this.widget.variant); }

  // Only the sizes the variant is designed for.
  get widths(): readonly number[] { return VARIANT_SIZES[this.variant].widths; }

  widthLabel(width: number): string {
    return width === 8 ? '8 栏 · 窄屏整行' : width === 4 ? '4 栏 · 窄屏整行' : `${width} 栏`;
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

  get options(): PageWidgetOptions {
    return this.draftOptions(this.variant, this.widget.options);
  }

  private draftOptions(variant: PageWidgetVariant, base: PageWidgetOptions | undefined): PageWidgetOptions {
    const options: Record<string, unknown> = { ...base };
    for (const [key, raw] of this.rawOptions) {
      const value = this.parseOption(key, raw);
      if (this.optionError(key, raw, value, variant)) continue;
      if (value === undefined) delete options[key];
      else options[key] = value;
    }
    return options as PageWidgetOptions;
  }

  // Common options with dedicated controls are left out of the generic list.
  get specific(): PageWidgetOptionKey[] {
    return [...VARIANT_WIDGET_OPTIONS[this.variant]];
  }
  get currentOptions(): PageWidgetOptionKey[] { return this.specific.filter(key => !ADVANCED_OPTIONS.has(key)); }
  get advancedOptions(): PageWidgetOptionKey[] { return this.specific.filter(key => ADVANCED_OPTIONS.has(key)); }
  get titleInput(): string { return this.rawTitle ?? this.widget.title ?? ''; }
  get titleBytes(): number { return new TextEncoder().encode(this.titleInput.trim()).length; }
  get bindingRole(): string {
    if (!this.field) return '字段信息未提供';
    if (this.field.role === 'action') return '设备动作';
    if (this.field.role === 'event') return '只读事件';
    return this.field.writable ? '可读写属性' : '只读属性';
  }
  get invalidCount(): number { return this.invalid.size; }
  error(key: EditableField): string { return this.errors.get(key) ?? ''; }
  fieldId(key: EditableField): string { return `${this.idPrefix}-${key}`; }
  describedBy(key: PageWidgetOptionKey): string | undefined {
    const ids = [this.hints[key] ? `${this.fieldId(key)}-hint` : '', this.error(key) ? `${this.fieldId(key)}-error` : ''].filter(Boolean);
    return ids.length ? ids.join(' ') : undefined;
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
    const raw = this.rawOptions.get(key);
    if (raw) return raw.value === undefined ? '' : String(raw.value);
    const value = this.options[key];

    return value === undefined ? '' : String(value);
  }

  setVariant(variant: string): void {
    if (this.disabled || variant === this.variant || !this.variants.includes(variant)) return;
    // Keep only the options the new variant still reads.
    const keep = new Set([...COMMON_WIDGET_OPTIONS, ...VARIANT_WIDGET_OPTIONS[variant as PageWidgetVariant]]);
    const options = Object.fromEntries(Object.entries(this.widget.options ?? {}).filter(([key, value]) => {
      const option = key as PageWidgetOptionKey;
      const values = VARIANT_OPTION_VALUES[variant as PageWidgetVariant]?.[option];
      return keep.has(option) && (!values || values.includes(String(value)));
    }));

    // A gauge's numeric upper bound is not a RAM capacity.
    if (variant === 'memory' && this.variant !== 'memory') delete options['max'];
    // The size moves to the nearest one the new variant allows.
    const { width, height } = fitSize(variant as PageWidgetVariant, this.widget.grid.width, this.widget.grid.height);

    // Keep invalid common inputs (notably title/caption) across skin changes.
    for (const key of this.rawOptions.keys()) {
      if (!keep.has(key) || (variant === 'memory' && this.variant !== 'memory' && key === 'max')) {
        this.rawOptions.delete(key);
        this.composing.delete(key);
      }
    }

    const next: PageLayoutWidget = {
      ...this.widget,
      variant: variant === widgetVariant(this.widget.type) ? undefined : variant as PageWidgetVariant,
      options,
      grid: { ...this.widget.grid, x: Math.min(this.widget.grid.x, 8 - width), width, height },
      // Only display cards show extra readings.
      extraKeys: variant === 'memory' && this.variant !== 'memory' ? undefined
        : acceptsExtras(this.widget.type, variant as PageWidgetVariant) ? this.widget.extraKeys : undefined,
    };
    // Notify within the user event, before Angular checks the parent's save
    // gate. The subsequent Input echo must not change it during that check.
    this.validate(next);
    this.emit(next);
  }

  setTitle(title: string): void {
    if (this.disabled) return;
    this.rawTitle = title;
    this.validate();
    if (this.invalid.has('title')) return;
    this.emit({ ...this.widget, title: title.trim() || undefined });
  }

  setSize(width: number, height: number): void {
    if (this.disabled) return;
    // Only an explicit resize fits the dimensions. Merely opening the inspector
    // must not normalise a saved legacy grid or change its binding/order.
    ({ width, height } = fitSize(this.variant, width, height));
    this.emit({ ...this.widget, grid: { ...this.widget.grid, x: Math.min(this.widget.grid.x, 8 - width), width, height } });
  }

  // Toggle a field in or out of the extra readings, keeping the order of picking.
  toggleExtra(key: string): void {
    if (this.disabled || !this.candidates.some(candidate => candidate.key === key)) return;
    const keys = this.extraKeys.includes(key) ? this.extraKeys.filter(item => item !== key)
      : this.variant === 'memory' ? [key] : [...this.extraKeys, key];

    if (keys.length > this.maxExtras) return;

    this.emit({ ...this.widget, extraKeys: keys.length ? keys : undefined });
  }

  // Raw input from a control; empty clears the option back to its default.
  setOption(key: PageWidgetOptionKey, raw: string | boolean | undefined, badInput = false): void {
    if (this.disabled) return;
    this.rawOptions.set(key, { value: raw, badInput });
    this.validate();
    if (this.invalid.has(key)) return;
    // Other invalid inputs stay visible locally; never put them in the valid widget.
    const options: Record<string, unknown> = { ...this.widget.options };
    for (const [draftKey, draft] of this.rawOptions) {
      if (this.invalid.has(draftKey)) continue;
      const value = this.parseOption(draftKey, draft);
      if (value === undefined) delete options[draftKey];
      else options[draftKey] = value;
    }
    this.emit({ ...this.widget, options: options as PageWidgetOptions });
  }

  beginComposition(key: EditableField): void {
    if (this.disabled) return;
    if (key !== 'title' && !this.rawOptions.has(key)) this.rawOptions.set(key, { value: this.text(key) });
    this.composing.add(key);
    this.validate();
  }

  endComposition(key: EditableField, value: string): void {
    if (this.disabled) return;
    this.composing.delete(key);
    if (key === 'title') this.setTitle(value);
    else this.setOption(key, value);
  }

  focusFirstInvalid(event: Event): void {
    const host = (event.currentTarget as HTMLElement).closest('app-widget-inspector');
    const input = host?.querySelector<HTMLElement>('[aria-invalid="true"]');
    let parent = input?.parentElement;
    while (parent && parent !== host) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    input?.focus();
  }

  private parseOption(key: PageWidgetOptionKey, raw: RawOption): unknown {
    if (raw.value === '' || raw.value === undefined) return undefined;
    const rule = this.rule(key);
    if (rule.kind === 'integer' || rule.kind === 'number') return Number(raw.value);
    return rule.kind === 'text' ? String(raw.value).trim() || undefined : raw.value;
  }

  private optionError(key: PageWidgetOptionKey, raw: RawOption, value: unknown, variant = this.variant): string {
    if (this.composing.has(key)) return '请完成输入后再保存。';
    if (raw.badInput) return '请输入有效数值，或留空恢复默认。';
    if (value === undefined) return '';
    const rule = this.rule(key);
    if (rule.kind === 'text') {
      if (String(value).includes('\0')) return '不能包含空字符。';
      if (new TextEncoder().encode(String(value)).length > rule.bytes) return `最多 ${rule.bytes} UTF-8 字节；中文和 emoji 会占多个字节。`;
      if (!validOption(rule, value)) {
        if (key === 'presets') return '请输入逗号分隔的分钟数，每项 1～4 位数字，最多 6 项。';
        if (key === 'palette') return '请输入逗号分隔的 #RRGGBB 色值，最多 12 项。';
        return '格式不正确，请按字段提示修正。';
      }
    } else if (!validOption(rule, value)) {
      if (rule.kind === 'integer') return `请输入 ${rule.min}～${rule.max} 的整数，或留空恢复默认。`;
      if (rule.kind === 'number') return rule.nonZero ? '请输入有限且非 0 的数值，或留空恢复默认。' : '请输入有限数值，或留空恢复默认。';
      return '请选择当前外观支持的值。';
    }
    if (rule.kind === 'enum' && !(VARIANT_OPTION_VALUES[variant]?.[key] ?? rule.values).includes(String(value))) return '请选择当前外观支持的值。';
    return variant === 'memory' && key === 'max' && Number(value) <= 0 ? '总内存必须大于 0；留空表示总量未知。' : '';
  }

  private validate(widget = this.widget): void {
    const variant = widgetVariant(widget.type, widget.variant);
    const title = (this.rawTitle ?? widget.title ?? '').trim();
    this.errors.clear();
    if (this.composing.has('title')) this.errors.set('title', '请完成标题输入后再保存。');
    else if (title && !validOption({ kind: 'text', bytes: PAGE_WIDGET_TITLE_MAX_BYTES }, title)) {
      this.errors.set('title', title.includes('\0') ? '标题不能包含空字符。' : `标题最多 ${PAGE_WIDGET_TITLE_MAX_BYTES} UTF-8 字节，请缩短后再保存。`);
    }
    for (const [key, raw] of this.rawOptions) {
      const error = this.optionError(key, raw, this.parseOption(key, raw), variant);
      if (error) this.errors.set(key, error);
    }
    const { min, max } = this.draftOptions(variant, widget.options);
    if (min !== undefined && max !== undefined && min >= max) {
      this.errors.set('min', '最小值必须小于最大值。');
      this.errors.set('max', '最大值必须大于最小值。');
    }
    this.invalid = new Set(this.errors.keys());
    const invalid = this.invalid.size > 0;
    if (invalid !== this.lastInvalid) {
      this.lastInvalid = invalid;
      this.invalidChange.emit(invalid);
    }
  }

  private clearDraft(): void {
    this.rawOptions.clear();
    this.rawTitle = undefined;
    this.composing.clear();
    this.errors.clear();
    this.invalid.clear();
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
