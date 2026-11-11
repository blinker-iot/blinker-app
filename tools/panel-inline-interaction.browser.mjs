// Real directives + installed dnd-kit, with a small synthetic host. No App
// router, services, accounts, devices, Angular template or native acceptance.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
for (const key of ['WIDGET_BROWSER_DRIVER', 'WIDGET_BROWSER_EXECUTABLE']) {
  if (process.env[key]) assert.ok(isAbsolute(process.env[key]), `${key} must be absolute`);
}
const { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
const bundle = await build({
  absWorkingDir: fileURLToPath(new URL('../', import.meta.url)), bundle: true, write: false,
  platform: 'browser', format: 'iife', target: 'es2022', logLevel: 'silent',
  stdin: { resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts', contents: `
    import '@angular/compiler';
    import { createEnvironmentInjector, runInInjectionContext, ElementRef } from '@angular/core';
    import { PanelSortableDirective, PanelSortItemDirective } from './src/app/sections/device/panel-editor/panel-sortable.directive';
    const grid = new PanelSortableDirective(); grid.sortInline = true;
    let order = ['one', 'two', 'three'];
    let origin = [...order];
    const elements = new Map(), items = new Map(), injectors = [];
    const state = { taps: [], starts: 0, moves: 0, finishes: [], canceledPointers: 0, ready: false };
    const container = document.querySelector('.panel');
    for (const [index, id] of order.entries()) {
      const element = document.createElement('div'); element.className = 'cell'; element.dataset.id = id;
      element.innerHTML = '<div class="card" inert>Readonly ' + id + '</div><div class="overlay" aria-hidden="true"></div>';
      container.append(element); elements.set(id, element);
      const injector = createEnvironmentInjector([{ provide: ElementRef, useValue: new ElementRef(element) },
        { provide: PanelSortableDirective, useValue: grid }], null);
      injectors.push(injector);
      const item = runInInjectionContext(injector, () => new PanelSortItemDirective());
      item.panelSortItem = id; item.sortIndex = index; item.sortDisabled = false; item.ngOnChanges(); items.set(id, item);
    }
    function render() {
      for (const [index, id] of order.entries()) {
        container.append(elements.get(id)); const item = items.get(id); item.sortIndex = index; item.ngOnChanges();
      }
    }
    grid.sortTapped.subscribe(id => state.taps.push(id));
    grid.sortStarted.subscribe(() => { state.starts++; origin = [...order]; });
    grid.sortMoved.subscribe(({from, to}) => {
      const a = order.indexOf(from), b = order.indexOf(to);
      if (a < 0 || b < 0 || a === b) return;
      const [id] = order.splice(a, 1); order.splice(b, 0, id); state.moves++; render();
    });
    grid.sortFinished.subscribe(canceled => { state.finishes.push(canceled); if (canceled) { order = [...origin]; render(); } });
    document.addEventListener('pointercancel', () => state.canceledPointers++);
    window.fixture = { state, order: () => [...order], idle: () => grid.manager.dragOperation.status.idle,
      disable() { for (const item of items.values()) { item.sortDisabled = true; item.ngOnChanges(); } },
      enable() { for (const item of items.values()) { item.sortDisabled = false; item.ngOnChanges(); } },
      registered: () => Array.from(grid.manager.registry.draggables).length,
      destroy() { for (const item of items.values()) item.ngOnDestroy(); grid.ngOnDestroy(); }
    };
    requestAnimationFrame(() => state.ready = true);
  ` },
});
const browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? {
  executablePath: process.env.WIDGET_BROWSER_EXECUTABLE,
} : {}) });
const html = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:24px;font:16px sans-serif;height:1600px}
  .panel{display:grid;grid-template-columns:repeat(3,160px);gap:16px;width:512px}
  .cell{position:relative;height:120px}.card{height:100%;padding:16px;border-radius:16px;background:#e8eef9}
  .overlay{position:absolute;inset:0;cursor:grab}.cell:focus-visible{outline:3px solid #245ad4;outline-offset:2px}
  </style><div class="panel" aria-label="Synthetic inline panel"></div>`;
let checked = 0;
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.abort());
  await page.setContent(html); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => window.fixture?.state.ready, null, { timeout: 3000 });
  const state = () => page.evaluate(() => structuredClone(window.fixture.state));
  const center = async id => { const box = await page.locator(`.cell[data-id="${id}"]`).boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
  const first = await center('one');
  await page.mouse.move(first.x, first.y); await page.mouse.down();
  await page.mouse.move(first.x + 5, first.y); await page.mouse.up();
  assert.deepEqual((await state()).taps, ['one']); assert.equal((await state()).starts, 0); checked++;

  const target = await center('three');
  await page.mouse.move(first.x, first.y); await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 14 }); await page.mouse.up();
  await page.waitForFunction(() => window.fixture.idle(), null, { timeout: 3000 });
  let current = await state();
  assert.equal(current.starts, 1); assert.ok(current.moves >= 1, 'real pointer drag must reorder');
  assert.equal(current.finishes.at(-1), false); assert.deepEqual(current.taps, ['one']); checked++;

  await page.locator('.cell[data-id="two"]').focus(); await page.keyboard.press('Enter');
  assert.deepEqual((await state()).taps, ['one', 'two']); checked++;
  const beforeKeyboard = await page.evaluate(() => window.fixture.order());
  const beforeKeyboardMoves = (await state()).moves;
  await page.locator('.cell[data-id="two"]').focus(); await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(previous => window.fixture.state.moves > previous, beforeKeyboardMoves, { timeout: 2000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.fixture.idle(), null, { timeout: 3000 });
  current = await state(); assert.equal(current.starts, 2); assert.equal(current.finishes.at(-1), true);
  assert.deepEqual(await page.evaluate(() => window.fixture.order()), beforeKeyboard);
  assert.deepEqual(current.taps, ['one', 'two']); checked++;

  const pending = await center('one'); await page.mouse.move(pending.x, pending.y); await page.mouse.down();
  await page.evaluate(() => window.fixture.disable());
  await page.mouse.move(pending.x + 40, pending.y); await page.mouse.up();
  await page.locator('.cell[data-id="one"]').click();
  assert.equal(await page.evaluate(() => window.fixture.registered()), 0);
  assert.equal(await page.locator('.cell[data-id="one"]').getAttribute('role'), null);
  assert.equal(await page.locator('.cell[data-id="one"]').getAttribute('tabindex'), null);
  assert.deepEqual((await state()).taps, ['one', 'two']); assert.equal((await state()).starts, 2); checked++;
  await page.evaluate(() => window.fixture.enable()); await page.locator('.cell[data-id="one"]').click();
  assert.deepEqual((await state()).taps, ['one', 'two', 'one']); checked++;

  await page.evaluate(() => window.fixture.destroy());

  const touchPage = await browser.newPage({ viewport: { width: 800, height: 600 }, hasTouch: true,
    isMobile: true, reducedMotion: 'reduce' });
  touchPage.on('pageerror', error => errors.push(error.message));
  await touchPage.route('**/*', route => route.abort());
  await touchPage.setContent(`${html}<style>body{padding-top:200px}</style>`);
  await touchPage.addScriptTag({ content: bundle.outputFiles[0].text });
  await touchPage.waitForFunction(() => window.fixture?.state.ready, null, { timeout: 3000 });
  const cdp = await touchPage.context().newCDPSession(touchPage);
  const box = await touchPage.locator('.cell[data-id="one"]').boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touchPage.waitForFunction(() => window.fixture.state.taps.length === 1, null, { timeout: 2000 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  let touched = await touchPage.evaluate(() => structuredClone(window.fixture.state));
  assert.deepEqual(touched.taps, ['one']); assert.ok(touched.canceledPointers >= 1); checked++;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  for (let move = 1; move <= 6; move++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y - move * 20 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touchPage.waitForFunction(() => window.fixture.idle(), null, { timeout: 3000 });
  touched = await touchPage.evaluate(() => structuredClone(window.fixture.state));
  assert.deepEqual(touched.taps, ['one']); checked++;
  // Empty canvas is the documented native scrolling region, rather than
  // requiring a vertical card drag to be both sorting and scrolling at once.
  const blank = { x: 740, y: 500 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [blank] });
  for (let move = 1; move <= 6; move++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: blank.x, y: blank.y - move * 20 }] });
    await touchPage.evaluate(() => new Promise(requestAnimationFrame));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touchPage.waitForFunction(() => scrollY > 0, null, { timeout: 2000 });
  assert.deepEqual(await touchPage.evaluate(() => window.fixture.state.taps), ['one']); checked++;
  await touchPage.evaluate(() => window.fixture.destroy());
  assert.deepEqual(errors, []);
  console.log(`Inline real directive/dnd-kit interaction ${checked}/${checked} passed: pointer tap/drag/reorder, Enter properties, Space/arrows/Escape, pending disable cleanup/re-entry, CDP touch tap/cancel/movement and empty-canvas native scroll. Synthetic host only; not App/Angular template/native/device acceptance.`);
} finally { await browser.close(); }
