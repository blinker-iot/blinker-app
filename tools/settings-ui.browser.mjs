// CSS-only fixtures compiled from the actual settings/selector/menu SCSS.
// No Angular/Ionic runtime, overlay lifecycle, account, device or native proof.
// Optional absolute paths: SETTINGS_BROWSER_DRIVER / SETTINGS_BROWSER_EXECUTABLE.
// Four review PNGs are written only to the gitignored tmp/settings-ui directory.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, app), 'utf8');
const require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const driver = process.env.SETTINGS_BROWSER_DRIVER;
if (driver) assert.ok(isAbsolute(driver), 'SETTINGS_BROWSER_DRIVER must be absolute');
if (process.env.SETTINGS_BROWSER_EXECUTABLE) assert.ok(isAbsolute(process.env.SETTINGS_BROWSER_EXECUTABLE), 'SETTINGS_BROWSER_EXECUTABLE must be absolute');
const { chromium } = require(driver || 'playwright');
const compile = path => sass.compile(fileURLToPath(new URL(path, app)), {
  logger: sass.Logger.silent,
  loadPaths: [fileURLToPath(new URL('node_modules/', app))],
}).css;
const settingsPath = 'src/app/sections/device/device-settings/device-settings';
const modePath = `${settingsPath.slice(0, settingsPath.lastIndexOf('/'))}/panel-mode-selector/panel-mode-selector.component`;
const settingsCss = compile(`${settingsPath}.scss`);
const modeCss = compile(`${modePath}.scss`);
const menuCss = compile('src/app/core/components/menu-list/menu-list.scss');
const themeCss = sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', {
  loadPaths: [fileURLToPath(new URL('src/theme/', app))],
}).css;

// Fail rather than silently keep checking fixtures for an obsolete structure.
for (const [path, classes] of [
  [`${settingsPath}.html`, ['device-card', 'device-summary', 'device-name-row', 'device-id', 'display-card', 'panel-mode-picker', 'display-entry', 'display-details', 'boolean-labels', 'access-card', 'key-row', 'key-actions', 'debug-switch', 'switch-track', 'reconfigure-card']],
  [`${modePath}.html`, ['mode-selector', 'mode-options', 'mode-option', 'current-badge', 'page-preview', 'option-title', 'option-description', 'confirm-action', 'cancel-action']],
  ['src/app/core/components/menu-list/menu-list.html', ['menu-row', 'menu-icon', 'menu-copy', 'menu-title', 'menu-description', 'menu-arrow']],
]) for (const name of classes) assert.match(read(path), new RegExp(`class="[^"\\n]*\\b${name}\\b`), `${path}: update the ${name} fixture`);

const icon = (kind = 'square') => `<svg viewBox="0 0 24 24" aria-hidden="true">${kind === 'arrow' ? '<path d="m9 6 6 6-6 6"/>' : kind === 'pen' ? '<path d="m5 15 10-10 4 4L9 19H5zm8-8 4 4"/>' : kind === 'copy' ? '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M15 8V4H4v12h4"/>' : '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12h8"/>'}</svg>`;
const glyph = kind => `<i aria-hidden="true">${icon(kind)}</i>`;
const button = (name, cls = '', kind = 'square') => `<button type="button" class="${cls}" aria-label="${name}">${glyph(kind)}</button>`;
const rows = [
  ['定时任务', '查看设备任务和执行状态', ''],
  ['实时数据', '按已有租约接收设备数据', ''],
  ['历史记录', '查看已上报的状态变化', ''],
  ['设备位置', '在地图上查看或调整设备位置', ''],
  ['活动记录', '查看最近 7 天保留的云端控制投递', ''],
];
const menu = entries => `<div class="menu-list menu-list--detailed menu-list--settings" role="group">${entries.map(([title, description, value]) => `<button class="menu-row" type="button"><span class="menu-icon">${glyph()}</span><span class="menu-copy"><span class="menu-title">${title}</span><span class="menu-description">${description}</span></span>${value ? `<span class="menu-value">${value}</span>` : ''}<i class="menu-arrow">${icon('arrow')}</i></button>`).join('')}</div>`;

