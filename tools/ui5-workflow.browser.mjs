// UI5 static presentation fixture: installed Ionic components and actual SCSS.
// No Angular page, account, device, saved data, request handler or journal is loaded.
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
const globalCss = ['node_modules/@ionic/core/css/core.css', 'node_modules/@ionic/core/css/structure.css',
  'node_modules/@ionic/core/css/typography.css'].map(read).join('') + css('src/app/sections/_transparent-page-header.scss');
const themeCss = sass.compileString('@use "ui-theme" as theme; html { @include theme.ui-theme; }', {
  loadPaths: [fileURLToPath(new URL('src/theme/', root))],
}).css;
const files = {
  automation: 'src/app/sections/scene/automation/automation.page',
  timer: 'src/app/sections/device/device-timer/device-timer.page',
  edit: 'src/app/sections/device/device-timer/timing-edit/timing-edit',
  history: 'src/app/sections/device/device-storage/device-storage.page',
  trends: 'src/app/sections/device/device-trends/device-trends.page',
  activity: 'src/app/sections/device/device-log/device-log.component',
};
const styles = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, css(`${path}.scss`)]));
const fullscreen = Object.fromEntries(Object.entries(files).map(([key, path]) => [key,
  /<ion-content\b[^>]*\[fullscreen\]="true"/.test(read(`${path}.html`)),
]));
const statusCss = css('src/app/sections/device/device-timer/task-status.component.scss');
// Drift guards tie the representative fixture to real consumers, not a second UI catalog.
for (const [name, guard] of [['automation', 'class="rule-summary"'], ['timer', 'class="task-row surface-card"'],
  ['edit', 'aria-label="何时执行"'], ['history', 'class="surface-card query-form"'],
  ['trends', 'class="surface-card policy-card"'], ['activity', 'class="activity-row surface-card"']])
  assert.ok(read(`${files[name]}.html`).includes(guard), `${name}: fixture source structure changed`);

