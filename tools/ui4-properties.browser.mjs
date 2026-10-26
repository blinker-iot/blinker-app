// UI4 static CSS fixtures compiled from the real Inspector SCSS and local fonts.
// The option catalogue/grouping is read from source; Angular handlers are never
// called. This is not an App, Ionic, native keyboard or device acceptance test.
// Reuses installed WIDGET_BROWSER_DRIVER / WIDGET_BROWSER_EXECUTABLE. Optional
// UI4_SCREENSHOT_DIR writes labelled static-fixture screenshots only.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const app = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const ts = require('typescript');
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const inspectorPath = 'src/app/sections/device/widget-inspector/widget-inspector';
const read = path => readFileSync(resolve(app, path), 'utf8');
const compile = path => sass.compile(resolve(app, path), {
  logger: sass.Logger.silent, loadPaths: [resolve(app, 'node_modules')],
}).css;

// Only read presentation metadata/getters. Deliberate stubs exclude Angular
// rendering and fail if the display fixture ever emits an actual edit event.
const modules = new Map();
const decorator = () => () => {};
function sourceModule(path) {
  path = resolve(app, path);
  if (modules.has(path)) return modules.get(path);
  const module = { exports: {} };
  modules.set(path, module.exports);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    experimentalDecorators: true,
  } }).outputText;
  const localRequire = name => {
    if (name === '@angular/core') return {
      Component: decorator, Input: decorator, Output: decorator,
      EventEmitter: class { emit(value) { assert.equal(typeof value, 'boolean', 'read-only fixture must not emit an edit'); } },
    };
    if (name === '@angular/common') return { NgTemplateOutlet: class {} };
    if (name.endsWith('/ui-icon')) return { UiIconComponent: class {} };
    if (name.endsWith('/page-layout')) return {
      variantsFor: type => metadata.PAGE_WIDGET_VARIANTS[type],
    };
    assert.ok(name.startsWith('.'), `unexpected fixture module ${name}`);
    const next = resolve(dirname(path), `${name}.ts`);
    const scoped = relative(resolve(app, 'src'), next);
    assert.ok(!scoped.startsWith('..') && !isAbsolute(scoped), 'metadata module outside source');
    return sourceModule(next);
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, TextEncoder, console }, { filename: path });
  return module.exports;
}

const metadata = sourceModule('src/app/core/device-v2/page-widget.ts');
const { WidgetInspectorComponent } = sourceModule(`${inspectorPath}.ts`);
const { UI_ICONS } = sourceModule('src/app/device/v2/widgets/icon/ui-icons.ts');
const template = read(`${inspectorPath}.html`);
for (const name of ['common-group', 'appearance-group', 'current-group', 'advanced-group', 'binding-summary', 'inspector-fields', 'field-error']) {
  assert.match(template, new RegExp(`\\b${name}\\b`), `update UI4 fixture for ${name}`);
}
for (const name of ['commonOptions', 'currentOptions', 'advancedOptions']) {
  assert.match(template, new RegExp(`\\b${name}\\b`), `update UI4 fixture for ${name}`);
}
assert.match(template, /data-title/);
assert.match(template, /data-option/);
assert.doesNotMatch(template, /maxlength="32"/);
const css = compile(`${inspectorPath}.scss`);
const themes = sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', {
  loadPaths: [resolve(app, 'src/theme')],
}).css;
const fonts = [['outfit', 'Outfit Variable'], ['geist-mono', 'Geist Mono Variable'], ['doto', 'Doto Variable']]
  .map(([name, family]) => `@font-face{font-family:'${family}';font-weight:100 900;src:url(data:font/woff2;base64,${
    readFileSync(resolve(app, `node_modules/@fontsource-variable/${name}/files/${name}-latin-wght-normal.woff2`)).toString('base64')
  }) format('woff2')}`).join('');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const radio = (label, selected = false, attrs = '') => `<button type="button" role="radio" aria-checked="${selected}" ${attrs}>${escape(label)}</button>`;
const optionLabel = (model, key) => model.variant === 'memory' && key === 'max' ? '总内存（字节）'
  : model.variant === 'memory' && key === 'pulse' ? '波纹动画'
    : model.variant === 'timer' && key === 'actionText' ? '结束动作文案' : model.optionLabels[key];

