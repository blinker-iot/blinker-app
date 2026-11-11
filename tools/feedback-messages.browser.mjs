// Bounded presentation regression: real template AST, Emulated production SCSS
// and installed Ionic. Local fixtures never enter App code, storage or services.
// No Angular bootstrap, event execution, real feedback/message request or native
// keyboard/device acceptance is performed here.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encapsulateStyle, parseTemplate } from '@angular/compiler';
import { compile, dictionary, presentation, read, renderTemplate } from './discovery-collection.browser.mjs';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const ts = require('typescript'), data = presentation();
const paths = {
  feedback: 'src/app/sections/feedback/feedback.component',
  messages: 'src/app/sections/message/message.page',
};
const sourceHashes = {};
const hash = text => createHash('sha256').update(text).digest('hex');
const remember = path => { const value = read(path); sourceHashes[path] = hash(value); return value; };
for (const path of Object.values(paths)) for (const suffix of ['.ts', '.html', '.scss']) remember(path + suffix);
for (const path of ['tools/feedback-messages.browser.mjs', 'tools/discovery-collection.browser.mjs',
  'src/app/sections/_transparent-page-header.scss', 'src/theme/_settings-surface.scss', 'src/theme/_control-page-chrome.scss',
  'src/theme/ui-theme.scss', 'public/i18n/zh_cn/zh_cn.json', 'node_modules/@ionic/core/package.json']) remember(path);

function literal(node) {
  assert.ok(node, 'Expected an actual literal initializer');
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
    assert.ok(ts.isPropertyAssignment(property), 'Only literal properties are allowed');
    assert.ok(ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name));
    return [property.name.text, literal(property.initializer)];
  }));
  assert.fail(`Unsupported fixture literal: ${ts.SyntaxKind[node.kind]}`);
}
const feedbackSource = ts.createSourceFile(paths.feedback + '.ts', read(paths.feedback + '.ts'), ts.ScriptTarget.Latest, true);
const feedbackClass = feedbackSource.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'FeedbackPage');
assert.ok(feedbackClass, 'Actual FeedbackPage is required');
const feedbackTypes = literal(feedbackClass.members.find(node => ts.isPropertyDeclaration(node) && node.name.getText(feedbackSource) === 'feedbackTypes')?.initializer);
assert.equal(feedbackTypes.length, 4);

for (const name of ['WIDGET_BROWSER_DRIVER', 'WIDGET_BROWSER_EXECUTABLE', 'FEEDBACK_MESSAGES_OUTPUT_DIR'])
  if (process.env[name]) assert.ok(isAbsolute(process.env[name]), `${name} must be absolute`);
const destination = resolve(process.env.FEEDBACK_MESSAGES_OUTPUT_DIR || join(tmpdir(), 'blinker-feedback-messages-ui'));
const fromRepo = relative(fileURLToPath(root), destination);
assert.ok(fromRepo === '..' || fromRepo.startsWith('..' + sep) || isAbsolute(fromRepo), 'Evidence must remain outside App worktree');
mkdirSync(destination, { recursive: true });
const outputDir = mkdtempSync(join(destination, 'feedback-messages-'));

