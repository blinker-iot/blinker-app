// §18 presentation-only regression: real page/header SCSS + installed Ionic.
// The local DOM and all text are fabricated. This does not boot Angular, load
// accounts/APIs/devices, or prove native font scaling, routing or business flows.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const read = path => readFileSync(new URL(path, root), 'utf8');
const compile = path => sass.compile(fileURLToPath(new URL(path, root)), { logger: sass.Logger.silent }).css;
function block(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `Missing real stylesheet block: ${marker}`);
  let end = source.indexOf('{', start), depth = 1;
  while (depth && ++end < source.length) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  assert.equal(depth, 0, `Unbalanced stylesheet block: ${marker}`);
  return source.slice(start, end + 1);
}
for (const key of ['WIDGET_BROWSER_DRIVER', 'WIDGET_BROWSER_EXECUTABLE']) {
  if (process.env[key]) assert.ok(isAbsolute(process.env[key]), `${key} must be absolute`);
}
const { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
const suite = process.env.HOME_TABS_UI_SUITE || 'all';
assert.ok(['all', 'tabs', 'nav-corners'].includes(suite), 'HOME_TABS_UI_SUITE must be all, tabs or nav-corners');
const paths = Object.fromEntries(['device', 'community', 'tools', 'profile']
  .map(kind => [kind, `src/app/home/components/tab-${kind}/tab-${kind}`]));
const styles = Object.fromEntries(Object.entries(paths).map(([kind, path]) => [kind, compile(`${path}.scss`)]));
const headerCss = sass.compileString(block(read('src/global.scss'), 'ion-header.main-tab-header {')).css;
const maskCss = compile('src/app/home/components/_tab-scroll-mask.scss');
const homeCss = compile('src/app/home/home.page.scss');
const menuCss = compile('src/app/core/components/menu-list/menu-list.scss');
const roomsCss = compile('src/app/home/components/room-list/room-list.scss');
const loginCss = compile('src/app/sections/login/login.scss');
const baseCss = ['core', 'normalize', 'structure', 'typography'].map(name => read(`node_modules/@ionic/core/css/${name}.css`)).join('');
const themeCss = sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', {
  loadPaths: [fileURLToPath(new URL('src/theme/', root))],
}).css;
const dictionary = JSON.parse(read('public/i18n/zh_cn/zh_cn.json'));
const navigation = read('src/app/home/home.page.html')
  .replace(/{{\s*'NAVIGATION\.([A-Z]+)'\s*\|\s*translate\s*}}/g, (_, key) => dictionary.NAVIGATION[key]);
const headerClasses = Object.fromEntries(Object.entries(paths).map(([kind, path]) => {
  const template = read(`${path}.html`), classes = template.match(/<ion-header\b[^>]*\bclass="([^"]+)"/s)?.[1];
  assert.ok(classes?.split(/\s+/).includes('home-tab-header'), `${kind}: update opt-in header fixture`);
  assert.ok(template.includes('top-scroll-mask'), `${kind}: update scroll-mask fixture`);
  return [kind, classes];
}));
for (const marker of ['category-tabs', 'inspiration-grid', 'story-card', 'story-copy', 'product-list', 'product-card', 'product-copy', 'community-search-field', 'search-visible']) {
  assert.ok(read(`${paths.community}.html`).includes(marker), `community: update ${marker} fixture`);
}
for (const marker of ['tool-section', 'appearance="settings"']) assert.ok(read(`${paths.tools}.html`).includes(marker), `tools: update ${marker} fixture`);
for (const marker of ['account-card', 'account-entitlements', 'profile-menu-group', 'profile-version']) assert.ok(read(`${paths.profile}.html`).includes(marker), `profile: update ${marker} fixture`);
const loginTemplate = read('src/app/sections/login/login.html');
assert.match(loginTemplate, /<ion-header class="main-tab-header">/);
assert.doesNotMatch(loginTemplate, /home-tab-header/);
assert.equal((navigation.match(/ion-tab-button tab=/g) || []).length, 4);

// An opt-in directory is outside the repository. A unique run directory prevents
// overwriting earlier screenshots, and no output is created without this env var.
let screenshotDir;
if (process.env.HOME_TABS_SCREENSHOT_DIR) {
  const destination = process.env.HOME_TABS_SCREENSHOT_DIR;
  assert.ok(isAbsolute(destination), 'HOME_TABS_SCREENSHOT_DIR must be an absolute private path');
  const inside = relative(fileURLToPath(root), resolve(destination));
  assert.ok(inside.startsWith(`..${sep}`) || isAbsolute(inside), 'Screenshots must stay outside the repository');
  mkdirSync(destination, { recursive: true });
  screenshotDir = mkdtempSync(join(destination, 'home-tabs-'));
}

