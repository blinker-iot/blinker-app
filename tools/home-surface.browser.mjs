// Actual homepage SCSS + installed Ionic; synthetic inventory only.
// Does not load Angular, accounts, saved layouts, device connections or commands.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
const read = path => readFileSync(new URL(path, root), 'utf8');
const css = path => sass.compile(fileURLToPath(new URL(path, root)), { logger: sass.Logger.silent }).css;
function block(source, marker) {
  const begin = source.indexOf(marker); assert.ok(begin >= 0, marker);
  let end = source.indexOf('{', begin), level = 1;
  while (level && ++end < source.length) { if (source[end] === '{') level++; if (source[end] === '}') level--; }
  assert.equal(level, 0); return source.slice(begin, end + 1);
}
const baseCss = ['core', 'structure', 'typography'].map(name => read(`node_modules/@ionic/core/css/${name}.css`)).join('');
const headerCss = sass.compileString(block(read('src/global.scss'), 'ion-header.main-tab-header {')).css
  + css('src/app/home/components/_tab-scroll-mask.scss');
const styles = {
  home: css('src/app/home/home.page.scss'), tab: css('src/app/home/components/tab-device/tab-device.scss'),
  rooms: css('src/app/home/components/room-list/room-list.scss'), card: css('src/app/home/components/deviceblock/deviceblock.scss'),
  list: css('src/app/home/components/deviceblock-list/deviceblock-list.scss'),
};
const dictionary = JSON.parse(read('public/i18n/zh_cn/zh_cn.json'));
const navigation = read('src/app/home/home.page.html')
  .replace(/{{\s*'NAVIGATION\.([A-Z]+)'\s*\|\s*translate\s*}}/g, (_, key) => dictionary.NAVIGATION[key]);
assert.equal((navigation.match(/ion-tab-button tab=/g) || []).length, 4);
const screenshots = process.env.HOME_SCREENSHOT_DIR;
if (screenshots) { assert.ok(isAbsolute(screenshots)); mkdirSync(screenshots, { recursive: true }); }
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><body></body></html>'); return; }
  if (!/^\/ionic\/[\w./-]+\.(js|svg)$/.test(path) || path.includes('..')) { response.writeHead(404).end(); return; }
  try { response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'image/svg+xml'); response.end(readFileSync(new URL(`node_modules/@ionic/core/${path.slice(7)}`, root))); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
