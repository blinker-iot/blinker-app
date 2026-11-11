// UI3 editor CSS fixtures, compiled from the real SCSS with synthetic text.
// No Angular/Ionic runtime, devices, accounts, persisted layouts or native QA.
// Reuses WIDGET_BROWSER_DRIVER / WIDGET_BROWSER_EXECUTABLE; no downloads.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const read = path => readFileSync(new URL(path, app), 'utf8');
const path = name => `src/app/sections/device/panel-editor/${name}.page`;
const compile = name => sass.compile(fileURLToPath(new URL(`${path(name)}.scss`, app)), {
  logger: sass.Logger.silent, loadPaths: [fileURLToPath(new URL('node_modules/', app))],
}).css;
for (const key of ['WIDGET_BROWSER_DRIVER', 'WIDGET_BROWSER_EXECUTABLE']) {
  if (process.env[key]) assert.ok(isAbsolute(process.env[key]), `${key} must be absolute`);
}
const { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
const css = { editor: compile('panel-editor'), property: compile('panel-widget-editor') };
css.inlineProperty = css.property + sass.compile(fileURLToPath(new URL('src/app/sections/device/panel-editor/inline-widget-properties.scss', app)), {
  logger: sass.Logger.silent, loadPaths: [fileURLToPath(new URL('node_modules/', app))],
}).css;
const template = read(`${path('panel-editor')}.html`);
for (const name of ['workspace', 'editor-tools', 'mode-switch', 'tools-right', 'theme-switch', 'icon-button', 'add-button', 'sheet', 'library-filters', 'new-field']) {
  assert.match(template, new RegExp(`class="[^"\n]*\\b${name}\\b`), `update the ${name} fixture`);
}
assert.match(template, /\[interactive\]="!embedded && mode === 'preview'"/);
assert.match(template, /操作会实际下发/);
const propertyTemplate = read(`${path('panel-widget-editor')}.html`);
assert.match(propertyTemplate, /aria-label="组件只读外观预览"/);
assert.doesNotMatch(propertyTemplate, /\[interactive\]|\(action\)/);
assert.match(propertyTemplate, /class="remove-button"/);

const modes = '<div class="mode-switch" role="group" aria-label="编辑模式"><button type="button" aria-pressed="true">编辑</button><button type="button">布局</button><button type="button">预览</button></div>';
const undo = '<button type="button" class="icon-button" aria-label="撤销">↶</button>';
const themes = '<div class="theme-switch" role="group" aria-label="预览主题"><button type="button" aria-label="自然" aria-pressed="true">A</button><button type="button" aria-label="暗夜">B</button><button type="button" aria-label="电子">C</button></div>';
const editor = mode => `<div class="workspace"><div class="editor-tools">${modes}<div class="tools-right">${mode === 'preview' ? themes : undo}${mode === 'edit' ? '<button class="add-button" type="button"><span>添加部件</span></button>' : ''}</div></div>${mode === 'preview' ? '<p class="layout-hint">此预览可控制设备，操作会实际下发。</p>' : ''}<div class="canvas"><div class="panel"><div class="cell full wide" style="--col:1;--row:1;--span:8;--rows:1"><div class="placeholder">真实部件由原渲染器呈现</div></div></div></div></div>`;
const library = theme => `<section class="sheet" data-ui-theme="${theme}"><header class="sheet-heading"><div><h2>添加部件</h2><p>选择字段，再挑选适合的部件。</p></div><button type="button" class="icon-button" aria-label="关闭部件库">×</button></header><div class="library-filters"><div class="field-select"><span>绑定字段</span><button class="field-trigger" type="button"><span>long-field-name-for-layout-fixture</span><i aria-hidden="true">⌄</i></button></div></div><div class="new-field">${['字段 key', '最小值', '最大值', '步进', '选项', '按钮指令'].map((name, i) => `<label>${name}<input value="${i ? '0' : 'fixture-field'}"/></label>`).join('')}</div></section>`;
const property = '<div class="property-page"><section class="preview-region" aria-label="组件只读外观预览"><div class="panel"><div class="cell wide full" style="--col:1;--row:1;--span:8;--rows:1"><div class="placeholder">原部件的只读预览</div></div></div></section><section class="property-scroll"><div class="property-settings"><p>属性表单沿用原字段；其完整视觉改版另作 UI4。</p><button type="button" class="remove-button">移除部件</button></div></section></div>';
const fixtures = [
  ...['edit', 'layout', 'preview'].map(mode => ({ id: mode, kind: 'editor', html: () => editor(mode) })),
  { id: 'library', kind: 'editor', html: library },
  { id: 'property', kind: 'property', html: () => property },
  // The detail host, not the embedded editor, owns these existing 16px gutters.
  { id: 'inline', kind: 'editor', html: () => `<main style="padding:16px"><div class="workspace inline-workspace"><div class="editor-tools"><div class="tools-right">${undo}<button class="add-button" type="button">添加展示</button></div></div><p class="layout-hint">拖动调整位置，轻点修改属性；空白处可滚动。</p><div class="canvas"><div class="panel"><div class="cell" style="--col:1;--row:1;--span:2;--rows:2"><div class="placeholder">只读编辑卡片</div><div class="widget-overlay widget-inline"></div></div></div></div></div></main>` },
  { id: 'inline-property', kind: 'inlineProperty', html: () => `<header class="inline-heading"><button class="cancel" aria-label="取消">×</button><h2>部件属性</h2><button class="apply">应用</button></header>${property.replace('<button type="button" class="remove-button">', '<div class="order-actions"><button type="button">前移</button><button type="button">后移</button></div><button type="button" class="remove-button">')}` },
];
const browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
let count = 0;
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.abort());
  for (const theme of ['natural', 'dark', 'electronic']) for (const width of [320, 375, 592, 844]) for (const scale of [1, 1.5]) for (const fixture of fixtures) {
    const height = width === 844 ? 390 : 900;
    await page.setViewportSize({ width, height });
    await page.setContent(`<html style="font-size:${16 * scale}px"><style>*{box-sizing:border-box}body{margin:0;--transparent-page-content-top:0px}probe-editor{display:block;width:100%;height:100dvh}</style><body><probe-editor class="${fixture.id === 'inline' ? 'inline-panel-editor' : ''}" data-ui-theme="${theme}"></probe-editor></body></html>`);
    await page.evaluate(({ css, html }) => {
      document.querySelector('probe-editor').attachShadow({ mode: 'open' }).innerHTML = `<style>${css}.placeholder{min-height:78px;padding:16px;border-radius:var(--ui-radius);background:var(--ui-card);color:var(--ui-ink)}.property-settings p{overflow-wrap:anywhere;line-height:1.5}</style>${html}`;
    }, { css: css[fixture.kind], html: fixture.html(theme) });
    const errors = await page.evaluate(() => {
      const host = document.querySelector('probe-editor');
      const root = host.shadowRoot;
      const errors = [];
      const fail = (condition, message) => { if (!condition) errors.push(message); };
      const box = el => el.getBoundingClientRect();
      const inside = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
      fail(host.scrollWidth <= host.clientWidth + 1, 'page horizontal overflow');
      fail(matchMedia('(prefers-reduced-motion: reduce)').matches, 'reduced motion not enabled');
      const targets = [...root.querySelectorAll('button,input')];
      for (const target of targets) {
        fail(box(target).width >= 47.9 && box(target).height >= 47.9, `target <48: ${target.className || target.tagName}`);
        fail(inside(box(target), box(host)), `target outside page: ${target.className || target.tagName}`);
      }
      for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
        const a = box(targets[i]), b = box(targets[j]);
        fail(Math.min(a.right, b.right) - Math.max(a.left, b.left) < 0.5 || Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) < 0.5, 'targets overlap');
      }
      if (targets.length) {
        targets[0].focus();
        fail(root.activeElement === targets[0], 'keyboard target not focusable');
        fail(parseFloat(getComputedStyle(targets[0]).outlineWidth) >= 2, 'focus outline missing');
      }
      const canvas = root.querySelector('.canvas');
      if (canvas) fail(box(canvas).height >= 48, 'toolbar consumes the whole canvas');
      const property = root.querySelector('.property-settings');
      if (property) fail(inside(box(property), box(host)), 'property settings outside preview width');
      return errors;
    });
    assert.deepEqual(errors, [], `${fixture.id}/${theme}/${width}/${scale}`);
    count++;
  }
} finally { await browser.close(); }
console.log(`UI3 editor CSS fixtures passed: ${count} (not Angular/Ionic or native acceptance).`);
