import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const theme = fileURLToPath(new URL('src/theme/', root));
const compile = source => sass.compileString(source, { loadPaths: [theme], logger: sass.Logger.silent }).css;
const consumers = [
  'src/app/sections/scene/automation/automation.page',
  'src/app/sections/device/device-timer/device-timer.page',
  'src/app/sections/device/device-timer/timing-edit/timing-edit',
  'src/app/sections/device/device-storage/device-storage.page',
  'src/app/sections/device/device-trends/device-trends.page',
  'src/app/sections/device/device-log/device-log.component',
];

test('workflow styles remain opt-in and reuse the approved token source', () => {
  assert.equal(compile('@use "workflow-surface";'), '');
  const source = readFileSync(new URL('src/theme/_workflow-surface.scss', root), 'utf8');
  assert.match(source, /@use 'settings-surface'/);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b|::ng-deep|iframe|--ui-/i);
  const css = compile('@use "workflow-surface" as w; @include w.page;');
  assert.match(css, /--ion-color-primary: light-dark\(#096bd8, #69aaff\)/);
  assert.doesNotMatch(css, /(^|\n)(body|html|ion-app|ion-router-outlet)\b/);
});

test('embedded workflow content creates no second page shell or scroll owner', () => {
  const css = compile('@use "workflow-surface" as w; @include w.content;');
  assert.doesNotMatch(css, /:host\b|(^|\n)main\b|ion-content|ion-header|overflow-y/);
  assert.match(css, /\.surface-card \{[^}]*border-radius: 22px/s);
  assert.match(css, /summary \{[^}]*min-height: 48px/s);
});

test('page chrome preserves the spacer and reserves safe areas for the real 48px targets', () => {
  const css = compile('@use "workflow-surface" as w; @include w.page;');
  assert.match(css, /--transparent-page-header-height: 56px/);
  assert.match(css, /--transparent-page-content-top: calc\(var\(--ion-safe-area-top, 0px\) \+ var\(--transparent-page-header-height\)\)/);
  assert.match(css, /--section-main-display: flex/);
  assert.match(css, /--section-main-accent-opacity: 0/);
  assert.match(css, /padding-bottom: calc\(32px \+ var\(--ion-safe-area-bottom, 0px\)\)/);
  assert.match(css, /ion-title \{[^}]*position: relative;[^}]*height: auto/s);
  assert.match(css, /ion-button::part\(native\) \{[^}]*min-height: 48px/s);
  assert.match(css, /ion-button:not\(\.header-back\):is\([^}]+\) \{[^}]*width: 48px;[^}]*height: 48px;[^}]*min-width: 48px;[^}]*min-height: 48px/s);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible/);
});

test('each selected page compiles against workflow.page without changing the old feature mixin', () => {
  for (const path of consumers) {
    const source = readFileSync(new URL(`${path}.scss`, root), 'utf8');
    assert.match(source, /@include workflow\.page/, path);
    assert.doesNotMatch(source, /@include feature\.base|::ng-deep|#[0-9a-f]{3,8}\b/i, path);
    const css = sass.compile(fileURLToPath(new URL(`${path}.scss`, root)), {
      logger: sass.Logger.silent, loadPaths: [fileURLToPath(new URL('node_modules/', root))],
    }).css;
    assert.match(css, /--transparent-page-header-height: 56px/, path);
    assert.doesNotMatch(css, /position: fixed/, `${path}: actions must not cover the form`);
  }
});

test('UNKNOWN remains explicit readable text, not warning-color-only communication', () => {
  const css = sass.compile(fileURLToPath(new URL('src/app/sections/device/device-log/device-log.component.scss', root)), {
    logger: sass.Logger.silent,
  }).css;
  assert.match(css, /\.activity-status\[data-status=["']?outcome_unknown["']?\] \{[^}]*color: var\(--blinker-text-primary\);[^}]*border-inline-start: 3px solid var\(--ion-color-warning-shade\)/s);
  const template = readFileSync(new URL('src/app/sections/device/device-log/device-log.component.html', root), 'utf8');
  assert.match(template, /\{\{ statusLabel\(row\) \}\}/);
});
