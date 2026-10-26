// Source/style contracts only; browser geometry lives in home-tabs-ui.browser.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const read = path => readFileSync(new URL(path, root), 'utf8');
const compile = path => sass.compile(fileURLToPath(new URL(path, root)), { logger: sass.Logger.silent }).css;
function block(source, marker) {
  const start = source.indexOf(marker); assert.ok(start >= 0, marker);
  let end = source.indexOf('{', start), depth = 1;
  while (depth && ++end < source.length) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
  assert.equal(depth, 0); return source.slice(start, end + 1);
}

test('four home tabs explicitly opt into the shared heading; login remains outside', () => {
  for (const kind of ['device', 'community', 'tools', 'profile']) {
    const source = read(`src/app/home/components/tab-${kind}/tab-${kind}.html`);
    const classes = source.match(/<ion-header\b[^>]*class="([^"]+)"/s)?.[1].split(/\s+/);
    assert.ok(classes?.includes('main-tab-header'), kind);
    assert.ok(classes?.includes('home-tab-header'), kind);
  }
  assert.doesNotMatch(read('src/app/sections/login/login.html'), /home-tab-header/);
});

test('home typography/action sizing is opt-in without changing the old 20px/44px header', () => {
  const css = sass.compileString(block(read('src/global.scss'), 'ion-header.main-tab-header {')).css;
  assert.match(css, /ion-header\.main-tab-header ion-title\s*\{[^}]*font-size: 20px;[^}]*font-weight: 600/s);
  assert.match(css, /ion-header\.main-tab-header ion-button\.header-action\s*\{[^}]*width: 44px;[^}]*height: 44px/s);
  assert.match(css, /ion-header\.main-tab-header\.home-tab-header ion-title\s*\{[^}]*font-size: 1\.8125rem;[^}]*font-weight: 650;[^}]*line-height: 1\.2;[^}]*letter-spacing: -1px/s);
  assert.match(css, /ion-header\.main-tab-header\.home-tab-header ion-button\.header-action\s*\{[^}]*width: 48px;[^}]*height: 48px/s);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*ion-header\.main-tab-header\.home-tab-header ion-title\s*\{[^}]*font-size: 1\.6875rem/s);
});

test('discovery removes only its negative end margin so focusing the actual Ionic action cannot scroll the title clip', () => {
  const css = compile('src/app/home/components/tab-community/tab-community.scss');
  const local = block(css, 'ion-header.discover-header ion-toolbar ion-buttons {');
  assert.equal(local.slice(local.indexOf('{') + 1, -1).trim(), 'margin-inline-end: 0;',
    'Fix the overflowing action locally rather than compensate title padding, transform, font or overflow');
  const shared = sass.compileString(block(read('src/global.scss'), 'ion-header.main-tab-header {')).css;
  assert.match(block(shared, 'ion-header.main-tab-header ion-buttons {'), /margin: 0 -10px 0 12px/,
    'Do not alter other tabs or login while repairing discovery');
  const installedToolbar = read('node_modules/@ionic/core/dist/collection/components/toolbar/toolbar.md.css');
  assert.match(block(installedToolbar, '.toolbar-container {'), /overflow: hidden/);
  const browser = read('tools/discovery-collection.browser.mjs');
  assert.match(browser, /toolbar\.shadowRoot\.querySelector\('\.toolbar-container'\)/);
  assert.match(browser, /title\.shadowRoot\.querySelector\('\.toolbar-title'\)/);
  assert.match(browser, /nativeAction\.focus\(\)/);
  assert.doesNotMatch(browser, /nativeAction\.focus\([^)]*preventScroll/,
    'A preventScroll probe would hide the regression rather than exercise it');
  assert.match(browser, /headerSnapshot\('before-focus'\)/);
  assert.match(browser, /headerSnapshot\('action-focus'\)/);
  assert.match(browser, /headerSnapshot\('action-blur'\)/);
});

