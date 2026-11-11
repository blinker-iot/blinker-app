// UI2 CSS fixtures: real compiled page SCSS, synthetic non-secret text.
// Not an Angular/Ionic, native, account, storage, API or device acceptance test.
// Uses the existing optional SETTINGS_BROWSER_DRIVER/EXECUTABLE absolute paths.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const read = path => readFileSync(new URL(path, app), 'utf8');
const compile = path => sass.compile(fileURLToPath(new URL(path, app)), {
  logger: sass.Logger.silent,
  loadPaths: [fileURLToPath(new URL('node_modules/', app))],
}).css;
for (const key of ['SETTINGS_BROWSER_DRIVER', 'SETTINGS_BROWSER_EXECUTABLE']) {
  if (process.env[key]) assert.ok(isAbsolute(process.env[key]), `${key} must be absolute`);
}
const { chromium } = require(process.env.SETTINGS_BROWSER_DRIVER || 'playwright');
const pages = {
  profile: 'src/app/home/components/tab-profile/tab-profile',
  settings: 'src/app/sections/settings/settings.page',
  user: 'src/app/sections/user/user.page',
  server: 'src/app/sections/self-hosted-server/self-hosted-server.page',
};
const css = Object.fromEntries(Object.entries(pages).map(([kind, path]) => [kind, compile(`${path}.scss`)]));
const menuCss = compile('src/app/core/components/menu-list/menu-list.scss');
const themeCss = sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', {
  loadPaths: [fileURLToPath(new URL('src/theme/', app))],
}).css;

// Fail if production markup changes without updating the corresponding fixture.
for (const [kind, classes] of Object.entries({
  profile: ['profile-content', 'account-card', 'user-info', 'account-card-details', 'account-entitlements', 'plan-badge', 'device-quota', 'account-refresh', 'profile-support', 'support-links', 'support-logout', 'profile-version'],
  settings: ['settings-card', 'settings-disclosure', 'row-title', 'row-value', 'disclosure-content', 'language-options', 'language-option', 'theme-options', 'theme-option', 'option-copy', 'option-description', 'service-region-option'],
  user: ['editor-content', 'account-card', 'account-identity', 'avatar-preview', 'account-copy', 'account-details', 'read-row', 'security-section', 'section-help'],
  server: ['server-form', 'section-heading', 'field-label', 'input-shell', 'field-help', 'field-error', 'key-toggle', 'save-success', 'save-button', 'clear-button', 'privacy-tip'],
})) for (const name of classes) {
  assert.match(read(`${pages[kind]}.html`), new RegExp(`class="[^"\\n]*\\b${name}\\b`), `${kind}: update ${name} fixture`);
}

const icon = (arrow = false) => `<svg viewBox="0 0 24 24" aria-hidden="true">${arrow ? '<path d="m9 6 6 6-6 6"/>' : '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12h8"/>'}</svg>`;
const glyph = arrow => `<i aria-hidden="true">${icon(arrow)}</i>`;
const menu = entries => `<app-menu-list><div class="menu-list menu-list--settings" role="group">${entries.map(([title, value, danger = false]) => `<button type="button" class="menu-row ${danger ? 'menu-row--danger' : ''}"><span class="menu-icon">${glyph()}</span><span class="menu-copy"><span class="menu-title">${title}</span></span>${value ? `<span class="menu-value">${value}</span>` : ''}${danger ? '' : `<i class="menu-arrow">${icon(true)}</i>`}</button>`).join('')}</div></app-menu-list>`;
const longName = 'CSS 测试用户 长名称与多语言 Example profile name';

function profileFixture(unknown) {
  return `<div class="profile-content"><section class="account-card" aria-labelledby="account-title"><h2 id="account-title" class="visually-hidden">账号与权益</h2><button type="button" class="user-info"><span class="avatar" aria-hidden="true"><span>B</span></span><span class="info"><span class="name">${longName}</span></span><i class="profile-arrow">${icon(true)}</i></button><div class="account-card-details"><dl class="account-entitlements"><div class="account-plan"><dt class="visually-hidden">套餐</dt><dd><span class="plan-badge ${unknown ? '' : 'pro'}">${unknown ? '套餐待查询' : 'Pro'}</span></dd></div><div class="account-quota"><dt>自有设备额度</dt><dd class="device-quota">${unknown ? '待查询' : '21 / 100 台'}</dd></div></dl><button type="button" class="account-refresh" aria-label="刷新账号权益">${glyph()}</button></div>${unknown ? '<p class="account-status" role="status">更新未完成，当前显示上次获取的数据。请稍后重试。</p>' : ''}<p class="account-hint">共享设备不计入自有设备额度。</p></section><section class="profile-menu-group">${menu([['区域管理', '2 个区域'], ['自动化', ''], ['设备共享', '2 台分享给我']])}</section><section class="profile-menu-group">${menu([['自建服务器', '独立配置'], ['第三方服务', '天气与地理服务']])}</section><div class="profile-support"><div class="support-links"><button type="button">意见反馈</button><button type="button">关于我们</button></div><button type="button" class="support-logout">退出登录</button></div><div class="profile-version"><span>版本 CSS-FIXTURE-3.0.0</span><span class="version-dot" aria-hidden="true"></span></div></div>`;
}

