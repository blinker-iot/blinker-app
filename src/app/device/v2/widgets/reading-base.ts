import { Directive, HostBinding } from '@angular/core';

import { WidgetBase } from './widget-base';
import { isAlert, numeric, present, ratio } from './widget-kit';

// Shared reading of read-only values (value, meter and chart families).
@Directive()
export abstract class ReadingWidgetBase extends WidgetBase {
  get number(): number | undefined { return numeric(this.card.value); }

  @HostBinding('class.alert') get alert(): boolean { return isAlert(this.number, this.options); }
  @HostBinding('class.off') get off(): boolean { return this.card.value === false; }

  get min(): number { return this.options.min ?? this.card.field.minimum ?? 0; }
  get max(): number { return this.options.max ?? this.card.field.maximum ?? 100; }
  get level(): number { return this.number === undefined ? 0 : ratio(this.number, this.min, this.max); }

  get reading(): { text: string; unit: string } {
    return this.describe(this.card.value);
  }

  // Text for any reading: formatted numbers, on/off words for booleans, raw text otherwise.
  describe(value: unknown): { text: string; unit: string } {
    const number = numeric(value as never);
    if (number !== undefined) return present(number, this.options, this.card.field);
    if (typeof value === 'boolean') return { text: value ? this.options.onText ?? '开启' : this.options.offText ?? '关闭', unit: '' };
    if (typeof value === 'string') return { text: value, unit: '' };
    if (value === undefined || value === null) return { text: '—', unit: '' };
    return { text: this.card.display, unit: '' };
  }
}
