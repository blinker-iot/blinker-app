import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const app = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, app), 'utf8');
// Use the Sass implementation selected by the existing Angular build toolchain.
const require = createRequire(import.meta.url);
const builder = createRequire(require.resolve('@angular/build/package.json'));
const sass = builder('sass');
const gridDirectory = fileURLToPath(new URL('src/app/device/v2/panel/', app));
const style = path => sass.compile(fileURLToPath(new URL(path, app)), {
  logger: sass.Logger.silent, loadPaths: [fileURLToPath(new URL('node_modules/', app))],
}).css;

test('shared panel geometry preserves saved coordinates and uses one unit on both axes', () => {
  const css = sass.compileString(`@use 'panel-grid' as grid;
    .viewport { @include grid.viewport; }
    @include grid.layout;
    @include grid.responsive;`, { loadPaths: [gridDirectory] }).css;
  assert.match(css, /container: page-panel\s*\/\s*inline-size/);
  assert.match(css, /container: panel-grid\s*\/\s*inline-size/);
  assert.match(css, /@container panel-grid \(max-width: 660px\)/);
  assert.match(css, /grid-column: var\(--col\)\s*\/\s*span var\(--span\)/);
  assert.match(css, /grid-row: var\(--row\)\s*\/\s*span var\(--rows\)/);
  assert.match(css, /grid-column: span min\(8, var\(--span\) \* 2\)/);
  assert.match(css, /--row-h: calc\(\(100cqw - 7 \* var\(--gap\)\) \/ 8\)/);
  assert.match(css, /--row-h: calc\(\(100cqw - 3 \* var\(--gap\)\) \/ 4\)/);
  assert.doesNotMatch(css, /--row-h: (78|84)px/);
  assert.doesNotMatch(css, /\.cell\.(full|wide)\s*\{/);
  assert.match(css, /\.cell > app-page-widget,\s*\.cell > \.preset-preview \{\s*flex: none;\s*height: var\(--fill-h\);\s*min-height: 0;/);
});

test('production, editor, property preview and Agent runtime use one content-container breakpoint', () => {
  for (const path of [
    'src/app/device/v2/panel/page-layout-panel.scss',
    'src/app/sections/device/panel-editor/panel-editor.page.scss',
    'src/app/sections/device/panel-editor/panel-widget-editor.page.scss',
    'src/custom-panel/styles.scss',
  ]) {
    const source = read(path);
    const css = style(path);
    assert.match(source, /@include grid\.viewport/, path);
    assert.match(source, /@include grid\.responsive/, path);
    assert.doesNotMatch(source, /@include grid\.compact|@media\s*\(max-width:\s*560px\)/, path);
    assert.match(css, /@container panel-grid \(max-width: 660px\)/, path);
  }
});

test('editor positions stay saved in edit/preview and automatic only while arranging', () => {
  const template = read('src/app/sections/device/panel-editor/panel-editor.page.html');
  assert.match(template, /\[style\.--col\]="mode === 'layout' && \(!embedded \|\| dragOriginActive\) \? 'auto' : item\.grid\.x \+ 1"/);
  assert.match(template, /\[style\.--row\]="mode === 'layout' && \(!embedded \|\| dragOriginActive\) \? 'auto' : item\.grid\.y \+ 1"/);
  assert.match(template, /\[class\.full\]="item\.grid\.width === 8"/);
  assert.match(template, /class="catalogue panel"/);
  assert.match(template, /\[style\.--span\]="entry\.preset\.width"/);
  const property = read('src/app/sections/device/panel-editor/panel-widget-editor.page.html');
  assert.doesNotMatch(property, /\[twoColumnLayout\]="true"/);
  assert.match(property, /\[class\.full\]="preview\.widget\.grid\.width === 8"/);
});

test('Agent root uses a single inset before its content-width query', () => {
  const css = style('src/custom-panel/styles.scss');
  const body = css.match(/(?:^|\n)body \{([^}]+)\}/)?.[1] ?? '';
  assert.match(body, /container: page-panel\s*\/\s*inline-size/);
  assert.match(body, /max-width: 720px/);
  assert.match(body, /padding: 16px 16px 32px/);
  const root = css.match(/body > \.panel \{([^}]+)\}/)?.[1] ?? '';
  assert.match(root, /padding: 0/);
});

test('legacy ordinary panels share the bounded width without constraining custom documents', () => {
  const component = read('src/app/device/legacy-panel/legacy-panel.component.ts');
  assert.match(component, /styleUrls: \['\.\/legacy-panel\.component\.scss'\]/);
  const css = style('src/app/device/legacy-panel/legacy-panel.component.scss');
  const ordinary = css.match(/:host \{([^}]+)\}/)?.[1] ?? '';
  assert.match(ordinary, /box-sizing: border-box/);
  assert.match(ordinary, /max-width: 720px/);
  assert.match(ordinary, /margin-inline: auto/);
  assert.match(ordinary, /padding: 16px/);
  const custom = css.match(/:host\.custom-panel \{([^}]+)\}/)?.[1] ?? '';
  assert.match(custom, /max-width: none/);
  assert.match(custom, /padding: 0/);
});

test('feedback remains in normal flow without changing the visible card frame', () => {
  const template = read('src/app/device/v2/panel/page-layout-panel.html');
  assert.match(template, /\[class\.feedback\]="!!card\.error"/);
  const editor = read('src/app/sections/device/panel-editor/panel-editor.page.html');
  assert.match(editor, /\[class\.feedback\]="mode === 'preview' && !!cards\.get\(item\.widgetId\)\?\.error"/);
  const css = style('src/app/device/v2/panel/page-layout-panel.scss');
  assert.match(css, /\.cell\.feedback \{\s*contain: none;/);
  assert.match(css, /\.cell > app-page-widget,\s*\.cell > \.preset-preview \{\s*flex: none;\s*height: var\(--fill-h\);/);
  assert.doesNotMatch(css, /\.cell\.(full|wide)\.feedback/);
  assert.match(read('src/custom-panel/main.ts'), /classList\.toggle\('feedback', !!card\.error\)/);
});
