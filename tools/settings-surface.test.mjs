import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const themePath = fileURLToPath(new URL('../src/theme/', import.meta.url));
const compile = source => sass.compileString(source, { loadPaths: [themePath] }).css;

test('settings foundation emits no global styles until explicitly included', () => {
  assert.equal(compile('@use "settings-surface";'), '');
});

test('settings colors inherit the selected color-scheme without changing widget tokens', () => {
  const css = compile('@use "settings-surface" as s; :host { @include s.tokens; }');

  assert.match(css, /@supports \(color: light-dark\(black, white\)\)/);
  assert.match(css, /--ion-color-primary: light-dark\(#096bd8, #69aaff\)/);
  assert.match(css, /--ion-color-primary-contrast: light-dark\(#ffffff, #111215\)/);
  assert.match(css, /--blinker-bg: light-dark\(#f2f3f5, #111215\)/);
  assert.match(css, /--blinker-surface: light-dark\(#ffffff, #202226\)/);
  assert.match(css, /--ion-toolbar-background: var\(--blinker-bg\)/);
  assert.doesNotMatch(css, /--ui-|--ion-color-primary-rgb|color-scheme:|::ng-deep/);
});

test('opt-in surfaces keep independent card, form and action geometry', () => {
  const css = compile(`@use "settings-surface" as s;
    .card { @include s.card; }
    .field { @include s.field; }
    .action { @include s.button; }
    .icon { @include s.icon-button; }
    .row { @include s.row; }`);

  assert.match(css, /\.card \{[^}]*border-radius: 22px/s);
  assert.match(css, /\.field \{[^}]*min-height: 48px;[^}]*border-radius: 12px/s);
  assert.match(css, /\.action \{[^}]*min-height: 48px;[^}]*border-radius: 16px/s);
  assert.match(css, /\.icon \{[^}]*min-width: 48px;[^}]*min-height: 48px/s);
  assert.match(css, /\.row \{[^}]*min-height: 56px/s);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /(^|\n)(html|body|button|input|\.card) [^{]*::ng-deep/);
});

test('self-hosted form gives native keyboard scrolling its unobscured viewport without a second spacer', () => {
  const file = fileURLToPath(new URL('../src/app/sections/self-hosted-server/self-hosted-server.page.scss', import.meta.url));
  const css = sass.compile(file).css;
  assert.match(css, /ion-content::part\(scroll\)\s*\{\s*top: var\(--transparent-page-content-top\);/);
  assert.match(css, /main::before\s*\{\s*display: none !important;/);
  assert.doesNotMatch(css, /(^|\n)(html|body)\s*\{|::ng-deep/);
});
