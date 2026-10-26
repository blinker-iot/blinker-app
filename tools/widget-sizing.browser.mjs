// Isolated static geometry regression using the real SCSS. This does not boot
// Angular, execute widget handlers, connect to devices, or replace native tests.
// Optional: WIDGET_BROWSER_DRIVER=<absolute Playwright module path>
//           WIDGET_BROWSER_EXECUTABLE=<Chromium executable path>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, app), 'utf8');
const require = createRequire(import.meta.url);
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const driver = process.env.WIDGET_BROWSER_DRIVER;
if (driver) assert.ok(isAbsolute(driver), 'WIDGET_BROWSER_DRIVER must be an absolute module path');
const { chromium } = require(driver || 'playwright');
const compile = path => sass.compile(fileURLToPath(new URL(path, app)), {
  logger: sass.Logger.silent, loadPaths: [fileURLToPath(new URL('node_modules/', app))],
}).css;
const widgetPath = name => `src/app/device/v2/widgets/${name}/${name}-widget`;
const shellPaths = {
  normal: 'src/app/device/v2/panel/page-layout-panel.scss',
  editor: 'src/app/sections/device/panel-editor/panel-editor.page.scss',
  property: 'src/app/sections/device/panel-editor/panel-widget-editor.page.scss',
  agent: 'src/custom-panel/styles.scss',
};
const shells = Object.fromEntries(Object.entries(shellPaths).map(([name, path]) => [name, compile(path)]));
const styles = Object.fromEntries(['stepper', 'slide', 'number', 'toggle'].map(name => [name, compile(`${widgetPath(name)}.scss`)]));
const wrapper = read('src/app/device/v2/panel/page-widget.ts').match(/styles:\s*\['(:host[^']+)'\]/)?.[1];
assert.ok(wrapper, 'update the fixture with the actual PageWidget host styles');
const wrapperCss = wrapper.replace(':host', 'app-page-widget');
const errorCss = shells.normal.match(/\.cell-error\s*\{[^}]+\}/)?.[0];
assert.ok(errorCss, 'update the fixture with the actual cell-error styles');
const themeCss = sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', {
  loadPaths: [fileURLToPath(new URL('src/theme/', app))],
}).css;
const fonts = [
  ['outfit', 'Outfit Variable'], ['geist-mono', 'Geist Mono Variable'], ['doto', 'Doto Variable'],
].map(([name, family]) => `@font-face{font-family:'${family}';font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64,${readFileSync(new URL(`node_modules/@fontsource-variable/${name}/files/${name}-latin-wght-normal.woff2`, app)).toString('base64')}) format('woff2')}`).join('');
const base = `${themeCss}${fonts}*{box-sizing:border-box}body{margin:0;--transparent-page-content-top:0px}probe-panel{display:block}.normal-shell{max-width:720px;padding:16px;margin:auto}`;
const icon = '<app-ui-icon aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg></app-ui-icon>';
const iconCss = 'app-ui-icon{display:grid;place-items:center;width:100%;height:100%;line-height:1}svg{display:block;width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8}';
const title = '客厅环境与设备控制长标题 Long control title';

// Fail visibly if the actual template structure/disabled contract moves away
// from these static fixtures; do not silently keep testing an obsolete shape.
for (const [name, guards] of Object.entries({
  stepper: [/class="rc-body"/, /class="rc-controls"/, /class="rbtn"/, /class="ns-go"/, /\[disabled\]="card.disabled"/],
  slide: [/class="slide-knob" role="switch"/, /class="slide"/, /class="hd-t"/],
  number: [/class="bn-value"/, /class="bn-num num"/, /rows > 1 \|\| size === 'md'/],
  toggle: [/class="sw"/, /role="switch"/, /\[disabled\]="card.disabled"/],
})) for (const guard of guards) assert.match(read(`${widgetPath(name)}.html`), guard, `${name}: update the fixture with its template`);