function optionField(model, key, invalid = false) {
  const rule = model.rule(key);
  const label = optionLabel(model, key);
  const id = `${model.variant}-${key}`;
  let control;
  if (rule.kind === 'boolean') control = `<span class="seg wrap" role="group" aria-label="${escape(label)}">${['默认', '开', '关'].map((text, i) => `<button type="button" aria-pressed="${i === 0}">${text}</button>`).join('')}</span>`;
  else if (rule.kind === 'enum') control = `<span class="seg wrap" role="group" aria-label="${escape(label)}">${['默认', ...model.enumValues(key).map(value => model.valueLabel(value))].map((text, i) => `<button type="button" aria-pressed="${i === 0}">${escape(text)}</button>`).join('')}</span>`;
  else if (model.variant === 'timer' && key === 'actionText') control = `<span class="seg" role="radiogroup" aria-label="结束动作文案">${radio('关闭', true)}${radio('开启')}</span><small class="field-hint">用于显示，请与设备实际的定时行为保持一致。</small>`;
  else control = `<input id="${id}" class="input" ${rule.kind === 'text' ? '' : 'type="number" inputmode="decimal"'} aria-label="${escape(label)}" ${invalid ? `aria-invalid="true" aria-describedby="${id}-error"` : ''} value="${invalid ? '0' : ''}" placeholder="默认">`;
  const hint = model.hints[key] ? `<small class="field-hint">${escape(model.hints[key])}</small>` : '';
  const error = invalid ? `<small class="field-error" id="${id}-error">请输入有效的非零换算倍率；修正后才能保存。</small>` : '';
  return `<div class="field ${rule.kind !== 'enum' ? 'top' : ''} ${invalid ? 'invalid' : ''}" data-option="${key}"><label for="${id}">${escape(label)}</label><span class="stack">${control}${hint}${error}</span></div>`;
}

function modelFor(type, variant) {
  const model = new WidgetInspectorComponent();
  model.widget = {
    widgetId: `fixture-${variant}`, type, variant,
    endpointKey: 'living_room_sensor_temperature_with_long_technical_key',
    title: '保留的设备部件标题',
    grid: { x: 0, y: 7, width: metadata.VARIANT_SIZES[variant].widths[0], height: metadata.VARIANT_SIZES[variant].heights[0] },
  };
  model.extraCandidates = Array.from({ length: 4 }, (_, i) => ({
    key: `extra-${i}`, label: `附属读数 ${i + 1} · 保留长名称`, role: 'property', valueType: i === 3 ? 'string' : 'integer',
  }));
  return model;
}

