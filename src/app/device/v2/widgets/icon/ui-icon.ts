import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { UI_ICONS } from './ui-icons';

// Library icons are stroked SVG (dotted in the electronic theme); any other
// name falls back to the Font Awesome light glyph of the same name.
@Component({
  selector: 'app-ui-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (paths) {
      <svg viewBox="0 0 24 24" aria-hidden="true">
        @for (path of paths; track $index) { <path [attr.d]="path" /> }
      </svg>
    } @else {
      <i class="fa-light fa-{{ name }}" aria-hidden="true"></i>
    }
  `,
  styles: [`
    // Fills the box its container gives it, as .ico does in the design.
    :host {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      line-height: 1;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
      fill: none;
      stroke: currentColor;
      stroke-width: var(--ui-icon-stroke, 1.8);
      stroke-dasharray: var(--ui-icon-dash, none);
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `],
})
export class UiIconComponent {
  @Input({ required: true }) name = '';

  get paths(): readonly string[] | undefined { return UI_ICONS[this.name]; }
}
