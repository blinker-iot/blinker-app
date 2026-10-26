import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const read = path => readFileSync(new URL(path, root), 'utf8');
const css = path => sass.compile(fileURLToPath(new URL(path, root))).css;

test('home shell and device tab explicitly reuse neutral scoped tokens, without widget or global overrides', () => {
  for (const path of ['src/app/home/home.page.scss', 'src/app/home/components/tab-device/tab-device.scss']) {
    const source = read(path), compiled = css(path);
    assert.match(source, /@include settings\.tokens/);
    assert.match(compiled, /--blinker-bg: light-dark\(#f2f3f5, #111215\)/);
    assert.match(compiled, /--blinker-surface: light-dark\(#ffffff, #202226\)/);
    assert.doesNotMatch(compiled, /--ui-[\w-]+\s*:|(^|\n)(html|body)\s*\{|::ng-deep/);
  }
  const tab = css('src/app/home/components/tab-device/tab-device.scss');
  assert.match(tab, /ion-popover\.device-add-popover\s*\{[^}]*--blinker-bg: light-dark/s);
});

test('home navigation keeps all original tabs and gains opaque 64px/25px surface and non-colour selection', () => {
  const compiled = css('src/app/home/home.page.scss'), html = read('src/app/home/home.page.html');
  assert.deepEqual([...html.matchAll(/tab="([^"]+)" href="([^"]+)"/g)].map(match => match.slice(1)),
    [['device', '/home/device'], ['community', '/home/community'], ['tools', '/home/tools'], ['profile', '/home/profile']]);
  assert.equal((html.match(/aria-hidden="true"/g) || []).length, 4);
  assert.match(compiled, /ion-tab-bar\s*\{[^}]*--home-navigation-height: 64px;[^}]*height: calc\(var\(--home-navigation-height\) - 14px\);[^}]*--background: var\(--blinker-surface\);[^}]*border-radius: 25px/s);
  assert.match(compiled, /ion-tab-button\.tab-selected\s*\{[^}]*--background: var\(--blinker-surface-muted\)/s);
  assert.match(compiled, /::part\(native\):focus-visible/);
  assert.doesNotMatch(compiled, /backdrop-filter|translateY/);
});

test('home filters expose original selection with an underline, bounded scrolling and 44px targets', () => {
  const compiled = css('src/app/home/components/room-list/room-list.scss');
  const html = read('src/app/home/components/room-list/room-list.html');
  assert.match(compiled, /\.room-scroll\s*\{[^}]*max-width: 100%;[^}]*overflow-x: auto/s);
  assert.match(compiled, /\.room-chip\s*\{[^}]*min-width: 44px;[^}]*min-height: 44px/s);
  assert.match(compiled, /\.room-chip\.selected\s*\{[^}]*border-bottom-color: var\(--blinker-text-primary\)/s);
  assert.equal((html.match(/\[attr\.aria-pressed\]/g) || []).length, 2);
  assert.match(compiled, /prefers-reduced-motion: reduce/);
});

test('homepage patch retains saved-card geometry, original data/control bindings and editing boundaries', () => {
  const card = read('src/app/home/components/deviceblock/deviceblock.scss');
  for (const contract of [
    '--device-card-height: min(220px, var(--device-card-side))',
    '--device-card-side: calc((100cqw - 12px) / 2)',
    'top: calc(12px + var(--device-card-header-height))',
    'left: 14px', 'inset: auto 12px 8px',
  ]) assert.ok(card.includes(contract), contract);
  const html = read('src/app/home/components/tab-device/tab-device.html');
  for (const contract of ['(click)="cardEditor.cancel()"', '(click)="cardEditor.save()"',
    '[editing]="cardEditor.editing() && cardEditor.active()"', '<home-card-settings />',
    '(click)="openAddPage(\'/guide\')"', '(click)="openAddPage(\'/room-manager\')"']) assert.ok(html.includes(contract), contract);
  const compiled = css('src/app/home/components/tab-device/tab-device.scss');
  assert.match(compiled, /ion-button\.card-editor-action\s*\{[^}]*width: 44px;[^}]*height: 44px/s);
  assert.match(compiled, /calc\(94px \+ var\(--ion-safe-area-bottom, 0px\)\)/);
  assert.match(compiled, /\.empty-devices > button\s*\{[^}]*min-height: 48px/s);
});
