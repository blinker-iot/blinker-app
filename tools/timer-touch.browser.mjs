// Isolated Timer SCSS/target checks. Fixed card boxes deliberately do not depend
// on the panel grid. No Angular handlers, backend, native state or device access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, app), 'utf8');
const require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const driver = process.env.WIDGET_BROWSER_DRIVER;
if (driver) assert.ok(isAbsolute(driver));
const { chromium } = require(driver || 'playwright');
const css = sass.compile(fileURLToPath(new URL('src/app/device/v2/widgets/timer/timer-widget.scss', app)), {
  logger: sass.Logger.silent, loadPaths: [fileURLToPath(new URL('node_modules/', app))],
}).css;
const themes = sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', {
  loadPaths: [fileURLToPath(new URL('src/theme/', app))],
}).css;
const fonts = [['outfit', 'Outfit Variable'], ['geist-mono', 'Geist Mono Variable'], ['doto', 'Doto Variable']]
  .map(([name, family]) => `@font-face{font-family:'${family}';font-weight:100 900;src:url(data:font/woff2;base64,${
    readFileSync(new URL(`node_modules/@fontsource-variable/${name}/files/${name}-latin-wght-normal.woff2`, app)).toString('base64')
  }) format('woff2')}`).join('');
const template = read('src/app/device/v2/widgets/timer/timer-widget.html');
for (const binding of ['(click)="start(minutes)"', '(click)="cancel()"', '[disabled]="card.disabled"',
  'role="group" aria-label="倒计时预设"']) assert.ok(template.includes(binding), `refresh fixture: ${binding}`);

const cases = [
  ...[4, 6].map(count => ({ name: `idle-${count}`, count, html: `<div class="hd"><span class="hd-t">保留的长设备名称 Timer</span><span class="hd-v">未设置</span></div><div class="tm-presets" role="group" aria-label="倒计时预设" style="--n:${count}">${Array.from({ length: count }, (_, n) => `<button type="button" class="tm-p"><b>${n === count - 1 ? '9999' : n + 1}</b>分钟</button>`).join('')}</div>` })),
  ...['ring', 'bar', 'text'].map(style => ({ name: `running-${style}`, html: `<div class="hd"><span class="hd-t">保留的长设备名称 Timer</span><button class="tm-x" type="button" aria-label="取消倒计时">取消</button></div>${style === 'ring' ? '<div class="tm-run"><div class="tm-dial"><svg class="tm-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" /></svg><div class="tm-center"><span class="tm-countdown num">01:30</span><span class="tm-act">后关闭</span></div></div></div>' : `<div class="tm-copy tm-end"><span class="tm-time num">01:30</span><span class="tm-act">后关闭 · 12:30</span>${style === 'bar' ? '<div class="tm-bar"><span style="width:50%"></span></div>' : ''}</div>`}` })),
];

const browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? {
  executablePath: process.env.WIDGET_BROWSER_EXECUTABLE,
} : {}) });
let checked = 0;
const failures = [];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.abort());
  for (const theme of ['natural', 'dark', 'electronic']) for (const width of [288, 343, 688])
    for (const height of [139, 180]) for (const scale of [1, 1.5]) {
      await page.setContent(`<html data-ui-theme="${theme}"><style>${themes}${fonts}body{margin:0}probe-timer{display:flex}</style><main></main></html>`);
      await page.evaluate(({ cases, css, width, height }) => {
        for (const [index, fixture] of cases.entries()) {
          const host = document.createElement('probe-timer');
          host.dataset.index = String(index);
          host.attachShadow({ mode: 'open' }).innerHTML = `<style>${css}:host{flex:none;width:${width}px;height:${height}px}</style>${fixture.html}`;
          document.querySelector('main').append(host);
        }
      }, { cases, css, width, height });
      await page.evaluate(() => document.fonts.ready);
      if (scale !== 1) await page.evaluate(scale => {
        for (const host of document.querySelectorAll('probe-timer')) {
          const nodes = [...host.shadowRoot.querySelectorAll('*')].filter(node => !node.closest('svg'));
          const values = nodes.map(node => ({ node, font: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight) }));
          for (const { node, font, line } of values) {
            node.style.fontSize = `${font * scale}px`;
            if (Number.isFinite(line)) node.style.lineHeight = `${line * scale}px`;
          }
        }
      }, scale);
      for (const [index, fixture] of cases.entries()) {
        const failure = await page.evaluate(({ index, fixture }) => {
          const host = document.querySelector(`[data-index="${index}"]`);
          const root = host.shadowRoot;
          const rect = node => node.getBoundingClientRect();
          const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
          const check = (condition, message) => { if (!condition) throw Error(message); };
          try {
            check(host.scrollWidth <= host.clientWidth + 1, 'card leaks horizontal overflow');
            const targets = [...root.querySelectorAll('button')];
            for (const target of targets) {
              check(rect(target).width >= 47.9 && rect(target).height >= 47.9, 'target smaller than 48px');
              if (fixture.count) {
                const strip = root.querySelector('.tm-presets');
                target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                check(inside(rect(strip), rect(host)), 'preset strip clipped by card');
                check(inside(rect(target), rect(strip)), 'preset cannot be fully reached');
                check(target.scrollWidth <= target.clientWidth + 1, 'preset label cropped');
              } else check(inside(rect(target), rect(host)), 'cancel target clipped');
            }
            for (let a = 0; a < targets.length; a++) for (let b = a + 1; b < targets.length; b++) {
              const x = rect(targets[a]), y = rect(targets[b]);
              check(Math.min(x.right, y.right) <= Math.max(x.left, y.left) || Math.min(x.bottom, y.bottom) <= Math.max(x.top, y.top), 'targets overlap');
            }
            if (fixture.count) check(targets.length === fixture.count, 'preset lost');
            else {
              const head = root.querySelector('.hd');
              const body = root.querySelector('.tm-run,.tm-copy');
              check(rect(head).bottom <= rect(body).top + 1, 'cancel header covers timer');
              check(inside(rect(body), rect(host)), 'timer body clipped');
              for (const value of body.querySelectorAll('.tm-time,.tm-act,.tm-bar')) {
                value.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                check(inside(rect(value), rect(body)), 'timer text cannot be fully reached');
              }
              check(parseFloat(getComputedStyle(root.querySelector('.tm-x')).fontSize) <= 18, 'cancel visual text enlarged with target');
            }
            return '';
          } catch (error) { return `${error.message}; host=${rect(host).width}x${rect(host).height}`; }
        }, { index, fixture });
        if (failure) failures.push(`${theme}/${width}x${height}/${scale}/${fixture.name}: ${failure}`);
        checked++;
      }
    }
} finally { await browser.close(); }
assert.deepEqual(failures, [], failures.join('\n'));
console.log(`Timer target geometry ${checked}/${checked} passed (fixed card boxes; three themes; four/six presets; cancel; 100/150% computed text). Not Angular/native/device acceptance.`);