function fixture(model, errors = false) {
  const common = Array.from(model.commonOptions);
  const current = Array.from(model.currentOptions);
  const advanced = Array.from(model.advancedOptions);
  const expected = [...metadata.COMMON_WIDGET_OPTIONS, ...metadata.VARIANT_WIDGET_OPTIONS[model.variant]].filter(key => !['icon', 'tone'].includes(key));
  assert.deepEqual([...common, ...current, ...advanced].sort(), expected.sort(), `${model.variant} lost or duplicated options`);
  const keys = [...common, ...current, ...advanced];
  assert.equal(new Set(keys).size, keys.length);
  const titleError = errors ? '<small id="title-error" class="field-error">标题最多 64 UTF-8 字节；请缩短后再保存。</small>' : '';
  const title = `<label class="field top ${errors ? 'invalid' : ''}"><span>标题</span><span class="stack"><input class="input" data-title value="${errors ? '很长的中文标题与 Emoji 😀' : escape(model.widget.title)}" ${errors ? 'aria-invalid="true" aria-describedby="title-error"' : ''}><small class="field-hint">标题最多 64 UTF-8 字节，留空使用字段名称。</small>${titleError}</span></label>`;
  const icon = name => `<app-ui-icon aria-hidden="true"><svg viewBox="0 0 24 24">${UI_ICONS[name].map(path => `<path d="${path}"/>`).join('')}</svg></app-ui-icon>`;
  const appearance = `<details class="group disclosure appearance-group"><summary>外观与尺寸</summary><div class="group-body"><div class="field top"><span>外观</span><div class="seg wrap" role="radiogroup" aria-label="组件外观">${model.variants.map(name => radio(model.variantLabel(name), name === model.variant)).join('')}</div></div><div class="field top"><span>图标</span><div class="icons" role="radiogroup" aria-label="图标">${radio('默认', true, 'class="icon-none"')}${model.icons.map(name => `<button type="button" role="radio" aria-checked="false" aria-label="${name}">${icon(name)}</button>`).join('')}</div></div><div class="field top"><span>色调</span><div class="tones" role="radiogroup" aria-label="色调"><button type="button" role="radio" class="tone-auto" aria-checked="true" aria-label="主题默认"><span>自</span></button>${model.tones.map(name => `<button type="button" role="radio" aria-checked="false" aria-label="${model.valueLabel(name)}" style="--c:var(--ui-${name})"><span></span></button>`).join('')}</div></div>${[['宽度', model.widths.map(model.widthLabel)], ['高度', model.heights.map(height => `${height} 行`)]].map(([name, labels]) => `<div class="field"><span>布局${name}</span><div class="seg wrap" role="radiogroup" aria-label="${name}">${labels.map((label, index) => radio(label, index === 0)).join('')}</div></div>`).join('')}<p class="note layout-hint">手机窄屏下，2 栏占半行，4／8 栏占整行；高度为布局行预算，内容卡按内容自适应。打开本页不会调整已有布局。</p></div></details>`;
  const extraHint = model.variant === 'memory' ? '选择一个以字节计的总内存字段；主字段绑定可用内存。' : `最多 ${model.maxExtras} 个，按选择顺序显示在附注行`;
  const extras = model.showExtras ? `<div class="field top"><span>${model.variant === 'memory' ? '总内存字段' : '附属读数'}</span><span class="stack"><span class="seg wrap">${model.candidates.map(candidate => `<button type="button" aria-pressed="false">${escape(candidate.label)}</button>`).join('')}</span><small>${extraHint}</small></span></div>` : '';
  return {
    variant: model.variant, expected,
    html: `<header class="head"><h2>${model.variantLabel(model.variant)}</h2><p>静态 CSS 夹具 · ${model.typeLabel}组件，不是实际 App 或原生验收</p>${errors ? '<div class="error-summary" role="status"><span>还有 2 项需要修正，当前输入已保留。</span><button type="button">查看错误</button></div>' : ''}</header><fieldset class="inspector-fields"><legend class="sr-only">部件属性</legend><section class="group common-group"><h3>常用</h3>${title}${common.map(key => optionField(model, key)).join('')}<div class="binding-summary"><span>绑定字段 · 只读</span><strong>${escape(model.widget.endpointKey)}</strong><small>整数 · 只读字段摘要，绑定保留</small></div></section>${appearance}<section class="group current-group"><h3>当前外观参数</h3><div class="group-body">${extras}${current.map(key => optionField(model, key)).join('') || '<p class="note">这个外观的低频设置在“高级”中。</p>'}</div></section><details class="group disclosure advanced-group"><summary>高级</summary><div class="group-body">${advanced.map(key => optionField(model, key, errors && key === 'scale')).join('')}<p class="note">显示范围、倍率及告警只影响显示，不改变设备能力、步进或自动化规则。</p><details class="json-details"><summary>只读布局片段</summary><pre class="json" tabindex="0" aria-label="只读布局片段">${escape(model.json)}</pre></details></div></details></fieldset>`,
  };
}

