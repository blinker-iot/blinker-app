// Bounded UI3 geometry checks using the real widget SCSS and local fonts.
// Static DOM fixtures only: no Angular handler, account, command, or layout write.
// WIDGET_BROWSER_DRIVER / WIDGET_BROWSER_EXECUTABLE may point to installed tools.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, app), 'utf8');
const require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const driver = process.env.WIDGET_BROWSER_DRIVER;
if (driver) assert.ok(isAbsolute(driver), 'WIDGET_BROWSER_DRIVER must be absolute');
const { chromium } = require(driver || 'playwright');
const compile = path => sass.compile(fileURLToPath(new URL(path, app)), {
  logger: sass.Logger.silent, loadPaths: [fileURLToPath(new URL('node_modules/', app))],
}).css;
const widgetPath = name => `src/app/device/v2/widgets/${name}/${name}-widget`;
const names = ['keys', 'levels', 'picker', 'dial'];
const styles = Object.fromEntries(names.map(name => [name, compile(`${widgetPath(name)}.scss`)]));
const grid = compile('src/app/device/v2/panel/page-layout-panel.scss');
const wrapper = read('src/app/device/v2/panel/page-widget.ts').match(/styles:\s*\['(:host[^']+)'\]/)?.[1];
assert.ok(wrapper, 'update fixture after PageWidget host styles change');
const themes = sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', {
  loadPaths: [fileURLToPath(new URL('src/theme/', app))],
}).css;
const fonts = [['outfit', 'Outfit Variable'], ['geist-mono', 'Geist Mono Variable'], ['doto', 'Doto Variable']]
  .map(([name, family]) => `@font-face{font-family:'${family}';font-weight:100 900;src:url(data:font/woff2;base64,${
    readFileSync(new URL(`node_modules/@fontsource-variable/${name}/files/${name}-latin-wght-normal.woff2`, app)).toString('base64')
  }) format('woff2')}`).join('');
const icon = '<app-ui-icon aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12h16"/></svg></app-ui-icon>';
const iconCss = 'app-ui-icon{display:grid;place-items:center;width:100%;height:100%;line-height:1}app-ui-icon svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8}';
const title = '客厅设备很长的完整控制名称 Long control title';
const heading = value => `<div class="hd"><span class="hd-ico">${icon}</span><span class="hd-t">${title}</span>${value ? `<span class="hd-v">${value}</span>` : ''}</div>`;
const palette = ['#FF5A4E', '#FF9A1F', '#FFD43B', '#2DBE7E', '#15B8C2', '#3482FF', '#8467F5', '#FB6EAB', '#7895B2', '#FFB4B4', '#6A9C89', '#C5BAFF'];
// Reuse the two pure drawing helpers, without importing Angular or running any
// component/command code. The ring shapes match the production viewBox math.
const geometrySource = read('src/app/device/v2/widgets/widget-kit.ts').match(/export function arcPath[\s\S]+?(?=\/\/ Colours)/)?.[0];
assert.ok(geometrySource, 'update fixture after pure arc helpers move');
const geometry = {};
new Function('exports', require('typescript').transpileModule(geometrySource, {
  compilerOptions: { module: require('typescript').ModuleKind.CommonJS },
}).outputText)(geometry);
const { arcPath, polar } = geometry;

// A stale fixture must fail, rather than silently stop checking the template.
for (const [name, patterns] of Object.entries({
  keys: [/class="keys" role="group"/, /class="key"/, /\(click\)="press\(key.label\)"/],
  levels: [/class="lv-row"/, /class="lv-dot-face"/, /class="lv-bar-fill"/, /\(click\)="set\(index \+ 1\)"/],
  picker: [/class="swc" role="radio"/, /class="cw-box" role="slider"/, /\(pointerdown\)="turnStart\(\$event\)"/],
  dial: [/class="dl-svg"/, /role="slider"/, /class="dl-btns"/, /\(pointerdown\)="repeatStart\(\$event, -1\)"/],
})) for (const pattern of patterns) assert.match(read(`${widgetPath(name)}.html`), pattern, `update ${name} fixture after template changes`);

