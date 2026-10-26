// UI3 isolated geometry checks using actual widget SCSS and local fonts.
// No Angular handlers, network, device command, account, or layout writes.
// Set WIDGET_BROWSER_DRIVER / WIDGET_BROWSER_EXECUTABLE to installed tools.
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
const compile = path => sass.compile(fileURLToPath(new URL(path, app)), {
  logger: sass.Logger.silent, loadPaths: [fileURLToPath(new URL('node_modules/', app))],
}).css;
const widgetPath = name => `src/app/device/v2/widgets/${name}/${name}-widget`;
const styles = Object.fromEntries(['gradient', 'text', 'mode'].map(name => [name, compile(`${widgetPath(name)}.scss`)]));
const grid = compile('src/app/device/v2/panel/page-layout-panel.scss');
const themes = sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', {
  loadPaths: [fileURLToPath(new URL('src/theme/', app))],
}).css;
const fonts = [['outfit', 'Outfit Variable'], ['geist-mono', 'Geist Mono Variable'], ['doto', 'Doto Variable']]
  .map(([name, family]) => `@font-face{font-family:'${family}';font-weight:100 900;src:url(data:font/woff2;base64,${
    readFileSync(new URL(`node_modules/@fontsource-variable/${name}/files/${name}-latin-wght-normal.woff2`, app)).toString('base64')
  }) format('woff2')}`).join('');
const icon = '<app-ui-icon aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12h16"/></svg></app-ui-icon>';
const iconCss = 'app-ui-icon{display:grid;place-items:center;width:100%;height:100%}svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8}';
const heading = '<span class="hd-t">客厅设备很长的完整控制名称 Long title</span>';
const guards = {
  gradient: [/class="gs-track" role="slider"/, /class="gs-strip"/, /\(pointerdown\)="dragStart\(\$event\)"/],
  text: [/class="tx-in"/, /class="tx-send"/, /\(click\)="send\(\)"/],
  mode: [/class="modes"/, /minmax\(48px, 1fr\)/, /\(click\)="pick\(choice.label\)"/],
};
for (const [name, patterns] of Object.entries(guards)) for (const pattern of patterns) {
  assert.match(read(`${widgetPath(name)}.html`), pattern, `update ${name} fixture after template changes`);
}

const cases = [
  ...[1, 2].flatMap(rows => ['thin', 'mid', 'thick'].map(size => ({
    name: 'gradient', rows, label: `gradient/${rows}/${size}`, size,
    html: `<div class="hd">${heading}<span class="gs-val num">4000<small>K</small></span></div><div class="gs-wrap h-${size}"><div class="gs-track" role="slider" tabindex="0" aria-label="色温"><span class="gs-strip cct" aria-hidden="true"></span><i class="gs-knob ring" style="--p:50"></i></div><i class="gs-mark" style="--p:50"></i></div>${rows > 1 ? '<div class="gs-ticks"><span>暖光</span><span>4000K</span><span>冷光</span></div>' : ''}`,
  }))),
  ...[false, true].map(multi => ({
    name: 'text', rows: multi ? 3 : 2, label: `text/${multi ? 'multi' : 'single'}`,
    html: `<div class="hd">${heading}<span class="hd-v tx-last">当前 原有完整状态</span></div><div class="tx-box ${multi ? 'multi' : ''}">${multi ? '<textarea class="tx-in" rows="2" aria-label="内容">保留的长文本内容</textarea>' : '<input class="tx-in" aria-label="内容" value="保留的长文本内容">'}<div class="tx-foot"><span class="tx-count">100/100</span><button type="button" class="tx-send" aria-label="发送">${icon}</button></div></div>`,
  })),
  ...[1, 2].flatMap(rows => ['tiles', 'chips', 'segmented'].flatMap(style => [3, 8].map(count => ({
    name: 'mode', rows, label: `mode/${rows}/${style}/${count}`, style, count,
    html: `<div class="hd">${heading}</div><div class="modes ${style}" role="radiogroup" aria-label="模式" ${style === 'tiles' ? `style="grid-template-columns:repeat(${count},minmax(48px,1fr))"` : ''}>${Array.from({ length: count }, (_, i) => `<button type="button" class="mode ${i === 0 ? 'on' : ''}" role="radio" aria-checked="${i === 0}" title="${i + 1} 自动模式完整长标签">${style === 'tiles' ? `<span class="mode-ico">${icon}</span>` : ''}<span>${i + 1} 自动模式完整长标签</span></button>`).join('')}</div>`,
  })))),
];

const browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? {
  executablePath: process.env.WIDGET_BROWSER_EXECUTABLE,
} : {}) });
let checked = 0;
const failures = [];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.abort());
  for (const theme of ['natural', 'dark', 'electronic']) for (const width of [320, 375, 593, 844]) for (const scale of [1, 1.5]) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<html data-ui-theme="${theme}"><style>${themes}${fonts}*{box-sizing:border-box}body{margin:0}probe-panel{display:block}</style><main id="fixtures"></main></html>`);
    await page.evaluate(({ cases, grid, styles, iconCss }) => {
      for (const [index, item] of cases.entries()) {
        const panel = document.createElement('probe-panel');
        panel.attachShadow({ mode: 'open' }).innerHTML = `<style>${grid}:host{display:block;max-width:720px;margin:auto;padding:16px}app-page-widget{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column}</style><div class="panel"><div class="cell wide" style="--col:1;--row:1;--span:4;--rows:${item.rows}"><app-page-widget><probe-widget class="${item.rows === 1 ? 'rowc' : ''}" data-index="${index}"></probe-widget></app-page-widget></div><div class="cell full next" style="--col:1;--row:${item.rows + 1};--span:8;--rows:1"><span>下一行</span></div></div>`;
        document.querySelector('#fixtures').append(panel);
        panel.shadowRoot.querySelector('probe-widget').attachShadow({ mode: 'open' }).innerHTML = `<style>${styles[item.name]}${iconCss}</style>${item.html}`;
      }
    }, { cases, grid, styles, iconCss });
    await page.evaluate(() => document.fonts.ready);
    if (scale !== 1) await page.evaluate(scale => {
      // Explicitly enlarge the computed text, not only the root rem size:
      // widgets intentionally contain px typography. This is a browser stress
      // fixture, not a claim about Android font_scale/native Dynamic Type.
      for (const panel of document.querySelectorAll('probe-panel')) {
        const root = panel.shadowRoot.querySelector('probe-widget').shadowRoot;
        const text = [...root.querySelectorAll('*')].filter(element => !element.closest('app-ui-icon'));
        const sizes = text.map(element => {
          const style = getComputedStyle(element);
          return { element, font: parseFloat(style.fontSize), line: parseFloat(style.lineHeight) };
        });
        for (const { element, font, line } of sizes) {
          element.style.fontSize = `${font * scale}px`;
          if (Number.isFinite(line)) element.style.lineHeight = `${line * scale}px`;
        }
      }
    }, scale);
    for (const [index, item] of cases.entries()) {
      const result = await page.evaluate(({ index, item, scale }) => {
        const panel = document.querySelectorAll('probe-panel')[index];
        const host = panel.shadowRoot.querySelector('probe-widget');
        const root = host.shadowRoot;
        const rect = element => element.getBoundingClientRect();
        const within = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        try {
          check(host.scrollWidth <= host.clientWidth + 1, 'horizontal widget overflow');
          check(rect(host).bottom <= rect(panel.shadowRoot.querySelector('.next')).top + 1, 'covers next saved row');
          const targets = [...root.querySelectorAll('button,input,textarea,[role="slider"]')];
          for (const target of targets) {
            check(rect(target).width >= 47.9 && rect(target).height >= 47.9, 'target below 48px');
            const scroller = item.name === 'mode' ? root.querySelector('.modes') : host;
            if (item.name !== 'mode') check(within(rect(target), rect(host)), 'target cropped by host');
            else {
              target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              check(within(rect(target), rect(scroller)), 'choice not fully reachable by local scroll');
              check(within(rect(scroller), rect(host)), `choice scroller cropped by host ${JSON.stringify({ host: rect(host).toJSON(), scroller: rect(scroller).toJSON() })}`);
            }
          }
          for (let a = 0; a < targets.length; a++) for (let b = a + 1; b < targets.length; b++) {
            const x = rect(targets[a]), y = rect(targets[b]);
            check(!(Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1), 'overlapping targets');
          }
          if (item.name === 'gradient') {
            const expected = { thin: 6, mid: 14, thick: 32 }[item.size];
            check(Math.abs(rect(root.querySelector('.gs-strip')).height - expected) < 0.1, 'visual gradient strip changed');
            check(Math.abs(rect(root.querySelector('.gs-track')).width - rect(root.querySelector('.gs-strip')).width) < 0.1, 'horizontal drag geometry changed');
          }
          if (item.name === 'text') check(parseFloat(getComputedStyle(root.querySelector('.tx-in')).fontSize) === (item.label.endsWith('multi') ? 13 : 16) * scale, 'input typography changed unexpectedly');
          return '';
        } catch (error) { return `${error.message}; host=${Math.round(rect(host).width)}x${Math.round(rect(host).height)}`; }
      }, { index, item, scale });
      if (result) failures.push(`${theme}/${width}/${scale}/${item.label}: ${result}`);
      checked++;
    }
  }
} finally { await browser.close(); }
assert.deepEqual(failures, [], failures.join('\n'));
console.log(`UI3 widget geometry ${checked}/${checked} passed (three themes, narrow/desktop, dense choices, 100/150% computed text). No native or device validation.`);
