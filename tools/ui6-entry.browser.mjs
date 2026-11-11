// UI6 presentation-only fixtures: actual source SCSS and installed Ionic.
// No Angular handler, account, device, saved layout, credential or request log is loaded.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const ts = require('typescript');
const { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
const read = path => readFileSync(new URL(path, root), 'utf8');
const loadPaths = [fileURLToPath(new URL('src/theme/', root))];
const css = path => sass.compile(fileURLToPath(new URL(path, root)), { loadPaths, logger: sass.Logger.silent }).css;
function block(source, marker) {
  const begin = source.indexOf(marker); assert.ok(begin >= 0, `Missing source block ${marker}`);
  let end = source.indexOf('{', begin), level = 1;
  while (level && ++end < source.length) {
    if (source[end] === '{') level++;
    if (source[end] === '}') level--;
  }
  assert.equal(level, 0); return source.slice(begin, end + 1);
}
const mainTabCss = sass.compileString(block(read('src/global.scss'), 'ion-header.main-tab-header {')).css;
const fontCss = ['public/fontawesome6/css/fontawesome.css', 'public/fontawesome6/css/light.css'].map(read).join('');
const globalCss = ['node_modules/@ionic/core/css/core.css', 'node_modules/@ionic/core/css/structure.css',
  'node_modules/@ionic/core/css/typography.css']
  .map(read).join('') + fontCss + css('src/app/sections/_transparent-page-header.scss') + mainTabCss + css('src/app/home/components/_tab-scroll-mask.scss');
const themeCss = sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', { loadPaths }).css;
const files = {
  guide: 'src/app/sections/guide/guide.page',
  ble: 'src/app/sections/guide/connection-method.page',
  key: 'src/app/sections/guide/key-device/key-device.page',
  provision: 'src/app/tools/esp32-provision/esp32-provision.page',
  share: 'src/app/sections/device/share-manager/share-manager.page',
  invitation: 'src/app/sections/device/share-invitation/share-invitation.page',
  device: 'src/app/sections/device/device-share/device-share',
  tools: 'src/app/home/components/tab-tools/tab-tools',
};
const styles = Object.fromEntries(Object.entries(files).map(([name, path]) => [name, css(`${path}.scss`)]));
const menuCss = css('src/app/core/components/menu-list/menu-list.scss');
const toolExports = {};
runInNewContext(ts.transpileModule(read('src/app/tools/tool-menu.config.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: toolExports });
const dictionary = JSON.parse(read('public/i18n/zh_cn/zh_cn.json'));
const localize = value => value?.startsWith('TOOLS.') ? dictionary.TOOLS[value.slice(6)] : value;
const menus = toolExports.TOOL_MENU_GROUPS.map(group => ({ title: localize(group.title), tools: group.tools.map(tool => ({
  ...tool, title: localize(tool.title), description: localize(tool.description), badge: localize(tool.badge),
})) }));
const icon = name => `<i class="fa-light ${name}" aria-hidden="true"></i>`;
const button = (copy, klass = 'text-action', extra = '') => `<button type="button" class="${klass}" ${extra}>${copy}</button>`;
const ion = (copy, extra = '') => `<ion-button ${extra}>${copy}</ion-button>`;
const long = '客厅环境设备与完整的长名称 LongTokenWithoutBreak012345678901234567890123456789';
const menu = rows => `<probe-menu data-items="${encodeURIComponent(JSON.stringify(rows))}"></probe-menu>`;
const details = (title, copy) => `<details><summary>${title}</summary><p>${copy}</p></details>`;
const input = (label, value, type = 'text') => `<div class="field-group"><label>${label}</label><div class="input-shell">${icon('fa-wifi')}<input type="${type}" aria-label="${label}" value="${value}"></div></div>`;
const sharedRow = `<div class="device-entry"><a class="device-row" href="#static-device"><span class="device-image">${icon('fa-microchip')}</span><span class="device-copy"><strong>${long}</strong><small>仅查看 · 所有者：测试示意账号</small></span>${icon('fa-chevron-right')}</a>${button('退出', 'text-action leave-action')}</div>`;
const cases = [
  { name: 'guide', style: 'guide', title: '添加设备', html: `<section class="methods-section" aria-labelledby="methods-heading"><h2 id="methods-heading" class="section-label">选择接入方式</h2>${menu(menus[0].tools)}<h2 class="section-label other-heading">其他</h2>${menu([{ id: 'static', title: '已有设备使用 Key', icon: 'fa-key-skeleton', description: '沿用已有设备凭据，不新建协议。' }])}</section>` },
  { name: 'ble-candidate', style: 'ble', title: '蓝牙设备', html: `<section class="setup-card"><h2>连接蓝牙设备</h2><ol class="setup-steps"><li><span class="step-number">1</span><div><strong>让设备进入可发现状态</strong><p>附近广播只用于发现，不代表完成授权或连接。</p></div></li></ol></section><label class="device-name"><span>设备名称</span><input aria-label="设备名称" value="客厅设备"></label><div class="ble-candidates"><button type="button">${icon('fa-signal-stream')}<span><strong>${long}</strong><small>实例标识：静态示意，不使用 MAC 判定身份</small></span><small class="candidate-rssi">-59 dBm</small></button></div>${button('重新扫描', 'primary-action')}${details('恢复说明', '失败后保留当前信息，只通过原认领入口重试。')}` },
  { name: 'key-result', style: 'key', title: '设备 Key', html: `<section class="key-result" role="status"><span class="success-icon" aria-hidden="true">${icon('fa-check')}</span><h1>设备接入信息已创建</h1><p>创建、获取 Key 与设备上线分别确认。</p><div class="key-card"><span>DeviceKey · 仅静态示意</span><div class="key-value-row"><code>STATIC_DEMO_NOT_A_CREDENTIAL_012345678901234567890123456789</code>${button(icon('fa-eye'), 'key-visibility', 'aria-label="显示或隐藏 Key" aria-pressed="false"')}</div>${button(`${icon('fa-copy')}复制`, 'copy-action')}</div><details class="setup-example"><summary>接入示例</summary><p>此处仅示意代码展示，不包含账号或网络参数。</p><pre tabindex="0"><code>const char *key = "STATIC_DEMO_NOT_A_CREDENTIAL";</code></pre></details>${button('完成', 'primary-action complete-action')}</section>` },
  { name: 'provision-scan', style: 'provision', title: 'ESP32 配网', main: 'tool-page-shell', html: `<div class="notice warning" role="note">${icon('fa-rotate')}<div><strong>这是原设备重新配网</strong><span>只核对当前实例；刷新 Key 与网络配置分别确认。</span></div></div><section class="form-card"><div class="section-title"><div><span>步骤 1</span><h2>连接配网设备</h2></div><span class="protocol-chip">Security 1</span></div><div class="transport-switch" role="group" aria-label="配网传输方式">${button('BLE', 'active', 'aria-pressed="true"')}${button('SoftAP', '', 'aria-pressed="false"')}</div><div class="scan-options">${input('设备名称前缀', 'STATIC_')}${button('扫描 ESP32', 'primary-button compact')}</div><div class="device-list">${button(`<span class="device-icon">${icon('fa-microchip')}</span><span class="device-copy"><strong>${long}</strong><span>静态候选，不创建连接或云端身份</span></span><span class="rssi">-58 dBm</span>`, 'device-row')}</div></section>${details('配网说明', '设备需支持 2.4 GHz；原认领、Key 与配网链路不变。')}` },
  { name: 'provision-network', style: 'provision', title: 'ESP32 配网', main: 'tool-page-shell', html: `<section class="connected-card"><span class="connected-icon">${icon('fa-check')}</span><div><strong>${long}</strong><span>BLE · Security 1 · 安全会话已连接，不等于云在线</span></div>${button('更换')}</section><section class="form-card wifi-card"><div class="section-title"><div><span>步骤 2</span><h2>选择目标 Wi-Fi</h2></div>${button('刷新', 'refresh-button')}</div>${input('Blinker 设备名称', '静态示意设备')}${input('Wi-Fi 名称', 'STATIC_DEMO_NETWORK')}<div class="field-group"><label>Wi-Fi 密码</label><div class="input-shell"><input type="password" aria-label="Wi-Fi 密码" value="STATIC_DEMO"><button type="button" class="inline-action" aria-label="显示或隐藏密码" aria-pressed="false">${icon('fa-eye')}</button></div></div>${button('<span class="checkbox">✓</span><span>记住此 Wi-Fi</span>', 'remember-row selected', 'aria-pressed="true"')}${button('发送 Wi-Fi 配置', 'primary-button provision-button', 'disabled')}</section><section class="status-card error" role="status"><div class="status-head"><span class="status-icon">${icon('fa-exclamation')}</span><div><strong>网络配置尚未确认</strong><span>保留当前输入，可以沿原链路重新开始。</span></div></div>${button('重新开始', 'retry-button')}</section>` },
  { name: 'share-list', style: 'share', title: '设备共享', main: 'sharing-page', action: '打开分享链接', html: `<div class="share-categories" role="group" aria-label="设备共享分类">${button('我的设备', '', 'aria-pressed="false"')}${button('分享给我 <span class="invitation-count">1</span>', 'selected', 'aria-pressed="true"')}</div><p class="error-notice" role="alert">刷新尚未完成，保留现有记录。${button('重试')}</p><section class="share-section received-devices"><div class="section-heading"><h2>分享给我的设备</h2></div><div class="device-list">${sharedRow}</div></section><section class="share-section local-bookmarks"><div class="section-heading"><h2>本机只读收藏</h2></div><p class="section-note">本机只读收藏不是账号共享，不获得控制权限。</p><div class="device-list"><div class="device-entry"><a href="#static-bookmark" class="device-row"><span class="device-copy"><strong>${long}</strong><small>仅本机只读收藏</small></span></a>${button(icon('fa-xmark'), 'remove-action', 'aria-label="移除本机收藏"')}</div></div></section>` },
  { name: 'invitation', style: 'invitation', title: '设备邀请', main: 'invitation-page', html: `<section class="invitation-card surface-card"><div class="device-heading"><span class="device-mark">${icon('fa-microchip')}</span><h1>${long}</h1></div><dl class="invitation-details"><div><dt>有效期</dt><dd>2026/10/30 08:30</dd></div><div><dt>权限</dt><dd>仅查看</dd></div></dl></section><div class="invitation-actions" aria-busy="true">${ion('正在接受…', 'expand="block" disabled')}${ion('拒绝邀请', 'expand="block" fill="clear" disabled')}</div><section class="status-panel surface-card"><h1>已接受分享</h1><p class="sync-notice" role="status">设备权限同步中</p><p class="open-error" role="alert">进入设备暂未完成，已接受的结果仍保留。</p>${ion('进入设备', 'expand="block"')}</section>` },
  { name: 'device-sharing', style: 'device', title: '设备共享', main: 'device-sharing-page', html: `<section class="surface-card sharing-heading"><h1>${long}</h1><p>查询、控制与编辑权限分别设置。</p></section><section class="settings-card public-card"><label class="public-access-row" data-target><span class="setting-copy"><strong>公开只读访问</strong><small>开启后链接可被他人查看</small></span><input type="checkbox" class="toggle" aria-label="公开只读访问"></label><p class="public-note">公开链接可被转发，风险不可隐藏。</p><div class="public-link-row"><div class="public-link-heading"><span>公开链接</span>${button('复制', 'copy-action')}</div><p class="public-link">https://example.invalid/STATIC_DEMO_NOT_AN_INVITATION_012345678901234567890123456789</p></div><div class="link-row"><span class="link-expiry">7天有效</span>${button('设置', 'text-action link-settings-action')}</div></section><section class="members-section"><div class="section-heading"><h2>共享成员</h2><div class="invite-actions">${button('邀请成员')}</div></div><div class="settings-card member-list"><div class="member-row"><span class="member-avatar">${icon('fa-user')}</span><span class="member-copy"><strong>${long}</strong><small>仅查看 · 权限同步中</small></span>${button(icon('fa-ellipsis'), 'icon-action', 'aria-label="成员权限"')}</div></div></section>` },
  { name: 'share-modal', style: 'device', title: '设备共享', modal: true, html: `<div class="share-options"><header class="options-heading"><h2>邀请设置</h2>${button(icon('fa-xmark'), 'icon-action', 'aria-label="关闭邀请设置"')}</header><p class="invitation-device">${long}</p><section class="permission-options"><label class="permission-option" data-target><span class="setting-copy"><strong>控制设备</strong><small>查询与控制权限仍按原合同设置。</small></span><input class="toggle" type="checkbox"></label><label class="permission-option" data-target><span class="setting-copy"><strong>编辑控制台</strong><small>修改对所有查看者生效。</small></span><input class="toggle" type="checkbox"></label></section><span class="options-label">有效期</span><div class="expiry-options">${button('1小时')}${button('1天')}${button('7天', 'selected', 'aria-pressed="true"')}${button('30天')}</div><p class="options-note">确认后才创建邀请；失败保留当前选择。</p>${button('确认邀请设置', 'options-save')}</div>` },
  { name: 'tools', style: 'tools', title: '工具', tab: true, main: 'tools-page', html: menus.map((group, index) => `<section class="tool-section" aria-labelledby="tools-group-${index}"><h2 id="tools-group-${index}">${group.title}</h2>${menu(group.tools)}</section>`).join('') },
];
for (const [path, marker] of [
  ['src/app/sections/guide/guide.page.html', 'appearance="settings"'],
  ['src/app/sections/guide/ble-device/ble-device.page.html', 'class="ble-candidates"'],
  [`${files.key}.html`, 'class="setup-example"'], [`${files.provision}.html`, 'class="tool-page-shell"'],
  [`${files.share}.html`, 'class="share-categories"'], [`${files.invitation}.html`, 'class="invitation-card surface-card"'],
  [`${files.device}.html`, 'class="device-sharing-page"'], [`${files.tools}.html`, 'appearance="settings"'],
]) assert.ok(read(path).includes(marker), `${path}: fixture source structure changed`);

const screenshotDir = process.env.UI6_SCREENSHOT_DIR;
if (screenshotDir) { assert.ok(isAbsolute(screenshotDir), 'UI6_SCREENSHOT_DIR must be absolute'); mkdirSync(screenshotDir, { recursive: true }); }
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><body></body></html>'); return; }
  let source;
  if (/^\/ionic\/[\w./-]+\.(js|svg)$/.test(path) && !path.includes('..')) source = `node_modules/@ionic/core/${path.slice(7)}`;
  if (/^\/webfonts\/fa-[\w-]+\.(woff2|ttf)$/.test(path)) source = `public/fontawesome6${path}`;
  if (!source) { response.writeHead(404).end(); return; }
  try { response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.svg') ? 'image/svg+xml' : 'font/woff2'); response.end(readFileSync(new URL(source, root))); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
let passed = 0;
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
  await page.goto(origin);
  // Font-face registration belongs in the document; fixture child components
  // still receive the actual icon selectors in their own presentation scope.
  await page.addStyleTag({ content: `${fontCss}${themeCss}body{margin:0;font-family:system-ui}probe-page{display:block;height:100vh}` });
  await page.evaluate(async () => { const { defineCustomElements } = await import('/ionic/loader/index.es2017.js'); await defineCustomElements(window); });
  for (const fixture of cases) for (const mode of ['ios', 'md']) for (const theme of ['natural', 'dark'])
    for (const width of [320, 375, 844]) for (const scale of [1, 1.5]) {
      const safeTop = width === 844 ? 20 : 0, height = width === 844 ? 390 : 900;
      await page.setViewportSize({ width, height });
      await page.evaluate(async ({ fixture, mode, theme, scale, safeTop, globalCss, pageCss, menuCss, fontCss }) => {
        document.documentElement.setAttribute('data-ui-theme', theme);
        document.documentElement.style.cssText = `font-size:${16 * scale}px;--ion-safe-area-top:${safeTop}px;--ion-safe-area-bottom:20px;--ion-safe-area-left:0px;--ion-safe-area-right:0px`;
        document.body.innerHTML = '<probe-page></probe-page>';
        const shell = document.querySelector('probe-page');
        shell.attachShadow({ mode: 'open' }).innerHTML = `<style>${globalCss}${pageCss}:host{display:block;position:relative;height:100vh}*{box-sizing:border-box}.fixture-note{font-size:.75rem;color:var(--blinker-text-secondary)}</style><ion-header class="${fixture.tab ? 'main-tab-header' : ''}" mode="${mode}"><ion-toolbar mode="${mode}">${fixture.tab ? '' : `<ion-buttons slot="start"><ion-back-button mode="${mode}" text="" default-href="/fixture"></ion-back-button></ion-buttons>`}<ion-title mode="${mode}">${fixture.title}</ion-title>${fixture.action ? `<ion-buttons slot="end"><ion-button mode="${mode}" aria-label="${fixture.action}"><i class="fa-light fa-plus" aria-hidden="true"></i></ion-button></ion-buttons>` : ''}</ion-toolbar></ion-header><ion-content mode="${mode}" fullscreen><main class="${fixture.main || ''}">${fixture.modal ? '' : fixture.html}<p class="fixture-note">UI6 · SCSS + Ionic 静态夹具 · 非真实账号／设备或原生验收</p></main></ion-content>`;
        for (const current of shell.shadowRoot.querySelectorAll('probe-menu')) {
          const items = JSON.parse(decodeURIComponent(current.dataset.items));
          current.attachShadow({ mode: 'open' }).innerHTML = `<style>${fontCss}${menuCss}*{box-sizing:border-box}:host{display:block;min-width:0}</style><div class="menu-list menu-list--settings" role="group">${items.map(item => `<button type="button" class="menu-row${item.muted ? ' menu-row--muted' : ''}">${item.icon ? `<span class="menu-icon" aria-hidden="true"><i class="fa-light ${item.icon}"></i></span>` : ''}<span class="menu-copy"><span class="menu-title">${item.title}</span><span class="menu-description">${item.description || ''}</span></span>${item.badge ? `<span class="menu-badge">${item.badge}</span>` : ''}${item.showChevron !== false ? '<i class="fa-light fa-chevron-right menu-arrow" aria-hidden="true"></i>' : ''}</button>`).join('')}</div>`;
        }
        if (fixture.modal) {
          const bodyStyle = document.createElement('style'); bodyStyle.textContent = pageCss; document.body.append(bodyStyle);
          if (!customElements.get('probe-options')) customElements.define('probe-options', class extends HTMLElement {});
          const modal = document.createElement('ion-modal'); modal.className = 'share-options-modal'; modal.mode = mode;
          modal.component = 'probe-options'; modal.backdropDismiss = false; modal.animated = false;
          document.body.append(modal); await modal.present();
          modal.querySelector('probe-options').innerHTML = fixture.html;
        }
        const roots = [shell.shadowRoot, ...shell.shadowRoot.querySelectorAll('probe-menu')].map(current => current.shadowRoot || current);
        for (const current of roots) for (const element of current.querySelectorAll('ion-button,ion-input,ion-select')) element.setAttribute('mode', mode);
      }, { fixture, mode, theme, scale, safeTop, globalCss, pageCss: styles[fixture.style], menuCss, fontCss });
      await page.waitForFunction(() => [...document.querySelector('probe-page').shadowRoot.querySelectorAll('ion-toolbar,ion-title,ion-button,ion-back-button,ion-content')].every(el => el.classList.contains('hydrated')));
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(({ modal }) => {
        const shell = document.querySelector('probe-page'), root = shell.shadowRoot;
        const actualModal = document.querySelector('ion-modal');
        const roots = modal ? [actualModal.querySelector('probe-options')] : [root, ...[...root.querySelectorAll('probe-menu')].map(menu => menu.shadowRoot)];
        const visible = element => (!element.closest('details:not([open])') || element.tagName === 'SUMMARY') && element.getBoundingClientRect().width > 0;
        const rect = element => { const r = element.getBoundingClientRect(); return { name: element.className || element.tagName, x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
        const elements = roots.flatMap(current => [...current.querySelectorAll('button,a,ion-button,ion-back-button,input:not([type="checkbox"]):not([type="radio"]),select,summary,[data-target]')]).filter(visible);
        const overlaps = [];
        for (let i = 0; i < elements.length; i++) for (let j = i + 1; j < elements.length; j++) {
          if (elements[i].contains(elements[j]) || elements[j].contains(elements[i])) continue;
          const a = elements[i].getBoundingClientRect(), b = elements[j].getBoundingClientRect();
          if (Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) overlaps.push([elements[i].outerHTML.slice(0,80),elements[j].outerHTML.slice(0,80)]);
        }
        const main = root.querySelector('main'), content = root.querySelector('ion-content');
        return { targets: elements.map(rect), overlaps, toolbar: rect(root.querySelector('ion-toolbar')), title: rect(root.querySelector('ion-title')),
          buttons: [...root.querySelectorAll('ion-buttons > *')].map(rect), first: rect(main.children[0]),
          text: roots.flatMap(current => [...current.querySelectorAll('h1,h2,p,strong,small,code,label,dt,dd,.menu-title,.menu-description,.menu-badge')]).filter(visible).map(rect),
          background: getComputedStyle(shell).backgroundColor,
          modalBackground: actualModal ? getComputedStyle(actualModal).getPropertyValue('--blinker-surface').trim() : null,
          bottomPadding: parseFloat(getComputedStyle(main).paddingBottom), scrollWidth: content.shadowRoot.querySelector('.inner-scroll').scrollWidth,
        };
      }, { modal: fixture.modal || false });
      const label = `${fixture.name}/${mode}/${theme}/${width}/${scale}`;
      assert.equal(result.background, theme === 'natural' ? 'rgb(242, 243, 245)' : 'rgb(17, 18, 21)', `${label}: scoped palette`);
      for (const target of result.targets) {
        assert.ok(target.w >= 47.9 && target.h >= 47.9, `${label}: target below 48px ${JSON.stringify(target)}`);
        assert.ok(target.x >= -.5 && target.right <= width + .5, `${label}: target overflow ${JSON.stringify(target)}`);
      }
      for (const text of result.text) assert.ok(text.x >= -.5 && text.right <= width + .5, `${label}: text overflow ${JSON.stringify(text)}`);
      assert.deepEqual(result.overlaps, [], `${label}: unrelated target overlap`);
      assert.ok(result.scrollWidth <= width + 1, `${label}: horizontal page scroll`);
      if (!fixture.modal) {
        assert.ok(result.toolbar.h >= 55.9, `${label}: toolbar height`);
        assert.ok(result.first.y >= safeTop + (fixture.tab ? 64 : 56) - .5, `${label}: content hidden by header`);
        assert.ok(result.bottomPadding >= (fixture.tab ? 107.9 : 51.9), `${label}: bottom safe area`);
        if (result.buttons.length) {
          assert.ok(result.title.x >= result.buttons[0].right - .5, `${label}: title overlaps back`);
          if (fixture.action) assert.ok(result.title.right <= result.buttons[1].x + .5, `${label}: title overlaps action`);
        }
      } else assert.ok(result.modalBackground, `${label}: portal has explicit surface tokens`);
      const focused = await page.evaluate(({ modal }) => {
        const root = modal ? document.querySelector('ion-modal').querySelector('probe-options') : document.querySelector('probe-page').shadowRoot;
        const target = root.querySelector('summary') || root.querySelector('button:not([disabled])') || root.querySelector('probe-menu')?.shadowRoot.querySelector('button');
        if (!target) return null;
        target.focus(); const r = target.getBoundingClientRect();
        return { name: target.tagName, focus: target.matches(':focus-visible'), outline: getComputedStyle(target).outlineWidth, y: r.y, bottom: r.bottom };
      }, { modal: fixture.modal || false });
      if (focused) {
        assert.equal(focused.focus, true, `${label}: keyboard focus`);
        assert.ok(parseFloat(focused.outline) >= 2, `${label}: visible focus`);
        assert.ok(focused.y >= (fixture.modal ? 0 : safeTop + (fixture.tab ? 64 : 56)) - .5 && focused.bottom <= height + .5, `${label}: focus not obscured`);
        if (focused.name === 'SUMMARY') { await page.keyboard.press('Enter'); assert.ok(await page.evaluate(() => document.querySelector('probe-page').shadowRoot.querySelector('details').open), `${label}: native details keyboard expansion`); }
      }
      if (screenshotDir && mode === 'ios' && width === 375 && scale === 1 && ['provision-network', 'device-sharing', 'tools'].includes(fixture.name)) {
        await page.evaluate(async () => { const root = document.querySelector('probe-page').shadowRoot; for (const menu of root.querySelectorAll('probe-menu')) menu.shadowRoot.activeElement?.blur(); root.activeElement?.blur(); await root.querySelector('ion-content').scrollToTop(0); const note = document.createElement('p'); note.textContent = 'UI6 · 静态 CSS / Ionic 夹具 · 非原生验收'; note.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:1000;margin:0;padding:8px;background:#202226;color:white;font:12px system-ui;text-align:center;pointer-events:none'; document.body.append(note); });
        await page.screenshot({ path: join(screenshotDir, `${fixture.name}-${theme}.png`) });
      }
      passed++;
    }
  console.log(`UI6 static entry/Ionic presentation: ${passed} cases passed (not Angular/native/device acceptance).`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
