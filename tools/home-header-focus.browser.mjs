// Finite presentation-only regression: production header AST, page SCSS,
// Angular Emulated style scoping and the installed Ionic native buttons.
// No Angular bootstrap, handlers, accounts, APIs, commands or native keyboard.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BindingType, encapsulateStyle, parseTemplate } from '@angular/compiler';
import { compile, dictionary, homeModel, presentation, read } from './discovery-collection.browser.mjs';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const paths = Object.fromEntries(['device', 'tools', 'profile', 'community'].map(kind =>
  [kind, `src/app/home/components/tab-${kind}/tab-${kind}`]));
const data = presentation(), translate = dictionary();
const args = process.argv.slice(2);
assert.ok(!args.length || args.length === 2 && args[0] === '--baseline-scss-dir', 'Only --baseline-scss-dir is supported');
const baselineDir = args[1];
if (baselineDir) assert.ok(isAbsolute(baselineDir), 'Baseline SCSS directory must be absolute');
const sass = createRequire(require.resolve('@angular/build/package.json'))('sass');
const sourceHashes = {};
function pageStyle(kind, path) {
  const source = baselineDir && ['device', 'profile'].includes(kind)
    ? readFileSync(join(baselineDir, `tab-${kind}-before.scss`), 'utf8') : read(path + '.scss');
  sourceHashes[path + '.scss'] = createHash('sha256').update(source).digest('hex');
  // The backed-up file keeps its original stylesheet URL for @use resolution.
  return sass.compileString(source, {
    url: new URL(path + '.scss', root), loadPaths: [fileURLToPath(new URL('node_modules/', root))], logger: sass.Logger.silent,
  }).css;
}
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// Only pure presentation inputs used by these actual headers are supported.
// In particular, output bindings are not run or replaced with fake handlers.
function evaluate(node, model) {
  if (node?.ast) return evaluate(node.ast, model);
  const value = item => evaluate(item, model);
  switch (node?.constructor.name) {
    case 'ImplicitReceiver': case 'ThisReceiver': return model;
    case 'LiteralPrimitive': return node.value;
    case 'PropertyRead': {
      const receiver = value(node.receiver);
      assert.ok(receiver != null && node.name in Object(receiver), `Missing header input: ${node.name}`);
      return receiver[node.name];
    }
    case 'LiteralArray': return node.expressions.map(value);
    case 'Conditional': return value(node.condition) ? value(node.trueExp) : value(node.falseExp);
    case 'PrefixNot': return !value(node.expression);
    case 'ParenthesizedExpression': return value(node.expression);
    case 'Binary':
      if (node.operation === '||') return value(node.left) || value(node.right);
      assert.equal(node.operation, '===', 'Unexpected header expression');
      return value(node.left) === value(node.right);
    case 'Call': {
      assert.equal(node.args.length, 0);
      assert.equal(node.receiver.constructor.name, 'PropertyRead');
      assert.ok(['editing', 'saving', 'dragging'].includes(node.receiver.name), 'Only editor presentation signals are supported');
      const receiver = value(node.receiver.receiver);
      assert.equal(receiver, model.cardEditor);
      return receiver[node.receiver.name]();
    }
    case 'BindingPipe':
      assert.equal(node.name, 'translate'); assert.equal(node.args.length, 0);
      return translate(value(node.exp));
    case 'Interpolation': return node.strings.reduce((text, part, index) => text + part
      + (index < node.expressions.length ? String(value(node.expressions[index]) ?? '') : ''), '');
    default: assert.fail(`Unsupported header expression: ${node?.constructor.name}`);
  }
}