// The shared fail-closed renderer supports translate, not DatePipe. Use the
// compiler's exact AST spans to derive only the two existing date expressions
// into explicit pure presentation calls. Everything else remains source-identical.
const originalMessageHtml = read(paths.messages + '.html').replaceAll('\r\n', '\n');
// Keep source whitespace for precise original byte offsets. The shared renderer
// separately parses the derived template with its ordinary whitespace policy.
const messageAst = parseTemplate(originalMessageHtml, paths.messages + '.html', { preserveWhitespaces: true });
assert.equal(messageAst.errors, null);
const dateReplacements = [], visited = new Set();
function visit(node) {
  if (!node || typeof node !== 'object' || visited.has(node)) return;
  visited.add(node);
  if (node.constructor.name === 'BindingPipe' && node.name === 'date') {
    assert.equal(node.args.length, 1);
    assert.equal(node.args[0].constructor.name, 'LiteralPrimitive');
    const format = node.args[0].value;
    assert.ok(['yyyy-MM-dd HH:mm', 'MM-dd HH:mm'].includes(format), 'Review a new production date format explicitly');
    const source = originalMessageHtml.slice(node.exp.sourceSpan.start, node.exp.sourceSpan.end);
    assert.ok(['message.createdAt', 'detailItem.createdAt'].includes(source));
    dateReplacements.push({ start: node.sourceSpan.start, end: node.sourceSpan.end,
      original: originalMessageHtml.slice(node.sourceSpan.start, node.sourceSpan.end), replacement: `presentationDate(${source}, '${format}')` });
  }
  for (const [key, value] of Object.entries(node)) {
    if (['sourceSpan', 'keySpan', 'valueSpan'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(visit); else visit(value);
  }
}
visit(messageAst.nodes);
assert.equal(dateReplacements.length, 2, 'Only the two existing DatePipe bindings are adapted');
let derivedMessageHtml = originalMessageHtml;
for (const item of [...dateReplacements].sort((a, b) => b.start - a.start))
  derivedMessageHtml = derivedMessageHtml.slice(0, item.start) + item.replacement + derivedMessageHtml.slice(item.end);
const derivedPath = join(outputDir, 'message-pure-date.template.html');
writeFileSync(derivedPath, derivedMessageHtml, { flag: 'wx' });
const templatePaths = { feedback: paths.feedback + '.html', messages: pathToFileURL(derivedPath).href };
function presentationDate(value, format) {
  // Explicit local timestamp fixture; UTC avoids a machine-timezone dependency.
  // Formatting is presentation-only, never a replacement App DatePipe or clock.
  const date = new Date(value);
  assert.ok(Number.isFinite(date.valueOf()));
  const full = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  return format === 'yyyy-MM-dd HH:mm' ? full : full.slice(5);
}

// Clearly identified synthetic presentation fixtures, not server response data.
const fixture = {
  title: '本地呈现夹具：这是需要完整换行展示的很长消息标题及设备分享说明',
  body: '本地呈现夹具，不会发送或保存。这里检查消息正文在小屏与大字下自然换行，保留完整内容及原有失败恢复入口。\n第二段用于核对段落和长字段 DEVICE_LOCAL_PRESENTATION_ONLY_0123456789 不产生横向溢出。',
  failure: '本地呈现夹具：消息服务暂时不可用，请检查网络连接后重试；已有内容仍然保留，未确认操作不会自动重复执行。',
};
const item = { id: 'local-presentation-only-1', title: fixture.title, body: fixture.body,
  category: 'device_sharing', unread: true, createdAt: '2026-10-24T10:25:00.000Z',
  action: { type: 'share_invitation', invitationId: 'local-presentation-only-invitation' } };
const feedbackBase = { feedbackTypes, feedbackType: feedbackTypes[0].value, selectedTypeLabel: feedbackTypes[0].label,
  title: '本地呈现夹具标题', content: fixture.body, email: '', isSubmitting: false, isDone: false, errorMessage: '' };
const messageBase = { detailItem: null, detailLoading: false, detailError: '', actionError: '', markingAllRead: false,
  openingInvitation: false, unreadTotal: 0, sharingUnreadCount: 0, initialLoading: false, pageError: '', messages: [],
  messageService: { hasLoaded: true, errorMessage: '', hasMore: false, loadingMore: false, loading: false } };
const pureCalls = { presentationDate,
  categoryLabel: message => message.category === 'device_sharing' ? '分享' : '消息',
  categoryTone: message => message.category === 'device_sharing' ? 'sharing' : 'generic',
  categoryIcon: message => message.category === 'device_sharing' ? 'fa-light fa-share-nodes' : 'fa-light fa-envelope',
  isDeleting: () => false };
const states = [
  ...['idle', 'busy', 'error', 'success'].map(name => ({ kind: 'feedback', name,
    model: { ...feedbackBase, isSubmitting: name === 'busy', isDone: name === 'success', errorMessage: name === 'error' ? fixture.failure : '' } })),
  { kind: 'messages', name: 'loading', model: { ...messageBase, initialLoading: true } },
  { kind: 'messages', name: 'empty', model: { ...messageBase } },
  { kind: 'messages', name: 'error', model: { ...messageBase, pageError: fixture.failure } },
  ...['list', 'list-error'].map(name => ({ kind: 'messages', name,
    model: { ...messageBase, messages: [item, { ...item, id: 'local-presentation-only-2', category: 'generic', unread: false, action: null }],
      unreadTotal: 1, sharingUnreadCount: 1, actionError: name === 'list-error' ? fixture.failure : '',
      messageService: { ...messageBase.messageService, errorMessage: name === 'list-error' ? fixture.failure : '' } } })),
  ...['detail-loading', 'detail', 'detail-error'].map(name => ({ kind: 'messages', name,
    model: { ...messageBase, detailItem: item, detailLoading: name === 'detail-loading', detailError: name === 'detail-error' ? fixture.failure : '' } })),
];
const environments = [];
for (const rootSize of [16, 24]) for (const theme of ['light', 'dark']) for (const mode of ['ios', 'md'])
  environments.push({ width: 320, height: 704, rootSize, theme, mode });
environments.push(
  { width: 375, height: 812, rootSize: 16, theme: 'light', mode: 'ios' },
  { width: 375, height: 812, rootSize: 24, theme: 'dark', mode: 'md' },
  { width: 844, height: 390, rootSize: 16, theme: 'light', mode: 'md' },
  { width: 844, height: 390, rootSize: 24, theme: 'dark', mode: 'ios' },
);
const css = Object.fromEntries(Object.entries(paths).map(([kind, path]) => [kind, encapsulateStyle(compile(path + '.scss'), `ui36-${kind}`)]));
const globalCss = data.baseCss + compile('src/app/sections/_transparent-page-header.scss');
const failures = [], measurements = [], screenshots = [], pageErrors = [], requestErrors = [];
let browser, externalRequests = 0, writeRequests = 0;
const server = createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { writeRequests++; response.writeHead(405).end(); return; }
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  if (pathname === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fontawesome6/css/all.min.css"></head><body></body></html>'); return;
  }
  let file;
  if (/^\/ionic\/[\w./-]+\.(js|svg)$/.test(pathname) && !pathname.includes('..')) file = new URL('node_modules/@ionic/core/' + pathname.slice(7), root);
  else if (/^\/fontawesome6\/(?:css\/[\w.-]+\.css|webfonts\/[\w.-]+\.(?:woff2?|ttf))$/.test(pathname)) file = new URL('public' + pathname, root);
  if (!file) { requestErrors.push(pathname); response.writeHead(404).end(); return; }
  try {
    response.setHeader('Content-Type', { js: 'text/javascript', svg: 'image/svg+xml', css: 'text/css', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf' }[pathname.split('.').at(-1)]);
    response.end(readFileSync(file));
  } catch { requestErrors.push(pathname); response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`, deadline = Date.now() + 300000;
try {
  const { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
  browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ reducedMotion: 'reduce' }); page.setDefaultTimeout(8000);
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.route('**/*', route => {
    if (!route.request().url().startsWith(origin + '/')) { externalRequests++; return route.abort(); }
    if (!['GET', 'HEAD'].includes(route.request().method())) { writeRequests++; return route.abort(); }
    return route.continue();
  });
  await page.goto(origin);
  await page.addStyleTag({ content: data.themeCss + 'html,body{margin:0;overflow:hidden}*{box-sizing:border-box}' });
  await page.evaluate(async () => { const { defineCustomElements } = await import('/ionic/loader/index.es2017.js'); await defineCustomElements(window); });
  for (const environment of environments) for (const state of states) {
    const label = `${state.kind}/${state.name}/${environment.width}/root${environment.rootSize}/${environment.theme}/${environment.mode}`;
    try {
      assert.ok(Date.now() < deadline, 'Finite browser deadline exceeded');
      const html = renderTemplate(templatePaths[state.kind], state.model, dictionary(), pureCalls);
      await page.setViewportSize({ width: environment.width, height: environment.height });
      await page.evaluate(({ environment, kind, html, globalCss, pageCss }) => {
        const safeTop = environment.width > environment.height ? 0 : 35;
        const safeSides = environment.width > environment.height ? 20 : 0;
        document.documentElement.dataset.uiTheme = environment.theme === 'light' ? 'natural' : 'dark';
        document.documentElement.style.cssText = `font-size:${environment.rootSize}px;color-scheme:${environment.theme};--ion-safe-area-top:${safeTop}px;--ion-safe-area-bottom:26px;--ion-safe-area-left:${safeSides}px;--ion-safe-area-right:${safeSides}px`;
        document.body.innerHTML = `<style>${globalCss}${pageCss}support-probe{display:block;position:absolute;inset:0;background:var(--blinker-bg)}</style><support-probe class="ion-page" _nghost-ui36-${kind}>${html}</support-probe>`;
        const host = document.querySelector('support-probe');
        for (const node of host.querySelectorAll('*')) {
          node.setAttribute(`_ngcontent-ui36-${kind}`, '');
          if (node.localName.startsWith('ion-')) node.setAttribute('mode', environment.mode);
        }
        // Reflect Angular's ngModel property binding for static native controls.
        // No input/change/submit event, storage owner or service is installed.
        for (const input of host.querySelectorAll('input,textarea')) input.value = input.getAttribute('value') ?? '';
      }, { environment, kind: state.kind, html, globalCss, pageCss: css[state.kind] });
      await page.waitForFunction(() => [...document.querySelectorAll('ion-header,ion-toolbar,ion-title,ion-buttons,ion-button,ion-back-button,ion-content')]
        .every(node => node.classList.contains('hydrated')));
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      const result = await page.evaluate(async ({ environment, kind, stateName, fixture }) => {
        const host = document.querySelector('support-probe'), content = host.querySelector('ion-content');
        const scroll = await content.getScrollElement(), main = host.querySelector('main,.message-content');
        const errors = [], check = (condition, error) => { if (!condition) errors.push(error); };
        const box = node => { const r = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : node; return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const header = box(host.querySelector('ion-header')), viewport = box(scroll);
        const safeTop = environment.width > environment.height ? 0 : 35;
        const toolbar = host.querySelector('ion-toolbar'), toolbarClip = toolbar.shadowRoot.querySelector('.toolbar-container');
        check(Math.abs(header.height - safeTop - 56) <= 1, 'Header must retain56px plus safe top');
        check(Math.abs(box(toolbarClip).height - 56) <= 1, 'Toolbar body must retain56px');
        check(Math.abs(viewport.y - header.bottom) <= 1, 'Native form/list scrollport must begin below header');
        check(document.documentElement.scrollWidth <= environment.width + 1 && host.scrollWidth <= environment.width + 1, 'Document/host horizontal overflow');
        check(scroll.scrollWidth <= scroll.clientWidth + 1 && main.scrollWidth <= main.clientWidth + 1, 'Content horizontal overflow');
        check(main.getBoundingClientRect().width <= 720.5, 'Content exceeds shared720px reading width');
        check(matchMedia('(prefers-reduced-motion: reduce)').matches, 'Reduced motion absent');
        const textBoxes = element => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), boxes = []; let node;
          while ((node = walker.nextNode())) for (const match of node.textContent.matchAll(/\S+/gu)) {
            // pre-wrap may legally hang whitespace at a line end. Measure all
            // visible text runs, not those non-ink trailing spaces.
            const range = document.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
            boxes.push(...[...range.getClientRects()].map(box));
          }
          return boxes;
        };
        const targets = [...host.querySelectorAll('button,input,textarea,ion-button,ion-back-button')].map(element => {
          const target = box(element);
          check(target.width >= 47.5 && target.height >= 47.5, `${element.localName}.${element.className}: touch target below48px`);
          check(target.x >= -.5 && target.right <= environment.width + .5, `${element.localName}.${element.className}: target outside width`);
          if (element.localName.startsWith('ion-')) {
            const native = element.shadowRoot?.querySelector('button,a');
            check(!!native && box(native).width >= 47.5 && box(native).height >= 47.5, `${element.localName}: installed Ionic native target below48px`);
          }
          return { tag: element.localName, className: element.className, ...target, disabled: !!element.disabled };
        });
        const essentialSelectors = kind === 'feedback'
          ? '.section-label,.type-title strong,.type-copy small,.field-label,.field-count,.feedback-tips strong,.feedback-tips p,.form-error span,.primary-action,.draft-hint,.success-card h1,.success-card p'
          : '.status-banner span,.status-banner button,.message-state strong,.message-state span,.message-state button,.message-summary,.message-category,.message-title,.message-meta time,.inbox-hint strong,.message-detail-card h1,.message-detail-card p,.message-detail-card time,.detail-category,.detail-status';
        const texts = [...host.querySelectorAll(essentialSelectors)].map(element => {
          const style = getComputedStyle(element), bounds = box(element), text = element.textContent.trim();
          check(style.textOverflow !== 'ellipsis' && !Number(style.webkitLineClamp), `${element.localName}.${element.className}: essential text clamped`);
          if (bounds.width && bounds.height) {
            check(element.clientWidth === 0 || element.scrollWidth <= element.clientWidth + 1, `${element.localName}.${element.className}: text horizontal overflow`);
            for (const r of textBoxes(element)) check(r.x >= bounds.x - 1.5 && r.right <= bounds.right + 1.5 && r.y >= bounds.y - 1.5 && r.bottom <= bounds.bottom + 1.5,
              `${element.localName}.${element.className}: text escapes own bounds`);
          }
          return { tag: element.localName, className: element.className, text, ...bounds, fontSize: style.fontSize };
        });
        const focus = [], counts = [];
        const textareaCaret = input => {
          // Browser-only read-only caret-flow probe. The textarea's actual
          // selection/inner scrolling can reveal its last line without moving
          // the entire multi-line box into view. A hidden mirror measures that
          // selected line with the exact computed typography/width; no handlers,
          // DOM selection change or scroll compensation is installed.
          const style = getComputedStyle(input), mirror = document.createElement('div'), marker = document.createElement('span');
          for (const property of ['box-sizing', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height',
            'text-indent', 'text-transform', 'word-spacing', 'white-space', 'word-break', 'overflow-wrap', 'tab-size',
            'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'])
            mirror.style.setProperty(property, style.getPropertyValue(property));
          mirror.style.cssText += `;position:fixed;left:0;top:0;width:${box(input).width}px;height:auto;min-height:0;max-height:none;visibility:hidden;pointer-events:none;border-style:solid;`;
          mirror.textContent = input.value.slice(0, input.selectionEnd);
          marker.textContent = '\u200b'; mirror.append(marker); document.body.append(mirror);
          const position = box(marker), mirrorBox = box(mirror), inputBox = box(input);
          const caret = { x: inputBox.x + position.x - mirrorBox.x - input.scrollLeft,
            y: inputBox.y + position.y - mirrorBox.y - input.scrollTop,
            bottom: inputBox.y + position.bottom - mirrorBox.y - input.scrollTop,
            height: position.height, selectionStart: input.selectionStart, selectionEnd: input.selectionEnd,
            valueLength: input.value.length, innerScrollTop: input.scrollTop, innerScrollHeight: input.scrollHeight };
          mirror.remove(); return caret;
        };
        if (kind === 'feedback') {
          const done = stateName === 'success', busy = stateName === 'busy';
          check(host.querySelectorAll('.success-card').length === Number(done), 'Success state must use actual template branch');
          if (!done) {
            check(host.querySelectorAll('.type-option').length === 4, 'Actual feedback type options missing');
            check([...host.querySelectorAll('.type-option,input,textarea,.primary-action')].every(element => element.disabled === busy), 'Busy form disabled contract changed');
            check(host.querySelectorAll('[role=radio][aria-checked=true]').length === 1, 'Exactly one actual feedback type selected');
            for (const field of host.querySelectorAll('.form-field')) {
              const input = field.querySelector('input,textarea'), counter = field.querySelector('.field-count');
              if (counter) {
                const inputBox = box(input), countBox = box(counter);
                check(countBox.y >= inputBox.bottom + 3, 'Field count must have its own row below native field');
                check(countBox.right <= box(field).right + 1, 'Field count overflows its field');
                check(counter.textContent.trim() === `${input.value.length}/${input.maxLength}`, 'Count must match the actual unchanged local field model');
                counts.push({ input: inputBox, counter: countBox, text: counter.textContent.trim() });
              }
              check(Math.abs(parseFloat(getComputedStyle(input).fontSize) - environment.rootSize) < .1, 'Feedback input must scale to root font');
              if (!input.disabled) {
                input.focus(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                const focused = box(input), visible = box(scroll), outline = getComputedStyle(input);
                check(document.activeElement === input, 'Actual native feedback field did not focus');
                const caret = input.localName === 'textarea' ? textareaCaret(input) : null;
                if (caret) {
                  check(Math.min(focused.bottom, visible.bottom) - Math.max(focused.y, visible.y) >= 47.5,
                    'Focused textarea must retain at least48px effective visible height');
                  check(caret.height > 0 && caret.y >= visible.y - 1 && caret.bottom <= visible.bottom + 1,
                    'Current textarea selection/caret line is obscured by header/outside scrollport');
                } else check(focused.y >= visible.y - 1 && focused.bottom <= visible.bottom + 1, 'Focused single-line input is obscured');
                check(Math.abs(scroll.scrollLeft) <= 1, 'Feedback focus horizontally scrolled');
                check(parseFloat(outline.outlineWidth) >= 2, 'Feedback field focus ring missing');
                focus.push({ name: input.name, ...focused, ...(caret ? { caret } : {}) }); input.blur();
              }
            }
          }
        } else {
          const items = [...host.querySelectorAll('.message-open')];
          for (const item of items) {
            const copy = item.querySelector('.message-copy'), meta = item.querySelector('.message-meta'), title = item.querySelector('.message-title'), preview = item.querySelector('.message-preview');
            check(title.textContent.trim() === fixture.title, 'Long local title differs from fixture');
            check(getComputedStyle(title).whiteSpace !== 'nowrap', 'List title must naturally wrap in full');
            check(getComputedStyle(preview).webkitLineClamp === '2', 'Only existing list preview may remain two-line summary');
            check(box(meta).y >= box(copy).bottom - 1, 'Message metadata must occupy its own row below copy');
            check(box(meta).right <= box(item).right + 1 && box(copy).right <= box(item).right + 1, 'Message metadata/copy escape card');
          }
          const detail = host.querySelector('.message-detail-card');
          if (detail) check(detail.querySelector('h1').textContent.trim() === fixture.title && detail.querySelector('p').textContent.trim() === fixture.body, 'Detail must retain full local fixture title/body');
          if (stateName === 'detail-error') check(!host.querySelector('[data-testid=message-invitation-action]'), 'Failed detail must retain existing invitation action guard');
          if (stateName === 'detail') check(!!host.querySelector('[data-testid=message-invitation-action]'), 'Matching share detail invitation action missing');
        }
        scroll.scrollTop = scroll.scrollHeight;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const last = main.lastElementChild, lastBox = box(last);
        check(lastBox.bottom <= environment.height - 26 + 1, 'Last content cannot clear bottom safe budget');
        scroll.scrollTop = 0;
        return { errors, header, viewport, main: box(main), targets, texts, focus, counts, last: lastBox };
      }, { environment, kind: state.kind, stateName: state.name, fixture });
      measurements.push({ label, ...environment, kind: state.kind, state: state.name, ...result });
      if (result.errors.length) failures.push({ label, errors: result.errors });
      if (environment.width === 320 && environment.rootSize === 24 && environment.theme === 'light' && environment.mode === 'md'
        || environment.width === 375 && environment.rootSize === 16 && ['idle', 'list', 'detail'].includes(state.name)) {
        const file = join(outputDir, `${state.kind}-${state.name}-${environment.width}-root${environment.rootSize}-${environment.theme}-${environment.mode}.png`);
        await page.screenshot({ path: file }); screenshots.push(file);
        if (state.kind === 'feedback' && state.name !== 'success') {
          await page.locator('.primary-action').scrollIntoViewIfNeeded();
          const lower = file.replace('.png', '-lower.png'); await page.screenshot({ path: lower }); screenshots.push(lower);
        }
      }
    } catch (error) { failures.push({ label, errors: [String(error.stack ?? error)] }); }
  }
  assert.deepEqual(pageErrors, []); assert.deepEqual(requestErrors, []); assert.equal(externalRequests, 0); assert.equal(writeRequests, 0);
  for (const [path, frozenHash] of Object.entries(sourceHashes)) assert.equal(hash(read(path)), frozenHash, `Frozen source changed during matrix: ${path}`);
} catch (error) { failures.push({ label: 'runner', errors: [String(error.stack ?? error)] }); }
finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  const report = { kind: 'actual-template-AST-Emulated-SCSS-installed-Ionic-static-local-fixtures-not-Angular-or-native',
    passed: failures.length === 0, sourceHashes, derivedDateTemplate: { originalNormalizedHash: hash(originalMessageHtml), derivedHash: hash(derivedMessageHtml), dateReplacements },
    fixtureBoundary: 'Explicit local-only presentation fixtures; no app services/storage/real content mutations/handlers/native keyboard',
    environmentCount: environments.length, stateCount: measurements.length, externalRequests, writeRequests, failures, pageErrors, requestErrors, measurements, screenshots };
  writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ passed: report.passed, environmentCount: report.environmentCount, stateCount: report.stateCount,
    failureCount: failures.length, firstFailures: failures.slice(0, 8).map(item => ({ label: item.label, firstError: item.errors[0], errorCount: item.errors.length })),
    externalRequests, writeRequests, outputDir }, null, 2));
}
assert.equal(measurements.length, environments.length * states.length, 'Complete bounded actual-template matrix');
assert.equal(failures.length, 0, 'Finite feedback/message presentation regressions; see report.json');