function settingsFixture() {
  const choice = (label, group, checked = false) => `<label class="${group}-option ${checked ? 'selected' : ''}"><input type="radio" name="${group}" value="${label}" ${checked ? 'checked' : ''}/><span>${label}</span></label>`;
  const summary = (id, title, value) => `<summary><i class="row-icon">${icon()}</i><span class="row-title" id="${id}">${title}</span><span class="row-value">${value}</span><i class="row-arrow">${icon(true)}</i></summary>`;
  const preview = theme => `<span class="theme-preview preview-${theme}" aria-hidden="true"><span class="preview-header"></span><span class="preview-card preview-card-main"></span><span class="preview-card preview-card-small"></span><span class="preview-nav"><b></b><b></b><b></b></span></span>`;
  return `<main><section class="settings-card"><details class="settings-disclosure" open>${summary('language-heading', '语言', '简体中文')}<div class="disclosure-content"><p class="help" id="language-hint">选择应用显示语言。</p><fieldset class="language-options" aria-labelledby="language-heading" aria-describedby="language-hint">${choice('简体中文', 'language', true)}${choice('English', 'language')}${choice('繁體中文', 'language')}${choice('日本語', 'language')}</fieldset></div></details><details class="settings-disclosure" open>${summary('theme-heading', '外观', '浅色')}<div class="disclosure-content"><p class="help" id="theme-hint">选择应用外观，不改变设备组件的独立主题。</p><fieldset class="theme-options" aria-labelledby="theme-heading" aria-describedby="theme-hint">${['light', 'dark'].map((theme, i) => `<label class="theme-option ${i ? '' : 'selected'}">${preview(theme)}<span class="option-copy"><span class="option-title">${i ? '深色' : '浅色'}</span><span class="option-description">${i ? '舒适的深色界面' : '清晰的浅色界面'}</span></span><input type="radio" name="theme" value="${theme}" ${i ? '' : 'checked'}/></label>`).join('')}</fieldset><p class="help">选择后立即应用。</p></div></details></section><section class="settings-card"><details class="settings-disclosure" open>${summary('region-heading', '服务地区', 'Development')}<div class="disclosure-content"><p id="region-hint" class="help region-warning">切换服务地区会退出当前账号，需要重新登录。</p><fieldset class="service-region-options" aria-labelledby="region-heading" aria-describedby="region-hint">${choice('China', 'service-region')}${choice('Global', 'service-region')}${choice('Development', 'service-region', true)}</fieldset></div></details></section></main>`;
}

function userFixture() {
  return `<main class="editor-content"><section class="account-card"><div class="account-identity"><div class="avatar-preview" aria-hidden="true"><span>B</span></div><div class="account-copy"><h1>${longName}</h1><p>资料仅支持查看</p></div></div><dl class="account-details"><div class="read-row"><dt>昵称</dt><dd>${longName}</dd></div><div class="read-row"><dt>邮箱</dt><dd>css-fixture-${'long-name-'.repeat(5)}@example.invalid</dd></div></dl></section><section class="security-section"><h2 class="section-label">账户安全</h2>${menu([['注销账号', '', true]])}<p class="section-help">注销需先解除全部设备绑定，并完成专用邮箱验证码验证。</p></section></main>`;
}