const glyph = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4"/><path d="M8 12h8M12 8v8"/></svg>';
const longToken = 'LongUnbrokenLocalPreview012345678901234567890123456789';
const longName = `本地静态长名称与多语言内容 ${longToken}`;
const title = text => `<ion-title><span class="fixture-title-copy">${text}<span data-baseline style="display:inline-block;width:0;height:0;vertical-align:baseline"></span></span></ion-title>`;
const action = label => `<ion-button class="header-action" aria-label="${label}"><i aria-hidden="true">${glyph}</i></ion-button>`;
function header(kind, search) {
  const text = kind === 'profile' ? dictionary.PROFILE.TITLE : dictionary.NAVIGATION[kind.toUpperCase()];
  const actions = kind === 'tools' ? '' : `<ion-buttons slot="end">${action(kind === 'community' ? '搜索本地示意内容' : '本地示意操作')}${kind === 'device' || kind === 'profile' ? action('另一项本地操作') : ''}</ion-buttons>`;
  const categories = kind === 'community' ? `<div id="community-search-field">${search ? `<div class="search-field"><i aria-hidden="true">${glyph}</i><input type="search" aria-label="搜索本地示意内容" placeholder="搜索本地静态内容"/></div>` : ''}</div><div class="category-tabs" role="group" aria-label="内容分类">${['推荐', '灵感', '产品', '技巧', '很长的分类标签'].map((text, i) => `<button type="button" class="${i ? '' : 'active'}" aria-pressed="${!i}">${text}</button>`).join('')}</div>` : '';
  return `<ion-header class="${headerClasses[kind]}${search && kind === 'community' ? ' search-visible' : ''}"><ion-toolbar>${title(text)}${actions}</ion-toolbar>${categories}</ion-header>`;
}
const menu = entries => `<div class="menu-list menu-list--settings" role="group">${entries.map(([name, description]) => `<button type="button" class="menu-row"><span class="menu-icon" aria-hidden="true"><i>${glyph}</i></span><span class="menu-copy"><span class="menu-title">${name}</span>${description ? `<span class="menu-description">${description}</span>` : ''}</span><i class="menu-arrow" aria-hidden="true">${glyph}</i></button>`).join('')}</div>`;
function content(kind) {
  if (kind === 'device') return `<div slot="fixed" class="room-list-fixed"><probe-rooms></probe-rooms></div><div class="device-page"><div class="empty-devices"><div class="empty-icon" aria-hidden="true">${glyph}</div><h2>还没有设备</h2><p>添加设备，开始连接你的智能生活。</p><button type="button" data-last>添加设备</button></div></div>`;
  if (kind === 'community') return `<div class="discover-content"><p class="local-preview-note">本地静态内容预览，不代表真实设备或服务。</p><div id="community-results">${['智能灵感', '使用技巧'].map(label => `<section class="content-section"><div class="section-heading"><h2>${label}</h2><button type="button" class="view-all">查看全部</button></div><div class="inspiration-grid"><article class="story-card"><div class="story-image"><span class="category-label">${label}</span></div><div class="story-copy"><h3>${longName}</h3><p>这是一段需要自然换行的本地静态描述。${longToken}</p></div></article></div></section>`).join('')}<section class="content-section product-section"><div class="section-heading"><h2>产品预览</h2><button type="button" class="view-all">查看全部</button></div><div class="product-list">${[1, 2, 3].map(i => `<article class="product-card" ${i === 3 ? 'data-last' : ''}><div class="product-image" aria-hidden="true"></div><div class="product-copy"><h3>本地产品示意 ${longToken}</h3><p>这是可换行的产品说明。${longToken}</p><small>静态预览，非可购买产品</small></div></article>`).join('')}</div></section></div></div>`;
  if (kind === 'tools') return `<div class="tools-page">${[1, 2, 3].map(i => `<section class="tool-section" ${i === 3 ? 'data-last' : ''}><h2>工具分组 ${i} ${longToken}</h2><app-menu-list data-menu="tools"></app-menu-list></section>`).join('')}</div>`;
  return `<div class="profile-content"><section class="account-card"><h2 class="visually-hidden">账号与权益</h2><button class="user-info" type="button"><span class="avatar" aria-hidden="true"><span>B</span></span><span class="info"><span class="name">${longName}</span></span><i class="profile-arrow" aria-hidden="true">${glyph}</i></button><div class="account-card-details"><dl class="account-entitlements"><div class="account-plan"><dt class="visually-hidden">套餐</dt><dd><span class="plan-badge">套餐待查询</span></dd></div><div class="account-quota"><dt>自有设备额度</dt><dd class="device-quota">待查询</dd></div></dl><button type="button" class="account-refresh" aria-label="刷新账号权益">${glyph}</button></div><p class="account-hint">共享设备不计入自有设备额度。</p></section>${[1, 2].map(i => `<section class="profile-menu-group"><h2 class="visually-hidden">功能分组 ${i}</h2><app-menu-list data-menu="profile"></app-menu-list></section>`).join('')}<div class="profile-support"><div class="support-links"><button type="button">意见反馈</button><button type="button">关于我们</button></div><button type="button" class="support-logout">退出登录</button></div><div class="profile-version" data-last><span>版本 LOCAL-FIXTURE</span><span class="version-dot" aria-hidden="true"></span></div></div>`;
}
const fixtures = Object.fromEntries(Object.keys(paths).map(kind => [kind, content(kind)]));
const menuFixture = menu([[`本地功能 ${longName}`, `说明 ${longToken}`], ['另一项本地功能', '不调用真实功能']]);
const scaffoldCss = '*{box-sizing:border-box}svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.7;vertical-align:middle}button,input{font-family:inherit}';

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'); return; }
  if (!/^\/ionic\/[\w./-]+\.(js|svg)$/.test(path) || path.includes('..')) { response.writeHead(404).end(); return; }
  try {
    response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'image/svg+xml');
    response.end(readFileSync(new URL(`node_modules/@ionic/core/${path.slice(7)}`, root)));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const viewports = [{ width: 320, height: 704 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
const cases = [];
for (const viewport of viewports) for (const rootSize of [16, 24]) for (const theme of ['light', 'dark']) for (const mode of ['ios', 'md']) {
  cases.push({ ...viewport, rootSize, theme, mode, search: false });
}
// Eight additional expanded-search boundaries keep the suite at 32 scenarios,
// while covering all viewports, both text sizes, palettes and Ionic modes.
for (const [viewportIndex, rootSize, theme, mode] of [
  [0, 16, 'light', 'ios'], [0, 24, 'dark', 'md'], [0, 24, 'light', 'ios'],
  [1, 16, 'dark', 'md'], [1, 24, 'light', 'md'], [1, 24, 'dark', 'ios'],
  [2, 16, 'light', 'md'], [2, 24, 'dark', 'ios'],
]) cases.push({ ...viewports[viewportIndex], rootSize, theme, mode, search: true });
const failures = [], screenshots = [], measurements = [];
const tabCases = suite === 'nav-corners' ? [] : cases;
const cornerCases = [];
if (suite !== 'tabs') for (const viewport of viewports.slice(0, 2)) for (const theme of ['light', 'dark']) for (const mode of ['ios', 'md']) {
  cornerCases.push({ ...viewport, theme, mode });
}
const cornerMeasurements = [];

// Chromium screenshots are RGB/RGBA PNGs. Decode these bounded local captures
// using only Node's zlib; no image dependency, remote screenshot or asset edit.
function pngPixels(buffer) {
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let width, height, channels;
  const compressed = [];
  for (let cursor = 8; cursor < buffer.length;) {
    const length = buffer.readUInt32BE(cursor), type = buffer.toString('ascii', cursor + 4, cursor + 8);
    const data = buffer.subarray(cursor + 8, cursor + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'Expected an 8-bit Chromium screenshot');
      assert.ok([2, 6].includes(data[9]), 'Expected an RGB/RGBA Chromium screenshot');
      assert.equal(data[12], 0, 'Interlaced screenshots are not supported');
      channels = data[9] === 6 ? 4 : 3;
    }
    if (type === 'IDAT') compressed.push(data);
    cursor += length + 12;
  }
  const source = inflateSync(Buffer.concat(compressed)), stride = width * channels;
  assert.equal(source.length, (stride + 1) * height);
  const pixels = Buffer.alloc(stride * height);
  const paeth = (left, above, diagonal) => {
    const estimate = left + above - diagonal;
    const dl = Math.abs(estimate - left), da = Math.abs(estimate - above), dd = Math.abs(estimate - diagonal);
    return dl <= da && dl <= dd ? left : da <= dd ? above : diagonal;
  };
  for (let y = 0; y < height; y++) {
    const row = y * stride, input = y * (stride + 1), filter = source[input];
    assert.ok(filter <= 4, 'Unsupported PNG filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const above = y ? pixels[row + x - stride] : 0;
      const diagonal = y && x >= channels ? pixels[row + x - stride - channels] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above
        : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, diagonal);
      pixels[row + x] = (source[input + x + 1] + predictor) & 255;
    }
  }
  return { width, height, at(x, y) {
    const index = Math.floor(y) * stride + Math.floor(x) * channels;
    assert.ok(x >= 0 && y >= 0 && x < width && y < height, 'Screenshot sample outside viewport');
    return [...pixels.subarray(index, index + 3)];
  } };
}
const pixelDifference = (a, b) => Math.max(...a.map((channel, index) => Math.abs(channel - b[index])));
let browser, externalRequests = 0;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => {
    if (route.request().url().startsWith(`${origin}/`)) return route.continue();
    externalRequests++;
    return route.abort();
  });
  await page.goto(origin);
  await page.addStyleTag({ content: `${themeCss}body{margin:0;overflow:hidden}probe-home{display:block;position:relative;height:100vh}` });
  await page.evaluate(async () => { const { defineCustomElements } = await import('/ionic/loader/index.es2017.js'); await defineCustomElements(window); });
  for (const scenario of tabCases) {
    const safeTop = 35, safeBottom = 26;
    const label = `${scenario.mode}/${scenario.theme}/${scenario.width}x${scenario.height}/root${scenario.rootSize}/${scenario.search ? 'search' : 'default'}`;
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.evaluate(({ scenario, safeTop, safeBottom, baseCss, headerCss, maskCss, homeCss, styles, navigation, fixtures, headers, menuCss, menuFixture, roomsCss, loginCss, scaffoldCss, title, action }) => {
      document.documentElement.dataset.uiTheme = scenario.theme === 'light' ? 'natural' : 'dark';
      document.documentElement.style.cssText = `font-size:${scenario.rootSize}px;color-scheme:${scenario.theme};--ion-safe-area-top:${safeTop}px;--ion-safe-area-bottom:${safeBottom}px;--ion-safe-area-left:0px;--ion-safe-area-right:0px`;
      document.body.innerHTML = '<probe-home></probe-home>';
      const home = document.querySelector('probe-home').attachShadow({ mode: 'open' });
      home.innerHTML = `<style>${baseCss}${homeCss}${scaffoldCss}probe-tab,probe-legacy{position:absolute;inset:0;display:block}probe-tab:not([data-visible]),probe-legacy{visibility:hidden;pointer-events:none}</style>${navigation}`;
      const tabs = home.querySelector('ion-tabs'), tab = document.createElement('ion-tab');
      tab.tab = 'device'; tab.active = true; tabs.prepend(tab);
      for (const kind of Object.keys(fixtures)) {
        const host = document.createElement('probe-tab'); host.dataset.kind = kind;
        if (kind === 'community') host.dataset.visible = '';
        tab.append(host);
        host.attachShadow({ mode: 'open' }).innerHTML = `<style>${baseCss}${headerCss}${maskCss}${styles[kind]}${scaffoldCss}:host{position:absolute;inset:0;display:block}</style>${headers[kind]}<ion-content fullscreen><div slot="fixed" class="top-scroll-mask" aria-hidden="true"></div>${fixtures[kind]}</ion-content>`;
        for (const menu of host.shadowRoot.querySelectorAll('app-menu-list')) {
          menu.attachShadow({ mode: 'open' }).innerHTML = `<style>${menuCss}${scaffoldCss}</style>${menuFixture}`;
        }
        const rooms = host.shadowRoot.querySelector('probe-rooms');
        if (rooms) rooms.attachShadow({ mode: 'open' }).innerHTML = `<style>${roomsCss}${scaffoldCss}</style><div class="room-filter"><div class="room-scroll" role="group" aria-label="设备区域">${['全部', '客厅', '卧室'].map((name, i) => `<button class="room-chip ${i ? '' : 'selected'}" aria-pressed="${!i}">${name}</button>`).join('')}</div></div>`;
      }
      for (const kind of ['secondary', 'login']) {
        const host = document.createElement('probe-legacy'); host.dataset.kind = kind; tab.append(host);
        // Production login has no ion-title: this synthetic sentinel only proves
        // that a non-opted-in header still resolves the old 20px title rule.
        host.attachShadow({ mode: 'open' }).innerHTML = `<style>${baseCss}${headerCss}${kind === 'login' ? loginCss : ''}${scaffoldCss}</style><ion-header class="main-tab-header"><ion-toolbar>${title}<ion-buttons slot="end">${action}</ion-buttons></ion-toolbar></ion-header>`;
      }
      for (const root of [home, ...[...home.querySelectorAll('probe-tab,probe-legacy')].map(host => host.shadowRoot)]) {
        for (const element of root.querySelectorAll('ion-header,ion-toolbar,ion-title,ion-buttons,ion-button,ion-content,ion-tabs,ion-tab,ion-tab-bar,ion-tab-button')) element.setAttribute('mode', scenario.mode);
      }
      home.querySelector('ion-tab-bar').selectedTab = 'community';
    }, { scenario, safeTop, safeBottom, baseCss, headerCss, maskCss, homeCss, styles, navigation, fixtures,
      headers: Object.fromEntries(Object.keys(paths).map(kind => [kind, header(kind, scenario.search)])),
      menuCss, menuFixture, roomsCss, loginCss, scaffoldCss, title: title('二级页面'), action: action('本地设置') });
    await page.waitForFunction(() => {
      const home = document.querySelector('probe-home').shadowRoot;
      return [...home.querySelectorAll('ion-tabs,ion-tab,ion-tab-bar,ion-tab-button'),
        ...[...home.querySelectorAll('probe-tab,probe-legacy')].flatMap(host => [...host.shadowRoot.querySelectorAll('ion-toolbar,ion-title,ion-content,ion-button')])]
        .every(element => element.classList.contains('hydrated'));
    });
    const result = await page.evaluate(async () => {
      const home = document.querySelector('probe-home').shadowRoot;
      const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
      const bar = box(home.querySelector('ion-tab-bar'));
      const tabs = [];
      for (const host of home.querySelectorAll('probe-tab')) {
        const root = host.shadowRoot, kind = host.dataset.kind;
        const title = root.querySelector('ion-title'), style = getComputedStyle(title);
        const scroll = await root.querySelector('ion-content').getScrollElement();
        scroll.scrollTop = 0;
        await new Promise(resolve => requestAnimationFrame(resolve));
        const sectionSelector = kind === 'community' ? '.content-section' : kind === 'tools' ? '.tool-section' : '.account-card,.profile-menu-group,.profile-support,.profile-version';
        const sections = kind === 'device' ? [] : [...root.querySelectorAll(sectionSelector)].map(box);
        const first = root.querySelector(kind === 'community' ? '.local-preview-note' : kind === 'tools' ? '.tool-section' : kind === 'profile' ? '.account-card' : '.empty-devices');
        const text = [...root.querySelectorAll('.story-copy h3,.story-copy p,.product-copy h3,.product-copy p,.product-copy small,.name,.account-hint,.tool-section h2')].map(element => {
          const range = document.createRange(); range.selectNodeContents(element);
          return { tag: `${element.tagName}.${element.className}`, ...box(element), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, lineCount: range.getClientRects().length };
        });
        const grid = root.querySelector('.inspiration-grid');
        const stories = [...root.querySelectorAll('.story-card')].map(element => {
          const style = getComputedStyle(element);
          return { card: box(element), image: box(element.querySelector('.story-image')), copy: box(element.querySelector('.story-copy')),
            borderLeft: parseFloat(style.borderLeftWidth), borderRight: parseFloat(style.borderRightWidth) };
        });
        const products = [...root.querySelectorAll('.product-card')].map(element => ({ card: box(element), image: box(element.querySelector('.product-image')), copy: box(element.querySelector('.product-copy h3')) }));
        const menuTargets = [...root.querySelectorAll('app-menu-list')].flatMap(menu => [...menu.shadowRoot.querySelectorAll('button')].map(box));
        const info = { kind, title: { font: parseFloat(style.fontSize), weight: style.fontWeight, line: parseFloat(style.lineHeight), tracking: style.letterSpacing,
          x: box(root.querySelector('.fixture-title-copy')).x, baseline: box(root.querySelector('[data-baseline]')).y, rect: box(title) },
          header: box(root.querySelector('ion-header')), toolbar: box(root.querySelector('ion-toolbar')), actions: [...root.querySelectorAll('ion-button.header-action')].map(box),
          first: box(first), sections, text, stories, products,
          // auto-fit retains collapsed zero-width tracks in computed styles.
          columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(track => parseFloat(track) > .5).length : null,
          targets: [...root.querySelectorAll('button')].map(box).concat(menuTargets),
          scrollWidth: scroll.scrollWidth, scrollClient: scroll.clientWidth, scrollTop: scroll.scrollTop,
          search: root.querySelector('.search-field') ? box(root.querySelector('.search-field')) : null,
          searchInput: root.querySelector('.search-field input') ? box(root.querySelector('.search-field input')) : null,
          categories: root.querySelector('.category-tabs') ? box(root.querySelector('.category-tabs')) : null };
        scroll.scrollTop = scroll.scrollHeight;
        await new Promise(resolve => requestAnimationFrame(resolve));
        info.last = box(root.querySelector('[data-last]'));
        info.maxScroll = scroll.scrollHeight - scroll.clientHeight;
        info.reachedScroll = scroll.scrollTop;
        tabs.push(info);
      }
      const legacy = [...home.querySelectorAll('probe-legacy')].map(host => ({ kind: host.dataset.kind,
        font: getComputedStyle(host.shadowRoot.querySelector('ion-title')).fontSize,
        weight: getComputedStyle(host.shadowRoot.querySelector('ion-title')).fontWeight,
        target: box(host.shadowRoot.querySelector('ion-button')) }));
      return { tabs, legacy, bar, navTargets: [...home.querySelectorAll('ion-tab-button')].map(box),
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
    });
    const errors = [];
    const check = (condition, message) => { if (!condition) errors.push(`${label}: ${message}`); };
    const approx = (a, b, tolerance = .6) => Math.abs(a - b) <= tolerance;
    check(result.reducedMotion, 'reduced-motion fixture absent');
    check(result.documentWidth <= result.viewportWidth + 1, 'document horizontal overflow');
    check(approx(result.bar.bottom, scenario.height - safeBottom - 10), 'bottom navigation safe area');
    for (const target of result.navTargets) check(target.w >= 47.9 && target.h >= 47.9, 'navigation target below48');
    const reference = result.tabs[0].title;
    for (const tab of result.tabs) {
      const prefix = `${tab.kind}: `;
      check(approx(tab.title.font, scenario.rootSize * (scenario.width <= 360 ? 1.6875 : 1.8125), .1), `${prefix}title font ${tab.title.font}`);
      check(tab.title.weight === '650', `${prefix}title weight ${tab.title.weight}`);
      check(approx(tab.title.line, tab.title.font * 1.2, .1), `${prefix}title line-height`);
      check(tab.title.tracking === '-1px', `${prefix}title letter spacing`);
      check(approx(tab.title.x, reference.x) && approx(tab.title.baseline, reference.baseline), `${prefix}title left/baseline differs from device`);
      check(tab.title.rect.y >= safeTop - .5, `${prefix}title under top safe area`);
      check(tab.scrollWidth <= tab.scrollClient + 1, `${prefix}content horizontal overflow`);
      for (const target of [...tab.actions, ...tab.targets]) {
        check(target.w >= 47.9 && target.h >= 47.9, `${prefix}target below48 ${JSON.stringify(target)}`);
      }
      for (const target of tab.actions) check(target.y >= safeTop - .5 && target.x >= -.5 && target.right <= scenario.width + .5, `${prefix}header action unsafe/overflow`);
      check(tab.first.y >= tab.header.bottom - .5, `${prefix}first content hidden behind header`);
      check(tab.last.bottom <= result.bar.y + .6, `${prefix}last content hidden behind navigation`);
      check(approx(tab.maxScroll, tab.reachedScroll, 1), `${prefix}last scroll position unreachable`);
      for (let i = 1; i < tab.sections.length; i++) check(tab.sections[i].y - tab.sections[i - 1].bottom >= 15.4, `${prefix}group spacing below16`);
      for (const text of tab.text) {
        check(text.x >= -.5 && text.right <= scenario.width + .5 && text.scrollWidth <= text.clientWidth + 1, `${prefix}long text overflow in ${text.tag}`);
      }
      if (tab.kind === 'community') {
        check(tab.columns === 1, 'community: recommendations must remain one horizontal-card column');
        check(tab.text.filter(text => text.tag.startsWith('H3')).every(text => text.lineCount > 1), 'community: long headings must wrap');
        for (const story of tab.stories) {
          check(story.image.right <= story.copy.x + .6 && story.image.y < story.copy.bottom && story.image.bottom > story.copy.y,
            `community: responsive horizontal cover/copy overlap ${JSON.stringify(story)}`);
        }
        for (const product of tab.products) check(product.image.right <= product.copy.x + .5 && product.image.y < product.copy.bottom && product.image.bottom > product.copy.y, 'community: product thumbnail/copy horizontal arrangement lost');
        if (scenario.search) {
          check(tab.search && tab.search.h >= 47.9 && tab.search.bottom <= tab.categories.y + .5, 'community: expanded search overlaps categories');
          check(tab.search?.y >= tab.toolbar.bottom - .5 && tab.searchInput?.y >= tab.search.y - .5
            && tab.searchInput?.bottom <= tab.search.bottom + .5, 'community: expanded search obscured by toolbar');
        }
      }
    }
    for (const legacy of result.legacy) {
      check(legacy.font === '20px' && legacy.weight === '600', `${legacy.kind}: opt-in heading leaked into old header`);
      check(approx(legacy.target.w, 44) && approx(legacy.target.h, 44), `${legacy.kind}: opt-in actions leaked into old header`);
    }
    // Activate only the discovery fixture for genuine keyboard-focus checks.
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(async () => {
      const home = document.querySelector('probe-home').shadowRoot;
      const host = home.querySelector('probe-tab[data-kind="community"]'), root = host.shadowRoot;
      const scroll = await root.querySelector('ion-content').getScrollElement(); scroll.scrollTop = 0;
      return [...root.querySelectorAll('.category-tabs button')].map(button => {
        button.focus();
        const style = getComputedStyle(button);
        return { visible: button.matches(':focus-visible'), outline: parseFloat(style.outlineWidth), transition: style.transitionDuration,
          y: button.getBoundingClientRect().y, bottom: button.getBoundingClientRect().bottom };
      });
    });
    for (const state of focus) {
      check(state.visible && state.outline >= 2, 'community: category keyboard focus ring absent');
      check(state.y >= safeTop - .5 && state.bottom <= scenario.height - safeBottom + .5, 'community: category keyboard focus obscured');
    }
    if (scenario.search) {
      const searchFocus = await page.evaluate(() => {
        const root = document.querySelector('probe-home').shadowRoot.querySelector('probe-tab[data-kind="community"]').shadowRoot;
        const input = root.querySelector('.search-field input'), field = input.closest('.search-field');
        input.focus();
        const style = getComputedStyle(field), inputStyle = getComputedStyle(input), rect = field.getBoundingClientRect();
        return { active: root.activeElement === input, focusWithin: field.matches(':focus-within'), visible: input.matches(':focus-visible'),
          outline: parseFloat(style.outlineWidth), outlineStyle: style.outlineStyle, outlineColor: style.outlineColor,
          inputBorder: [inputStyle.borderTopWidth, inputStyle.borderRightWidth, inputStyle.borderBottomWidth, inputStyle.borderLeftWidth].map(parseFloat),
          inputBackground: inputStyle.backgroundColor, y: rect.y, bottom: rect.bottom };
      });
      check(searchFocus.active && searchFocus.focusWithin && searchFocus.visible && searchFocus.outline >= 2
        && searchFocus.outlineStyle === 'solid' && !['transparent', 'rgba(0, 0, 0, 0)'].includes(searchFocus.outlineColor),
      'community: search keyboard focus lacks replacement field ring');
      check(searchFocus.inputBorder.every(width => width === 0) && searchFocus.inputBackground === 'rgba(0, 0, 0, 0)',
        'community: search input retains nested native border/background');
      check(searchFocus.y >= safeTop - .5 && searchFocus.bottom <= scenario.height - safeBottom + .5,
        'community: search keyboard focus obscured');
    }
    failures.push(...errors);
    measurements.push({ scenario: label,
      // Compact tuples: tab, font px, weight, line px, tracking, text left, baseline.
      titles: result.tabs.map(({ kind, title }) => [kind, title.font, title.weight, title.line, title.tracking, title.x, title.baseline]),
      failures: errors.length });
    if (screenshotDir && errors.length) {
      const path = join(screenshotDir, `FAIL-${scenario.mode}-${scenario.theme}-${scenario.width}-root${scenario.rootSize}-${scenario.search ? 'search' : 'default'}.png`);
      await page.screenshot({ path, fullPage: false }); screenshots.push(path);
    }
    if (screenshotDir && scenario.mode === 'ios' && ((scenario.width === 390 && scenario.rootSize === 16 && !scenario.search) || (scenario.width === 320 && scenario.rootSize === 24 && scenario.search))) {
      for (const kind of scenario.search ? ['community'] : Object.keys(paths)) {
        await page.evaluate(async kind => {
          const home = document.querySelector('probe-home').shadowRoot;
          for (const host of home.querySelectorAll('probe-tab')) {
            host.toggleAttribute('data-visible', host.dataset.kind === kind);
            const scroll = await host.shadowRoot.querySelector('ion-content').getScrollElement(); scroll.scrollTop = 0;
          }
          home.querySelector('ion-tab-bar').selectedTab = kind;
          await new Promise(resolve => requestAnimationFrame(resolve));
        }, kind);
        const path = join(screenshotDir, `${kind}-${scenario.theme}-${scenario.width}-root${scenario.rootSize}${scenario.search ? '-search' : ''}.png`);
        await page.screenshot({ path, fullPage: false }); screenshots.push(path);
      }
    }
  }
  for (const scenario of cornerCases) {
    const label = `nav-corners/${scenario.mode}/${scenario.theme}/${scenario.width}x${scenario.height}`;
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.evaluate(({ scenario, baseCss, homeCss, navigation, scaffoldCss }) => {
      document.documentElement.dataset.uiTheme = scenario.theme === 'light' ? 'natural' : 'dark';
      document.documentElement.style.cssText = `font-size:16px;color-scheme:${scenario.theme};--ion-safe-area-top:35px;--ion-safe-area-bottom:26px;--ion-safe-area-left:0px;--ion-safe-area-right:0px`;
      document.body.innerHTML = '<probe-home></probe-home>';
      const root = document.querySelector('probe-home').attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${baseCss}${homeCss}${scaffoldCss}ion-content{--background:transparent}.fixture-checkerboard{height:100%;width:100%;background:repeating-conic-gradient(#ff00cc 0% 25%,#00ff66 0% 50%) 0 0/16px 16px}</style>${navigation}`;
      const tab = document.createElement('ion-tab'); tab.tab = 'device'; tab.active = true;
      tab.innerHTML = '<ion-content fullscreen><div class="fixture-checkerboard" aria-hidden="true"></div></ion-content>';
      root.querySelector('ion-tabs').prepend(tab);
      for (const element of root.querySelectorAll('ion-tabs,ion-tab,ion-content,ion-tab-bar,ion-tab-button')) element.setAttribute('mode', scenario.mode);
      root.querySelector('ion-tab-bar').selectedTab = 'device';
    }, { scenario, baseCss, homeCss, navigation, scaffoldCss });
    await page.waitForFunction(() => [...document.querySelector('probe-home').shadowRoot.querySelectorAll('ion-tabs,ion-tab,ion-content,ion-tab-bar,ion-tab-button')]
      .every(element => element.classList.contains('hydrated')));
    // Let Ionic's ResizeObserver settle its fullscreen scroll offsets before
    // taking geometry, not just before the later screenshot capture.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await page.evaluate(async () => {
      const root = document.querySelector('probe-home').shadowRoot, tabs = root.querySelector('ion-tabs'), bar = root.querySelector('ion-tab-bar');
      const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
      const content = root.querySelector('ion-content'), scroll = await content.getScrollElement();
      const after = getComputedStyle(tabs, '::after'), style = getComputedStyle(bar);
      return { tabs: box(tabs), inner: box(tabs.shadowRoot.querySelector('.tabs-inner')), content: box(content), scroll: box(scroll),
        pattern: box(root.querySelector('.fixture-checkerboard')), bar: box(bar),
        after: { content: after.content, display: after.display, background: after.backgroundImage },
        position: style.position, radius: style.borderRadius,
        targets: [...root.querySelectorAll('ion-tab-button')].map(box) };
    });
    const capture = async state => {
      const path = screenshotDir ? join(screenshotDir, `nav-corners-${scenario.mode}-${scenario.theme}-${scenario.width}-${state}.png`) : undefined;
      const buffer = await page.screenshot({ ...(path ? { path } : {}), fullPage: false });
      if (path) screenshots.push(path);
      return pngPixels(buffer);
    };
    const shown = await capture('visible');
    // visibility:hidden preserves the layout as a control. A normal-flow footer
    // cannot pass by expanding the content only in this hidden reference shot.
    await page.evaluate(async () => {
      document.querySelector('probe-home').shadowRoot.querySelector('ion-tab-bar').style.visibility = 'hidden';
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    const hidden = await capture('hidden');
    const errors = [], check = (condition, message) => { if (!condition) errors.push(`${label}: ${message}`); };
    const near = (a, b) => Math.abs(a - b) <= .6;
    check(geometry.position === 'absolute', 'navigation occupies normal-flow space');
    for (const name of ['tabs', 'inner', 'content', 'scroll', 'pattern']) {
      check(near(geometry[name].y, 0) && near(geometry[name].bottom, scenario.height), `${name} does not fill the viewport: ${JSON.stringify(geometry[name])}`);
    }
    check(['none', 'normal'].includes(geometry.after.content) || geometry.after.display === 'none', `full-width tabs pseudo-layer remains: ${JSON.stringify(geometry.after)}`);
    check(near(geometry.bar.h, 64) && geometry.radius === '25px', '64px / 25px rounded surface changed');
    check(near(geometry.bar.x, 12) && near(geometry.bar.right, scenario.width - 12)
      && near(geometry.bar.bottom, scenario.height - 36), 'navigation safe-area anchoring changed');
    for (const target of geometry.targets) check(target.w >= 47.9 && target.h >= 47.9, 'navigation hit target below48');
    const b = geometry.bar;
    const outsidePoints = [
      ['top-left-cutout', b.x + 2, b.y + 2], ['top-right-cutout', b.right - 3, b.y + 2],
      ['bottom-left-cutout', b.x + 2, b.bottom - 3], ['bottom-right-cutout', b.right - 3, b.bottom - 3],
      ['left-gutter', 2, b.y + b.h / 2], ['right-gutter', scenario.width - 3, b.y + b.h / 2],
      ['below-navigation', scenario.width / 2 + 3, scenario.height - 5],
    ];
    const outside = outsidePoints.map(([name, x, y]) => {
      const visible = shown.at(x, y), reference = hidden.at(x, y), delta = pixelDifference(visible, reference);
      const patterned = Math.min(pixelDifference(reference, [255, 0, 204]), pixelDifference(reference, [0, 255, 102])) <= 1;
      check(patterned, `${name}: hidden navigation still leaves a rectangular/tinted backdrop ${JSON.stringify(reference)}`);
      // At most 3% of an 8-bit colour channel is allowed for the existing shadow.
      check(delta <= Math.ceil(255 * .03), `${name}: outside corner differs from hidden nav by ${delta}/255`);
      return { name, delta, patterned };
    });
    const surface = scenario.theme === 'light' ? [255, 255, 255] : [32, 34, 38];
    const inside = [['top-inner-surface', b.x + b.w / 2, b.y + 3], ['bottom-inner-surface', b.x + b.w / 2, b.bottom - 4]]
      .map(([name, x, y]) => {
        const visible = shown.at(x, y), reference = hidden.at(x, y);
        check(pixelDifference(visible, surface) <= 1, `${name}: surface is not opaque ${JSON.stringify(visible)}`);
        check(pixelDifference(visible, reference) > 40, `${name}: navigation became a transparent pass-through`);
        return { name, pixel: visible };
      });
    failures.push(...errors);
    cornerMeasurements.push({ scenario: label, geometry, outside, inside, failures: errors.length });
  }
  assert.equal(externalRequests, 0, 'Synthetic fixtures attempted external resource access');
  const reportPath = screenshotDir ? join(screenshotDir, 'report.json') : undefined;
  const report = { status: failures.length ? 'FAIL' : 'PASS', suite, scenarios: tabCases.length, tabsPerScenario: 4,
    navCornerScenarios: cornerCases.length,
    viewports, rootSizes: [16, 24], themes: ['light', 'dark'], ionicModes: ['ios', 'md'], safeArea: { top: 35, bottom: 26 },
    measurements, cornerMeasurements, screenshots, reportPath, externalRequests, failures,
    limit: 'Fabricated local DOM with real compiled SCSS and installed Ionic in this Chromium. Not Angular/App/native, system font scaling, routing, login, account, API or device acceptance.' };
  // Generated evidence stays with its private screenshots; exclusive creation
  // complements the unique run directory and cannot replace a prior report.
  if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
  assert.equal(failures.length, 0, failures.join('\n'));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
