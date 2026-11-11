// Local presentation fixture: real SCSS + installed Ionic web components.
// No Angular page, account, device command, saved layout, or iframe document is loaded.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
const read = path => readFileSync(new URL(path, root), 'utf8');
const css = path => sass.compile(fileURLToPath(new URL(path, root)), { logger: sass.Logger.silent }).css;
const globalCss = ['node_modules/@ionic/core/css/core.css', 'node_modules/@ionic/core/css/structure.css',
  'node_modules/@ionic/core/css/typography.css'].map(read).join('') + css('src/app/sections/_transparent-page-header.scss');
const shellCss = css('src/app/device/device.page.scss');
const editorCss = css('src/app/sections/device/panel-editor/panel-editor.page.scss');
const propertyCss = css('src/app/sections/device/panel-editor/panel-widget-editor.page.scss');
const themeCss = sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', {
  loadPaths: [fileURLToPath(new URL('src/theme/', root))],
}).css;
const fonts = [['outfit', 'Outfit Variable'], ['geist-mono', 'Geist Mono Variable'], ['doto', 'Doto Variable']]
  .map(([name, family]) => `@font-face{font-family:'${family}';font-weight:100 900;src:url(data:font/woff2;base64,${readFileSync(new URL(`node_modules/@fontsource-variable/${name}/files/${name}-latin-wght-normal.woff2`, root)).toString('base64')})}`).join('');
const bodyCss = css('src/app/device/v2/device-v2.page.scss');
const gridCss = css('src/app/device/v2/panel/page-layout-panel.scss');
const template = read('src/app/device/device.page.html');
const screenshotDirectory = process.env.UI3_SCREENSHOT_DIR;
if (screenshotDirectory) {
  assert.ok(isAbsolute(screenshotDirectory), 'UI3_SCREENSHOT_DIR must be absolute');
  mkdirSync(screenshotDirectory, { recursive: true });
}
for (const guard of ['class="name-text"', 'class="theme-close"', 'class="theme-option"', 'class="theme-copy"'])
  assert.ok(template.includes(guard), `keep shell fixture aligned: ${guard}`);