const cases = Object.entries(metadata.PAGE_WIDGET_VARIANTS).flatMap(([type, variants]) => variants.map(variant => fixture(modelFor(type, variant))));
assert.equal(cases.length, 23, 'update finite matrix when the variant catalogue changes');
cases.push(fixture(modelFor('value', 'number'), true));
for (const name of ['WIDGET_BROWSER_DRIVER', 'WIDGET_BROWSER_EXECUTABLE', 'UI4_SCREENSHOT_DIR']) {
  if (process.env[name]) assert.ok(isAbsolute(process.env[name]), `${name} must be absolute`);
}
const { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
let checked = 0;
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.abort());
  for (const theme of ['natural', 'dark', 'electronic']) for (const width of [320, 375, 844]) for (const scale of [1, 1.5]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 900 });
    await page.setContent(`<html data-ui-theme="${theme}"><style>${themes}${fonts}*{box-sizing:border-box}body{margin:0;background:var(--ui-bg)}probe-inspector{display:block;max-width:720px;margin:auto;padding:16px}</style><main id="fixtures"></main></html>`);
    await page.evaluate(({ cases, css }) => {
      for (const item of cases) {
        const host = document.createElement('probe-inspector');
        host.attachShadow({ mode: 'open' }).innerHTML = `<style>${css}app-ui-icon{display:grid;place-items:center;width:18px;height:18px}svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:var(--ui-icon-stroke)}</style>${item.html}`;
        document.querySelector('#fixtures').append(host);
      }
    }, { cases, css });
    await page.evaluate(async scale => {
      await document.fonts.ready;
      for (const host of document.querySelectorAll('probe-inspector')) {
        // Stress the actual px typography as well as rem. Not Android font_scale.
        const elements = [...host.shadowRoot.querySelectorAll('*')].filter(element => !element.closest('app-ui-icon'));
        const sizes = elements.map(element => {
          const style = getComputedStyle(element);
          return { element, size: parseFloat(style.fontSize), line: parseFloat(style.lineHeight) };
        });
        if (scale !== 1) for (const { element, size, line } of sizes) {
          element.style.fontSize = `${size * scale}px`;
          if (Number.isFinite(line)) element.style.lineHeight = `${line * scale}px`;
        }
      }
    }, scale);

    // Native details keyboard semantics, not a simulated Angular click handler.
    const first = page.locator('probe-inspector').first();
    const disclosure = first.locator('.advanced-group > summary');
    await disclosure.focus();
    await page.keyboard.press('Enter');
    assert.equal(await first.locator('.advanced-group').evaluate(element => element.open), true, 'advanced disclosure keyboard open');
    await page.keyboard.press('Enter');
    assert.equal(await first.locator('.advanced-group').evaluate(element => element.open), false, 'advanced disclosure keyboard close');

    const results = await page.evaluate(() => [...document.querySelectorAll('probe-inspector')].map(host => {
      const root = host.shadowRoot;
      const errors = [];
      const check = (condition, message) => { if (!condition) errors.push(message); };
      const rect = element => element.getBoundingClientRect();
      const insideX = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1;
      check(!root.querySelector('.advanced-group').open, 'advanced parameters not initially collapsed');
      check(!root.querySelector('.appearance-group').open, 'appearance not initially collapsed');
      for (const detail of root.querySelectorAll('details')) detail.open = true;
      check(host.scrollWidth <= host.clientWidth + 1, 'page horizontal overflow');
      const targets = [...root.querySelectorAll('button,input,summary,pre[tabindex]')];
      for (const target of targets) {
        const box = rect(target);
        check(box.width >= 47.9 && box.height >= 47.9, `target below48: ${target.getAttribute('aria-label') || target.textContent}`);
        check(insideX(box, rect(host)), `target horizontally cropped: ${target.className || target.tagName}`);
        target.focus({ preventScroll: true });
        check(root.activeElement === target, 'keyboard field unreachable');
        check(parseFloat(getComputedStyle(target).outlineWidth) >= 2, `focus indicator missing: ${target.className || target.tagName}`);
      }
      for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
        const a = rect(targets[i]), b = rect(targets[j]);
        check(Math.min(a.right, b.right) - Math.max(a.left, b.left) < 0.5 || Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) < 0.5, 'touch targets overlap');
      }
      for (const error of root.querySelectorAll('.field-error')) {
        const field = error.closest('.field');
        check(rect(error).height > 0 && insideX(rect(error), rect(host)), 'inline error hidden/cropped');
        check(rect(field).bottom >= rect(error).bottom - 1, 'inline error overlaps following field');
        const input = field.querySelector('input');
        check(input.getAttribute('aria-describedby').split(' ').includes(error.id), 'inline error not associated');
      }
      const json = root.querySelector('.json');
      check(insideX(rect(json), rect(host)) && getComputedStyle(json).overflowX === 'auto', 'JSON not locally scrollable');
      const last = targets.at(-1);
      last.scrollIntoView({ block: 'center' });
      check(rect(last).top >= -1 && rect(last).bottom <= innerHeight + 1, 'final advanced field not reachable');
      return errors;
    }));
    for (const [index, errors] of results.entries()) {
      assert.deepEqual(errors, [], `${theme}/${width}/${scale}/${cases[index].variant}${index === 23 ? '/invalid' : ''}`);
      checked++;
    }
    if (process.env.UI4_SCREENSHOT_DIR && width === 375 && scale === 1) {
      mkdirSync(process.env.UI4_SCREENSHOT_DIR, { recursive: true });
      await page.locator('probe-inspector').nth(16).screenshot({ path: resolve(process.env.UI4_SCREENSHOT_DIR, `ui4-static-properties-${theme}.png`) });
    }
  }
} finally { await browser.close(); }
console.log(`UI4 properties static CSS fixtures ${checked}/${checked} passed: 23 variants + invalid, three themes, 320/375/844px, 100/150% computed text. Not Angular/Ionic, native or device acceptance.`);