function fixture(name, option = '') {
  const disabled = option.includes('disabled') ? ' disabled' : '';
  if (name === 'stepper') {
    const command = option.includes('command');
    if (option.startsWith('rows2')) {
      const dec = `<button type="button" class="rbtn" aria-label="减少"${disabled}>${icon}</button>`;
      const inc = `<button type="button" class="rbtn" aria-label="增加"${disabled}>${icon}</button>`;
      const middle = '<div class="ns-mid" role="spinbutton" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="42"><span class="ns-v num"><span>42</span><small>%</small></span><span class="ns-range">0–100 · 步长 1</span></div>';
      const split = option.includes('split');
      return { span: 2, rows: 2, html: `<div class="hd"><span class="hd-ico">${icon}</span><span class="hd-t">${title}</span>${command ? `<button type="button" class="ns-go" aria-label="发送"${disabled}>${icon}</button>` : ''}</div><div class="ns ${split ? 'split' : ''}">${split ? `${middle}<div class="ns-row">${dec}${inc}</div>` : `${dec}${middle}${inc}`}</div>` };
    }
    return { span: 2, className: 'rowc', html: `<div class="rc-body"><span class="rc-ico">${icon}</span><span class="rc-copy"><strong>${title}</strong><small>0–100%</small></span><div class="rc-controls" role="group" aria-label="${title}"><button type="button" class="rbtn" aria-label="减少"${disabled}>${icon}</button><span class="ns-v ns-sm num"><span>${command ? '12345678901234567890' : '42'}</span><small>%</small></span><button type="button" class="rbtn" aria-label="增加"${disabled}>${icon}</button>${command ? `<button type="button" class="ns-go" aria-label="发送"${disabled}>${icon}</button>` : ''}</div></div>` };
  }
  if (name === 'slide') return { span: 4, html: `<div class="hd"><span class="hd-ico">${icon}</span><span class="hd-t">${title}</span><span class="hd-v">已关闭</span></div><div class="slide ${option === 'on' ? 'on' : ''}" style="--slide:${option === 'on' ? 1 : 0}"><span class="slide-fill"></span><span class="slide-hint">向右滑动 · 开启</span><span class="slide-hint lit" aria-hidden="true">向右滑动 · 开启</span><span class="slide-knob" role="switch" tabindex="0" aria-label="${title}" aria-checked="${option === 'on'}">${icon}</span></div>` };
  if (name === 'number') return { span: 2, className: 'rowc', html: `<div class="hd"><span class="hd-ico">${icon}</span><span class="hd-t">${title}</span></div><div class="bn ${option}"><div class="bn-num num" title="原始值：12345678901234567890"><span class="bn-value" style="--reading-length:20">12345678901234567890</span><span class="bn-u">千瓦时</span></div>${option === 'md' ? '<div class="bn-sub"><span class="delta"><span class="delta-arrow">↑</span><span>123.45%</span></span><span>持续更新中的长备注说明</span></div>' : ''}</div>` };
  return { span: 4, html: `<span class="rc-ico">${icon}</span><span class="rc-copy"><strong>${title}</strong><small>设备状态与辅助说明</small></span><button type="button" class="sw ${option.split('-')[0]} ${disabled ? 'on' : ''}" role="switch" aria-label="${title}" aria-checked="${Boolean(disabled)}"${disabled}><i></i></button>` };
}

