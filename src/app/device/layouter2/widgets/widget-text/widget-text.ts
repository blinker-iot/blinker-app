import { Component, Input } from '@angular/core';
import { Layouter2Widget } from '../config';
import {
  normalizeTextWidgetAlignment,
  normalizeTextWidgetFontSize,
} from './widget-text-layout';

@Component({
  selector: 'widget-text',
  templateUrl: 'widget-text.html',
  styleUrls: ['widget-text.scss'],
})
export class WidgetTextComponent implements Layouter2Widget {
  @Input() widget;
  @Input() device;
  @Input() isDemo = false;
  @Input() lstyle = 0;

  get key() {
    return this.widget?.key;
  }

  get t0(): string {
    const value = this.getValue(['t0', 'tex']);
    return value == null ? '' : String(value);
  }

  get size(): number {
    return normalizeTextWidgetFontSize(this.getValue(['size']));
  }

  get align() {
    return normalizeTextWidgetAlignment(this.widget?.align);
  }

  private getValue(valueKeys: string[]): unknown {
    if (!this.isDemo) {
      const liveValue = this.readValue(this.device?.data?.[this.key], valueKeys);
      if (typeof liveValue !== 'undefined') return liveValue;
    }

    return this.readValue(this.widget, valueKeys);
  }

  private readValue(source: unknown, valueKeys: string[]): unknown {
    if (!source || typeof source !== 'object') return undefined;

    const values = source as Record<string, unknown>;
    for (const valueKey of valueKeys) {
      if (typeof values[valueKey] !== 'undefined') return values[valueKey];
    }
    return undefined;
  }
}