test('device and profile keep normal header actions within the toolbar without changing card editor spacing', () => {
  const device = compile('src/app/home/components/tab-device/tab-device.scss');
  const profile = compile('src/app/home/components/tab-profile/tab-profile.scss');
  for (const [css, selector] of [
    [device, 'ion-header.main-tab-header ion-toolbar ion-buttons:not(.card-editor-actions) {'],
    [profile, 'ion-header.main-tab-header ion-toolbar ion-buttons {'],
  ]) {
    const local = block(css, selector);
    assert.equal(local.slice(local.indexOf('{') + 1, -1).trim(), 'margin-inline-end: 0;');
  }
  assert.equal(block(device, 'ion-buttons.card-editor-actions {').slice('ion-buttons.card-editor-actions {'.length, -1).trim(), 'margin: 0;');
  assert.match(block(device, 'ion-header.main-tab-header ion-buttons.card-editor-actions ion-button.card-editor-action {'),
    /width: 44px;[^}]*height: 44px;[^}]*min-width: 44px;[^}]*min-height: 44px;/s);
  const tools = read('src/app/home/components/tab-tools/tab-tools.html');
  assert.doesNotMatch(tools.slice(0, tools.indexOf('</ion-header>')), /ion-buttons|header-action/,
    'Tools is the title-only control, not another page to patch without evidence');
  const browser = read('tools/home-header-focus.browser.mjs');
  assert.match(browser, /encapsulateStyle/);
  assert.doesNotMatch(browser, /preventScroll\s*:/, 'Normal focus must exercise the scroll behavior');
});

test('discovery keeps horizontal recommendations, category directories and non-colour filter state', () => {
  const html = read('src/app/home/components/tab-community/tab-community.html');
  const css = compile('src/app/home/components/tab-community/tab-community.scss');
  assert.ok(css.includes('.story-card') && css.includes('.collection-directory'));
  assert.match(css, /\.story-card\s*\{[^}]*min-width: 0/s);
  assert.match(css, /\.story-image\s*\{[^}]*width: 100%/s);
  assert.match(block(css, '.story-card {'), /grid-template-columns: clamp\(88px, max\(30%, 4\.5rem\), 112px\) minmax\(0, 1fr\)/);
  assert.match(block(css, '.story-image {'), /display: flex;[^}]*flex-direction: column/s);
  for (const selector of ['.story-image img {', '.story-image span {']) {
    assert.doesNotMatch(block(css, selector), /position:\s*(?:absolute|fixed)|\binset:/,
      `${selector}: cover and label must participate in natural flow`);
  }
  assert.doesNotMatch(css, /\.story-card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
    'Narrow screens and larger text must not switch recommendations into a hero');
  assert.doesNotMatch(css, /\.story-image\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/s);
  assert.doesNotMatch(css, /\.product-copy\s*\{[^}]*display:\s*contents/s,
    'Product copy must remain together beside its thumbnail');
  assert.match(css, /\.search-field:focus-within\s*\{[^}]*outline: 2px solid/s);
  assert.match(css, /\.product-card\s*\{[^}]*display: grid;[^}]*grid-template-columns: 80px minmax\(0, 1fr\)/s);
  const product = block(css, '.product-card {');
  assert.match(product, /align-items: start/);
  assert.match(product, /gap: 12px/);
  assert.match(product, /padding: 12px/);
  assert.match(css, /\.product-copy\s*\{[^}]*min-width: 0/s);
  assert.match(css, /\.category-tabs button\s*\{[^}]*min-height: 48px/s);
  assert.match(css, /\.category-tabs button:focus-visible\s*\{[^}]*outline: 2px/s);
  assert.match(html, /\[attr\.aria-pressed\]="activeCategory === category\.id"/);
  assert.match(html, /\[attr\.aria-expanded\]="searchVisible"/);
  assert.match(html, /class="product-card"/);
  assert.doesNotMatch(html, /class="product-card"[^]*?<button[^]*?<\/article>/);
});

test('discovery search and filters paint above the shared header blur, not merely pass hit testing', () => {
  const declarations = (css, selector) => {
    const result = {};
    const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selectors, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selectors.split(',').some(value => value.trim() === selector)) continue;
      for (const declaration of body.split(';')) {
        const colon = declaration.indexOf(':');
        if (colon >= 0) result[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
      }
    }
    return result;
  };
  const chrome = compile('src/app/sections/_transparent-page-header.scss');
  const blur = declarations(chrome, 'ion-header::before');
  const toolbar = declarations(chrome, 'ion-header ion-toolbar');
  assert.equal(blur.position, 'absolute');
  assert.equal(blur['z-index'], '0');
  assert.match(blur['backdrop-filter'], /blur\(var\(--ui-header-blur, 16px\)\)/);
  assert.equal(blur['pointer-events'], 'none');
  assert.equal(toolbar.position, 'relative');
  assert.equal(toolbar['z-index'], '1');

  // A pointer-transparent blur layer can still paint over readable input text.
  // Geometry/typing success is not visual acceptance; keep both sibling regions
  // in the toolbar's foreground plane. Native visual A/B remains separate.
  const discovery = compile('src/app/home/components/tab-community/tab-community.scss');
  for (const selector of ['#community-search-field', '.category-tabs']) {
    const region = declarations(discovery, selector);
    assert.equal(region.position, 'relative', `${selector}: foreground must be positioned`);
    assert.equal(region['z-index'], toolbar['z-index'], `${selector}: foreground must paint above z0 blur`);
  }
});