function renderHeader(kind, model, identifier) {
  const path = paths[kind] + '.html', parsed = parseTemplate(read(path), path, { preserveWhitespaces: false });
  assert.equal(parsed.errors, null, `Invalid actual template: ${path}`);
  const headers = parsed.nodes.filter(node => node.constructor.name === 'Element' && node.name === 'ion-header');
  assert.equal(headers.length, 1, `Expected one actual header: ${path}`);
  function render(nodes, context) {
    return nodes.map(node => {
      switch (node.constructor.name) {
        case 'Text': return escape(node.value);
        case 'BoundText': return escape(evaluate(node.value, context));
        case 'IfBlock': {
          const branch = node.branches.find(branch => !branch.expression || evaluate(branch.expression, context));
          return branch ? render(branch.children, context) : '';
        }
        case 'ForLoopBlock': {
          const values = evaluate(node.expression, context);
          assert.ok(Array.isArray(values));
          return values.map((value, index) => render(node.children, { ...context, [node.item.name]: value, $index: index })).join('');
        }
        case 'Element': {
          const attributes = new Map(node.attributes.map(item => [item.name, item.value]));
          const classes = new Set((attributes.get('class') ?? '').split(/\s+/).filter(Boolean));
          for (const input of node.inputs) {
            const value = evaluate(input.value, context);
            if (input.type === BindingType.Class) {
              if (value) classes.add(input.name); else classes.delete(input.name);
            } else if (input.name === 'class') {
              classes.clear(); for (const token of String(value ?? '').split(/\s+/).filter(Boolean)) classes.add(token);
            } else {
              assert.notEqual(input.type, BindingType.Style, 'Unexpected header inline style');
              const name = input.name === 'routerLink' ? 'href' : input.name;
              if (value == null || name === 'disabled' && !value) attributes.delete(name);
              else attributes.set(name, name === 'disabled' ? '' : Array.isArray(value) ? value.join('/') : String(value));
            }
          }
          if (classes.size) attributes.set('class', [...classes].join(' ')); else attributes.delete('class');
          attributes.set(`_ngcontent-${identifier}`, '');
          return `<${node.name}${[...attributes].map(([name, value]) => ` ${name}="${escape(value)}"`).join('')}>`
            + (node.isVoid ? '' : render(node.children, context) + `</${node.name}>`);
        }
        default: assert.fail(`Unsupported actual header node: ${node.constructor.name}`);
      }
    }).join('');
  }
  return render(headers, model);
}

const states = [
  { kind: 'device', name: 'ordinary', messages: false, actions: 1 },
  { kind: 'device', name: 'messages', messages: true, actions: 2 },
  { kind: 'device', name: 'editing', editing: true, messages: true, actions: 2 },
  { kind: 'profile', name: 'ordinary', messages: false, actions: 1 },
  { kind: 'profile', name: 'messages', messages: true, actions: 2 },
  { kind: 'tools', name: 'ordinary', actions: 0 },
  { kind: 'community', name: 'ordinary', actions: 1 },
].map(state => {
  const identifier = `ui33-${state.kind}`;
  const model = {
    ...homeModel(data.content), messagesAvailable: !!state.messages,
    cardEditor: { editing: () => !!state.editing, saving: () => false, dragging: () => false },
    messageButtonLabel: '消息通知', showUnreadMessageBadge: !!state.messages, unreadMessageBadge: '99+',
  };
  return { ...state, identifier, html: renderHeader(state.kind, model, identifier) };
});
const pageCss = Object.fromEntries(Object.entries(paths).map(([kind, path]) =>
  [kind, encapsulateStyle(pageStyle(kind, path), `ui33-${kind}`)]));
const globalCss = data.baseCss + compile('src/app/sections/_transparent-page-header.scss') + data.headerCss;
const environments = [];
for (const rootSize of [16, 24]) for (const theme of ['light', 'dark']) for (const mode of ['ios', 'md'])
  environments.push({ width: 320, height: 704, rootSize, theme, mode });
environments.push(
  { width: 375, height: 812, rootSize: 16, theme: 'light', mode: 'ios' },
  { width: 375, height: 812, rootSize: 24, theme: 'dark', mode: 'md' },
  { width: 844, height: 390, rootSize: 16, theme: 'light', mode: 'md' },
  { width: 844, height: 390, rootSize: 24, theme: 'dark', mode: 'ios' },
);

for (const name of ['WIDGET_BROWSER_DRIVER', 'WIDGET_BROWSER_EXECUTABLE', 'HOME_HEADER_FOCUS_OUTPUT_DIR'])
  if (process.env[name]) assert.ok(isAbsolute(process.env[name]), `${name} must be absolute`);