function fixture(item) {
  const disabled = item.disabled ? ' disabled' : '';
  const attrs = item.disabled ? ' aria-disabled="true" tabindex="-1"' : ' tabindex="0"';
  if (item.name === 'keys') {
    const count = item.count ?? 8;
    const columns = Math.ceil(count / Math.min(count, item.rows));
    return `${item.rows > 1 ? heading('已发送') : ''}<div class="keys" role="group" aria-label="${title}" style="--cols:${columns}">${Array.from({ length: count }, (_, index) => `<button type="button" class="key ${index === 0 ? 'toned sent' : ''}"${disabled}>${index % 2 === 0 ? icon : ''}<span>${index + 1} 完整长名称</span></button>`).join('')}</div>`;
  }
  if (item.name === 'levels') {
    const count = item.count ?? 12;
    const nudge = direction => `<button type="button" class="rbtn" aria-label="${direction}档"${disabled}>${icon}</button>`;
    const buttons = Array.from({ length: count }, (_, index) => {
      const attrs = `role="radio" aria-checked="${index === 0}" aria-label="${index + 1} 档位完整长名称"${disabled}`;
      if (item.style === 'dots') return `${index ? '<i class="lv-gap" aria-hidden="true"></i>' : ''}<button type="button" class="lv-dot ${index === 0 ? 'on' : ''}" ${attrs}><span class="lv-dot-face" aria-hidden="true">${index + 1}</span></button>`;
      if (item.style === 'segment') return `<button type="button" ${attrs} class="${index === 0 ? 'on' : ''}">${index + 1} 档位完整长名称</button>`;
      return `<button type="button" class="lv-bar ${index === 0 ? 'on' : ''}" ${attrs} style="--h:${28 + 72 * (index + 1) / count}"><span class="lv-bar-fill" aria-hidden="true"></span></button>`;
    }).join('');
    return `${heading('1 档')}<div class="lv-row">${item.showButtons ? nudge('降') : ''}<div class="lv-${item.style === 'bars' ? 'bars' : item.style === 'dots' ? 'dots' : 'seg'}" role="radiogroup" aria-label="${title}">${buttons}</div>${item.showButtons ? nudge('升') : ''}</div>`;
  }
  if (item.name === 'picker') {
    const swatches = `<div class="sws ${item.mode === 'swatches' ? 'big' : ''}" role="radiogroup" aria-label="${title}">${palette.slice(0, item.count ?? 7).map((color, index) => `<button type="button" class="swc ${index === 0 ? 'on' : ''}" role="radio" aria-checked="${index === 0}" aria-label="${color}" style="--c:${color}"${disabled}></button>`).join('')}</div>`;
    const wheel = `<div class="cw-wrap"><div class="cw-box" role="slider"${attrs} aria-label="${title} 色相" aria-valuemin="0" aria-valuemax="360" aria-valuenow="180" style="--rw:18px;--a:180deg"><div class="cw"></div><i class="cw-knob" style="background:#15B8C2"></i><div class="cw-mid lt" style="--c:#15B8C2"></div></div></div>`;
    return `${heading('#15B8C2')}${item.mode === 'swatches' ? swatches : `${wheel}${item.mode === 'both' ? swatches : ''}`}`;
  }
  const half = (item.sweep ?? 270) / 2;
  const drop = Math.max(0, -Math.cos(half * Math.PI / 180));
  const viewHeight = Math.ceil(110 + Math.max(84 * drop + 12 / 2 + 4, (84 + 12 / 2 + 12) * drop, 40) + 2);
  item.viewHeight = viewHeight;
  const angle = -half + 0.42 * half * 2;
  const knob = polar(110, 110, 84, angle);
  const ticks = Array.from({ length: 41 }, (_, index) => {
    const at = -half + index / 40 * half * 2;
    const from = polar(110, 110, 96, at), to = polar(110, 110, index % 5 ? 99 : 102, at);
    return `<line class="arc-tick ${at <= angle ? 'on' : ''}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/>`;
  }).join('');
  return `${heading()}<div class="dl-wrap"><div class="dl-box" style="--vh:${viewHeight}"><svg class="dl-svg" viewBox="0 0 220 ${viewHeight}" role="slider"${attrs} aria-label="${title}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="42" style="--thick:12">${ticks}<path class="arc-track" d="${arcPath(110, 110, 84, -half, half)}" stroke-width="12"/><path class="arc-prog" d="${arcPath(110, 110, 84, -half, angle)}" stroke-width="12"/><circle class="arc-knob" cx="${knob.x}" cy="${knob.y}" r="10"/></svg><div class="dl-center"><div class="dl-num num"><span>42</span><sup>%</sup></div><div class="dl-sub">目标设定</div></div></div></div>${item.showButtons ? `<div class="dl-btns"><button type="button" class="rbtn" aria-label="降低"${disabled}>${icon}</button><span class="dl-range">0–100%</span><button type="button" class="rbtn" aria-label="升高"${disabled}>${icon}</button></div>` : ''}`;
}