const long = '客厅环境设备及很长的功能名称 LongTokenWithoutBreak012345678901234567890123456789';
const button = (label, klass = 'secondary-action') => `<button type="button" class="${klass}">${label}</button>`;
const ion = (label, fill = 'outline') => `<ion-button fill="${fill}" data-target>${label}</ion-button>`;
const details = (title, copy) => `<details><summary>${title}</summary><p>${copy}</p></details>`;
const summary = `<section class="task-summary surface-card" aria-label="任务容量与来源"><strong class="capacity-text">已用 1 / 4 条</strong><p class="source-text">设备本地执行；当前通过云端管理，需要设备云端连接。</p></section>`;
const rule = `<article class="surface-card rule-card"><header class="rule-heading"><h3>${long}</h3><p class="workflow-status">已停用</p></header><dl class="rule-summary"><div><dt>当</dt><dd>室内温度升至 26 °C 或以上</dd></div><div><dt>执行</dt><dd>风扇 · 电源开关：开启</dd></div></dl><div class="workflow-actions">${ion('详情与结果', 'clear')}${ion('启用')}${ion('编辑', 'clear')}</div></article>`;
const task = `<article class="task-row surface-card"><button class="task-main"><span class="task-type-icon" aria-hidden="true">◷</span><span class="task-copy"><span class="task-heading"><strong>3 秒倒计时</strong><small>#7</small></span><span class="task-detail"><strong>${long}：开启</strong><small>定义已启用 · 尚未开始倒计时；不代表实物动作已执行</small></span></span><span class="row-arrow" aria-hidden="true">›</span></button><div class="task-actions">${ion('停用', 'clear')}${ion('开始新倒计时', 'clear')}</div></article>`;
const pending = `<section class="task-pending surface-card" aria-label="未确认请求"><strong>尚未确认：开始倒计时</strong><p>断线不代表未执行；原请求和日志已保留，不自动生成新请求。</p><p>查询只读取当前任务；恢复原请求可能执行原操作；停止本地追踪不会取消设备任务。</p>${details('技术详情', long)}<div class="workflow-actions">${ion('恢复原请求')}${ion('查询当前任务')}${ion('已核对，停止追踪原请求', 'clear')}</div></section>`;
const intro = text => `<header class="page-intro"><h1>${long}</h1><p>${text}</p></header>`;
const numeric = (label, type = 'number') => `<label class="form-field">${label}<input type="${type}" value="${type === 'number' ? '3' : '2026-10-23T08:00'}"></label>`;
const range = `<label>时间范围<select><option>最近 24 小时</option></select></label><label>功能<select><option>${long}</option></select></label>`;
const cases = [
  { name: 'automation-list', style: 'automation', title: '自动化', html: `<p class="hint">满足条件后执行动作，退出 App 后仍可执行。</p><div class="workflow-actions">${ion('新建自动化', 'solid')}${ion('已删除记录', 'clear')}</div><section class="rule-list workflow-stack"><h2>我的自动化</h2>${rule}</section><details class="help surface-card"><summary>使用说明与支持范围</summary><p>首次数据和重连只建立起点，不执行动作。</p></details>` },
  { name: 'automation-edit', style: 'automation', title: '编辑自动化', html: `<div class="editor workflow-stack"><section class="surface-card form-section"><h2>名称</h2><ion-input label="名称" label-placement="stacked" value="温度升高时开启风扇"></ion-input></section><section class="surface-card form-section"><h2>当</h2><ion-select label="源属性" label-placement="stacked"><ion-select-option value="temperature">${long}</ion-select-option></ion-select><ion-input label="触发阈值" label-placement="stacked" type="number" value="26"></ion-input>${details('为什么需要回差？', '避免数值在阈值附近反复触发。')}</section><section class="surface-card form-section"><h2>就执行</h2><ion-select label="目标值" label-placement="stacked"><ion-select-option value="true">开启</ion-select-option></ion-select><p>缓存范围仅作提示，服务器会核对设备当前能力。</p></section><div class="workflow-actions editor-actions">${ion('保存修改', 'solid')}${ion('取消', 'clear')}</div></div>` },
  { name: 'automation-result', style: 'automation', title: '自动化详情', html: `<p class="workflow-feedback confirmation" role="status">设备已确认配置；列表刷新失败不撤回已确认结果。</p><div class="workflow-feedback warning" role="alert"><p>列表读取失败，仍保留本次确认。</p>${ion('重新读取列表')}</div>${rule}<section class="surface-card execution-history"><h2>最近执行</h2>${details('执行结果说明', '设备已确认不代表实物动作已完成。')}<p>10-23 08:30:00 · 设备已确认</p><p class="workflow-feedback warning">上次执行结果待确认，不会自动重发。</p></section>` },
  { name: 'task-list', style: 'timer', title: '定时功能', status: summary, html: `${intro('定时/延时由设备执行，退出 App 不会取消已安装任务。')}<probe-status></probe-status>${button('新建任务', 'primary-action add-task-button')}<section class="task-list">${task}</section>` },
  { name: 'task-edit', style: 'edit', title: '编辑任务 #7', status: summary, html: `${intro('保存倒计时不会自动开始；本页无法确认校时状态及来源。')}<probe-status></probe-status>${button('从当前查询重新载入（覆盖未保存编辑）', 'secondary-action load-form-button')}<fieldset class="task-form"><section class="surface-card setting-card"><h2>何时执行</h2><label class="form-field">任务类型<select><option>倒计时</option><option>一次日期</option><option>每周/每天</option></select></label>${numeric('倒计时秒数')}<p>设备接受并持久化开始请求后起算，不以手机点击时刻为准。</p></section><section class="surface-card setting-card"><h2>执行动作</h2><label class="form-field">固件允许的目标<select><option>${long}</option></select></label>${numeric('数值')}</section><section class="surface-card setting-card"><h2>定义状态</h2><label class="check-field" data-target><input type="checkbox">启用定义（不是开始/恢复倒计时）</label></section></fieldset><div class="editor-bottom-actions">${button('保存定义（不自动开始倒计时）', 'save-action')}<button class="delete-action" aria-label="删除任务">×</button></div>` },
  { name: 'task-unknown', style: 'timer', title: '定时功能', status: `${summary}<p class="workflow-feedback" role="status">设备已确认管理操作；确认不代表到期动作已执行。</p><section class="surface-card task-diagnostics">${details('客户端操作耗时', '提交准备 500 ms；HTTP开始至设备确认 200 ms。HTTP开始不是设备收到指令的时刻。')}</section>${pending}`, html: `${intro('原请求和完整日志仍保留。')}<probe-status></probe-status>${button('新建任务', 'primary-action add-task-button')}` },
  { name: 'history', style: 'history', title: '状态历史', html: `<section class="surface-card data-heading"><h1>${long}</h1><p class="source-summary">云端状态变化 · 服务器确认时间（UTC）</p></section><section class="surface-card query-form"><h2>查询范围</h2>${range}${button('刷新')}</section><details class="surface-card source-disclosure"><summary>记录来源与限制</summary><p>蓝牙或局域网本地变化不补录。时间不是设备采集时间。</p></details><section class="surface-card history-list"><article class="history-row"><div class="history-main"><strong>${long}</strong><span>开启</span></div><time>2026-10-23 08:30:00 UTC</time><small class="event-label">状态基线（不是操作）· 布尔</small>${details('记录详情', long)}</article></section>${button('查看更早记录', 'secondary-action load-more-action')}` },
  { name: 'trends', style: 'trends', title: '在线趋势', html: `<section class="surface-card data-heading"><h1>${long}</h1><p class="source-summary">云端周期归档 · 服务器接收时间（UTC）</p></section><section class="surface-card policy-card"><h2>在线记录</h2><p>设置：已启用 · 每 60 秒 · 最多 4 项</p><label class="enabled-control" data-target><input type="checkbox">启用在线记录</label><fieldset><legend>选择数值功能（最多 4 项）</legend><label data-target><input type="checkbox"><span>${long}</span></label></fieldset>${button('保存记录设置')}</section><section class="surface-card query-form"><h2>查询窗口</h2>${range}<label>结束时间（UTC，不含）<input type="datetime-local" value="2026-10-23T08:30"></label>${button('查询窗口')}<nav class="window-navigation">${button('前一窗')}${button('后一窗')}${button('回到最近窗口')}</nav></section><details class="surface-card source-disclosure"><summary>归档来源与限制</summary><p>服务器每约 60 秒选样归档；关闭页面不停止已启用的归档，不补离线数据。</p></details><section class="surface-card chart-card"><h2>室内温度</h2><small>24 ～ 28 °C · 已读取 12 个点</small><svg viewBox="0 0 300 100" role="img" aria-label="静态示意曲线"><path d="M0 80L30 70L60 78L90 40L120 60L150 20"/></svg><small>服务器接收时间；间断处分段，不补点。</small></section>` },
  { name: 'activity', style: 'activity', title: '活动记录', html: `<section class="activity-heading surface-card"><div><h1>${long}</h1><p>最近 7 天 · 云端控制投递</p></div>${button('刷新')}</section><details class="scope-note source-disclosure surface-card"><summary>记录范围与状态说明</summary><p>不包含 BLE／LAN 控制、定时任务或全部 State。设备已确认不等于新鲜 State 或物理完成；结果未知不会自动重发。</p></details><section class="activity-list"><article class="activity-row surface-card"><div class="row-heading"><h2>${long}</h2><span class="activity-status" data-status="outcome_unknown">结果未知</span></div><dl><div><dt>记录时间</dt><dd>2026-10-23 08:30:00</dd></div><div><dt>投递尝试</dt><dd>1 次</dd></div></dl></article></section><section class="related-data surface-card"><h2>其他数据</h2>${button('状态历史')}${button('在线趋势')}</section>` },
];