const cases = [
  ...['enabled', 'disabled', 'command', 'command-disabled'].map(option => ({ name: 'stepper', option })),
  ...['rows2-property-default', 'rows2-property-split', 'rows2-command-default', 'rows2-command-split'].map(option => ({ name: 'stepper', option })),
  ...['off', 'on'].map(option => ({ name: 'slide', option })),
  ...['md', 'lg', 'xl'].map(option => ({ name: 'number', option })),
  ...['sm', 'md', 'lg'].flatMap(size => ['enabled', 'disabled'].map(state => ({ name: 'toggle', option: `${size}-${state}` }))),
].map(item => ({ ...item, ...fixture(item.name, item.option) }));
const feedbackCases = [
  { name: 'stepper', option: 'enabled' }, { name: 'number', option: 'md' }, { name: 'slide', option: 'off' },
].map(item => ({ ...item, ...fixture(item.name, item.option), feedback: true }));
const themes = ['natural', 'dark', 'electronic'];
const widths = [320, 375, 390, 720, 1024];
let count = 0;
const failures = [];
const browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.abort());

  // The production, editor and iframe shells must agree on actual content
  // width, including the narrow breakpoint's inset-sensitive boundary.
  for (const theme of themes) for (const width of [320, 375, 390, 592, 593, 692, 693, 720, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const results = [];
    for (const [kind, css] of Object.entries(shells)) {
      const panel = `<div class="panel">${[2, 4, 8].map((span, i) => `<div class="cell ${span === 8 ? 'full' : ''} ${span >= 4 ? 'wide' : ''}" style="--col:1;--row:${i * 3 + 1};--span:${span};--rows:2"><div style="height:40px;flex:1">${span}</div></div>`).join('')}</div>`;
      if (kind === 'agent') await page.setContent(`<html data-ui-theme="${theme}"><style>${base}${css}</style><body>${panel}</body></html>`);
      else {
        await page.setContent(`<html data-ui-theme="${theme}"><style>${base}</style><div id="root" class="${kind === 'normal' ? 'normal-shell' : ''}"></div></html>`);
        await page.evaluate(({ kind, css, panel }) => {
          const host = document.createElement('probe-panel');
          document.querySelector('#root').append(host);
          host.attachShadow({ mode: 'open' }).innerHTML = `<style>${css}</style>${kind === 'normal' ? panel : kind === 'editor' ? `<div class="workspace"><div class="canvas">${panel}</div></div>` : `<section class="preview-region">${panel}</section>`}`;
        }, { kind, css, panel });
      }
      results.push(await page.evaluate(() => {
        const root = document.querySelector('probe-panel')?.shadowRoot || document;
        return { content: Math.round(root.querySelector('.panel').getBoundingClientRect().width), row: getComputedStyle(root.querySelector('.panel')).getPropertyValue('--row-h').trim(), spans: [...root.querySelectorAll('.cell')].map(el => Math.round(el.getBoundingClientRect().width)) };
      }));
      count++;
    }
    for (const result of results.slice(1)) assert.deepEqual(result, results[0], `${theme}/${width}: shell geometry differs`);
  }

  for (const theme of themes) for (const width of [...widths, 593]) {
    // Compact historical single-row cards retain all commands without changing
    // their saved grid; the new per-grid geometry is asserted separately.
    const regular = width === 593 ? cases.filter(item => item.name === 'stepper' && !item.rows && item.option.includes('command')) : cases;
    const selected = [375, 720].includes(width) ? [...regular, ...feedbackCases] : regular;
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<html data-ui-theme="${theme}"><style>${base}${shells.property}${wrapperCss}${errorCss}</style><main id="fixtures"></main></html>`);
    await page.evaluate(({ cases, styles, iconCss }) => {
      for (const [index, item] of cases.entries()) {
        const region = document.createElement('section');
        region.className = 'preview-region';
        const error = item.feedback ? `<p class="cell-error" role="alert">${'暂时无法确认设备结果，请等待最新状态后重试。'.repeat(8)}</p>` : '';
        const next = item.feedback ? '<div class="cell full wide next-row" style="--col:1;--row:2;--span:8;--rows:1"><div>下一行</div></div>' : '';
        region.innerHTML = `<div class="panel"><div class="cell ${item.span >= 4 ? 'wide' : ''} ${item.feedback ? 'feedback' : ''}" style="--col:1;--row:1;--span:${item.span};--rows:${item.rows || 1}"><app-page-widget><probe-widget class="${item.className || ''}" data-case="${index}"></probe-widget></app-page-widget>${error}</div>${next}</div>`;
        document.querySelector('#fixtures').append(region);
        region.querySelector('probe-widget').attachShadow({ mode: 'open' }).innerHTML = `<style>${styles[item.name]}${iconCss}</style>${item.html}`;
      }
    }, { cases: selected, styles, iconCss });
    await page.evaluate(() => document.fonts.ready);
    for (const [index, item] of selected.entries()) {
      const failure = await page.evaluate(({ index, item }) => {
        const host = document.querySelector(`[data-case="${index}"]`);
        const root = host.shadowRoot;
        const rect = el => el.getBoundingClientRect();
        const inside = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
        const check = (ok, text) => { if (!ok) throw new Error(text); };
        const target = el => check(rect(el).width >= 47.9 && rect(el).height >= 47.9, 'target smaller than 48px');
        const reach = (el, frame) => {
          if (!inside(rect(el), rect(frame))) {
            // A historical compact frame may not fit a title and every 48px
            // key at once. Require a real bounded scroll, not hidden content.
            const style = getComputedStyle(frame);
            check(style.overflowX === 'auto' || style.overflowY === 'auto', 'cropped content has no scroll fallback');
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
          check(inside(rect(el), rect(frame)), 'content cannot be fully reached by scrolling');
        };
        try {
          check(matchMedia('(prefers-reduced-motion: reduce)').matches, 'reduced-motion was not enabled');
          check(host.scrollWidth <= host.clientWidth + 1, 'widget leaks horizontal overflow');
          if (item.feedback) {
            const cell = host.closest('.cell');
            const error = cell.querySelector('.cell-error');
            check(rect(error).top >= rect(host).bottom - 0.5, 'feedback covers the widget');
            check(rect(error).bottom <= rect(cell.nextElementSibling).top + 0.5, 'feedback overlaps the next saved row');
            check(getComputedStyle(error).position === 'static', 'feedback was taken out of normal flow');
          }
          if (item.name === 'stepper') {
            const buttons = [...root.querySelectorAll('button')];
            buttons.forEach(target);
            check(buttons.every(button => button.disabled === item.option.includes('disabled')), 'disabled semantics differ');
            for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
              const a = rect(buttons[i]), b = rect(buttons[j]);
              check(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, 'button targets intersect');
            }
            if (item.rows === 2) {
              check(rect(root.querySelector('.hd-t')).width > 0, 'title width collapsed');
              buttons.forEach(button => reach(button, host));
              reach(root.querySelector('.ns-mid'), host);
            } else {
              const controls = root.querySelector('.rc-controls');
              check(rect(root.querySelector('.rc-copy strong')).width > 0, 'title width collapsed');
              reach(controls, host);
              if (item.option.includes('command')) {
                check(controls.scrollWidth > controls.clientWidth, 'narrow command fixture does not exercise scroll recovery');
                controls.scrollLeft = controls.scrollWidth;
                check(inside(rect(root.querySelector('.ns-go')), rect(controls)), 'send cannot be scrolled fully into view');
                check(root.querySelector('.ns-go').disabled === item.option.includes('disabled'), 'scroll changed disabled semantics');
              } else buttons.forEach(button => reach(button, controls));
            }
          } else if (item.name === 'slide') {
            const track = root.querySelector('.slide');
            const knob = root.querySelector('.slide-knob');
            check(Math.abs(rect(track).height - 56) < 0.2, 'slide track is not 56px');
            target(knob);
            check(inside(rect(track), rect(host)), 'slide track is clipped');
            check(inside(rect(knob), rect(track)), 'slide knob is clipped');
          } else if (item.name === 'number') {
            const heading = root.querySelector('.hd');
            const value = root.querySelector('.bn-num');
            check(rect(heading).bottom <= rect(value).top + 0.5, 'reading overlaps title');
            check(inside(rect(value), rect(host)), 'reading is clipped');
            const note = root.querySelector('.bn-sub');
            if (note) {
              check(rect(value).bottom <= rect(note).top + 0.5, 'note overlaps reading');
              check(inside(rect(note), rect(host)), 'note is clipped');
            }
          } else {
            const button = root.querySelector('.sw');
            target(button);
            check(inside(rect(button), rect(host)), 'toggle target is clipped');
            check(button.disabled === item.option.includes('disabled'), 'toggle disabled semantics differ');
          }
          return '';
        } catch (error) {
          const boxes = Object.fromEntries(['.rc-controls', '.ns-v', '.rbtn', '.ns-go'].map(selector => {
            const el = root.querySelector(selector);
            return [selector, el ? rect(el).toJSON() : null];
          }));
          return `${error.message}; host=${JSON.stringify(rect(host).toJSON())}; boxes=${JSON.stringify(boxes)}`;
        }
      }, { index, item });
      if (failure) failures.push(`${theme}/${width}/${item.name}/${item.option}${item.feedback ? '/feedback' : ''}: ${failure}`);
      count++;
    }
  }
  assert.equal(failures.length, 0, failures.join('\n'));
  console.log(`PASS ${count} static Chromium geometry cases: 3 themes; widget outer widths ${widths.join('/')} plus 593px command fallback; 9 shell widths including both sides of the 660px content boundary; stepper 2x1/2x2 property/action/default/split, slide/number/toggle; long in-flow feedback at 375/720; reduced motion. No Angular/native/device execution, network, screenshots or files.`);
} finally {
  await browser.close();
}
