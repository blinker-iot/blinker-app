import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';

import { DOT_GLYPHS } from './dot-glyphs';

// Renders text as an OLED dot matrix when the theme enables --ui-dotnum,
// and as regular text otherwise or when a character has no glyph.
@Component({
  selector: 'app-dot-text',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.force]': 'force' },
  template: `
    @if (path) {
      <svg class="dots" role="img" [attr.aria-label]="text" [attr.viewBox]="'0 0 ' + columns + ' 7'"
        [style.width.em]="columns / 7 * 0.74"><path [attr.d]="path" /></svg>
      <span class="text" aria-hidden="true">{{ text }}</span>
    } @else {
      <span class="text plain">{{ text }}</span>
    }
  `,
  styles: [`
    :host { display: inline-flex; align-items: baseline; }

    .dots {
      display: var(--ui-dotnum, none);
      height: 0.74em;
      overflow: visible;
      fill: none;
      stroke: currentColor;
      stroke-width: 0.74;
      stroke-linecap: round;
    }

    .text { display: var(--ui-textnum, inline); }
    .text.plain { display: inline; }

    :host(.force) .dots { display: inline-block; }
    :host(.force) .text:not(.plain) { display: none; }
  `],
})
export class DotTextComponent implements OnChanges {
  @Input() text = '';
  // Always draw dots, whatever the theme (LED boards).
  @Input() force = false;

  path = '';
  columns = 0;

  ngOnChanges(): void {
    const glyphs = [...this.text.toUpperCase()].map(char => DOT_GLYPHS[char]);
    if (!glyphs.length || glyphs.some(glyph => !glyph)) {
      this.path = '';
      return;
    }

    const segments: string[] = [];
    let x = 0;
    for (const glyph of glyphs) {
      const rows = glyph.split('/');
      rows.forEach((row, y) => [...row].forEach((dot, column) => {
        if (dot === '#') segments.push(`M${x + column + 0.5} ${y + 0.5}h0`);
      }));
      x += rows[0].length + 1;
    }

    this.columns = x - 1;
    this.path = segments.join('');
  }
}