function serverFixture(invalid) {
  const field = (key, label, value, help, error) => `<div class="field ${invalid ? 'field-invalid' : ''}"><label class="field-label" for="${key}"><span>${label}</span><small>必填</small></label><span class="input-shell">${glyph()}<input id="${key}" type="${key === 'key' ? 'password' : 'url'}" value="${value}" aria-invalid="${invalid}" aria-describedby="${key}-help ${key}-error"/>${key === 'key' ? `<button type="button" class="key-toggle" aria-label="显示服务器密钥">${glyph()}</button>` : ''}</span><small id="${key}-help" class="field-help">${help}</small>${invalid ? `<small id="${key}-error" class="field-error" role="alert">${error}</small>` : ''}</div>`;
  return `<main><form class="server-form"><h2 class="section-heading">连接配置</h2>${field('address', '服务器地址', 'https://css-fixture.example.invalid/' + 'long-path-'.repeat(8), '支持 HTTP、HTTPS、WS 和 WSS，请填写完整协议。', '请输入包含协议的有效服务器地址。')}${field('key', '服务器密钥', 'CSS-FIXTURE-NOT-A-SECRET-' + 'abcdef'.repeat(10), '密钥仅保存在当前设备，请勿分享给他人。', '请输入服务器密钥。')}${invalid ? '' : `<div class="save-success" role="status">${glyph()}配置已保存到当前设备</div>`}<button type="submit" class="save-button">保存配置</button><button type="button" class="clear-button">清除配置</button></form><aside class="privacy-tip">${glyph()}<div><strong>独立配置</strong><p>这里的设置不会修改应用内置的 API 地址或现有账户连接。</p></div></aside></main>`;
}

