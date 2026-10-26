// Presentation-only fixture: actual page/grid SCSS and installed Ionic runtime.
// Synthetic content, not Angular/App/native, account, persistence or device acceptance.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
const read = path => readFileSync(new URL(path, root), 'utf8');
const css = path => sass.compile(fileURLToPath(new URL(path, root)), { logger: sass.Logger.silent }).css;
const pagePath = 'src/app/sections/device/device-components/device-components.page';
const pageCss = css(`${pagePath}.scss`), gridCss = css('src/app/device/v2/panel/page-layout-panel.scss');
const globalCss = ['node_modules/@ionic/core/css/core.css', 'node_modules/@ionic/core/css/structure.css',
  'node_modules/@ionic/core/css/typography.css'].map(read).join('') + css('src/app/sections/_transparent-page-header.scss');
const themeCss = sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', {
  loadPaths: [fileURLToPath(new URL('src/theme/', root))],
}).css;
const template = read(`${pagePath}.html`);
for (const marker of ['class="control-page-header"', 'class="retry"', 'class="style"', 'class="empty" role="status"',
  'class="component-style-modal"', 'class="text-action"', 'class="save-status"', 'class="validation-hint"',
  'class="editor-preview"', '[attr.data-ui-theme]="theme"']) assert.ok(template.includes(marker), `Update fixture: ${marker}`);
const longText = '客厅设备完整字段名称 LongUnbrokenField012345678901234567890123456789';

// Only the locally installed runtime is served; external URLs and workspace files are unavailable.
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><body></body></html>'); return; }
  if (!/^\/ionic\/[a-zA-Z0-9_./-]+\.(js|svg)$/.test(path) || path.includes('..')) { response.writeHead(404).end(); return; }
  try {
    response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'image/svg+xml');
    response.end(readFileSync(new URL(`node_modules/@ionic/core/${path.slice(7)}`, root)));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, count = 0;