// Read declared dimensions, so a future catalog change cannot silently drop a size.
const sizing = read('src/app/core/device-v2/page-widget.ts');
const cases = names.flatMap(name => {
  const declaration = sizing.match(new RegExp(`\\b${name}: \\{ widths: \\[([^\\]]+)\\], heights: \\[([^\\]]+)\\] \\}`));
  assert.ok(declaration, `declared sizes for ${name}`);
  const widths = declaration[1].split(',').map(Number);
  const rows = declaration[2].split(',').map(Number);
  return widths.flatMap((span, wi) => rows.map((rows, ri) => ({
    name, span, rows, label: `${name}/${span}x${rows}/declared`,
    style: ['bars', 'dots', 'segment'][(wi + ri) % 3],
    mode: ['both', 'wheel', 'swatches'][(wi + ri) % 3],
    showButtons: (wi + ri) % 2 === 0, sweep: (wi + ri) % 2 ? 240 : 300,
  })));
});
cases.push(
  ...['bars', 'dots', 'segment'].flatMap(style => [false, true].map(showButtons => ({ name: 'levels', span: 2, rows: 1, style, showButtons, label: `levels/dense/${style}/${showButtons}` }))),
  ...['both', 'wheel', 'swatches'].map(mode => ({ name: 'picker', span: 4, rows: 2, mode, count: 12, label: `picker/dense/${mode}` })),
  ...[false, true].map(showButtons => ({ name: 'dial', span: 4, rows: 3, showButtons, sweep: 270, label: `dial/buttons/${showButtons}` })),
  ...names.map(name => ({ name, span: name === 'levels' ? 2 : 4, rows: name === 'keys' || name === 'levels' ? 1 : name === 'picker' ? 2 : 3, style: 'dots', mode: 'both', showButtons: true, disabled: true, label: `${name}/disabled` })),
  // Keep each family's existing narrow specification, not unsupported sizes.
  ...names.map(name => ({ name, span: name === 'levels' ? 2 : 4, rows: name === 'keys' || name === 'levels' ? 1 : name === 'picker' ? 2 : 3, style: 'segment', mode: 'both', showButtons: true, label: `${name}/old-narrow` })),
);
for (const item of cases) item.html = fixture(item);

const browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
const failures = [];
let checked = 0;
async function renderCases(page, cases, theme, width, scale = 1) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<html data-ui-theme="${theme}"><style>${themes}${fonts}*{box-sizing:border-box}body{margin:0;background:var(--ui-bg);color:var(--ui-ink);font-family:var(--ui-font)}probe-panel{display:block}</style><main id="fixtures"></main></html>`);
    await page.evaluate(({ cases, grid, styles, wrapper, iconCss }) => {
      for (const [index, item] of cases.entries()) {
        const panel = document.createElement('probe-panel');
        panel.attachShadow({ mode: 'open' }).innerHTML = `<style>${grid}:host{display:block;max-width:720px;margin:auto;padding:16px}${wrapper.replace(':host', 'app-page-widget')}</style><div class="panel"><div class="cell ${item.span >= 4 ? 'wide' : ''} ${item.span === 8 ? 'full' : ''}" style="--col:1;--row:1;--span:${item.span};--rows:${item.rows}"><app-page-widget><probe-widget class="${item.rows === 1 ? item.name === 'keys' ? 'inline' : item.name === 'levels' ? 'rowc' : '' : ''}" ${item.disabled ? 'aria-disabled="true"' : ''}></probe-widget></app-page-widget></div><div class="cell full next" style="--col:1;--row:${item.rows + 1};--span:8;--rows:1"><span>下一行保持原保存位置</span></div></div>`;
        document.querySelector('#fixtures').append(panel);
        panel.shadowRoot.querySelector('probe-widget').attachShadow({ mode: 'open' }).innerHTML = `<style>${styles[item.name]}${iconCss}</style>${item.html}`;
      }
    }, { cases, grid, styles, wrapper, iconCss });
    await page.evaluate(() => document.fonts.ready);
    if (scale !== 1) await page.evaluate(scale => {
      for (const panel of document.querySelectorAll('probe-panel')) {
        const root = panel.shadowRoot.querySelector('probe-widget').shadowRoot;
        const sizes = [...root.querySelectorAll('*')].filter(element => !element.closest('app-ui-icon')).map(element => {
          const style = getComputedStyle(element);
          return { element, font: parseFloat(style.fontSize), line: parseFloat(style.lineHeight) };
        });
        for (const { element, font, line } of sizes) {
          element.style.fontSize = `${font * scale}px`;
          if (Number.isFinite(line)) element.style.lineHeight = `${line * scale}px`;
        }
      }
    }, scale);
}
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.abort());
  for (const theme of ['natural', 'dark', 'electronic']) for (const width of [320, 375, 593, 844]) for (const scale of [1, 1.5]) {
    await renderCases(page, cases, theme, width, scale);
    for (const [index, item] of cases.entries()) {
      const result = await page.evaluate(({ index, item }) => {
        const panel = document.querySelectorAll('probe-panel')[index];
        const host = panel.shadowRoot.querySelector('probe-widget');
        const root = host.shadowRoot;
        const rect = element => element.getBoundingClientRect();
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
        const visible = element => {
          const r = rect(element);
          let box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent), p = rect(parent);
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
              box.left = Math.max(box.left, p.left + parent.clientLeft);
              box.right = Math.min(box.right, p.left + parent.clientLeft + parent.clientWidth);
            }
            if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
              box.top = Math.max(box.top, p.top + parent.clientTop);
              box.bottom = Math.min(box.bottom, p.top + parent.clientTop + parent.clientHeight);
            }
          }
          const h = rect(host);
          return { left: Math.max(box.left, h.left), right: Math.min(box.right, h.right), top: Math.max(box.top, h.top), bottom: Math.min(box.bottom, h.bottom) };
        };
        try {
          check(host.scrollWidth <= host.clientWidth + 1, 'widget horizontal overflow');
          check(rect(host).bottom <= rect(panel.shadowRoot.querySelector('.next')).top + 1, 'covers next saved row');
          const targets = [...root.querySelectorAll('button,[role="slider"]')];
          check(targets.length > 0, 'no actual controls checked');
          for (const target of targets) {
            check(rect(target).width >= 47.9 && rect(target).height >= 47.9, `target below 48px: ${target.className.baseVal ?? target.className}`);
            target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            check(inside(rect(target), visible(target)), `target not fully reachable: ${target.className.baseVal ?? target.className}; target=${JSON.stringify(rect(target).toJSON())}; visible=${JSON.stringify(visible(target))}`);
          }
          for (let a = 0; a < targets.length; a++) for (let b = a + 1; b < targets.length; b++) {
            const x = visible(targets[a]), y = visible(targets[b]);
            check(!(Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1), 'visible touch targets overlap');
          }
          if (item.name === 'picker' && item.mode !== 'swatches') {
            const wheel = rect(root.querySelector('.cw-box'));
            check(Math.abs(wheel.width - wheel.height) < 0.5, 'hue wheel no longer square');
            check(getComputedStyle(root.querySelector('.cw')).pointerEvents === 'none', 'decorative ring intercepts pointer');
          }
          if (item.name === 'picker') for (const swatch of root.querySelectorAll('.swc')) {
            const visual = getComputedStyle(swatch, '::before');
            const size = item.mode === 'swatches' ? 36 : 26;
            check(parseFloat(visual.width) === size && parseFloat(visual.height) === size, 'swatch visual changed with hit area');
          }
          if (item.name === 'levels' && item.style === 'dots') for (const dot of root.querySelectorAll('.lv-dot-face')) {
            check(rect(dot).width === 30 && rect(dot).height === 30, 'dot visual changed with hit area');
          }
          if (item.name === 'levels' && item.style !== 'segment') {
            const faces = root.querySelectorAll(item.style === 'dots' ? '.lv-dot-face' : '.lv-bar-fill');
            const on = getComputedStyle(faces[0]), off = getComputedStyle(faces[1]);
            check(on.backgroundImage !== off.backgroundImage || on.backgroundColor !== off.backgroundColor || on.borderColor !== off.borderColor, 'selected level visual lost');
          }
          for (const button of root.querySelectorAll('.rbtn')) {
            const face = getComputedStyle(button, '::before');
            const width = parseFloat(face.width) + (face.boxSizing === 'border-box' ? 0 : parseFloat(face.borderLeftWidth) + parseFloat(face.borderRightWidth));
            const height = parseFloat(face.height) + (face.boxSizing === 'border-box' ? 0 : parseFloat(face.borderTopWidth) + parseFloat(face.borderBottomWidth));
            check(Math.abs(width - 40) < 0.1 && Math.abs(height - 40) < 0.1, `round nudge visual changed with hit area: ${JSON.stringify({ width, height, cssWidth: face.width, cssHeight: face.height, boxSizing: face.boxSizing, border: face.borderWidth })}`);
          }
          if (item.name === 'dial') {
            const svg = rect(root.querySelector('.dl-svg')), box = rect(root.querySelector('.dl-box'));
            check(Math.abs(svg.width - box.width) < 0.5 && Math.abs(svg.height - box.height) < 0.5, 'dial slider differs from mapping box');
            check(Math.abs(svg.width / svg.height - 220 / item.viewHeight) < 0.01, 'dial viewBox aspect/mapping changed');
          }
          for (const target of root.querySelectorAll('button')) {
            if (item.disabled) check(target.disabled, 'disabled fixture lost native disabled');
          }
          if (!item.disabled) {
            const target = targets[0];
            target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            target.focus();
            check(root.activeElement === target, 'control is not keyboard focusable');
            check(parseFloat(getComputedStyle(target).outlineWidth) >= 2, 'visible focus outline missing');
            check(inside(rect(target), visible(target)), 'focused control is obscured');
          }
          for (const element of root.querySelectorAll('.key,.lv-bar-fill,.lv-dot-face,.rbtn,.swc,.cw-mid')) {
            for (const pseudo of [null, '::before']) {
              check(getComputedStyle(element, pseudo).transitionDuration.split(',').every(value => parseFloat(value) === 0), 'control ignores reduced motion');
            }
          }
          return '';
        } catch (error) { return `${error.message}; host=${Math.round(rect(host).width)}x${Math.round(rect(host).height)}`; }
      }, { index, item });
      if (result) failures.push(`${theme}/${width}/${scale}/${item.label}: ${result}`);
      checked++;
    }
  }
  const screenshotDirectory = process.env.UI3_TOUCH_SCREENSHOT_DIR;
  if (screenshotDirectory) {
    assert.ok(isAbsolute(screenshotDirectory), 'UI3_TOUCH_SCREENSHOT_DIR must be absolute');
    mkdirSync(screenshotDirectory, { recursive: true });
    const representatives = [
      { name: 'keys', span: 4, rows: 1, count: 3, label: 'Keys · 4×1' },
      { name: 'levels', span: 2, rows: 1, style: 'dots', showButtons: true, count: 5, label: 'Levels · 2×1' },
      { name: 'picker', span: 4, rows: 2, mode: 'both', label: 'Picker · 4×2' },
      { name: 'dial', span: 4, rows: 3, showButtons: true, sweep: 270, label: 'Dial · 4×3' },
    ];
    for (const item of representatives) item.html = fixture(item);
    for (const theme of ['natural', 'dark', 'electronic']) {
      await renderCases(page, representatives, theme, 375);
      await page.evaluate(({ theme, representatives }) => {
        const caption = document.createElement('p');
        caption.textContent = `UI3 ${theme} · 合成 CSS 夹具，非 App／原生截图`;
        caption.style.cssText = 'margin:0;padding:16px;font:12px/1.5 system-ui;color:var(--ui-ink)';
        document.body.prepend(caption);
        for (const [index, panel] of [...document.querySelectorAll('probe-panel')].entries()) {
          const label = document.createElement('p');
          label.textContent = representatives[index].label;
          label.style.cssText = 'margin:0;padding:0 16px;font:12px/1.5 system-ui;color:var(--ui-ink)';
          panel.before(label);
        }
      }, { theme, representatives });
      await page.screenshot({ path: `${screenshotDirectory}/${theme}-static-fixtures.png`, fullPage: true });
    }
  }
} finally { await browser.close(); }
assert.equal(failures.length, 0, `${failures.length} failing cases of ${checked}:\n${failures.slice(0, 8).join('\n')}`);
console.log(`UI3 remaining touch geometry ${checked}/${checked} passed (declared dimensions, old narrow shapes, three themes, 100/150% computed text). Static fixtures, not native/device validation.`);