function settingsFixture(expanded = true) {
  // Synthetic non-secret test strings. These are not an account or device.
  const id = 'CSS-FIXTURE-' + '0123456789abcdef'.repeat(4);
  const metadata = expanded ? `<div class="display-details"><div class="section-heading"><p class="help">控制页面、自动化和定时共用的名称，不改变设备代码中的 key。</p><button type="button">重新加载</button></div><fieldset><div class="display-field"><label>long_property_key_012345678901234<input value="客厅主灯的电源与显示名称" placeholder="功能名称"/></label><div class="boolean-labels"><label>开启 / true<input value="已经开启"/></label><label>关闭 / false<input value="已经关闭"/></label></div></div></fieldset><button class="display-save" type="button">保存功能名称</button></div>` : '';
  return `<main><section class="device-card">${button('修改设备图片', 'device-image-button').replace(/<i[\s\S]*<\/i>/, `<span class="device-image-shell"><b-device-img aria-hidden="true">${icon()}</b-device-img></span>`)}<div class="device-summary"><div class="device-name-row"><h1>客厅环境与设备控制长名称 Long device name</h1>${button('修改设备名称', 'rename-button', 'pen')}</div><button type="button" class="device-id" aria-label="复制设备 ID">ID: ${id}</button></div></section><section class="menu-group"><h2 class="section-label">名称与显示</h2><div class="display-card"><button class="panel-mode-picker" type="button"><i class="row-icon">${icon()}</i><span class="mode-label">显示模式</span><span class="mode-current">组件面板</span><i class="row-arrow">${icon('arrow')}</i></button><button class="display-entry" type="button"><i class="row-icon">${icon()}</i><span>功能名称</span><i class="row-arrow">${icon('arrow')}</i></button>${metadata}</div></section><section class="access-card"><div class="section-heading"><h2>设备 Key</h2><span>版本 4294967295</span></div><div class="key-row"><code class="revealed">CSS-FIXTURE-NOT-A-SECRET-${'abcdef0123456789'.repeat(3)}</code><div class="key-actions">${button('查看设备 Key')}${button('复制设备 Key', '', 'copy')}${button('刷新设备 Key', 'refresh-key')}</div></div><p class="help">刷新后旧 Key 立即失效，需同步更新设备代码。</p></section><section class="menu-group"><h2 class="section-label">设备功能</h2>${menu(rows)}</section><section class="menu-group"><h2 class="section-label">设备管理</h2>${menu([['区域', '你的个人区域分类，仅影响自己的设备列表', '起居室与开放办公区'], ['分享', '管理共享访问与设备权限', '']])}</section><section class="debug-entry"><span><strong>调试模式</strong><small>查看原始数据与指令</small></span><button class="debug-switch" type="button" role="switch" aria-checked="false" aria-label="调试模式"><span class="switch-track"><span></span></span></button></section><section class="reconfigure-card"><div><h2>重新配网</h2><p>只重新写入 Wi-Fi；保留当前设备、控制页面、DeviceKey 和 Direct BLE 控制权。</p></div><button type="button">开始${glyph('arrow')}</button></section></main>`;
}

function modeFixture(state = 'ready', draft = 'normal') {
  const hasCustom = state === 'ready';
  const shared = state === 'shared-empty';
  const preview = normal => normal ? '<span class="preview-heading"></span><span class="preview-caption"></span><span class="preview-grid"><span class="preview-tile"><span></span></span><span class="preview-tile"><span></span></span><span class="preview-tile wide"><span></span></span><span class="preview-tile wide short"><span></span></span></span><span class="preview-kind">布局示意</span>' : hasCustom ? '<span class="preview-heading"></span><span class="preview-caption"></span><span class="custom-hero"><span></span><span></span></span><span class="custom-detail"><span></span><span></span><span></span></span><span class="preview-kind">布局示意</span>' : '<span class="empty-preview-mark"></span><span class="empty-preview-label">尚未创建</span>';
  return `<section class="mode-selector"><p class="scope-note">${shared ? '仅更改这台手机的显示偏好，不改变所有者的设置或共享权限。' : '选择设备控制页的显示方式，两套面板内容都会保留。'}</p><fieldset class="mode-options"><legend>选择显示模式</legend>${['normal', 'custom'].map(mode => `<label class="mode-option ${draft === mode ? 'selected' : ''} ${shared && mode === 'custom' ? 'unavailable' : ''}"><span class="current-badge">${mode === 'normal' ? '当前使用' : ''}</span><span class="page-preview ${mode === 'normal' ? 'components-preview' : 'custom-preview'}" aria-hidden="true">${preview(mode === 'normal')}</span><span class="option-title"><span>${mode === 'normal' ? '组件面板' : '自定义面板'}</span><input type="radio" name="mode-fixture" value="${mode}" ${draft === mode ? 'checked' : ''} ${shared && mode === 'custom' ? 'disabled' : ''}/></span><span class="option-description">${mode === 'normal' ? '使用已有组件和布局' : hasCustom ? '使用 Agent 生成的页面' : shared ? '请所有者先创建面板' : '通过 Agent 创建页面'}</span></label>`).join('')}</fieldset><p class="preview-note">缩略图仅为布局示意，不读取设备数据，也不会发送控制。</p><p class="draft-note" role="status">${draft === 'normal' ? '选择另一种面板后确认应用。' : hasCustom ? '尚未确认，当前使用的显示模式未改变。' : '确认后进入创建页面，创建完成前不会切换。'}</p><div class="mode-actions"><button type="button" class="confirm-action" ${draft === 'normal' ? 'disabled' : ''}>${draft === 'custom' && !hasCustom ? '创建自定义面板' : draft === 'custom' ? '使用自定义面板' : '使用组件面板'}</button><button type="button" class="cancel-action">取消</button></div></section>`;
}