const screenshotDir = process.env.UI5_SCREENSHOT_DIR;
if (screenshotDir) { assert.ok(isAbsolute(screenshotDir), 'UI5_SCREENSHOT_DIR must be absolute'); mkdirSync(screenshotDir, { recursive: true }); }
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><body></body></html>'); return; }
  if (!/^\/ionic\/[a-zA-Z0-9_./-]+\.(js|svg)$/.test(path) || path.includes('..')) { response.writeHead(404).end(); return; }
  try { response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'image/svg+xml'); response.end(readFileSync(new URL(`node_modules/@ionic/core/${path.slice(7)}`, root))); }
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
  await page.addStyleTag({ content: `${themeCss}body{margin:0;font-family:system-ui}probe-page{display:block;height:100vh}` });
  await page.evaluate(async () => { const { defineCustomElements } = await import('/ionic/loader/index.es2017.js'); await defineCustomElements(window); });
  for (const fixture of cases) for (const mode of ['ios', 'md']) for (const theme of ['natural', 'dark'])
    for (const width of [320, 375, 844]) for (const scale of [1, 1.5]) {
      const safeTop = width === 844 ? 20 : 0;
      await page.setViewportSize({ width, height: width === 844 ? 390 : 900 });
      await page.evaluate(({ fixture, mode, theme, scale, safeTop, globalCss, pageCss, statusCss, fullscreen }) => {
        document.documentElement.setAttribute('data-ui-theme', theme);
        document.documentElement.style.cssText = `font-size:${16 * scale}px;--ion-safe-area-top:${safeTop}px;--ion-safe-area-bottom:20px;--ion-safe-area-left:0px;--ion-safe-area-right:0px`;
        document.body.innerHTML = '<probe-page></probe-page>';
        const shell = document.querySelector('probe-page');
        shell.attachShadow({ mode: 'open' }).innerHTML = `<style>${globalCss}${pageCss}:host{display:block;position:relative;height:100vh}*{box-sizing:border-box}.fixture-note{font-size:.75rem;color:var(--blinker-text-secondary)}</style><ion-header mode="${mode}"><ion-toolbar mode="${mode}"><ion-buttons slot="start"><ion-back-button mode="${mode}" text="" default-href="/fixture"></ion-back-button></ion-buttons><ion-title mode="${mode}">${fixture.title}</ion-title><ion-buttons slot="end"><ion-button mode="${mode}" aria-label="刷新"><i aria-hidden="true">↻</i></ion-button></ion-buttons></ion-toolbar></ion-header><ion-content mode="${mode}" ${fullscreen ? 'fullscreen' : ''}><main>${fixture.html}<p class="fixture-note">UI5 · SCSS + Ionic 静态夹具 · 非真实账号／设备或原生验收</p></main></ion-content>`;
        for (const element of shell.shadowRoot.querySelectorAll('ion-button,ion-input,ion-select')) element.setAttribute('mode', mode);
        const status = shell.shadowRoot.querySelector('probe-status');
        if (status) {
          status.attachShadow({ mode: 'open' }).innerHTML = `<style>${statusCss}*{box-sizing:border-box}</style>${fixture.status}`;
          for (const element of status.shadowRoot.querySelectorAll('ion-button')) element.setAttribute('mode', mode);
        }
      }, { fixture, mode, theme, scale, safeTop, globalCss, pageCss: styles[fixture.style], statusCss, fullscreen: fullscreen[fixture.style] });
      await page.waitForFunction(() => {
        const shell = document.querySelector('probe-page').shadowRoot;
        const children = [...shell.querySelectorAll('ion-toolbar,ion-title,ion-button,ion-back-button,ion-content,ion-input,ion-select'),
          ...shell.querySelector('probe-status')?.shadowRoot.querySelectorAll('ion-button') || []];
        return children.every(el => el.classList.contains('hydrated'));
      });
      const result = await page.evaluate(() => {
        const shell = document.querySelector('probe-page'), root = shell.shadowRoot;
        const roots = [root, ...(root.querySelector('probe-status') ? [root.querySelector('probe-status').shadowRoot] : [])];
        const rect = element => { const r = element.getBoundingClientRect(); return { name: element.className || element.tagName, x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
        const targets = roots.flatMap(current => [...current.querySelectorAll('button,ion-button,ion-back-button,ion-input,ion-select,input:not([type="checkbox"]),select,summary,[data-target]')])
          .filter(el => !el.closest('ion-input,ion-select') || ['ION-INPUT','ION-SELECT'].includes(el.tagName));
        const inputTargets = targets.map(rect);
        const main = root.querySelector('main'), content = root.querySelector('ion-content');
        const buttons = [...root.querySelectorAll('ion-buttons > *')].map(rect);
        const paragraphs = roots.flatMap(current => [...current.querySelectorAll('h1,h2,h3,p,dd,.history-main > *,strong,small,time,label,code,legend')])
          .filter(el => !el.closest('details:not([open])') && !el.classList.contains('sr-only'));
        return { targets: inputTargets, paragraphs: paragraphs.map(rect),
          title: rect(root.querySelector('ion-title')), toolbar: rect(root.querySelector('ion-toolbar')), buttons,
          first: rect(main.children[0]), main: rect(main), background: getComputedStyle(shell).backgroundColor,
          bottomPadding: parseFloat(getComputedStyle(main).paddingBottom),
          mainTop: rect(main).y, nativeScrollWidth: content.shadowRoot.querySelector('.inner-scroll').scrollWidth,
          details: roots.flatMap(current => [...current.querySelectorAll('details')]).map(el => ({ open: el.open, rect: rect(el) })),
          feedback: roots.flatMap(current => [...current.querySelectorAll('.workflow-feedback')]).map(rect),
        };
      });
      const label = `${fixture.name}/${mode}/${theme}/${width}/${scale}`;
      assert.equal(result.background, theme === 'natural' ? 'rgb(242, 243, 245)' : 'rgb(17, 18, 21)', `${label}: settings/workflow palette`);
      for (const target of result.targets) {
        assert.ok(target.w >= 47.9 && target.h >= 47.9, `${label}: target below 48px ${JSON.stringify(target)}`);
        assert.ok(target.x >= -0.5 && target.right <= width + .5, `${label}: target overflow ${JSON.stringify(target)}`);
      }
      for (const paragraph of result.paragraphs) assert.ok(paragraph.x >= -.5 && paragraph.right <= width + .5, `${label}: text overflow ${JSON.stringify(paragraph)}`);
      assert.ok(result.nativeScrollWidth <= width + 1, `${label}: horizontal page scroll`);
      assert.ok(result.title.x >= result.buttons[0].right - .5 && result.title.right <= result.buttons[1].x + .5, `${label}: title overlaps header action`);
      assert.ok(result.toolbar.h >= 55.9, `${label}: toolbar is not 56px`);
      assert.ok(result.buttons[0].y >= safeTop - .5, `${label}: header target under safe area`);
      assert.ok(result.first.y >= safeTop + 56 - .5, `${label}: first content hidden by toolbar`);
      assert.ok(result.bottomPadding >= 51.9, `${label}: bottom safe area missing`);
      assert.ok(result.details.every(d => !d.open), `${label}: low frequency details must start folded`);
      // Top-level target regions may nest (label -> input / Ionic shadow). Reject
      // only unrelated targets overlapping, not that intended ownership.
      const overlaps = await page.evaluate(() => {
        const root = document.querySelector('probe-page').shadowRoot;
        const roots = [root, ...(root.querySelector('probe-status') ? [root.querySelector('probe-status').shadowRoot] : [])];
        const bad = [];
        for (const current of roots) {
          const elements = [...current.querySelectorAll('button,ion-button,ion-back-button,ion-input,ion-select,input:not([type="checkbox"]),select,summary,[data-target]')]
            .filter(el => (!el.closest('details:not([open])') || el.tagName === 'SUMMARY')
              && (!el.closest('ion-input,ion-select') || ['ION-INPUT','ION-SELECT'].includes(el.tagName)));
          for (let i = 0; i < elements.length; i++) for (let j = i + 1; j < elements.length; j++) {
            if (elements[i].contains(elements[j]) || elements[j].contains(elements[i])) continue;
            const a = elements[i].getBoundingClientRect(), b = elements[j].getBoundingClientRect();
            if (Math.min(a.right,b.right)-Math.max(a.left,b.left) > 1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) bad.push([elements[i].outerHTML.slice(0,90),elements[j].outerHTML.slice(0,90)]);
          }
        }
        return bad;
      });
      assert.deepEqual(overlaps, [], `${label}: target overlap`);
      // Exercise native details keyboard semantics and visible focus only; there
      // are no App handlers or API requests in this fixture.
      const detailFocus = await page.evaluate(() => {
        const root = document.querySelector('probe-page').shadowRoot;
        const summary = root.querySelector('summary') || root.querySelector('probe-status')?.shadowRoot.querySelector('summary');
        if (!summary) return null;
        summary.focus();
        const rect = summary.getBoundingClientRect();
        return { focus: summary.matches(':focus-visible'), outline: getComputedStyle(summary).outlineWidth, y: rect.y, bottom: rect.bottom };
      });
      if (detailFocus) {
        assert.equal(detailFocus.focus, true, `${label}: summary focus`);
        assert.ok(parseFloat(detailFocus.outline) >= 2, `${label}: focus outline`);
        assert.ok(detailFocus.y >= safeTop + 56 - .5 && detailFocus.bottom <= (width === 844 ? 390 : 900) + .5,
          `${label}: keyboard-focused summary obscured by header or viewport`);
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => {
          const root = document.querySelector('probe-page').shadowRoot;
          const summary = root.querySelector('summary') || root.querySelector('probe-status')?.shadowRoot.querySelector('summary');
          return summary.parentElement.open;
        }), true, `${label}: details keyboard open`);
      }
      if (screenshotDir && mode === 'ios' && width === 375 && scale === 1 && ['automation-edit', 'task-edit', 'trends'].includes(fixture.name)) {
        await page.evaluate(async () => {
          const root = document.querySelector('probe-page').shadowRoot;
          for (const detail of root.querySelectorAll('details')) detail.open = false;
          await root.querySelector('ion-content').scrollToTop(0);
          const label = document.createElement('p');
          label.textContent = 'UI5 · 静态 CSS / Ionic 夹具 · 非原生验收';
          label.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:1000;margin:0;padding:8px;background:#202226;color:#fff;font:12px system-ui;text-align:center;pointer-events:none';
          document.body.append(label);
        });
        await page.screenshot({ path: join(screenshotDir, `${fixture.name}-${theme}.png`) });
      }
      passed++;
    }
  console.log(`UI5 static workflow/Ionic presentation: ${passed} cases passed (not Angular/native/device acceptance).`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
