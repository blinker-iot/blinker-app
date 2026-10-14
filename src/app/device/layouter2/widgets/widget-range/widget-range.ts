import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { Layouter2Widget } from '../config';
import { LayouterService } from '../../../layouter.service';
import { NgClass, NgStyle } from '@angular/common';
import { BRangeComponent } from '../../../../core/components/b-range/b-range';

@Component({
  selector: 'widget-range',
  templateUrl: 'widget-range.html',
  styleUrls: ['widget-range.scss'],
  imports: [NgClass, BRangeComponent, NgStyle],
})
export class WidgetRangeComponent implements Layouter2Widget {
  @Input() device;
  @Input() widget;
  @Input() isDemo = false;

  get key() {
    return this.widget.key;
  }

  get t0() {
    return this.getValue('t0');
  }

  @ViewChild('rangbox', { read: ElementRef, static: true }) rangbox: ElementRef;

  showValue = 0;
  set value(value) {
    if (typeof this.device.data[this.key] == 'undefined')
      this.device.data[this.key] = {};
    this.device.data[this.key]['val'] = value;
  }

  get value() {
    return this.getValue('val');
  }

  get max() {
    return this.getValue('max');
  }

  get min() {
    return this.getValue('min');
  }

  get ico() {
    return this.getValue('ico');
  }

  get color() {
    return this.getValue('clr');
  }

  get state() {
    return this.getValue('swi');
  }

  get mode() {
    return this.getValue('mode');
  }

  get custom() {
    return this.getValue('cus');
  }

  textBoxWidth = '300px';

  getValue(valueKey) {
    if (
      this.isDemo &&
      typeof this.widget[valueKey] != 'undefined'
    )
      return this.widget[valueKey];

    if (typeof this.device.data[this.key] != 'undefined')
      if (typeof this.device.data[this.key][valueKey] != 'undefined')
        return this.device.data[this.key][valueKey];
    if (typeof this.widget[valueKey] != 'undefined')
      return this.widget[valueKey];
    return;
  }

  _lstyle;
  @Input()
  set lstyle(lstyle) {
    this._lstyle = lstyle;
  }
  get lstyle() {
    if (typeof this._lstyle != 'undefined') return this._lstyle;
    if (typeof this.widget.lstyle != 'undefined') return this.widget.lstyle;
    return 0;
  }

  constructor(private LayouterService: LayouterService) {}

  ngAfterViewInit(): void {
    this.refresh();
  }

  canSend = true;
  sendData(senddata) {
    if (this.isDemo) return;
    this.LayouterService.send(`{"${this.key}":${senddata}}\n`);
  }

  refresh() {
    setTimeout(() => {
      this.textBoxWidth = `${this.rangbox.nativeElement.clientWidth}px`;
    }, 100);
  }

  jia() {
    this.adjustValue(1);
  }

  jian() {
    this.adjustValue(-1);
  }

  private adjustValue(delta: number): void {
    const min = Number(this.min ?? 0);
    const max = Number(this.max ?? 100);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return;
    const raw = Number(this.value ?? min);
    const current = Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : min;
    const next = Math.min(max, Math.max(min, current + delta));
    this.value = next;
    if (next !== current) this.sendData(next);
  }
}
