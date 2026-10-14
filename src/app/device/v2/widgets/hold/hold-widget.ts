import { Component, OnDestroy, signal } from '@angular/core';

import { UiIconComponent } from '../icon/ui-icon';
import { ValueTransitionDirective } from '../value-transition.directive';
import { WidgetBase } from '../widget-base';

// 按住开关: a writable boolean that stays on only while held, e.g. jogging a motor.
// Pressing writes true and releasing writes false. The release must always go
// out, so the key keeps the pointer while the device is busy with the press.
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
export class HoldWidgetComponent extends WidgetBase implements OnDestroy {
  readonly pressed = signal(false);

  // A held key is never disabled under the finger: its release still has to arrive.
  override get disabled() { return this.card.disabled && !this.pressed() ? 'true' : null; }

  get on(): boolean { return this.pressed() || this.card.value === true; }
  get state(): string { return this.on ? this.options.onText ?? '运行中' : this.options.offText ?? '按住运行'; }

  press(event: PointerEvent): void {
    if (this.card.disabled || this.pressed() || event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.start();
  }

  start(): void {
    if (this.card.disabled || this.pressed()) return;
    this.pressed.set(true);
    this.act.emit({ kind: 'toggle', value: true });
  }

  release(): void {
    if (!this.pressed()) return;
    this.pressed.set(false);
    this.act.emit({ kind: 'toggle', value: false });
  }

  ngOnDestroy(): void {
    this.release();
  }
}