let outputDir;
if (process.env.HOME_HEADER_FOCUS_OUTPUT_DIR) {
  const destination = resolve(process.env.HOME_HEADER_FOCUS_OUTPUT_DIR), fromRepo = relative(fileURLToPath(root), destination);
  assert.ok(fromRepo === '..' || fromRepo.startsWith('..' + sep) || isAbsolute(fromRepo), 'Output must stay outside the App worktree');
  mkdirSync(destination, { recursive: true }); outputDir = mkdtempSync(join(destination, 'header-focus-'));
}
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
const origin = `http://127.0.0.1:${server.address().port}`, deadline = Date.now() + 120000;
try {
  const { chromium } = require(process.env.WIDGET_BROWSER_DRIVER || 'playwright');
  browser = await chromium.launch({ headless: true, ...(process.env.WIDGET_BROWSER_EXECUTABLE ? { executablePath: process.env.WIDGET_BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ reducedMotion: 'reduce' }); page.setDefaultTimeout(10000);
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
      await page.setViewportSize({ width: environment.width, height: environment.height });
      await page.evaluate(({ environment, state, globalCss, pageCss }) => {
        const safeTop = environment.width > environment.height ? 0 : 35;
        document.documentElement.dataset.uiTheme = environment.theme === 'light' ? 'natural' : 'dark';
        document.documentElement.style.cssText = `font-size:${environment.rootSize}px;color-scheme:${environment.theme};--ion-safe-area-top:${safeTop}px;--ion-safe-area-bottom:26px;--ion-safe-area-left:0px;--ion-safe-area-right:0px`;
        document.body.innerHTML = `<style>${globalCss}${pageCss}header-probe{display:block;position:absolute;inset:0;background:var(--blinker-bg)}</style><header-probe _nghost-${state.identifier} class="${state.editing ? 'card-editing' : ''}">${state.html}</header-probe>`;
        for (const node of document.querySelectorAll('ion-header,ion-toolbar,ion-title,ion-buttons,ion-button')) node.setAttribute('mode', environment.mode);
      }, { environment, state, globalCss, pageCss: pageCss[state.kind] });
      await page.waitForFunction(() => [...document.querySelectorAll('ion-header,ion-toolbar,ion-title,ion-buttons,ion-button')]
        .every(node => node.classList.contains('hydrated')));
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      const result = await page.evaluate(async () => {
        const host = document.querySelector('header-probe'), toolbar = host.querySelector('ion-toolbar'), container = toolbar.shadowRoot.querySelector('.toolbar-container');
        const title = host.querySelector('ion-title'), titleClip = title?.shadowRoot.querySelector('.toolbar-title');
        const actions = [...host.querySelectorAll('ion-button')], nativeActions = actions.map(action => action.shadowRoot.querySelector('button,a'));
        if (!container || nativeActions.some(action => !action)) throw new Error('Missing actual Ionic native toolbar/action structure');
        const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        let character;
        if (title) {
          const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT); let text;
          while ((text = walker.nextNode()) && !text.textContent.trim()) { /* find actual visible title text */ }
          if (!text) throw new Error('Missing actual translated title');
          const start = text.textContent.search(/\S/u); character = document.createRange();
          character.setStart(text, start); character.setEnd(text, start + Array.from(text.textContent.slice(start))[0].length);
        }
        const snapshot = phase => ({ phase,
          container: { ...box(container), clientWidth: container.clientWidth, scrollWidth: container.scrollWidth, scrollLeft: container.scrollLeft },
          title: title ? { ...box(title), fontSize: getComputedStyle(title).fontSize } : null,
          titleClip: titleClip ? { ...box(titleClip), scrollLeft: titleClip.scrollLeft } : null,
          firstCharacter: character ? box(character) : null,
          actions: actions.map((action, index) => ({ ...box(action), native: box(nativeActions[index]),
            label: action.getAttribute('aria-label'), focused: action.shadowRoot.activeElement === nativeActions[index],
            slot: action.closest('ion-buttons').slot, margin: getComputedStyle(action.closest('ion-buttons')).margin })),
          documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth });
        const frames = [snapshot('before-focus')];
        for (let index = 0; index < nativeActions.length; index++) {
          // Ordinary browser focus deliberately exercises hidden-overflow scroll.
          // Never preventScroll or reset scrollLeft: either would hide the defect.
          nativeActions[index].focus();
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          frames.push(snapshot(`action-${index}-focus`));
          nativeActions[index].blur(); frames.push(snapshot(`action-${index}-blur`));
        }
        return { frames, actualTitle: title?.textContent.trim() ?? null, actualActionCount: actions.length };
      });
      measurements.push({ label, ...environment, kind: state.kind, state: state.name, ...result });
      assert.equal(result.actualActionCount, state.actions, label + ': actual conditional action count');
      assert.equal(result.actualTitle === null, !!state.editing, label + ': editor has no normal title');
      const before = result.frames[0];
      const geometryIssues = [];
      const geometry = (condition, message) => { if (!condition) geometryIssues.push(message); };
      for (const frame of result.frames) {
        const context = label + '/' + frame.phase;
        geometry(frame.documentWidth <= frame.viewportWidth + 1, context + ': document overflow');
        geometry(frame.container.scrollWidth <= frame.container.clientWidth + 1, context + ': hidden toolbar overflow');
        geometry(Math.abs(frame.container.scrollLeft) <= 1, context + ': toolbar scrolled horizontally');
        for (const action of frame.actions) {
          const minimum = state.editing ? 44 : 48;
          geometry(action.width >= minimum - .5 && action.height >= minimum - .5, context + ': action target shrank');
          for (const bounds of [action, action.native]) geometry(bounds.x >= frame.container.x - 1 && bounds.right <= frame.container.right + 1,
            context + ': action escaped toolbar clip');
        }
        if (frame.title) {
          geometry(Math.abs(frame.title.x - before.title.x) <= 1, context + ': title shifted');
          geometry(Math.abs(frame.titleClip.scrollLeft) <= 1, context + ': title scrolled');
          geometry(frame.firstCharacter.width > 0 && frame.firstCharacter.x >= Math.max(frame.titleClip.x, frame.container.x) - 1
            && frame.firstCharacter.right <= Math.min(frame.titleClip.right, frame.container.right) + 1, context + ': first title character clipped');
        }
        const focusPhase = frame.phase.match(/^action-(\d+)-focus$/);
        if (focusPhase) {
          const index = Number(focusPhase[1]);
          assert.equal(frame.actions[index].focused, true, context + ': actual Ionic native action must focus');
        }
      }
      measurements.at(-1).geometryIssues = geometryIssues;
      if (geometryIssues.length) failures.push({ label, type: 'geometry', error: geometryIssues.join('\n') });
      if (outputDir && environment.width === 320 && environment.rootSize === 24 && environment.theme === 'light' && environment.mode === 'md') {
        const file = join(outputDir, `${state.kind}-${state.name}-320-root24-light-md.png`);
        await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 320, height: 230 } }); screenshots.push(file);
      }
    } catch (error) { failures.push({ label, type: 'runner', error: String(error.stack ?? error) }); }
  }
  assert.deepEqual(pageErrors, []); assert.deepEqual(requestErrors, []); assert.equal(externalRequests, 0); assert.equal(writeRequests, 0);
} catch (error) { failures.push({ label: 'runner', type: 'runner', error: String(error.stack ?? error) }); }
finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  const report = { kind: 'actual-header-AST-Emulated-SCSS-installed-Ionic-not-Angular-or-native', passed: failures.length === 0,
    mode: baselineDir ? 'pre-change-source-backed-baseline' : 'current-source-regression', sourceHashes,
    environmentCount: environments.length, stateCount: measurements.length, externalRequests, writeRequests, failures, pageErrors, requestErrors, measurements, screenshots };
  if (outputDir) writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ passed: report.passed, environmentCount: report.environmentCount, stateCount: report.stateCount,
    failures: failures.map(item => ({ label: item.label, error: item.error.split('\n')[0] })), externalRequests, writeRequests, outputDir }, null, 2));
}
if (baselineDir) {
  assert.equal(measurements.length, environments.length * states.length, 'Baseline must complete the finite matrix');
  assert.equal(failures.filter(item => item.type !== 'geometry').length, 0, 'Baseline harness errors are not expected geometry failures');
  assert.ok(failures.length > 0, 'Backed-up original sources must expose the existing geometry defect');
  assert.ok(failures.every(item => /^(device|profile)\/(ordinary|messages)\//.test(item.label)), 'Baseline controls must remain unaffected');
} else assert.equal(failures.length, 0, 'Finite real-header focus/clip regressions; see the bounded report above');