test('short-landscape open search shares one row with its 48px close action and synchronized content offsets', () => {
  const css = compile('src/app/home/components/tab-community/tab-community.scss');
  const compact = block(css, '@media (orientation: landscape) and (max-height: 500px)');
  const body = compact.slice(compact.indexOf('{') + 1, -1);
  for (const [, selectors] of body.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    assert.ok(selectors.split(',').every(selector => selector.trim().startsWith('.discover-header.search-visible')),
      'Compact keyboard layout must stay local to discovery with search open');
  }
  const header = block(compact, '.discover-header.search-visible {');
  assert.match(header, /display: grid/);
  assert.match(header, /grid-template-columns: minmax\(0, 1fr\) calc\(48px \+ max\(18px, var\(--ion-safe-area-right, 0px\)\)\)/);
  assert.match(header, /padding-top: calc\(var\(--ion-safe-area-top, 0px\) \+ 8px\)/);
  const toolbar = block(compact, '.discover-header.search-visible ion-toolbar {');
  assert.match(toolbar, /grid-column: 2;[^}]*grid-row: 1/s);
  assert.match(toolbar, /--min-height: var\(--discover-search-height\)/);
  const field = block(compact, '.discover-header.search-visible #community-search-field {');
  assert.match(field, /grid-column: 1;[^}]*grid-row: 1/s);
  assert.match(block(compact, '.discover-header.search-visible .category-tabs {'), /grid-column: 1\s*\/\s*-1/);
  assert.match(block(compact, '.discover-header.search-visible ion-toolbar ion-title {'), /display: none/);
  assert.equal((compact.match(/display: none/g) ?? []).length, 1, 'Only the large title is hidden, not input or close');
  assert.doesNotMatch(css.replace(compact, ''), /ion-title\s*\{[^}]*display: none/s,
    'Ordinary and portrait headings must not inherit the compact title suppression');
  assert.match(block(css, '.search-field {'), /min-height: var\(--discover-search-height\)/);
  assert.match(css, /--discover-search-height: max\(48px, calc\(1\.5rem \+ 16px\)\)/);
  const global = sass.compileString(block(read('src/global.scss'), 'ion-header.main-tab-header {')).css;
  const close = block(global, 'ion-header.main-tab-header.home-tab-header ion-button.header-action {');
  assert.match(close, /width: 48px;[^}]*height: 48px;[^}]*min-width: 48px;[^}]*min-height: 48px/s);

  // No keyboard pixels are simulated here. Preserve the bounded CSS contract
  // behind the separate native IME A/B: no old64px title row in either offset.
  const content = block(compact, '.discover-header.search-visible + ion-content .discover-content {');
  const mask = block(compact, '.discover-header.search-visible + ion-content .top-scroll-mask {');
  const common = 'var\\(--ion-safe-area-top, 0px\\) \\+ var\\(--discover-search-height\\) \\+ var\\(--discover-filters-height\\)';
  assert.match(content, new RegExp('padding-top: calc\\(' + common + ' \\+ 32px\\)'));
  assert.match(mask, new RegExp('height: calc\\(' + common + ' \\+ 16px\\)'));
  assert.doesNotMatch(content + mask, /--discover-header-height/);
});

test('bounded browser suite documents synthetic scope and uses unique private screenshot runs', () => {
  const source = read('tools/home-tabs-ui.browser.mjs');
  assert.match(source, /mkdtempSync\(join\(destination, 'home-tabs-'\)\)/);
  assert.match(source, /HOME_TABS_SCREENSHOT_DIR must be an absolute private path/);
  assert.match(source, /Screenshots must stay outside the repository/);
  assert.match(source, /Not Angular\/App\/native/);
  assert.match(source, /safeTop = 35, safeBottom = 26/);
  assert.match(source, /rootSizes: \[16, 24\]/);
  assert.match(source, /HOME_TABS_UI_SUITE must be all, tabs or nav-corners/);
  assert.match(source, /pixelDifference\(visible, reference\)/);
});

test('floating home navigation does not reserve a rectangular footer or full-width pseudo-layer', () => {
  const css = compile('src/app/home/home.page.scss');
  assert.doesNotMatch(css, /ion-tabs::after\s*\{/);
  assert.match(css, /ion-tab-bar\s*\{[^}]*position: absolute/s);
  assert.match(css, /ion-tab-bar\s*\{[^}]*margin: 0/s);
  assert.match(css, /ion-tab-bar\s*\{[^}]*border-radius: 25px/s);
});