let count = 0;
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
  await page.goto(origin);
  await page.addStyleTag({ content: 'body{margin:0}probe-home{display:block;position:relative;height:100vh}' });
  await page.evaluate(async () => { const { defineCustomElements } = await import('/ionic/loader/index.es2017.js'); await defineCustomElements(window); });
  for (const mode of ['ios', 'md']) for (const theme of ['light', 'dark'])
    for (const width of [320, 375, 430, 844]) for (const scale of [1, 1.5]) for (const state of ['list', 'edit', 'empty']) {
      const height = width === 844 ? 390 : 820, safeTop = width === 844 ? 0 : 20, safeBottom = 20;
      await page.setViewportSize({ width, height });
      await page.evaluate(({ mode, theme, scale, state, styles, baseCss, headerCss, navigation, safeTop, safeBottom }) => {
        document.documentElement.style.cssText = `font-size:${16 * scale}px;color-scheme:${theme};--ion-safe-area-top:${safeTop}px;--ion-safe-area-bottom:${safeBottom}px;--ion-safe-area-left:0px;--ion-safe-area-right:0px`;
        document.body.innerHTML = '<probe-home></probe-home>';
        const home = document.querySelector('probe-home');
        home.attachShadow({ mode: 'open' }).innerHTML = `<style>${baseCss}${styles.home}*{box-sizing:border-box}</style>${navigation}`;
        const tabs = home.shadowRoot.querySelector('ion-tabs'), tab = document.createElement('ion-tab');
        tab.tab = 'device'; tab.active = true; tabs.prepend(tab);
        const host = document.createElement('probe-device'); tab.append(host);
        host.className = state === 'edit' ? 'card-editing' : '';
        const actions = state === 'edit' ? '<ion-buttons class="card-editor-actions" slot="start"><ion-button class="header-action card-editor-action" aria-label="取消编辑">×</ion-button></ion-buttons><ion-buttons class="card-editor-actions" slot="end"><ion-button class="header-action card-editor-action" aria-label="保存卡片">✓</ion-button></ion-buttons>' : '<ion-title>设备</ion-title><ion-buttons slot="end"><ion-button class="header-action" aria-label="消息通知">◦</ion-button><ion-button class="header-action" aria-label="添加设备">+</ion-button></ion-buttons>';
        host.attachShadow({ mode: 'open' }).innerHTML = `<style>${baseCss}${headerCss}${styles.tab}:host{display:block;position:relative;height:100%}*{box-sizing:border-box}</style><ion-header class="main-tab-header home-tab-header"><ion-toolbar>${actions}</ion-toolbar></ion-header><ion-content fullscreen><div slot="fixed" class="top-scroll-mask" aria-hidden="true"></div><div slot="fixed" class="room-list-fixed" ${state === 'edit' ? 'hidden' : ''}><probe-rooms></probe-rooms></div><div class="device-page">${state === 'empty' ? '<div class="empty-devices"><div class="empty-icon" aria-hidden="true">⌂</div><h2>还没有设备</h2><p>添加设备，开始连接你的智能生活。</p><button type="button">添加设备</button></div>' : '<div class="device-zone"><probe-list></probe-list></div>'}</div></ion-content>`;
        const rooms = host.shadowRoot.querySelector('probe-rooms');
        rooms.attachShadow({ mode: 'open' }).innerHTML = `<style>${styles.rooms}*{box-sizing:border-box}</style><div class="room-filter"><div class="room-scroll" role="group" aria-label="设备区域">${['全部', '客厅', '卧室', '工作台长区域名称'].map((name, i) => `<button class="room-chip${i ? '' : ' selected'}" aria-pressed="${!i}">${name}</button>`).join('')}</div></div>`;
        const list = host.shadowRoot.querySelector('probe-list');
        if (list) {
          list.attachShadow({ mode: 'open' }).innerHTML = `<style>${styles.list}:host{flex:1;min-width:0}*{box-sizing:border-box}</style><div class="device-list">${Array.from({ length: 7 }, (_, i) => `<probe-card class="deviceblock${i === 2 ? ' wide-device' : ''}" data-wide="${i === 2}"></probe-card>`).join('')}<div class="device-count">6 台设备 · 静态示意</div></div>`;
          for (const card of list.shadowRoot.querySelectorAll('probe-card')) card.attachShadow({ mode: 'open' }).innerHTML = `<style>${styles.card}*{box-sizing:border-box}.device-visual{font-size:40px} .device-metric-visual{font-size:13px}</style><article class="device-card${card.dataset.wide === 'true' ? ' wide' : ''}"><header class="device-heading"><div class="device-name"><span class="device-name-text">客厅环境设备长名称</span></div><span class="device-status" aria-label="云端已同步">◦</span></header><div class="device-visual" aria-hidden="true">♧</div><footer class="device-metrics"><span class="device-metric"><span class="device-metric-visual"><strong>24.6</strong><small>°C</small></span></span><span class="device-metric"><span class="device-metric-visual"><strong>56</strong><small>%</small></span></span></footer></article>`;
        }
        for (const current of [home.shadowRoot, host.shadowRoot]) for (const element of current.querySelectorAll('ion-header,ion-toolbar,ion-title,ion-buttons,ion-button,ion-content,ion-tab-bar,ion-tab-button')) element.setAttribute('mode', mode);
        home.shadowRoot.querySelector('ion-tab-bar').selectedTab = 'device';
      }, { mode, theme, scale, state, styles, baseCss, headerCss, navigation, safeTop, safeBottom });
      await page.waitForFunction(() => {
        const home = document.querySelector('probe-home').shadowRoot, tab = home.querySelector('probe-device').shadowRoot;
        return [...home.querySelectorAll('ion-tabs,ion-tab-bar,ion-tab-button'), ...tab.querySelectorAll('ion-toolbar,ion-content,ion-button')].every(element => element.classList.contains('hydrated'));
      });
      const result = await page.evaluate(async () => {
        const home = document.querySelector('probe-home'), root = home.shadowRoot, device = root.querySelector('probe-device'), tab = device.shadowRoot;
        const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
        const bar = root.querySelector('ion-tab-bar'), rooms = tab.querySelector('probe-rooms').shadowRoot;
        const list = tab.querySelector('probe-list'), cards = list ? [...list.shadowRoot.querySelectorAll('probe-card')].map(card => {
          const inner = card.shadowRoot; return { wide: card.dataset.wide === 'true', card: rect(inner.querySelector('article')), image: rect(inner.querySelector('.device-visual')), metrics: rect(inner.querySelector('.device-metrics')) };
        }) : [];
        const scroll = await tab.querySelector('ion-content').getScrollElement(); scroll.scrollTop = scroll.scrollHeight;
        await new Promise(resolve => requestAnimationFrame(resolve));
        return { background: getComputedStyle(device).getPropertyValue('--blinker-bg').trim(), surface: getComputedStyle(device).getPropertyValue('--blinker-surface').trim(),
          color: getComputedStyle(tab.querySelector('.device-page')).backgroundColor, bar: rect(bar), barStyle: { box: getComputedStyle(bar).boxSizing, height: getComputedStyle(bar).height, padding: getComputedStyle(bar).padding, border: getComputedStyle(bar).borderWidth, flex: getComputedStyle(bar).flex }, radius: getComputedStyle(bar).borderRadius,
          tabs: [...root.querySelectorAll('ion-tab-button')].map(rect), actions: [...tab.querySelectorAll('ion-button')].map(rect),
          roomTargets: [...rooms.querySelectorAll('button')].map(rect), roomHeight: rect(rooms.querySelector('.room-scroll')).h,
          selectedBorder: getComputedStyle(rooms.querySelector('.selected')).borderBottomStyle,
          roomBottom: rect(tab.querySelector('.room-list-fixed')).bottom, firstTop: cards[0]?.card.y,
          cards, scrollWidth: scroll.scrollWidth, viewportWidth: scroll.clientWidth,
          last: list ? rect(list.shadowRoot.querySelector('.device-count')) : null,
          emptyButton: tab.querySelector('.empty-devices > button') ? rect(tab.querySelector('.empty-devices > button')) : null,
        };
      });
      const label = `${mode}/${theme}/${width}/${scale}/${state}`;
      assert.equal(result.color, theme === 'light' ? 'rgb(242, 243, 245)' : 'rgb(17, 18, 21)', `${label}: neutral page`);
      assert.equal(result.bar.h, 64, `${label}: navigation height ${JSON.stringify(result.barStyle)}`); assert.equal(result.radius, '25px', label);
      assert.equal(result.tabs.length, 4, label);
      for (const target of [...result.tabs, ...result.actions]) {
        const minimum = state === 'edit' && result.actions.some(action => action.x === target.x && action.y === target.y) ? 44 : 48;
        assert.ok(target.w >= minimum - .1 && target.h >= minimum - .1, `${label}: target ${JSON.stringify(target)}`);
        assert.ok(target.x >= -.5 && target.right <= width + .5, `${label}: target overflow`);
      }
      assert.ok(result.scrollWidth <= result.viewportWidth + 1, `${label}: page overflow`);
      assert.equal(result.selectedBorder, 'solid', label);
      if (state !== 'edit') assert.ok(result.roomHeight >= 44, label);
      if (state === 'list') assert.ok(result.firstTop >= result.roomBottom - .5, `${label}: region overlaps first card`);
      if (result.last) assert.ok(result.last.bottom <= result.bar.y + .5, `${label}: final content hidden by navigation`);
      if (result.emptyButton) assert.ok(result.emptyButton.h >= 48 && result.emptyButton.w >= 48, label);
      for (const card of result.cards) {
        assert.ok(card.card.h <= card.card.w + .5, `${label}: card grew taller than square`);
        assert.ok(Math.abs(card.card.h - result.cards[0].card.h) < .5, `${label}: wide and standard card heights diverged`);
        assert.ok(Math.abs(card.image.x - card.card.x - 15) < .5, `${label}: image anchor (14px + original 1px border) changed`);
        assert.ok(Math.abs(card.image.w - result.cards[0].image.w) < .5, `${label}: image size diverged`);
        assert.ok(card.metrics.bottom <= card.card.bottom - 7.5, `${label}: single-row footer left card`);
      }
      if (screenshots && mode === 'ios' && width === 375 && scale === 1 && state === 'list') {
        await page.evaluate(async () => { const scroll = await document.querySelector('probe-home').shadowRoot.querySelector('probe-device').shadowRoot.querySelector('ion-content').getScrollElement(); scroll.scrollTop = 0; await new Promise(resolve => requestAnimationFrame(resolve)); });
        await page.screenshot({ path: join(screenshots, `home-${theme}.png`), fullPage: false });
      }
      count++;
    }
  console.log(`Homepage presentation checks: ${count}/${count} passed (SCSS + Ionic synthetic fixtures; no native/business claim).`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