// Serve only the installed Ionic runtime, not arbitrary workspace/account files.
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
const browser = await chromium.launch({ headless: true,
  ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
let count = 0;
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
  await page.goto(origin);
  // Angular emulates :host[data-ui-theme]; the native fixture instead inherits
  // the same tokens from html, as the widget geometry fixtures do.
  await page.addStyleTag({ content: `${themeCss}${fonts}body{font-family:var(--ui-font);background:var(--ui-bg)}` });
  await page.evaluate(async () => {
    const { defineCustomElements } = await import('/ionic/loader/index.es2017.js');
    await defineCustomElements(window);
  });
  for (const consumer of ['device', 'editor', 'property']) for (const mode of ['ios', 'md']) for (const theme of ['natural', 'dark', 'electronic'])
    for (const width of [320, 375, 593, 844]) for (const scale of [1, 1.5]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 900 });
      await page.evaluate(({ mode, theme, globalCss, shellCss, bodyCss, scale, width, consumer, consumerCss }) => {
        document.body.innerHTML = '';
        document.body.style.margin = '0';
        document.documentElement.setAttribute('data-ui-theme', theme);
        document.documentElement.style.cssText = `--ion-safe-area-top:${width === 844 ? 20 : 0}px;--transparent-page-header-height:44px;--transparent-page-content-top:calc(var(--ion-safe-area-top) + var(--transparent-page-header-height))`;
        const shell = document.createElement('probe-shell');
        shell.setAttribute('data-ui-theme', theme);
        document.body.append(shell);
        shell.attachShadow({ mode: 'open' }).innerHTML = `<style>${globalCss}${shellCss}${consumerCss}
          :host{display:flow-root;position:relative;min-height:100vh}*{box-sizing:border-box}
          .name,.state,.theme-copy strong,.theme-copy small,.notice{font-size:calc(1em * ${scale})}
          .theme-picker{margin:80px auto 0;max-width:340px;width:calc(100% - 32px)}
          </style>
          <ion-header class="control-page-header" mode="${mode}"><ion-toolbar mode="${mode}" color="transparent">
            <ion-buttons slot="start"><ion-back-button mode="${mode}" text="" default-href="/fixture"></ion-back-button></ion-buttons>
            <ion-title mode="${mode}"><div class="name"><span class="name-text">客厅环境与设备控制很长的名称</span><span class="shared-device-badge">↗</span></div><div class="state showState">局域网已连接 · 设备状态已同步</div></ion-title>
            <ion-buttons slot="end">${(consumer === 'device' ? ['设备主题', '编辑页面', '设备设置'] : ['保存']).map(label => `<ion-button mode="${mode}" aria-label="${label}">${consumer === 'device' ? '<i aria-hidden="true">○</i>' : label}</ion-button>`).join('')}</ion-buttons>
          </ion-toolbar></ion-header>
          <section class="theme-picker"><div class="theme-picker-heading"><div><h2>设备主题</h2><p>为这个设备选一个喜欢的风格</p></div><button class="theme-close" aria-label="关闭主题选择">×</button></div>
          <div class="theme-options">${['自然', '暗夜', '电子'].map((name, i) => `<button class="theme-option" aria-pressed="${i === 0}"><span class="theme-swatch" data-ui-theme="${['natural', 'dark', 'electronic'][i]}"><span></span><span></span><span></span></span><span class="theme-copy"><strong>${name}</strong><small>保留组件和文档的独立主题</small></span><span class="theme-check">${i === 0 ? '✓' : ''}</span></button>`).join('')}</div></section>`;
        const content = document.createElement('probe-content');
        shell.shadowRoot.append(content);
        content.attachShadow({ mode: 'open' }).innerHTML = `<style>${bodyCss}:host{display:block}*{box-sizing:border-box}.notice{font-size:${14 * scale}px}</style>
          <main class="v2-content"><section class="notice error"><span>设备请求尚未确认，请保留原请求记录并只读恢复。LongTokenWithoutBreak01234567890123456789</span><ion-button mode="${mode}" size="small" fill="clear">重试</ion-button></section></main>`;
      }, { mode, theme, globalCss, shellCss, bodyCss, scale, width, consumer,
        consumerCss: consumer === 'editor' ? editorCss : consumer === 'property' ? propertyCss : '' });
      await page.waitForFunction(() => {
        const shadow = document.querySelector('probe-shell').shadowRoot;
        return [...shadow.querySelectorAll('ion-button,ion-title,ion-back-button,ion-toolbar')].every(element => element.classList.contains('hydrated'))
          && shadow.querySelector('probe-content').shadowRoot.querySelector('ion-button').classList.contains('hydrated');
      });
      const result = await page.evaluate(() => {
        const root = document.querySelector('probe-shell').shadowRoot;
        const rect = element => { const r = element.getBoundingClientRect(); return { name: element.className || element.tagName, x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
        const title = rect(root.querySelector('ion-title'));
        const buttons = [...root.querySelectorAll('ion-buttons > *')].map(rect);
        const picker = [...root.querySelectorAll('.theme-close,.theme-option')].map(rect);
        const body = root.querySelector('probe-content').shadowRoot;
        const notice = rect(body.querySelector('.notice'));
        const message = rect(body.querySelector('.notice > span'));
        const retry = rect(body.querySelector('ion-button'));
        return { title, buttons, picker, notice, message, retry,
          background: getComputedStyle(document.querySelector('probe-shell')).backgroundColor,
          bodyTop: parseFloat(getComputedStyle(body.querySelector('.v2-content')).paddingTop),
          toolbar: rect(root.querySelector('ion-toolbar')),
          transition: getComputedStyle(root.querySelector('.state')).transitionDuration };
      });
      const label = `${consumer}/${mode}/${theme}/${width}/${scale}`;
      assert.equal(result.background, { natural: 'rgb(242, 243, 245)', dark: 'rgb(12, 13, 15)', electronic: 'rgb(7, 8, 9)' }[theme], `${label}: real theme tokens must be applied`);
      for (const target of [...result.buttons, ...result.picker, result.retry]) {
        assert.ok(target.w >= 47.9 && target.h >= 47.9, `${label}: target below 48px ${JSON.stringify(target)}`);
        assert.ok(target.x >= -0.5 && target.right <= width + 0.5, `${label}: target overflows screen`);
      }
      assert.ok(result.title.x >= result.buttons[0].right - 0.5, `${label}: title overlaps back`);
      assert.ok(result.title.right <= result.buttons[1].x + 0.5, `${label}: title overlaps actions`);
      assert.ok(result.toolbar.h >= 55.9, `${label}: header must reserve its targets`);
      assert.ok(result.buttons[0].y >= (width === 844 ? 20 : 0) - 0.5, `${label}: header target is under the top safe area`);
      assert.equal(result.bodyTop, 56 + (width === 844 ? 20 : 0) + 16, `${label}: body must reserve the actual header and safe area`);
      assert.ok(result.message.right <= result.notice.right + 0.5, `${label}: notice overflows`);
      assert.ok(result.retry.y >= result.message.bottom - 0.5 || result.retry.x >= result.message.right - 0.5, `${label}: retry overlaps message`);
      assert.equal(result.transition, '0s', `${label}: reduced motion`);
      if (screenshotDirectory && consumer === 'device' && mode === 'ios' && width === 375 && scale === 1) {
        await page.evaluate(() => {
          const note = document.createElement('p');
          note.textContent = 'UI3 · SCSS + Ionic 夹具 · 非真实设备或原生截图';
          note.style.cssText = 'padding:16px;font:12px system-ui;color:#596477';
          document.body.append(note);
        });
        await page.screenshot({ path: join(screenshotDirectory, `control-shell-${theme}.png`), fullPage: true });
      }
      count++;
    }
  // Explicit theme and inherited theme must use identical measured grid widths,
  // including the previously inconsistent 560/561px boundary.
  for (const width of [320, 560, 561, 570, 593, 720]) for (const theme of ['natural', 'dark', 'electronic']) {
    const results = [];
    for (const explicit of [false, true]) {
      await page.evaluate(({ gridCss, width, theme, explicit }) => {
        document.body.innerHTML = '<probe-grid></probe-grid>';
        const host = document.querySelector('probe-grid');
        host.style.cssText = `display:block;width:${width}px`;
        host.setAttribute('data-ui-theme', theme);
        host.attachShadow({ mode: 'open' }).innerHTML = `<style>${gridCss}*{box-sizing:border-box}</style><div class="panel" ${explicit ? `data-ui-theme="${theme}"` : ''}><div class="cell" style="--col:1;--span:2;--row:1;--rows:1">保留网格</div></div>`;
      }, { gridCss, width, theme, explicit });
      results.push(await page.evaluate(() => {
        const root = document.querySelector('probe-grid').shadowRoot;
        return { panel: root.querySelector('.panel').getBoundingClientRect().width,
          cell: root.querySelector('.cell').getBoundingClientRect().width,
          row: getComputedStyle(root.querySelector('.panel')).getPropertyValue('--row-h') };
      }));
    }
    assert.deepEqual(results[0], results[1], `${width}/${theme}: a theme must not change grid geometry`);
    count++;
  }
  console.log(`UI3 control-shell Ionic/CSS fixture: ${count} cases passed (not native/Angular/device acceptance).`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
