import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { RangeWidgetBase } from '../range-base';
import { ValueTransitionDirective } from '../value-transition.directive';

const SENT_MS = 1200;

interface DraftBinding {
  widgetId: string;
  endpointKey: string;
  fieldId: number;
  fieldKey: string;
  command: boolean;
}

// 数值步进器: − value +; one row high it becomes a row with the value between the buttons.
// Bound to an action (e.g. "turn to 90°") it has no state to follow: − / + only
// pick the value on screen and the send key fires it.
@Component({
  selector: 'app-stepper-widget',
  standalone: true,
  imports: [ValueTransitionDirective, UiIconComponent, NgTemplateOutlet],
  templateUrl: './stepper-widget.html',
  styleUrls: ['./stepper-widget.scss'],
  host: { '[class.rowc]': 'rows === 1' },
})
export class StepperWidgetComponent extends RangeWidgetBase implements OnDestroy {
  readonly sent = signal(false);
  private sentTimer?: ReturnType<typeof setTimeout>;
  private binding?: DraftBinding;

  get hold(): boolean { return this.options.longPress !== false; }
  get showRange(): boolean { return this.options.showRange !== false; }
  get command(): boolean { return this.card.field.role === 'action'; }

  override ngOnChanges(): void {
    const { widget, field } = this.card;
    const binding: DraftBinding = { widgetId: widget.widgetId, endpointKey: widget.endpointKey,
      fieldId: field.id, fieldKey: field.key, command: this.command };
    const previous = this.binding;

    if (previous && (previous.command || binding.command)
      && (previous.widgetId !== binding.widgetId || previous.endpointKey !== binding.endpointKey
        || previous.fieldId !== binding.fieldId || previous.fieldKey !== binding.fieldKey
        || previous.command !== binding.command)) {
      this.resetInput();
      clearTimeout(this.sentTimer);
      this.sentTimer = undefined;
      this.sent.set(false);
    }

    this.binding = binding;
    super.ngOnChanges();
  }

  // An action only moves the value on screen; send() fires it.
  override commit(raw: number): void {
    if (this.command) this.preview(raw);
    else super.commit(raw);
  }

  send(): void {
    if (this.card.disabled || !this.command) return;
    this.act.emit({ kind: 'range', value: this.value });
    this.sent.set(true);
    clearTimeout(this.sentTimer);
    this.sentTimer = setTimeout(() => this.sent.set(false), SENT_MS);
  }

  protected override settle(startValue: number): void {
    if (this.command) this.dragging = false;
    else super.settle(startValue);
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    clearTimeout(this.sentTimer);
  }
}