const fixtures = [
  { kind: 'profile', state: 'ready', html: () => profileFixture(false) },
  { kind: 'profile', state: 'unknown', html: () => profileFixture(true) },
  { kind: 'settings', state: 'expanded', html: settingsFixture },
  { kind: 'user', state: 'readonly', html: userFixture },
  { kind: 'server', state: 'saved', html: () => serverFixture(false) },
  { kind: 'server', state: 'invalid', html: () => serverFixture(true) },
];
const baseCss = `${themeCss}*{box-sizing:border-box}body{margin:0;background:var(--blinker-bg);color:var(--blinker-text-primary);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Sans SC',sans-serif}.fixture-caption{margin:0;padding:10px 16px;font-size:11px;color:var(--blinker-text-secondary)}probe-content{display:block}svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.7;vertical-align:middle}button,input{font-family:inherit}`;
const browser = await chromium.launch({ headless: true, ...(process.env.SETTINGS_BROWSER_EXECUTABLE ? { executablePath: process.env.SETTINGS_BROWSER_EXECUTABLE } : {}) });
const output = new URL('tmp/profile-settings-ui/', app);
mkdirSync(output, { recursive: true });
let requests = 0;
let cases = 0;
const failures = [];
const screenshots = [];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => { requests++; return route.abort(); });
  async function render(fixture, theme, width, scale) {
    await page.setViewportSize({ width, height: width === 844 ? 480 : 920 });
    await page.setContent(`<html data-ui-theme="${theme}" style="font-size:${16 * scale}px"><style>${baseCss}</style><body><p class="fixture-caption">CSS 静态夹具 · 非真实账号／原生 App</p><probe-content></probe-content></body></html>`);
    await page.evaluate(({ css, html }) => {
      document.querySelector('probe-content').attachShadow({ mode: 'open' }).innerHTML = `<style>*{box-sizing:border-box}svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.7;vertical-align:middle}${css}</style>${html}`;
    }, { css: `${css[fixture.kind]}${menuCss}`, html: fixture.html() });
  }
  for (const fixture of fixtures) for (const theme of ['natural', 'dark']) for (const width of [320, 375, 430, 844]) for (const scale of [1, 1.5]) {
    await render(fixture, theme, width, scale);
    const errors = await page.evaluate(({ kind, scale }) => {
      const host = document.querySelector('probe-content');
      const root = host.shadowRoot;
      const errors = [];
      const rect = el => el.getBoundingClientRect();
      const check = (condition, message) => { if (!condition) errors.push(message); };
      const rgb = value => value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
      const over = (top, bottom) => {
        const alpha = top[3] ?? 1;
        return top.slice(0, 3).map((part, i) => part * alpha + bottom[i] * (1 - alpha));
      };
      const luminance = color => color.slice(0, 3).map(value => value / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
      const background = el => {
        const layers = [];
        while (el) {
          layers.push(rgb(getComputedStyle(el).backgroundColor));
          el = el.parentElement ?? el.getRootNode()?.host;
        }
        return layers.reverse().reduce((base, layer) => over(layer, base), [255, 255, 255]);
      };
      check(matchMedia('(prefers-reduced-motion: reduce)').matches, 'reduced motion absent');
      check(document.documentElement.scrollWidth <= innerWidth + 1, 'document horizontal overflow');
      check(host.scrollWidth <= host.clientWidth + 1, 'host horizontal overflow');
      for (const el of root.querySelectorAll('*:not(style):not(svg):not(path):not(rect):not(.visually-hidden)')) {
        const box = rect(el);
        check(box.left >= -0.5 && box.right <= innerWidth + 0.5, `${el.tagName}.${el.className}: outside viewport`);
      }
      const targets = [...root.querySelectorAll('button,input:not([type="radio"]),summary,label:has(input[type="radio"])')];
      for (const el of targets) check(rect(el).height >= 47.9 && rect(el).width >= 47.9, `${el.tagName}.${el.className}: target below48`);
      const buttons = [...root.querySelectorAll('button')];
      for (let a = 0; a < buttons.length; a++) for (let b = a + 1; b < buttons.length; b++) {
        const x = rect(buttons[a]), y = rect(buttons[b]);
        check(x.right <= y.left + 0.1 || y.right <= x.left + 0.1 || x.bottom <= y.top + 0.1 || y.bottom <= x.top + 0.1, 'button targets overlap');
      }
      for (const el of root.querySelectorAll('button,summary,label:has(input[type="radio"])')) check(getComputedStyle(el).transitionDuration === '0s', `${el.tagName}.${el.className}: motion not reduced`);
      const reading = root.querySelector(kind === 'profile' ? '.name' : kind === 'settings' ? '.row-title' : kind === 'user' ? 'h1' : 'input');
      const expectedRem = kind === 'profile' || kind === 'user' ? 1.25 : kind === 'settings' ? 0.9375 : 1;
      check(Math.abs(parseFloat(getComputedStyle(reading).fontSize) - 16 * scale * expectedRem) < 0.1, 'rem text did not scale');
      if (kind === 'settings') for (const radio of root.querySelectorAll('input[type="radio"]')) check(radio.closest('label') !== null, 'radio lacks whole-label target');
      if (kind === 'user') check(root.querySelectorAll('.account-details button,input').length === 0, 'readonly profile fixture has editable controls');
      if (kind === 'server') check(root.querySelector('#key').type === 'password', 'key not masked by default');
      for (const el of root.querySelectorAll('.account-hint,.account-status,.profile-version,.plan-badge,.help,.row-value,.option-description,.section-help,.field-help,.field-error,.privacy-tip p,.save-button,.clear-button')) {
        const bg = background(el);
        const fg = over(rgb(getComputedStyle(el).color), bg);
        const [a, b] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
        check((a + 0.05) / (b + 0.05) >= 4.5, `${el.tagName}.${el.className}: text contrast below4.5`);
      }
      return errors;
    }, { kind: fixture.kind, scale });
    if (errors.length) failures.push(`${fixture.kind}/${fixture.state}/${theme}/${width}/${scale}: ${errors.join('; ')}`);
    cases++;
  }

  await render(fixtures[2], 'natural', 320, 1);
  await page.locator('input[name="language"]').first().focus();
  await page.keyboard.press('ArrowRight');
  const radio = await page.evaluate(() => {
    const root = document.querySelector('probe-content').shadowRoot;
    const active = root.activeElement;
    return { value: active.value, checked: active.checked, ring: getComputedStyle(active.closest('label')).outlineWidth };
  });
  assert.equal(radio.value, 'English');
  assert.equal(radio.checked, true);
  assert.ok(parseFloat(radio.ring) >= 2, 'keyboard radio focus not visible');
  for (const fixture of [fixtures[0], fixtures[3], fixtures[4]]) {
    await render(fixture, 'dark', 375, 1);
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const root = document.querySelector('probe-content').shadowRoot;
      const active = root.activeElement;
      const target = active.tagName === 'INPUT' ? active.closest('.input-shell') : active;
      return getComputedStyle(target).outlineWidth;
    });
    assert.ok(parseFloat(focus) >= 2, `${fixture.kind}: keyboard focus not visible`);
  }
  for (const fixture of [fixtures[0], fixtures[2], fixtures[3], fixtures[5]]) for (const theme of ['natural', 'dark']) {
    await render(fixture, theme, 375, 1);
    const file = new URL(`${fixture.kind}-${theme}.png`, output);
    await page.screenshot({ path: fileURLToPath(file), fullPage: true });
    screenshots.push(fileURLToPath(file));
  }
  assert.equal(requests, 0, 'fixtures attempted external resource access');
  console.log(JSON.stringify({ status: failures.length ? 'FAIL' : 'PASS', geometryCases: cases, widths: [320, 375, 430, 844], themes: ['natural', 'dark'], remScales: [1, 1.5], keyboardFocus: true, reducedMotion: true, sampledTextContrastMinimum: 4.5, externalRequests: requests, screenshots, failures, limit: 'Synthetic CSS fixtures with actual compiled SCSS in this Chromium; sampled composed text contrast is not a full accessibility or old-engine audit. No Angular/Ionic lifecycle, real account, native font scaling, storage, API or device acceptance.' }, null, 2));
  assert.equal(failures.length, 0, failures.join('\n'));
} finally {
  await browser.close();
}