const geometryBySize = new Map();
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
  await page.goto(origin);
  await page.addStyleTag({ content: `${themeCss}body{margin:0;font-family:system-ui}` });
  await page.evaluate(async () => {
    const { defineCustomElements } = await import('/ionic/loader/index.es2017.js');
    await defineCustomElements(window);
    customElements.define('probe-options', class extends HTMLElement {});
  });

  async function render({ mode, outerTheme, width, scale, state, previewTheme }) {
    const safeTop = width === 844 ? 20 : 0, height = width === 844 ? 390 : 900;
    await page.setViewportSize({ width, height });
    await page.evaluate(async ({ mode, outerTheme, scale, safeTop, state, previewTheme, globalCss, pageCss, gridCss, longText }) => {
      const previous = document.querySelector('ion-modal');
      if (previous) await previous.dismiss();
      document.body.innerHTML = '';
      document.documentElement.dataset.uiTheme = outerTheme;
      document.documentElement.style.cssText = `font-size:${16 * scale}px;--ion-safe-area-top:${safeTop}px;--ion-safe-area-bottom:20px;--ion-safe-area-left:0px;--ion-safe-area-right:0px`;
      const shell = document.createElement('probe-page');
      document.body.append(shell);
      const header = modal => `<ion-header class="control-page-header" mode="${mode}"><ion-toolbar mode="${mode}"><ion-buttons slot="start">${modal ? `<ion-button class="text-action" mode="${mode}" ${state === 'saving' ? 'disabled' : ''}>取消</ion-button>` : `<ion-back-button mode="${mode}" text="" default-href="/fixture"></ion-back-button>`}</ion-buttons><ion-title mode="${mode}">${modal ? '组件样式' : '组件配置中心'}</ion-title>${modal ? `<ion-buttons slot="end"><ion-button class="text-action" mode="${mode}" disabled>${state === 'saving' ? '保存中…' : '保存'}</ion-button></ion-buttons>` : ''}</ion-toolbar></ion-header>`;
      const error = `<div class="error" role="alert"><span>读取配置失败，请保留草稿后重试。${longText}</span><button type="button" class="retry">重新读取</button></div>`;
      const row = `<div class="row"><ion-toggle mode="${mode}" justify="space-between" ${state === 'saving' ? 'disabled' : ''}>${longText}</ion-toggle><button type="button" class="style" ${state === 'saving' ? 'disabled' : ''}>样式</button></div>`;
      shell.attachShadow({ mode: 'open' }).innerHTML = `<style>${globalCss}${pageCss}:host{display:block;position:relative;height:100vh}*{box-sizing:border-box}</style>${header(false)}<ion-content fullscreen mode="${mode}"><main><p class="hint">选择显示字段，隐藏不会影响设备运行。</p>${state === 'loading' ? '<div class="empty" role="status"><ion-spinner name="crescent" aria-hidden="true"></ion-spinner><span>正在读取组件配置…</span></div>' : `${state === 'error' ? error : '<p class="save-status" role="status">正在保存组件显示设置…</p>'}<section class="components" aria-busy="${state === 'saving'}">${row}</section>`}</main></ion-content>`;
      if (previewTheme) {
        const style = document.createElement('style');
        style.textContent = `${globalCss}${pageCss}*{box-sizing:border-box}`;
        document.body.append(style);
        const modal = document.createElement('ion-modal');
        modal.className = 'component-style-modal'; modal.mode = mode;
        modal.component = 'probe-options'; modal.animated = false; modal.backdropDismiss = false;
        document.body.append(modal); await modal.present();
        modal.querySelector('probe-options').innerHTML = `${header(true)}<ion-content mode="${mode}"><div class="editor" data-ui-theme="${previewTheme}" aria-busy="${state === 'saving'}"><probe-grid class="editor-preview"></probe-grid><p class="hint">保存部件与当前页面布局；预览不下发设备命令。</p><p class="${state === 'saving' ? 'save-status' : 'error'}" role="${state === 'saving' ? 'status' : 'alert'}">${state === 'saving' ? '正在保存部件与页面布局…' : `样式尚未保存，请保留当前草稿。${longText}`}</p>${state === 'saving' ? '' : '<p class="validation-hint" role="status">请先修正标出的属性，再保存。</p>'}</div></ion-content>`;
        const grid = modal.querySelector('probe-grid');
        grid.attachShadow({ mode: 'open' }).innerHTML = `<style>${gridCss}*{box-sizing:border-box}.preset-preview{box-sizing:border-box;background:var(--ui-card);color:var(--ui-ink);border-radius:var(--ui-radius);font-family:var(--ui-font)}</style><section class="panel" inert><div class="cell" style="--col:1;--span:2;--row:1;--rows:2"><div class="preset-preview">2×2 合成预览</div></div></section>`;
      }
    }, { mode, outerTheme, scale, safeTop, state, previewTheme, globalCss, pageCss, gridCss, longText });
    await page.waitForFunction(() => {
      const root = document.querySelector('ion-modal')?.querySelector('probe-options') ?? document.querySelector('probe-page').shadowRoot;
      return [...root.querySelectorAll('ion-toolbar,ion-title,ion-content,ion-toggle,ion-button,ion-back-button,ion-spinner')]
        .every(element => element.classList.contains('hydrated'));
    });
    return { safeTop, height };
  }

  for (const mode of ['ios', 'md']) for (const outerTheme of ['natural', 'dark'])
    for (const width of [320, 844]) for (const scale of [1, 1.5]) {
      for (const previewTheme of [undefined, 'natural', 'dark', 'electronic'])
        for (const state of previewTheme ? [scale === 1 ? 'invalid' : 'saving'] : ['error', 'loading', 'saving']) {
          const { safeTop, height } = await render({ mode, outerTheme, width, scale, state, previewTheme });
          const result = await page.evaluate(async () => {
            const modal = document.querySelector('ion-modal');
            const shell = document.querySelector('probe-page'), root = modal?.querySelector('probe-options') ?? shell.shadowRoot;
            const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
            const content = root.querySelector('ion-content'), container = root.querySelector('.editor') ?? root.querySelector('main');
            const scroll = await content.getScrollElement();
            const focus = [];
            for (const target of root.querySelectorAll('button:not([disabled]),ion-toggle:not([disabled])')) {
              target.focus();
              focus.push({ name: target.className, visible: target.matches(':focus-visible'),
                outline: getComputedStyle(target).outlineWidth, transition: getComputedStyle(target).transitionDuration });
            }
            for (const target of root.querySelectorAll('ion-buttons > *')) {
              if (target.disabled) continue;
              const native = target.shadowRoot.querySelector('button,a');
              native.focus();
              focus.push({ name: target.tagName, visible: native.matches(':focus-visible'),
                outline: getComputedStyle(native).outlineWidth });
            }
            const gridRoot = root.querySelector('probe-grid')?.shadowRoot;
            return {
              background: getComputedStyle(modal?.shadowRoot.querySelector('.modal-wrapper') ?? shell).backgroundColor,
              first: box(container.children[0]), title: box(root.querySelector('ion-title')),
              headerTargets: [...root.querySelectorAll('ion-buttons > *')].map(box),
              targets: [...root.querySelectorAll('button,ion-toggle')].map(box),
              text: [...root.querySelectorAll('.hint,.save-status,.validation-hint,.empty,.error,.error > span')].map(box),
              labelOverflow: root.querySelector('ion-toggle') ? (() => {
                const label = root.querySelector('ion-toggle').shadowRoot.querySelector('[part="label"]');
                if (!label) throw new Error('Installed Ionic label part missing: update the fixture');
                return label.scrollWidth > label.clientWidth + 1;
              })() : false,
              scrollWidth: scroll.scrollWidth, scrollClient: scroll.clientWidth,
              bottomPadding: parseFloat(getComputedStyle(container).paddingBottom),
              focus,
              grid: gridRoot ? { panel: box(gridRoot.querySelector('.panel')), card: box(gridRoot.querySelector('.preset-preview')),
                theme: getComputedStyle(container).getPropertyValue('--ui-bg').trim(), inert: gridRoot.querySelector('.panel').inert } : null,
              savedDisabled: modal ? root.querySelector('ion-buttons[slot="end"] ion-button').disabled : undefined,
              cancelDisabled: modal ? root.querySelector('ion-buttons[slot="start"] ion-button').disabled : undefined,
            };
          });
          const label = `${mode}/${outerTheme}/${width}/${scale}/${previewTheme ?? 'page'}/${state}`;
          assert.equal(result.background, outerTheme === 'natural' ? 'rgb(242, 243, 245)' : 'rgb(17, 18, 21)', `${label}: actual portal/page palette`);
          for (const target of [...result.targets, ...result.headerTargets]) {
            assert.ok(target.w >= 47.9 && target.h >= 47.9, `${label}: target below48 ${JSON.stringify(target)}`);
            assert.ok(target.x >= -.5 && target.right <= width + .5, `${label}: target overflow`);
          }
          for (const text of result.text) assert.ok(text.x >= -.5 && text.right <= width + .5, `${label}: long text overflow`);
          for (let i = 0; i < result.targets.length; i++) for (let j = i + 1; j < result.targets.length; j++) {
            const a = result.targets[i], b = result.targets[j];
            assert.ok(Math.min(a.right, b.right) - Math.max(a.x, b.x) <= 1
              || Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) <= 1, `${label}: target overlap`);
          }
          assert.ok(!result.labelOverflow, `${label}: Ionic field label overflow`);
          assert.ok(result.scrollWidth <= result.scrollClient + 1, `${label}: content horizontal overflow`);
          assert.ok(result.bottomPadding >= (previewTheme ? 43.9 : 51.9), `${label}: bottom safe area`);
          assert.ok(result.title.x >= result.headerTargets[0].right - .5, `${label}: title overlaps start action`);
          if (previewTheme) assert.ok(result.title.right <= result.headerTargets[1].x + .5, `${label}: title overlaps save`);
          assert.ok(result.headerTargets.every(target => target.y >= safeTop - .5 && target.bottom <= height + .5), `${label}: header safe area`);
          assert.ok(result.first.y >= result.headerTargets[0].bottom - .5, `${label}: content beneath header`);
          for (const focus of result.focus) {
            assert.equal(focus.visible, true, `${label}/${focus.name}: keyboard focus`);
            assert.ok(parseFloat(focus.outline) >= 2, `${label}/${focus.name}: visible focus ring`);
            if (focus.transition) assert.equal(focus.transition, '0s', `${label}/${focus.name}: reduced motion`);
          }
          if (previewTheme) {
            assert.equal(result.savedDisabled, true, `${label}: invalid/busy save disabled`);
            assert.equal(result.cancelDisabled, state === 'saving', `${label}: busy cancel contract`);
            assert.equal(result.grid.theme, { natural: '#f2f3f5', dark: '#0c0d0f', electronic: '#070809' }[previewTheme], `${label}: original widget tokens`);
            assert.equal(result.grid.inert, true, `${label}: read-only preview`);
            assert.ok(Math.abs(result.grid.card.w - result.grid.card.h) <= 1, `${label}: 2x2 square`);
            const key = `${mode}/${width}/${scale}`, geometry = [result.grid.panel.w, result.grid.card.w, result.grid.card.h];
            if (geometryBySize.has(key)) assert.deepEqual(geometry, geometryBySize.get(key), `${label}: outer/preview theme must not alter grid geometry`);
            else geometryBySize.set(key, geometry);
          }
          count++;
        }
    }
  console.log(`Device-components presentation fixture: ${count} cases passed (synthetic, not Angular/App/native/device acceptance).`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
