// Presentation-only: actual room/menu SCSS and the installed Ionic runtime.
// Synthetic content is not Angular/App/native, account, ordering or save acceptance.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
const read = path => readFileSync(new URL(path, root), 'utf8');
const css = path => sass.compile(fileURLToPath(new URL(path, root)), { logger: sass.Logger.silent }).css.replaceAll('::ng-deep', '');
const base = 'src/app/sections/room/';
const pageCss = Object.fromEntries(['room-manager', 'room-edit'].map(name => [name, css(`${base}${name}/${name}.scss`)]));
const menuCss = ['menu-list/menu-list-items.scss', 'menu-list/menu-item/menu-item.scss']
  .map(path => css(`src/app/core/components/${path}`)).join('');
const globalCss = ['node_modules/@ionic/core/css/core.css', 'node_modules/@ionic/core/css/structure.css',
  'node_modules/@ionic/core/css/typography.css'].map(read).join('') + css('src/app/sections/_transparent-page-header.scss');
const themeCss = sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', {
  loadPaths: [fileURLToPath(new URL('src/theme/', root))],
}).css;
for (const name of ['room-manager', 'room-edit']) {
  const template = read(`${base}${name}/${name}.html`);
  for (const marker of ['control-page-header', 'class="text-action"', 'class="hint"', 'class="save-status" role="status"',
    'class="loading-state" role="status"', '[disabled]="saving" (click)="load()"']) {
    assert.ok(template.includes(marker), `Update ${name} fixture: ${marker}`);
  }
}
assert.ok(read(`${base}room-manager/room-manager.html`).includes('[height]="0"'), 'Projected menu must allow wrapping');
const longName = '客厅区域完整名称LongUnbrokenRoom012345678901234567890123456789';

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
  });

  for (const mode of ['ios', 'md']) for (const theme of ['natural', 'dark'])
    for (const width of [320, 844]) for (const scale of [1, 1.5])
      for (const name of ['room-manager', 'room-edit'])
        for (const state of name === 'room-manager' ? ['edit', 'busy', 'error', 'empty', 'loading'] : ['ready', 'busy', 'error', 'empty', 'loading']) {
          const safeTop = width === 844 ? 20 : 0, height = width === 844 ? 390 : 900;
          await page.setViewportSize({ width, height });
          await page.evaluate(({ mode, theme, scale, safeTop, name, state, pageCss, menuCss, globalCss, longName }) => {
            document.body.innerHTML = '';
            document.documentElement.dataset.uiTheme = theme;
            document.documentElement.style.cssText = `font-size:${16 * scale}px;--ion-safe-area-top:${safeTop}px;--ion-safe-area-bottom:20px;--ion-safe-area-left:0px;--ion-safe-area-right:0px`;
            const shell = document.createElement('room-probe'); document.body.append(shell);
            const manager = name === 'room-manager', busy = state === 'busy';
            const header = `<ion-header class="control-page-header ${manager ? 'manager-header' : ''}" mode="${mode}"><ion-toolbar mode="${mode}"><ion-buttons slot="start">${manager ? `<ion-back-button mode="${mode}" text="" default-href="/fixture"></ion-back-button>` : `<ion-button class="text-action" mode="${mode}" ${busy ? 'disabled' : ''}>取消</ion-button>`}</ion-buttons><ion-title mode="${mode}">${manager ? '区域管理' : '区域设置'}</ion-title><ion-buttons slot="end"><ion-button class="text-action" mode="${mode}" ${busy || state === 'loading' ? 'disabled' : ''}>${manager ? '完成' : busy ? '保存中…' : '保存'}</ion-button>${manager ? `<ion-button mode="${mode}" aria-label="新建区域" ${busy || state === 'loading' ? 'disabled' : ''}><i aria-hidden="true"></i></ion-button>` : ''}</ion-buttons></ion-toolbar></ion-header>`;
            const error = `<div class="error-message" role="alert"><span>读取区域失败，请稍后重试。${longName}</span><button ${busy ? 'disabled' : ''}>重新加载</button></div>`;
            const projected = `<app-menu-list class="manager-list"><div class="item-list-box ${state === 'edit' ? 'edit sort' : ''}"><app-menu-item><div class="item-box">${state === 'edit' ? '<div class="del-btn" style="height:auto"><i></i></div><div class="handle" style="height:auto"><i></i></div>' : ''}<div class="item ${busy ? 'disabled' : ''}" style="height:auto"><div class="content"><span class="entry-copy"><strong>${longName}</strong><small>99 台设备</small></span></div>${state === 'edit' ? '' : '<div class="arrow"><i></i></div>'}</div></div></app-menu-item></div></app-menu-list>`;
            const row = `<button class="device-row" ${busy ? 'disabled' : ''} aria-pressed="true"><b-device-img></b-device-img><span>${longName}</span><i aria-hidden="true"></i></button>`;
            const content = state === 'loading' ? '<p class="loading-state" role="status">正在读取区域…</p>' : manager
              ? state === 'empty' ? '<section class="empty-state"><p>还没有区域</p><button>新建区域</button></section>' : `<section class="manager-card" aria-busy="${busy}">${projected}</section>`
              : `<button class="name-row" ${busy ? 'disabled' : ''}><span>区域名称</span><strong>${longName}</strong><i></i></button><h2>设备 <small>99 台已选择</small></h2><section class="device-list" aria-busy="${busy}">${state === 'empty' ? '<p class="empty-state">暂无可添加的设备</p>' : row + row}</section>`;
            shell.attachShadow({ mode: 'open' }).innerHTML = `<style>${globalCss}${menuCss}${pageCss[name]}:host{display:block;position:relative;height:100vh}*{box-sizing:border-box}i::before{content:'•'}b-device-img{display:block}</style>${header}<ion-content fullscreen mode="${mode}"><main><p class="hint">按区域整理设备，修改仅在保存后生效。</p>${busy ? '<p class="save-status" role="status">正在保存区域设置…</p>' : ''}${state === 'error' ? error : ''}${content}</main></ion-content>`;
          }, { mode, theme, scale, safeTop, name, state, pageCss, menuCss, globalCss, longName });
          await page.waitForFunction(() => [...document.querySelector('room-probe').shadowRoot.querySelectorAll('ion-toolbar,ion-title,ion-content,ion-button,ion-back-button')]
            .every(element => element.classList.contains('hydrated')));
          const result = await page.evaluate(async () => {
            const shell = document.querySelector('room-probe'), root = shell.shadowRoot;
            const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
            const scroll = await root.querySelector('ion-content').getScrollElement(), main = root.querySelector('main');
            const focused = [];
            for (const button of root.querySelectorAll('button:not([disabled])')) {
              button.focus(); focused.push({ visible: button.matches(':focus-visible'), outline: getComputedStyle(button).outlineWidth, transition: getComputedStyle(button).transitionDuration });
            }
            for (const button of root.querySelectorAll('ion-buttons > *')) {
              if (button.disabled) continue;
              const native = button.shadowRoot.querySelector('button,a'); native.focus();
              focused.push({ visible: native.matches(':focus-visible'), outline: getComputedStyle(native).outlineWidth });
            }
            // Keyboard focus can legitimately scroll a long list. Measure the
            // initial header/content relationship at its original scroll origin.
            scroll.scrollTop = 0;
            return {
              background: getComputedStyle(shell).backgroundColor,
              targets: [...root.querySelectorAll('button,.item,.del-btn,.handle')].map(box),
              headerTargets: [...root.querySelectorAll('ion-buttons > *')].map(box),
              headerText: [...root.querySelectorAll('ion-buttons ion-button.text-action')].map(button => {
                const native = button.shadowRoot.querySelector('button,a');
                const inner = button.shadowRoot.querySelector('.button-inner');
                const range = document.createRange(); range.selectNodeContents(button);
                const text = range.getBoundingClientRect();
                return { text: button.textContent.trim(), native: box(native), inner: box(inner),
                  ink: { x: text.x, right: text.right, y: text.y, bottom: text.bottom },
                  scrollWidth: inner.scrollWidth, clientWidth: inner.clientWidth,
                  scrollHeight: inner.scrollHeight, clientHeight: inner.clientHeight };
              }),
              text: [...root.querySelectorAll('.hint,.save-status,.loading-state,.error-message,.error-message > span,.empty-state,.entry-copy,.name-row > strong,.device-row > span')].map(box),
              title: box(root.querySelector('ion-title')), first: box(main.children[0]),
              scrollWidth: scroll.scrollWidth, scrollClient: scroll.clientWidth,
              bottomPadding: parseFloat(getComputedStyle(main).paddingBottom),
              focused,
            };
          });
          const label = `${mode}/${theme}/${width}/${scale}/${name}/${state}`;
          assert.equal(result.background, theme === 'natural' ? 'rgb(242, 243, 245)' : 'rgb(17, 18, 21)', `${label}: semantic palette`);
          for (const target of [...result.targets, ...result.headerTargets]) {
            assert.ok(target.w >= 47.9 && target.h >= 47.9, `${label}: target below48 ${JSON.stringify(target)}`);
            assert.ok(target.x >= -.5 && target.right <= width + .5, `${label}: target overflow ${JSON.stringify(target)}`);
          }
          for (const text of result.text) assert.ok(text.x >= -.5 && text.right <= width + .5, `${label}: long text overflow`);
          for (let i = 0; i < result.targets.length; i++) for (let j = i + 1; j < result.targets.length; j++) {
            const a = result.targets[i], b = result.targets[j];
            assert.ok(Math.min(a.right, b.right) - Math.max(a.x, b.x) <= 1
              || Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) <= 1, `${label}: targets overlap`);
          }
          assert.ok(result.scrollWidth <= result.scrollClient + 1, `${label}: content horizontal overflow`);
          assert.ok(result.bottomPadding >= 51.9, `${label}: bottom safe area`);
          assert.ok(result.title.x >= result.headerTargets[0].right - .5, `${label}: title/start overlap`);
          assert.ok(result.title.right <= result.headerTargets[1].x + .5, `${label}: title/end overlap`);
          for (const text of result.headerText) {
            assert.ok(text.scrollWidth <= text.clientWidth + 1 && text.scrollHeight <= text.clientHeight + 1,
              `${label}/${text.text}: header text clipped inside Ionic button ${JSON.stringify(text)}`);
            assert.ok(text.ink.x >= text.native.x - .5 && text.ink.right <= text.native.right + .5
              && text.ink.y >= text.native.y - .5 && text.ink.bottom <= text.native.bottom + .5,
            `${label}/${text.text}: header glyph bounds outside native target`);
          }
          assert.ok(result.headerTargets.every(target => target.y >= safeTop - .5 && target.bottom <= height + .5), `${label}: header safe area`);
          assert.ok(result.first.y >= result.headerTargets[0].bottom - .5, `${label}: content beneath header`);
          for (const focus of result.focused) {
            assert.equal(focus.visible, true, `${label}: keyboard focus`);
            assert.ok(parseFloat(focus.outline) >= 2, `${label}: focus ring`);
            if (focus.transition) assert.equal(focus.transition, '0s', `${label}: reduced motion`);
          }
          count++;
        }
  console.log(`Room presentation fixture: ${count} cases passed (synthetic, not Angular/App/native/save acceptance).`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
