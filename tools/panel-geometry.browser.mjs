// Actual SCSS geometry with static contents; not an installed App/native test.
// No accounts, saved layouts or device traffic are read or modified.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, app), 'utf8');
const require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const compile = name => sass.compile(fileURLToPath(new URL(name, app)), {
  logger: sass.Logger.silent, loadPaths: [fileURLToPath(new URL('node_modules/', app))],
}).css;
for (const key of ['WIDGET_BROWSER_DRIVER', 'WIDGET_BROWSER_EXECUTABLE']) {
  if (process.env[key]) assert.ok(isAbsolute(process.env[key]));
}
const { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
const shells = {
  normal: compile('src/app/device/v2/panel/page-layout-panel.scss'),
  editor: compile('src/app/sections/device/panel-editor/panel-editor.page.scss'),
  property: compile('src/app/sections/device/panel-editor/panel-widget-editor.page.scss'),
  catalogue: compile('src/app/sections/device/panel-editor/panel-editor.page.scss'),
  configuration: compile('src/app/device/v2/panel/page-layout-panel.scss')
    + compile('src/app/sections/device/device-components/device-components.page.scss'),
  agent: compile('src/custom-panel/styles.scss'),
};
const variants = ['tile', 'toggle', 'slide', 'hold', 'action', 'keys', 'dpad', 'mode',
  'level', 'gradient', 'dial', 'levels', 'stepper', 'timer', 'picker', 'text', 'number',
  'trend', 'ring', 'status', 'log', 'uptime', 'memory'];
// Node versions supported by this repository can read erasable TypeScript.
// Use the real size catalogue, not an invented 2x2 for every appearance.
const { VARIANT_SIZES } = await import(new URL('../src/app/core/device-v2/page-widget.ts', import.meta.url));
const styles = Object.fromEntries(variants.map(name => [name,
  compile(`src/app/device/v2/widgets/${name}/${name}-widget.scss`)]));
const wrapper = read('src/app/device/v2/panel/page-widget.ts').match(/styles:\s*\['(:host[^']+)'\]/)?.[1];
assert.ok(wrapper, 'update the fixture if the PageWidget host changes');
const wrapperCss = wrapper.replace(':host', 'app-page-widget');
const browser = await chromium.launch({ headless: true,
  ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
let checks = 0;
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.abort());
  for (const theme of ['natural', 'dark', 'electronic']) {
    for (const width of [320, 375, 430, 592, 593, 692, 693, 720, 844]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 1000 });
      const measurements = [];
      for (const [kind, css] of Object.entries(shells)) {
        const fixtures = [...variants.map(name => ({ name,
          span: VARIANT_SIZES[name].widths[0], rows: VARIANT_SIZES[name].heights[0] })),
          { name: 'number', span: 2, rows: 2 },
          ...[1, 2, 3].map(rows => ({ name: 'level', span: 4, rows })),
          { name: 'status', span: 8, rows: 2 }];
        await page.setContent(`<html data-ui-theme="${theme}"><style>*{box-sizing:border-box}body{margin:0;--transparent-page-content-top:0px}.shell{max-width:720px;padding:16px;margin:auto}probe-panel{display:block}</style><main class="${kind === 'normal' ? 'shell' : ''}"></main></html>`);
        await page.evaluate(({ css, kind, fixtures, styles, wrapperCss }) => {
          const host = document.createElement('probe-panel');
          document.querySelector('main').append(host);
          const root = host.attachShadow({ mode: 'open' });
          root.innerHTML = `<style>${css}${wrapperCss}</style>${kind === 'editor'
            ? '<div class="workspace"><div class="canvas"></div></div>'
            : kind === 'catalogue' ? '<section class="sheet"><div class="catalogue-region"></div></section>'
            : kind === 'configuration' ? '<section class="editor"><div class="editor-preview"></div></section>'
            : kind === 'property' ? '<section class="preview-region"></section>'
            : '<section class="measure-region"></section>'}`;
          const region = root.querySelector('.canvas,.catalogue-region,.editor-preview,.preview-region,.measure-region');
          if (kind === 'agent') {
            // The real Agent body owns exactly the same max-width/single inset.
            region.style.cssText = 'container:page-panel/inline-size;box-sizing:border-box;max-width:720px;margin:auto;padding:16px';
          }
          for (const [index, item] of fixtures.entries()) {
            const panel = document.createElement('section'); panel.className = kind === 'catalogue' ? 'catalogue panel' : 'panel';
            const widget = `<app-page-widget><probe-widget data-case="${index}"></probe-widget></app-page-widget>`;
            panel.innerHTML = `<div class="cell ${kind === 'catalogue' ? 'preset' : ''} ${item.span >= 4 ? 'wide' : ''} ${item.span === 8 ? 'full' : ''}" style="--col:1;--row:1;--span:${item.span};--rows:${item.rows}">${kind === 'catalogue' ? `<div class="preset-preview">${widget}</div>` : widget}</div>`;
            region.append(panel);
            // Generic intrinsic content deliberately differs between variants.
            // This checks all 23 real host styles, not their inner interactions.
            panel.querySelector('probe-widget').attachShadow({ mode: 'open' }).innerHTML =
              `<style>${styles[item.name]}</style><div class="hd"><span class="hd-t">Static ${item.name}</span></div><div>${'Value '.repeat(index % 3 + 1)}</div>`;
          }
          const panel = document.createElement('section'); panel.className = 'panel feedback-fixture';
          panel.innerHTML = `<div class="cell feedback" style="--col:1;--row:1;--span:2;--rows:2"><app-page-widget></app-page-widget><p class="cell-error atom-error" role="alert">${'Unconfirmed result; read fresh state. '.repeat(30)}</p></div><div class="cell neighbour" style="--col:3;--row:1;--span:2;--rows:2"><app-page-widget></app-page-widget></div><div class="cell wide full following" style="--col:1;--row:3;--span:8;--rows:1"><app-page-widget></app-page-widget></div>`;
          region.append(panel);
        }, { css, kind, fixtures, styles, wrapperCss });
        const measured = await page.evaluate(() => {
          const root = document.querySelector('probe-panel').shadowRoot;
          const rect = el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height, top: r.top, bottom: r.bottom }; };
          const feedback = root.querySelector('.feedback-fixture');
          return {
            panel: rect(root.querySelector('.panel')).width,
            frames: [...root.querySelectorAll('probe-widget')].map(rect),
            feedback: {
              card: rect(feedback.querySelector('app-page-widget')),
              neighbour: rect(feedback.querySelector('.neighbour app-page-widget')),
              error: rect(feedback.querySelector('[role="alert"]')),
              following: rect(feedback.querySelector('.following')),
            },
            leaked: document.documentElement.scrollWidth > innerWidth + 1,
          };
        });
        const label = `${kind}/${theme}/${width}`;
        assert.equal(measured.leaked, false, `${label}: page overflow`);
        for (const [index, frame] of measured.frames.entries()) {
          const columns = measured.panel <= 660 ? 4 : 8;
          const unit = (measured.panel - (columns - 1) * 12) / columns;
          const expected = fixtures[index].rows * unit + (fixtures[index].rows - 1) * 12;
          assert.ok(Math.abs(frame.height - expected) <= 1, `${label}: ${fixtures[index].name} ignores height ${JSON.stringify(frame)}`);
        }
        const square = measured.frames[variants.length];
        assert.ok(Math.abs(square.width - square.height) <= 1, `${label}: 2x2 is not square`);
        const heights = measured.frames.slice(variants.length + 1, variants.length + 4).map(r => r.height);
        assert.ok(heights[1] > heights[0] && heights[2] > heights[1], `${label}: row choice does not resize`);
        const feedback = measured.feedback;
        assert.ok(Math.abs(feedback.card.height - feedback.neighbour.height) <= 1, `${label}: feedback stretches neighbour`);
        assert.ok(Math.abs(feedback.card.width - feedback.card.height) <= 1, `${label}: feedback changes card shape`);
        assert.ok(feedback.error.top >= feedback.card.bottom - 1, `${label}: error covers card`);
        assert.ok(feedback.following.top >= feedback.error.bottom - 1, `${label}: error covers next row`);
        measurements.push(measured.frames.map(r => [Math.round(r.width * 10), Math.round(r.height * 10)]));
        checks++;
      }
      for (const frames of measurements.slice(1)) assert.deepEqual(frames, measurements[0], `${theme}/${width}: consumers differ`);
    }
  }
  // Real Agent root/body selectors and nested groups, including an outer wide
  // panel whose inner group is compact. No user HTML is loaded or rewritten.
  for (const width of [320, 375, 720]) for (const groupWidth of ['100%', '280px']) {
    await page.setViewportSize({ width, height: 1000 });
    const cell = id => `<div class="cell" id="${id}" style="--col:auto;--row:auto;--span:2;--rows:2"><app-page-widget></app-page-widget></div>`;
    await page.setContent(`<html data-ui-theme="natural"><style>${shells.agent}${wrapperCss}.group{box-sizing:border-box;max-width:100%;padding:16px;width:${groupWidth}}</style><body><main class="panel">${cell('root-card')}<section class="group"><div class="panel">${cell('nested-card')}</div></section></main></body></html>`);
    const frames = await page.evaluate(() => [...document.querySelectorAll('app-page-widget')].map(el => {
      const r = el.getBoundingClientRect(); return [r.width, r.height];
    }));
    for (const [w, h] of frames) assert.ok(Math.abs(w - h) <= 1, `Agent nested ${width}/${groupWidth}: ${w}x${h}`);
    checks++;
  }
  console.log(`Panel geometry: ${checks} scenarios passed (162 consumer/theme/viewport combinations + 6 actual Agent nested groups; 23 legal host specifications; static SCSS, not inner-widget/native acceptance).`);
} finally { await browser.close(); }