const baseCss = `${themeCss}*{box-sizing:border-box}body{margin:0;background:var(--blinker-bg);color:var(--blinker-text-primary);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Sans SC',sans-serif}.fixture-caption{margin:0;padding:10px 16px;font-size:11px;color:var(--blinker-text-secondary);border-bottom:1px solid var(--blinker-divider)}.fixture-title{max-width:720px;margin:0 auto;padding:18px 16px 0;font-size:1.125rem;font-weight:600}probe-settings,probe-mode{display:block}svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.7;vertical-align:middle}button,input{font-family:inherit}b-device-img{display:grid;place-items:center;color:var(--blinker-text-secondary)}b-device-img svg{width:40px;height:40px}`;
const browser = await chromium.launch({ headless: true, ...(process.env.SETTINGS_BROWSER_EXECUTABLE ? { executablePath: process.env.SETTINGS_BROWSER_EXECUTABLE } : {}) });
const output = new URL('tmp/settings-ui/', app);
mkdirSync(output, { recursive: true });
let cases = 0;
let requests = 0;
const screenshots = [];
const measuredFonts = [];
const failures = [];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => { requests++; return route.abort(); });

  async function render(kind, theme, width, scale, option) {
    await page.setViewportSize({ width, height: width === 844 ? 480 : 920 });
    await page.setContent(`<html data-ui-theme="${theme}" style="font-size:${16 * scale}px"><style>${baseCss}</style><body><p class="fixture-caption">CSS 静态夹具 · 非真实设备／原生 App</p><h1 class="fixture-title">${kind === 'settings' ? '设备设置' : '显示模式'}</h1><probe-${kind === 'settings' ? 'settings' : 'mode'}></probe-${kind === 'settings' ? 'settings' : 'mode'}></body></html>`);
    await page.evaluate(({ kind, css, html }) => {
      document.querySelector(`probe-${kind === 'settings' ? 'settings' : 'mode'}`).attachShadow({ mode: 'open' }).innerHTML = `<style>${css}svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.7;vertical-align:middle}b-device-img{display:grid;place-items:center}b-device-img svg{width:40px;height:40px}</style>${html}`;
    }, {
      kind,
      css: kind === 'settings' ? `${settingsCss}${menuCss}` : modeCss,
      html: kind === 'settings' ? settingsFixture(option !== 'closed') : modeFixture(option || 'ready'),
    });
  }

  for (const kind of ['settings', 'mode']) for (const option of kind === 'settings' ? ['expanded'] : ['ready', 'owner-empty', 'shared-empty']) {
    for (const theme of ['natural', 'dark']) for (const width of [320, 375, 430, 844]) for (const scale of [1, 1.5]) {
      await render(kind, theme, width, scale, option);
      const result = await page.evaluate(({ kind, scale }) => {
        const host = document.querySelector(`probe-${kind === 'settings' ? 'settings' : 'mode'}`);
        const root = host.shadowRoot;
        const errors = [];
        const rect = el => el.getBoundingClientRect();
        const check = (condition, message) => { if (!condition) errors.push(message); };
        check(matchMedia('(prefers-reduced-motion: reduce)').matches, 'reduced motion not enabled');
        check(document.documentElement.scrollWidth <= innerWidth + 1, 'document horizontal overflow');
        check(host.scrollWidth <= host.clientWidth + 1, 'host horizontal overflow');
        for (const el of root.querySelectorAll('*:not(style):not(svg):not(path):not(rect)')) {
          const box = rect(el);
          check(box.left >= -0.5 && box.right <= innerWidth + 0.5, `${el.tagName}.${el.className}: outside viewport`);
        }
        const targets = [...root.querySelectorAll('button, input:not([type="radio"]), .mode-option')];
        for (const el of targets) check(rect(el).height >= 47.9 && rect(el).width >= 47.9, `${el.tagName}.${el.className}: target below48`);
        const buttons = [...root.querySelectorAll('button')];
        for (let a = 0; a < buttons.length; a++) for (let b = a + 1; b < buttons.length; b++) {
          const x = rect(buttons[a]), y = rect(buttons[b]);
          check(x.right <= y.left + 0.1 || y.right <= x.left + 0.1 || x.bottom <= y.top + 0.1 || y.bottom <= x.top + 0.1, 'button target overlap');
        }
        if (kind === 'mode') {
          const options = [...root.querySelectorAll('.mode-option')].map(rect);
          check(Math.abs(options[0].top - options[1].top) <= 0.5, 'mode options do not share top');
          check(options[0].right < options[1].left, 'mode options are not side-by-side');
          check(getComputedStyle(root.querySelector('.mode-option')).transitionDuration === '0s', 'mode transition not reduced');
          check(Math.abs(parseFloat(getComputedStyle(root.querySelector('legend')).fontSize) - 16 * scale) < 0.1, 'rem text did not scale');
          for (const radio of root.querySelectorAll('input[type="radio"]')) check(radio.closest('label.mode-option') !== null, 'radio missing whole-card label target');
        } else {
          const first = root.querySelector('button');
          check(getComputedStyle(first).transitionDuration === '0s', 'settings transition not reduced');
          check(root.querySelector('.device-id').textContent.includes('CSS-FIXTURE'), 'long ID not present');
          check(root.querySelectorAll('.display-details input').length === 3, 'metadata stress inputs missing');
        }
        const reading = root.querySelector(kind === 'mode' ? 'legend' : '.device-name-row h1');
        return { errors, readingFontPx: getComputedStyle(reading).fontSize };
      }, { kind, scale });
      if (result.errors.length) failures.push(`${kind}/${option}/${theme}/${width}/${scale}: ${result.errors.join('; ')}`);
      if (width === 320 && theme === 'natural' && (option === 'expanded' || option === 'ready')) measuredFonts.push({ kind, scale, font: result.readingFontPx });
      cases++;
    }
  }

  // Native radio keyboard behavior only; Angular draft/persistence is unit-tested separately.
  await render('mode', 'natural', 320, 1, 'ready');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  const keyboard = await page.evaluate(() => {
    const root = document.querySelector('probe-mode').shadowRoot;
    const focused = root.activeElement;
    return { value: focused?.value, checked: focused?.checked, outline: getComputedStyle(focused.closest('label')).outlineWidth };
  });
  assert.equal(keyboard.value, 'custom');
  assert.equal(keyboard.checked, true);
  assert.ok(parseFloat(keyboard.outline) >= 2, 'keyboard radio focus not visible');
  await render('settings', 'dark', 375, 1, 'expanded');
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const root = document.querySelector('probe-settings').shadowRoot;
    return getComputedStyle(root.activeElement).outlineWidth;
  });
  assert.ok(parseFloat(focus) >= 2, 'settings keyboard focus not visible');

  for (const theme of ['natural', 'dark']) for (const kind of ['settings', 'mode']) {
    await render(kind, theme, 375, 1, kind === 'settings' ? 'closed' : 'ready');
    const file = new URL(`${kind}-${theme}.png`, output);
    await page.screenshot({ path: fileURLToPath(file), fullPage: true });
    screenshots.push(fileURLToPath(file));
  }
  assert.equal(requests, 0, 'fixture attempted external resource access');
  console.log(JSON.stringify({ status: failures.length ? 'FAIL' : 'PASS', geometryCases: cases, widths: [320, 375, 430, 844], themes: ['natural', 'dark'], remScales: [1, 1.5], measuredFonts, keyboardFocus: true, reducedMotion: true, externalRequests: requests, screenshots, failures, limit: 'Static synthetic DOM with actual compiled SCSS; no Angular/Ionic runtime, real account, native font scaling, overlay, API or device acceptance.' }, null, 2));
  assert.equal(failures.length, 0, failures.join('\n'));
} finally {
  await browser.close();
}
