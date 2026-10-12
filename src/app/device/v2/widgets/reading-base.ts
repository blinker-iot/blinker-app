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

  // 附属读数, each in its own field's format: the card's options belong to its own field.
  get extras(): string {
    return (this.card.extras ?? []).map(extra => {
      const reading = this.describe(extra.value, extra.field, {});
      return reading.unit ? `${reading.text} ${reading.unit}` : reading.text;
    }).join(' · ');
  }

  // A note line followed by the extra readings.
  withExtras(note: string): string {
    return [note, this.extras].filter(Boolean).join(' · ');
  }

  // Text for any reading: formatted numbers, on/off words for booleans, raw text otherwise.
  describe(value: unknown, field = this.card.field, options = this.options): { text: string; unit: string } {
    const number = numeric(value as never);
    if (number !== undefined) return present(number, options, field);
    if (typeof value === 'boolean') return { text: value ? options.onText ?? '开启' : options.offText ?? '关闭', unit: '' };
    if (typeof value === 'string') return { text: value, unit: '' };
    if (value === undefined || value === null) return { text: '—', unit: '' };
    return { text: this.card.display, unit: '' };
  }
}
