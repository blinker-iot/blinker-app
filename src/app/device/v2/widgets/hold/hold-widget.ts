import { Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { ValueTransitionDirective } from '../value-transition.directive';
import { WidgetBase } from '../widget-base';
import type { HoldGesture } from '../widget-kit';

// 按住开关: a writable boolean that stays on only while held, e.g. jogging a motor.
// Busy keeps the original release available. A retired control session must
// never carry that release into a different device or connection.
@Component({
  selector: 'app-hold-widget',
  standalone: true,
  imports: [ValueTransitionDirective, UiIconComponent],
  templateUrl: './hold-widget.html',
  styleUrls: ['./hold-widget.scss'],
  host: {
    '[class.wide]': 'rows === 1',
    '[class.on]': 'on',
  },
})
export class HoldWidgetComponent extends WidgetBase implements OnChanges, OnDestroy {
  @Input() interactive = true;
  readonly pressed = signal(false);
  private held?: HoldGesture;
  private pointerId?: number;

  // A held key is never disabled under the finger: its release still has to arrive.
  override get disabled() { return !this.available || this.card.disabled && !this.pressed() ? 'true' : null; }

  get on(): boolean { return this.pressed() || this.card.value === true; }
  get state(): string { return this.on ? this.options.onText ?? '运行中' : this.options.offText ?? '按住运行'; }

  private get available(): boolean { return this.interactive && this.card.controlAvailable !== false; }

  ngOnChanges(): void {
    const target = this.held?.target;
    if (!target) return;
    if (!this.interactive || target.scope !== this.card.controlScope) this.finish(false);
    else if (target.widgetId !== this.card.widget.widgetId || target.field.id !== this.card.field.id
      || target.field.key !== this.card.field.key || target.field.role !== this.card.field.role
      || target.field.valueType !== this.card.field.valueType) this.finish(true, true);
    else if (!this.available) this.finish(false);
  }

  press(event: PointerEvent): void {
    if (!this.available || this.card.disabled || this.pressed() || event.button !== 0) return;
    try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
    catch { return; } // Without capture, do not start an unowned physical action.
    this.begin(event.pointerId);
  }

  start(event?: Event): void {
    if (!(event as KeyboardEvent | undefined)?.repeat) this.begin();
  }

  private begin(pointerId?: number): void {
    if (!this.available || this.card.disabled || this.pressed()) return;
    this.held = { id: crypto.randomUUID(), phase: 'press', target: {
      field: { ...this.card.field }, widgetId: this.card.widget.widgetId, scope: this.card.controlScope,
    } };
    this.pointerId = pointerId;
    this.pressed.set(true);
    this.act.emit({ kind: 'toggle', value: true, hold: this.held });
  }

  release(event?: PointerEvent): void {
    if (event && event.pointerId !== this.pointerId) return;
    this.finish(true);
  }

  releaseKey(): void {
    if (this.pointerId === undefined) this.release();
  }

  private finish(release: boolean, originalTarget = false): void {
    const held = this.held;
    this.held = undefined;
    this.pointerId = undefined;
    this.pressed.set(false);
    // A new binding's disabled state says nothing about the original target.
    // Hosts must still revalidate the original target's current authority.
    if (held && release && this.interactive && (originalTarget || this.available) && held.target.scope === this.card.controlScope) {
      this.act.emit({ kind: 'toggle', value: false, hold: { ...held, phase: 'release' } });
    }
  }

  ngOnDestroy(): void {
    this.release();
  }
}
